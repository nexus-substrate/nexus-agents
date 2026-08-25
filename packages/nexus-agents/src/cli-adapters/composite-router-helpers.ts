/**
 * nexus-agents/cli-adapters - CompositeRouter Helper Functions
 *
 * Pure helper functions extracted from CompositeRouter to reduce file size.
 *
 * @module cli-adapters/composite-router-helpers
 * (Source: Issue #275, Epic #164, Issue #347)
 */

import type { Task } from '../core/types/agent.js';
import { getTimeProvider, type TaskProfile } from '../core/index.js';
import type { CliName, RoutingArmId, CliTask, BudgetConstraint } from './types.js';
import { routingArmDisplaySlot } from './types.js';
import type { BanditContext } from './budget-router-types.js';
import type { TopsisModelProfile, TopsisResult } from './topsis-types.js';
import {
  DEFAULT_MODEL_PROFILES,
  DEFAULT_TOPSIS_CRITERIA,
  PLAN_BILLING_TOPSIS_CRITERIA,
  applyDifficultyCostWeighting,
  getCriteriaForTaskCategory,
} from './topsis-types.js';
import type { BillingMode } from '../mcp/tools/delegate-to-model-types.js';
import type { BudgetRouter } from './budget-router.js';
import { TopsisRouter } from './topsis-router.js';
import type { CompositeRouterConfig } from './composite-router-types.js';
import type { IZeroRouter } from './zero-router.js';
import type { DifficultyEstimate, DifficultyOutcome, ModelTier } from './zero-router-types.js';
import { hashTaskContent } from './zero-router-calibration.js';
import { deriveStrongClis, deriveWeakClis, deriveTierToClis } from './derive-tier-tables.js';

/**
 * Adjusts model profile based on task characteristics.
 */
export function adjustProfileForTask(
  profile: TopsisModelProfile,
  taskProfile: TaskProfile
): TopsisModelProfile {
  if (taskProfile.taskType === 'architecture' || taskProfile.reasoningComplexity > 7) {
    return { ...profile, qualityScore: Math.min(profile.qualityScore * 1.2, 10) };
  }
  if (taskProfile.taskType === 'bulk_operations' || taskProfile.contextRequired < 1000) {
    return { ...profile, averageLatencyMs: profile.averageLatencyMs * 0.8 };
  }
  return profile;
}

/** Neutral feature value — what {@link LinUCBBandit.warmStart} replays. */
const NEUTRAL_FEATURE = 0.5;

/**
 * Converts a task profile to LinUCB bandit context.
 *
 * `budgetUtilization` was hardcoded to 0.5 on every call, so the bandit's
 * budget feature was constant and carried no information — a dead input to a
 * learned model, and the actual reason the feature never varied (#4834). It
 * now takes the figure the pipeline computes, falling back to neutral when no
 * cost ceiling is configured and there is nothing to measure.
 *
 * Neutral rather than zero: zero would read as "budget untouched" and is a
 * claim; 0.5 is the same value `warmStart` replays historical outcomes at, so
 * an unknown budget matches the context the weights were reconstructed
 * against.
 *
 * `timePressure` remains hardcoded — no producer computes one anywhere in the
 * tree, so there is nothing to thread. Tracked separately.
 */
export function taskProfileToBanditContext(
  profile: TaskProfile,
  budgetUtilization?: number
): BanditContext {
  return {
    taskComplexity: profile.reasoningComplexity / 10,
    contextLengthNormalized: Math.min(profile.contextRequired / 100000, 1),
    isCodeTask: profile.codeGeneration ? 1 : 0,
    isReasoningTask: profile.taskType === 'architecture' || profile.reasoningComplexity > 5 ? 1 : 0,
    budgetUtilization: budgetUtilization ?? NEUTRAL_FEATURE,
    timePressure: 0.3,
  };
}

/**
 * Calculates routing confidence from multiple scores.
 */
export function calculateConfidence(
  topsisScore: number | undefined,
  ucbScore: number | undefined,
  candidateCount: number
): number {
  const scores: number[] = [];
  if (topsisScore !== undefined) scores.push(topsisScore);
  if (ucbScore !== undefined) scores.push(Math.min(ucbScore / 10, 1));
  const baseConfidence = Math.min(0.5 + candidateCount * 0.1, 0.8);
  if (scores.length === 0) return baseConfidence;
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  return 0.3 * baseConfidence + 0.7 * avgScore;
}

/**
 * BINDING plan-mode annotation (#4196): when billing mode is 'plan' the
 * difficulty-conditional cost weighting and the per-task-class cost ceiling
 * are no-ops — the routing decision must SAY so explicitly (never silent),
 * so downstream evals don't misread plan-mode routing as cost-aware.
 */
export const PLAN_MODE_COST_ANNOTATION = 'cost weighting disabled: plan mode';

/**
 * Options for building routing reason.
 */
export interface BuildReasonOptions {
  selectedCli: RoutingArmId;
  stages: string[];
  topsisScore?: number;
  ucbScore?: number;
  preferenceScore?: number;
  difficultyTier?: ModelTier;
  difficultyScore?: number;
  /** Billing mode in effect; 'plan' appends {@link PLAN_MODE_COST_ANNOTATION} (#4196). */
  billingMode?: BillingMode;
}

/**
 * Builds a human-readable routing reason.
 */
export function buildReason(options: BuildReasonOptions): string {
  const { selectedCli, stages, topsisScore, ucbScore, preferenceScore, difficultyTier } = options;
  const difficultyScore = options.difficultyScore;
  const parts: string[] = ['Selected ' + selectedCli];
  if (stages.includes('budget-filter')) parts.push('within budget');
  if (difficultyTier !== undefined && difficultyScore !== undefined) {
    parts.push('difficulty ' + difficultyTier + ' (' + difficultyScore.toFixed(2) + ')');
  }
  if (preferenceScore !== undefined) parts.push('preference ' + preferenceScore.toFixed(2));
  if (topsisScore !== undefined) parts.push('TOPSIS score ' + topsisScore.toFixed(2));
  if (ucbScore !== undefined) parts.push('UCB score ' + ucbScore.toFixed(2));
  if (options.billingMode === 'plan') parts.push(PLAN_MODE_COST_ANNOTATION);
  return parts.join(', ');
}

/**
 * Filters CLI candidates based on preference tier.
 */
export function filterByPreferenceTier(
  candidates: RoutingArmId[],
  tier: 'strong' | 'weak'
): RoutingArmId[] {
  // Strong = the premium tier (most-expensive frontier default); weak = the
  // budget CLIs. DERIVED from real registry pricing + qualityScores (#4195) —
  // a $0/unscored default can never be "strong". Tier membership is slot-level;
  // collapse an api:* arm to its display slot (#3422) so a wrapped API arm
  // inherits its vendor slot's tier.
  const strongModels: CliName[] = deriveStrongClis();
  const weakModels: CliName[] = deriveWeakClis();

  const preferred = tier === 'strong' ? strongModels : weakModels;
  const filtered = candidates.filter((c) => preferred.includes(routingArmDisplaySlot(c)));

  // Return filtered if any match, otherwise return all candidates
  return filtered.length > 0 ? filtered : candidates;
}

/**
 * Converts a CliTask to internal Task format.
 */
export function cliTaskToTask(cliTask: CliTask): Task {
  return {
    id: 'task-' + String(getTimeProvider().now()),
    description: cliTask.content,
    context: {},
  };
}

/**
 * Budget filter result.
 */
export interface BudgetFilterResult {
  eligible: RoutingArmId[];
  withinBudget: boolean;
  /**
   * Projected spend as a fraction of the configured cost ceiling (#4866).
   *
   * `undefined` when no `maxCostUsd` is configured — there is then no ceiling
   * to be a fraction of, and an unknown budget must not be rendered as a
   * known one. `ResourceStrategyStage` consumes this; it previously looked
   * for a `budget:utilization=` signal that nothing on this path emitted.
   */
  budgetUtilization?: number;
}

/** Narrows the router config's budget constraints to a {@link BudgetConstraint}. */
function toBudgetConstraint(raw: CompositeRouterConfig['budgetConstraints']): BudgetConstraint {
  const constraint: BudgetConstraint = {};
  if (raw?.maxTokens !== undefined) {
    (constraint as { maxTokens: number }).maxTokens = raw.maxTokens;
  }
  if (raw?.maxCostUsd !== undefined) {
    (constraint as { maxCostUsd: number }).maxCostUsd = raw.maxCostUsd;
  }
  if (raw?.maxLatencyMs !== undefined) {
    (constraint as { maxLatencyMs: number }).maxLatencyMs = raw.maxLatencyMs;
  }
  return constraint;
}

/**
 * Applies budget filtering to candidate CLIs.
 */
export function applyBudgetFilter(
  task: CliTask,
  candidates: RoutingArmId[],
  budgetRouter: BudgetRouter | undefined,
  config: CompositeRouterConfig
): BudgetFilterResult {
  if (budgetRouter === undefined) return { eligible: candidates, withinBudget: true };

  const constraint = toBudgetConstraint(config.budgetConstraints);

  const result = budgetRouter.checkBudget(task, constraint);
  if (!result.withinBudget) return { eligible: [], withinBudget: false };

  // Mirrors BudgetFilterStage's formula (budget-stage.ts:233), over the
  // selected adapter's projected cost rather than an average across
  // candidates — this is the spend actually being contemplated.
  const maxCostUsd = constraint.maxCostUsd;
  const utilization =
    maxCostUsd !== undefined && maxCostUsd > 0
      ? { budgetUtilization: Math.min(1, result.estimatedCostUsd / maxCostUsd) }
      : {};

  if (config.billingMode !== 'api')
    return { eligible: candidates, withinBudget: true, ...utilization };
  return {
    eligible: budgetRouter.filterByTaskClassCeiling(task, candidates),
    withinBudget: true,
    ...utilization,
  };
}

/**
 * TOPSIS ranking result.
 */
export interface TopsisRankingResult {
  ranking: RoutingArmId[];
  topScore: number;
  /** Number of candidates within the tolerance band of the top score. */
  toleranceBandSize?: number;
}

/**
 * Tolerance band percentage for TOPSIS scoring.
 * Candidates within this % of the top score are considered quality-equivalent.
 * Among equivalent candidates, the original ranking is preserved (TOPSIS tiebreak).
 * This prevents over-concentration on a single CLI and improves diversity.
 * (Source: Issue #1401 — tolerance-routing technique)
 */
export const TOPSIS_TOLERANCE_BAND_PERCENT = 0.05;

/** Returns a TopsisRouter with task-category-aware criteria (#1491) and
 * difficulty-conditional quality/cost weighting (#4196).
 * Difficulty conditioning is api-mode ONLY: plan mode zeroes the cost weight
 * already, so conditioning there would be a silent no-op — plan mode instead
 * emits an explicit routing-decision annotation (see buildReason).
 * Only creates a new router when the criteria differ from the billing-mode default. */
function selectTopsisRouter(
  router: TopsisRouter,
  billingMode: BillingMode,
  taskType?: string,
  reasoningComplexity?: number
): TopsisRouter {
  const mode = billingMode === 'plan' ? 'plan' : 'api';
  const defaultCriteria = mode === 'plan' ? PLAN_BILLING_TOPSIS_CRITERIA : DEFAULT_TOPSIS_CRITERIA;
  const base =
    taskType !== undefined ? getCriteriaForTaskCategory(taskType, mode) : defaultCriteria;
  // #4196: condition the quality/cost split on the canonical SharedTaskAnalyzer
  // complexity (TaskProfile.reasoningComplexity). Mid-band complexity returns
  // the same reference, keeping the default path byte-identical.
  const criteria =
    mode === 'api' && reasoningComplexity !== undefined
      ? applyDifficultyCostWeighting(base, reasoningComplexity)
      : base;
  // Only create a new router when the effective criteria differ from default
  if (criteria !== defaultCriteria) return new TopsisRouter({ criteria });
  if (mode === 'plan') return new TopsisRouter({ criteria: PLAN_BILLING_TOPSIS_CRITERIA });
  return router;
}

// ---------------------------------------------------------------------------
// Performance Floor Gate (Issue #1401 — consensus-approved Option A)
// ---------------------------------------------------------------------------

/** Minimum observed success rate before quality penalty applies. */
export const PERFORMANCE_FLOOR_THRESHOLD = 0.5;

/** Minimum sample count required before the floor gate activates. */
export const PERFORMANCE_FLOOR_MIN_SAMPLES = 20;

/** Quality score penalty applied to underperforming CLI+category pairs. */
export const PERFORMANCE_FLOOR_PENALTY = 3.0;

/**
 * Performance data for a CLI on a specific task category.
 */
export interface PerformanceFloorEntry {
  successRate: number;
  sampleCount: number;
}

/**
 * Applies a quality penalty to CLI profiles whose observed success rate
 * for the current task category falls below PERFORMANCE_FLOOR_THRESHOLD.
 *
 * Only activates when sufficient samples exist (>= PERFORMANCE_FLOOR_MIN_SAMPLES)
 * to avoid penalizing CLIs with noisy small-sample data.
 *
 * This is a pre-TOPSIS adjustment that nudges routing away from
 * empirically underperforming CLI+category pairs. (#1401)
 */
export function applyPerformanceFloorPenalty(
  profiles: readonly TopsisModelProfile[],
  performanceData: ReadonlyMap<CliName, PerformanceFloorEntry>
): TopsisModelProfile[] {
  if (performanceData.size === 0) return [...profiles];

  return profiles.map((p) => {
    const perf = performanceData.get(p.cliName);
    if (perf === undefined) return p;
    if (perf.sampleCount < PERFORMANCE_FLOOR_MIN_SAMPLES) return p;
    if (perf.successRate >= PERFORMANCE_FLOOR_THRESHOLD) return p;

    const penalized = Math.max(p.qualityScore - PERFORMANCE_FLOOR_PENALTY, 0);
    return { ...p, qualityScore: penalized };
  });
}

/** Max quality boost from stage scores: +15%. */
const STAGE_SCORE_MAX_BOOST = 0.15;

/** Max quality penalty from stage scores: -10%. */
const STAGE_SCORE_MAX_PENALTY = 0.1;

/**
 * Adjusts TOPSIS model profiles based on aggregated stage scores.
 * CLIs with above-average stage affinity get quality boosted (up to +15%),
 * below-average get quality reduced (down to -10%). (#1354)
 */
export function adjustProfileWithStageScores(
  profiles: readonly TopsisModelProfile[],
  stageScores: ReadonlyMap<CliName, number>
): TopsisModelProfile[] {
  if (stageScores.size === 0) return [...profiles];

  // Calculate the mean score across all CLIs that have scores
  const scoreValues = [...stageScores.values()];
  const mean = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
  // Range for normalization: max deviation from mean
  const maxDev = Math.max(
    ...scoreValues.map((v) => Math.abs(v - mean)),
    0.001 // prevent division by zero
  );

  return profiles.map((p) => {
    const score = stageScores.get(p.cliName);
    if (score === undefined) return p;

    const deviation = score - mean;
    // Normalize to [-1, 1] range
    const normalized = deviation / maxDev;
    // Map to boost/penalty: positive → boost, negative → penalty
    const multiplier =
      normalized >= 0
        ? 1 + normalized * STAGE_SCORE_MAX_BOOST
        : 1 + normalized * STAGE_SCORE_MAX_PENALTY;
    const adjustedQuality = Math.min(p.qualityScore * multiplier, 10);

    return { ...p, qualityScore: adjustedQuality };
  });
}

/** Options for TOPSIS ranking beyond the core required params. */
export interface TopsisRankingOptions {
  billingMode?: BillingMode;
  stageScores?: ReadonlyMap<CliName, number>;
  performanceData?: ReadonlyMap<CliName, PerformanceFloorEntry>;
}

/** Builds adjusted TOPSIS profiles from task, stage scores, and performance data. */
function buildAdjustedProfiles(
  taskProfile: TaskProfile,
  candidates: RoutingArmId[],
  options?: TopsisRankingOptions
): TopsisModelProfile[] {
  // TOPSIS profiles are slot-level (DEFAULT_MODEL_PROFILES keyed by CliName).
  // Collapse arms to their display slot so an api:* arm reuses its vendor
  // slot's profile (#3422).
  const candidateSlots = new Set(candidates.map(routingArmDisplaySlot));
  const profiles = DEFAULT_MODEL_PROFILES.filter((p) => candidateSlots.has(p.cliName));
  let adjusted = profiles.map((p) => adjustProfileForTask(p, taskProfile));
  if (options?.stageScores !== undefined && options.stageScores.size > 0) {
    adjusted = adjustProfileWithStageScores(adjusted, options.stageScores);
  }
  if (options?.performanceData !== undefined && options.performanceData.size > 0) {
    adjusted = applyPerformanceFloorPenalty(adjusted, options.performanceData);
  }
  return adjusted;
}

/**
 * Applies TOPSIS ranking to candidate CLIs.
 * Uses task-category-aware criteria weights when taskProfile.taskType is available (#1491).
 * When stageScores are provided, adjusts quality profiles before evaluation. (#1354)
 */
export function applyTopsisRanking(
  taskProfile: TaskProfile,
  candidates: RoutingArmId[],
  topsisRouter: TopsisRouter | undefined,
  options?: TopsisRankingOptions
): TopsisRankingResult {
  if (topsisRouter === undefined) {
    return { ranking: candidates, topScore: 1.0 };
  }

  const billingMode = options?.billingMode ?? 'api';
  const router = selectTopsisRouter(
    topsisRouter,
    billingMode,
    taskProfile.taskType,
    taskProfile.reasoningComplexity
  );
  const adjustedProfiles = buildAdjustedProfiles(taskProfile, candidates, options);
  const result: TopsisResult = router.selectModel({ profiles: adjustedProfiles });

  // Scores are slot-keyed; an api:* candidate inherits its display slot's
  // closeness score so it ranks alongside its vendor's CLI slot (#3422).
  const scoreMap = new Map(result.scores.map((s) => [s.cliName, s.closenessScore]));
  const scoreOf = (arm: RoutingArmId): number => scoreMap.get(routingArmDisplaySlot(arm)) ?? 0;
  const ranking = [...candidates].sort((a, b) => scoreOf(b) - scoreOf(a));
  const topArm = ranking[0];
  const topScore = topArm !== undefined ? scoreOf(topArm) : 1.0;

  // Tolerance band: count how many candidates are within TOLERANCE_BAND_PERCENT of top
  const threshold = topScore * (1 - TOPSIS_TOLERANCE_BAND_PERCENT);
  const toleranceBandSize = ranking.filter((c) => scoreOf(c) >= threshold).length;

  return { ranking, topScore, toleranceBandSize };
}

/**
 * Preference stage result.
 */
export interface PreferenceStageResult {
  preferenceScore: number | undefined;
  preferenceTier: 'strong' | 'weak' | undefined;
  preferredCandidates: RoutingArmId[];
}

/**
 * Default preference stage result when preference routing is disabled.
 */
export function defaultPreferenceStageResult(candidates: RoutingArmId[]): PreferenceStageResult {
  return {
    preferenceScore: undefined,
    preferenceTier: undefined,
    preferredCandidates: candidates,
  };
}

/**
 * ZeroRouter stage result.
 */
export interface ZeroRouterStageResult {
  difficultyEstimate: DifficultyEstimate | undefined;
  difficultyTier: ModelTier | undefined;
  filteredCandidates: RoutingArmId[];
}

/**
 * Default ZeroRouter stage result when ZeroRouter is disabled.
 */
export function defaultZeroRouterStageResult(candidates: RoutingArmId[]): ZeroRouterStageResult {
  return {
    difficultyEstimate: undefined,
    difficultyTier: undefined,
    filteredCandidates: candidates,
  };
}

/**
 * Maps model tier to preferred CLI order.
 * Fast tier prefers gemini/codex, Powerful tier prefers claude.
 */
export function filterByDifficultyTier(
  candidates: RoutingArmId[],
  tier: ModelTier
): RoutingArmId[] {
  // Single source with ZeroRouter's DEFAULT_TIER_TO_CLIS: the same
  // registry-derived tier→CLI ordering (#4195), no longer a parallel literal.
  const preferred = deriveTierToClis()[tier];
  // Sort candidates by tier preference order. Tier preference is slot-level;
  // an api:* arm sorts by its display slot's position (#3422).
  const sortedCandidates = [...candidates].sort((a, b) => {
    const aIndex = preferred.indexOf(routingArmDisplaySlot(a));
    const bIndex = preferred.indexOf(routingArmDisplaySlot(b));
    // If not in preference list, put at end
    const aPos = aIndex === -1 ? preferred.length : aIndex;
    const bPos = bIndex === -1 ? preferred.length : bIndex;
    return aPos - bPos;
  });

  return sortedCandidates;
}

/**
 * Applies ZeroRouter difficulty-based filtering to candidate CLIs.
 */
export function applyZeroRouterFilter(
  task: CliTask,
  candidates: RoutingArmId[],
  zeroRouter: IZeroRouter | undefined
): ZeroRouterStageResult {
  if (zeroRouter === undefined || candidates.length === 0) {
    return defaultZeroRouterStageResult(candidates);
  }

  // Difficulty estimation is slot-level; collapse arms to their display slot
  // for the ZeroRouter call (we only read difficulty + tier back) (#3422).
  const decision = zeroRouter.routeByDifficulty(task, candidates.map(routingArmDisplaySlot));
  const difficultyEstimate = decision.difficulty;
  const difficultyTier = decision.tier;

  // Sort candidates by tier preference
  const filteredCandidates = filterByDifficultyTier(candidates, difficultyTier);

  return {
    difficultyEstimate,
    difficultyTier,
    filteredCandidates,
  };
}

/**
 * Builds a DifficultyOutcome object for calibration.
 */
export function buildDifficultyOutcome(
  taskContent: string,
  difficulty: number,
  selectedCli: CliName,
  success: boolean,
  qualityScore?: number
): DifficultyOutcome {
  const base = {
    taskHash: hashTaskContent(taskContent),
    estimatedDifficulty: difficulty,
    selectedCli,
    success,
    timestamp: getTimeProvider().now(),
  };
  return qualityScore !== undefined ? { ...base, qualityScore } : base;
}

/**
 * Creates the routing decision result object.
 */
export interface BuildDecisionContext {
  selectedCli: RoutingArmId;
  candidates: RoutingArmId[];
  topsisRanking: RoutingArmId[];
  stagesExecuted: string[];
  decisionTimeMs: number;
  withinBudget: boolean | undefined;
  difficultyEstimate: DifficultyEstimate | undefined;
  difficultyTier: ModelTier | undefined;
  preferenceScore: number | undefined;
  preferenceTier: 'strong' | 'weak' | undefined;
  topsisScore: number | undefined;
  ucbScore: number | undefined;
  taskProfile: TaskProfile;
  /** Billing mode in effect; 'plan' surfaces the explicit annotation (#4196). */
  billingMode?: BillingMode | undefined;
}

/**
 * Builds the routing decision fields (excluding adapter which requires Map lookup).
 */
export function buildDecisionFields(ctx: BuildDecisionContext): {
  confidence: number;
  reason: string;
  alternatives: RoutingArmId[];
} {
  const confidence = calculateConfidence(ctx.topsisScore, ctx.ucbScore, ctx.candidates.length);
  const reason = buildReason({
    selectedCli: ctx.selectedCli,
    stages: ctx.stagesExecuted,
    ...(ctx.billingMode !== undefined ? { billingMode: ctx.billingMode } : {}),
    ...(ctx.topsisScore !== undefined ? { topsisScore: ctx.topsisScore } : {}),
    ...(ctx.ucbScore !== undefined ? { ucbScore: ctx.ucbScore } : {}),
    ...(ctx.preferenceScore !== undefined ? { preferenceScore: ctx.preferenceScore } : {}),
    ...(ctx.difficultyTier !== undefined ? { difficultyTier: ctx.difficultyTier } : {}),
    ...(ctx.difficultyEstimate?.aggregateScore !== undefined
      ? { difficultyScore: ctx.difficultyEstimate.aggregateScore }
      : {}),
  });
  const alternatives = ctx.topsisRanking.filter((c) => c !== ctx.selectedCli);
  return { confidence, reason, alternatives };
}

/**
 * Builds preference stats for CompositeRouter stats output.
 */
export function buildPreferenceStats(
  enablePreferenceRouting: boolean,
  preferenceRouter:
    | {
        getStats: () => { totalDataPoints: number; strongModelPreferenceRate: number };
        hasMinimumData: () => boolean;
      }
    | undefined
):
  | {
      enabled: boolean;
      hasSufficientData: boolean;
      dataPointCount: number;
      strongModelPreferenceRate: number;
    }
  | undefined {
  if (!enablePreferenceRouting || preferenceRouter === undefined) {
    return undefined;
  }
  const stats = preferenceRouter.getStats();
  return {
    enabled: true,
    hasSufficientData: preferenceRouter.hasMinimumData(),
    dataPointCount: stats.totalDataPoints,
    strongModelPreferenceRate: stats.strongModelPreferenceRate,
  };
}

// `fetchCapacityData` was removed with #4378. Its only caller was
// `CompositeRouter.getCapacityDashboard`, itself a read-only surface with no
// production consumer (its only references were two test mocks), so it was
// orphaned by that deletion rather than being independently useful.
//
// #4373 will reintroduce capacity reads as a routing *exclusion predicate*
// inside the stage chain — a decision input, not a dashboard. Adapter capacity
// is still available directly via `ICliAdapter.getCapacity()`.
