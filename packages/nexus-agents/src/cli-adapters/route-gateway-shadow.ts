/**
 * Shadow-mode evaluation for Route=(model, gateway) routing (#7071, epic #4391 Increment A).
 *
 * Evaluates factoring model capability reward from serving gateway health/latency
 * against the epic's explicit baseline: a gateway-health pre-filter plus flat
 * `(model, gateway)` bandit arms.
 *
 * Gated behind `NEXUS_ROUTE_GATEWAY_SHADOW=1` (default OFF) and learning persistence.
 * Non-fatal by construction: any shadow evaluation failure increments an internal
 * failure counter and logs a warning without disturbing the live routing hot path.
 *
 * @module cli-adapters/route-gateway-shadow
 */

// @export-no-consumer-yet — see #7071. Spike increment awaiting live bandit consumer (Epic #4391 Increment B).

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';

import { createLogger, getErrorMessage } from '../core/index.js';
import { parseBoolEnv } from '../config/defaults-env.js';
import {
  ensureLearningDir,
  getRouteGatewayShadowFile,
  isPersistenceEnabled,
} from '../config/learning-persistence.js';
import type { EndpointArmId, RoutingArmId } from './types-core.js';

/** Schema version for persisted route-gateway shadow records. */
export const ROUTE_GATEWAY_SHADOW_SCHEMA_VERSION = 1;

/** 30-day lookback window in milliseconds for persisted shadow evaluation. */
const READ_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

/** Default prior success rate for unobserved arms. */
const DEFAULT_PRIOR_SUCCESS = 0.5;

/** Threshold of dead-CLI / corrupted outcomes above which a clean reset is recommended (#4386). */
const DEAD_CLI_CONTAMINATION_THRESHOLD = 0.15;

/** Minimum sample count required for warm-start confidence. */
const MIN_SAMPLES_FOR_WARM_START = 30;

/** Selected routing unit representing a concrete model served through a gateway. */
export interface Route {
  readonly model: string;
  readonly gateway: RoutingArmId;
  readonly gatewayArm?: EndpointArmId;
}

/** Route candidate with execution cost and latency metadata. */
export interface RouteCandidate {
  readonly route: Route;
  readonly costUsd?: number;
  readonly estimatedLatencyMs?: number;
}

export type ModelQualityStats = Record<
  string,
  { readonly sampleCount: number; readonly successRate: number }
>;
export type GatewayHealthStats = Record<
  string,
  { readonly healthy: boolean; readonly failureRate: number }
>;
export type FlatArmStats = Record<
  string,
  { readonly sampleCount: number; readonly successRate: number }
>;

const RouteSchema = z.object({
  model: z.string().min(1).max(120),
  gateway: z.string().min(1).max(120),
  gatewayArm: z.string().startsWith('api:').optional(),
});

export const RouteGatewayShadowRecordSchema = z.object({
  schema: z.literal(ROUTE_GATEWAY_SHADOW_SCHEMA_VERSION),
  timestamp: z.string().min(1),
  liveRoute: RouteSchema,
  factoredRoute: RouteSchema,
  baselineRoute: RouteSchema,
  flip: z.boolean(),
  transferBenefited: z.boolean(),
  factoredScore: z.number(),
  baselineScore: z.number(),
  regretDelta: z.number(),
  success: z.boolean(),
});

export type RouteGatewayShadowRecord = z.infer<typeof RouteGatewayShadowRecordSchema>;

export interface RouteGatewayComparison {
  readonly liveRoute: Route;
  readonly factoredRoute: Route;
  readonly baselineRoute: Route;
  readonly flip: boolean;
  readonly transferBenefited: boolean;
  readonly factoredScore: number;
  readonly baselineScore: number;
  readonly regretDelta: number;
}

export interface RouteGatewaySpikeEvaluation {
  readonly totalDecisions: number;
  readonly flipCount: number;
  readonly flipRate: number;
  readonly transferBenefitedCount: number;
  readonly averageRegretDelta: number;
  readonly factoredSuperiorRate: number;
}

export interface ArmMigrationAssessment {
  readonly strategy: 'warm_start_replay' | 'documented_reset';
  readonly rationale: string;
}

/** Check if route-gateway shadow evaluation is enabled. */
export function isRouteGatewayShadowEnabled(): boolean {
  return parseBoolEnv('NEXUS_ROUTE_GATEWAY_SHADOW', false) && isPersistenceEnabled();
}

let shadowFailureCount = 0;

/** Record a shadow evaluation failure safely. */
export function recordRouteGatewayShadowFailure(): number {
  return ++shadowFailureCount;
}

/** Get current count of shadow failures. */
export function getRouteGatewayShadowFailureCount(): number {
  return shadowFailureCount;
}

/** Reset failure counter for testing. */
export function resetRouteGatewayShadowFailureCount(): void {
  shadowFailureCount = 0;
}

function getCandidateKey(candidate: RouteCandidate): string {
  return `${candidate.route.gateway}::${candidate.route.model}`;
}

/**
 * Filters candidates through the gateway-health pre-filter common to both factored
 * routing and the epic's baseline.
 */
function filterHealthyCandidates(
  candidates: readonly RouteCandidate[],
  gatewayStats: GatewayHealthStats
): readonly RouteCandidate[] {
  const healthy = candidates.filter((c) => {
    const gw = gatewayStats[c.route.gateway];
    return gw === undefined || gw.healthy;
  });
  return healthy.length > 0 ? healthy : candidates;
}

/**
 * Computes factored score: model quality transfers across all gateways serving the same model.
 */
function scoreFactoredCandidate(
  candidate: RouteCandidate,
  modelStats: ModelQualityStats,
  gatewayStats: GatewayHealthStats
): number {
  const m = modelStats[candidate.route.model];
  const modelScore = m !== undefined ? m.successRate : DEFAULT_PRIOR_SUCCESS;
  const gw = gatewayStats[candidate.route.gateway];
  const gwHealthScore = gw !== undefined ? Math.max(0.01, 1 - gw.failureRate) : 0.9;
  return modelScore * gwHealthScore;
}

/**
 * Computes flat baseline score: treats each (gateway, model) as an isolated arm with no transfer.
 */
function scoreFlatCandidate(candidate: RouteCandidate, flatStats: FlatArmStats): number {
  const arm = flatStats[getCandidateKey(candidate)];
  return arm !== undefined ? arm.successRate : DEFAULT_PRIOR_SUCCESS;
}

function selectBestFactoredCandidate(
  candidates: readonly RouteCandidate[],
  modelStats: ModelQualityStats,
  gatewayStats: GatewayHealthStats
): { readonly candidate: RouteCandidate; readonly score: number } {
  let best = candidates[0];
  if (best === undefined) {
    throw new Error('Candidate list cannot be empty');
  }
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = scoreFactoredCandidate(c, modelStats, gatewayStats);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return { candidate: best, score: bestScore };
}

function selectBestFlatCandidate(
  candidates: readonly RouteCandidate[],
  flatStats: FlatArmStats
): { readonly candidate: RouteCandidate; readonly score: number } {
  let best = candidates[0];
  if (best === undefined) {
    throw new Error('Candidate list cannot be empty');
  }
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = scoreFlatCandidate(c, flatStats);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return { candidate: best, score: bestScore };
}

/**
 * Computes the shadow Route=(model, gateway) comparison against the flat baseline.
 */
export function computeRouteGatewayShadow(options: {
  readonly liveRoute: Route;
  readonly candidates: readonly RouteCandidate[];
  readonly modelStats: ModelQualityStats;
  readonly gatewayStats: GatewayHealthStats;
  readonly flatStats: FlatArmStats;
}): RouteGatewayComparison {
  const { liveRoute, candidates, modelStats, gatewayStats, flatStats } = options;
  const eligible = filterHealthyCandidates(candidates, gatewayStats);

  const factored = selectBestFactoredCandidate(eligible, modelStats, gatewayStats);
  const baseline = selectBestFlatCandidate(eligible, flatStats);

  const flip =
    factored.candidate.route.model !== baseline.candidate.route.model ||
    factored.candidate.route.gateway !== baseline.candidate.route.gateway;

  const factoredKey = getCandidateKey(factored.candidate);
  const factoredFlatSamples = flatStats[factoredKey]?.sampleCount ?? 0;
  const factoredModelSamples = modelStats[factored.candidate.route.model]?.sampleCount ?? 0;
  const transferBenefited = flip && factoredModelSamples > factoredFlatSamples;

  const regretDelta = baseline.score - factored.score;

  return {
    liveRoute,
    factoredRoute: factored.candidate.route,
    baselineRoute: baseline.candidate.route,
    flip,
    transferBenefited,
    factoredScore: factored.score,
    baselineScore: baseline.score,
    regretDelta,
  };
}

/**
 * Evaluates an aggregated shadow evaluation dataset across regret and flip metrics.
 */
export function evaluateRouteGatewaySpike(
  records: readonly RouteGatewayShadowRecord[]
): RouteGatewaySpikeEvaluation {
  if (records.length === 0) {
    return {
      totalDecisions: 0,
      flipCount: 0,
      flipRate: 0,
      transferBenefitedCount: 0,
      averageRegretDelta: 0,
      factoredSuperiorRate: 0,
    };
  }

  let flipCount = 0;
  let transferBenefitedCount = 0;
  let totalRegretDelta = 0;
  let factoredSuperiorCount = 0;

  for (const r of records) {
    if (r.flip) flipCount++;
    if (r.transferBenefited) transferBenefitedCount++;
    totalRegretDelta += r.regretDelta;
    if (r.regretDelta < 0) factoredSuperiorCount++;
  }

  return {
    totalDecisions: records.length,
    flipCount,
    flipRate: flipCount / records.length,
    transferBenefitedCount,
    averageRegretDelta: totalRegretDelta / records.length,
    factoredSuperiorRate: factoredSuperiorCount / records.length,
  };
}

/**
 * Assesses the arm-statistics migration decision (warm-start replay vs documented reset per #4386).
 */
export function evaluateArmStatisticsMigration(options: {
  readonly historicalSampleCount: number;
  readonly deadCliContaminationRate: number;
}): ArmMigrationAssessment {
  const { historicalSampleCount, deadCliContaminationRate } = options;

  if (
    historicalSampleCount >= MIN_SAMPLES_FOR_WARM_START &&
    deadCliContaminationRate <= DEAD_CLI_CONTAMINATION_THRESHOLD
  ) {
    return {
      strategy: 'warm_start_replay',
      rationale:
        'Preserves empirical capability priors across established CLI and gateway arms without imposing a cold-start exploration tax. Contamination remains bounded.',
    };
  }

  return {
    strategy: 'documented_reset',
    rationale:
      'Dead-CLI failure contamination rate exceeds tolerable threshold. A documented reset avoids poisoning the factored LinUCB feature space with stale failure priors.',
  };
}

const persistLogger = createLogger({ component: 'RouteGatewayShadow' });

/**
 * Persists one route-gateway shadow record to the dedicated JSONL log.
 */
export function persistRouteGatewayShadowRecord(record: RouteGatewayShadowRecord): void {
  try {
    ensureLearningDir();
    appendFileSync(getRouteGatewayShadowFile(), JSON.stringify(record) + '\n', 'utf-8');
  } catch (err: unknown) {
    recordRouteGatewayShadowFailure();
    persistLogger.warn('Failed to persist route-gateway shadow record (ignored)', {
      error: getErrorMessage(err),
    });
  }
}

/**
 * Reads persisted route-gateway shadow records within the 30-day lookback window.
 */
export function readRouteGatewayShadowRecords(): RouteGatewayShadowRecord[] {
  const file = getRouteGatewayShadowFile();
  if (!existsSync(file)) return [];

  const records: RouteGatewayShadowRecord[] = [];
  try {
    const cutoff = Date.now() - READ_LOOKBACK_MS;
    const lines = readFileSync(file, 'utf-8')
      .split('\n')
      .filter((l) => l.trim().length > 0);

    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const parsedRecord = RouteGatewayShadowRecordSchema.safeParse(parsed);
      if (!parsedRecord.success) continue;
      const ts = Date.parse(parsedRecord.data.timestamp);
      if (Number.isNaN(ts) || ts < cutoff) continue;
      records.push(parsedRecord.data);
    }
  } catch (err: unknown) {
    recordRouteGatewayShadowFailure();
    persistLogger.warn('Failed to read route-gateway shadow records (ignored)', {
      error: getErrorMessage(err),
    });
  }

  return records;
}
