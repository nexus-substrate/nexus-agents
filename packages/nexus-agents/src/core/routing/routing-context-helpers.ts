/**
 * RoutingContextStore Helpers (ADR-0008)
 *
 * Helper functions for metric aggregation, cleanup, and serialization.
 *
 * @module core/routing/routing-context-helpers
 */

import type { CliName } from '../../cli-adapters/types.js';
import type {
  QueryFeatures,
  ModelPerformance,
  RoutingDecision,
  TaskOutcome,
  AggregatedModelMetrics,
  PreferenceDataPoint,
  CachedActionResult,
} from './routing-context-store.js';

// ============================================================================
// Internal Types
// ============================================================================

export interface ModelAggregation {
  selectionCount: number;
  explorationCount: number;
  rewards: number[];
  qualities: number[];
  latencies: number[];
  successes: number;
}

export interface MetricTotals {
  explorationRate: number;
  avgReward: number;
  avgLatency: number;
}

export interface PerformanceAccumulator {
  totalQuality: number;
  totalSuccesses: number;
  totalLatencyMs: number;
  totalTokens: number;
  observations: number;
}

export interface ExperienceAccumulator {
  totalDurationMs: number;
  successCount: number;
  usageCount: number;
}

// ============================================================================
// Metric Aggregation Helpers
// ============================================================================

export function buildOutcomeMap(outcomes: TaskOutcome[]): Map<string, TaskOutcome> {
  const map = new Map<string, TaskOutcome>();
  for (const o of outcomes) {
    map.set(o.traceId, o);
  }
  return map;
}

export function aggregateByModel(
  decisions: RoutingDecision[],
  outcomeByTrace: Map<string, TaskOutcome>
): Map<CliName, ModelAggregation> {
  const aggs = new Map<CliName, ModelAggregation>();
  for (const d of decisions) {
    const agg = getOrCreateAggregation(aggs, d.selectedModel);
    agg.selectionCount++;
    if (d.isExploration) agg.explorationCount++;
    addOutcomeToAggregation(agg, outcomeByTrace.get(d.traceId));
  }
  return aggs;
}

function getOrCreateAggregation(
  aggs: Map<CliName, ModelAggregation>,
  model: CliName
): ModelAggregation {
  let agg = aggs.get(model);
  if (agg === undefined) {
    agg = {
      selectionCount: 0,
      explorationCount: 0,
      rewards: [],
      qualities: [],
      latencies: [],
      successes: 0,
    };
    aggs.set(model, agg);
  }
  return agg;
}

function addOutcomeToAggregation(agg: ModelAggregation, outcome: TaskOutcome | undefined): void {
  if (outcome === undefined) return;
  agg.rewards.push(outcome.reward);
  if (outcome.qualityScore !== undefined) agg.qualities.push(outcome.qualityScore);
  if (outcome.latencyMs !== undefined) agg.latencies.push(outcome.latencyMs);
  if (outcome.success) agg.successes++;
}

export function buildModelMetrics(
  aggs: Map<CliName, ModelAggregation>,
  totalDecisions: number
): { modelMetrics: AggregatedModelMetrics[]; totals: MetricTotals } {
  const modelMetrics: AggregatedModelMetrics[] = [];
  let totalExplorations = 0;
  let totalReward = 0;
  let rewardCount = 0;
  let totalLatency = 0;
  let latencyCount = 0;

  for (const [model, agg] of aggs) {
    modelMetrics.push(createModelMetric(model, agg, totalDecisions));
    totalExplorations += agg.explorationCount;
    totalReward += agg.rewards.reduce((a, b) => a + b, 0);
    rewardCount += agg.rewards.length;
    totalLatency += agg.latencies.reduce((a, b) => a + b, 0);
    latencyCount += agg.latencies.length;
  }

  return {
    modelMetrics,
    totals: {
      explorationRate: totalDecisions > 0 ? totalExplorations / totalDecisions : 0,
      avgReward: rewardCount > 0 ? totalReward / rewardCount : 0,
      avgLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
    },
  };
}

function createModelMetric(
  model: CliName,
  agg: ModelAggregation,
  total: number
): AggregatedModelMetrics {
  return {
    model,
    selectionCount: agg.selectionCount,
    selectionPercent: total > 0 ? agg.selectionCount / total : 0,
    avgReward: agg.rewards.length > 0 ? avg(agg.rewards) : 0,
    avgQuality: agg.qualities.length > 0 ? avg(agg.qualities) : 0,
    avgLatencyMs: agg.latencies.length > 0 ? avg(agg.latencies) : 0,
    successRate: agg.rewards.length > 0 ? agg.successes / agg.rewards.length : 0,
    explorationCount: agg.explorationCount,
  };
}

// ============================================================================
// Calculation Helpers
// ============================================================================

export function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function calculateSimilarity(a: QueryFeatures, b: QueryFeatures): number {
  const tokenDist = Math.abs(a.tokenCount - b.tokenCount) / 1000;
  const tokenSim = Math.max(0, 1 - tokenDist);
  const complexitySim = 1 - Math.abs(a.complexity - b.complexity);

  let boolMatches = 0;
  if (a.requiresReasoning === b.requiresReasoning) boolMatches++;
  if (a.requiresCode === b.requiresCode) boolMatches++;
  if (a.requiresCreativity === b.requiresCreativity) boolMatches++;
  if (a.hasAmbiguity === b.hasAmbiguity) boolMatches++;
  const boolSim = boolMatches / 4;
  const domainSim = a.domain === b.domain ? 1 : 0;

  return tokenSim * 0.2 + complexitySim * 0.3 + boolSim * 0.3 + domainSim * 0.2;
}

export function calculateStrength(perf: ModelPerformance): number {
  const latencyScore = Math.max(0, 1 - perf.avgLatencyMs / 10000);
  const tokenScore = Math.max(0, 1 - perf.avgTokens / 8000);
  return perf.avgQuality * 0.4 + perf.successRate * 0.3 + latencyScore * 0.2 + tokenScore * 0.1;
}

// ============================================================================
// Cleanup Helpers
// ============================================================================

export function cleanupOldRecords<T>(
  records: T[],
  cutoff: string,
  getTimestamp: (r: T) => string
): void {
  let i = 0;
  while (i < records.length) {
    const record = records[i];
    if (record !== undefined && getTimestamp(record) < cutoff) {
      i++;
    } else {
      break;
    }
  }
  if (i > 0) records.splice(0, i);
}

// ============================================================================
// Serialization Types
// ============================================================================

export interface SerializedStoreData {
  preferences: Array<[string, PreferenceDataPoint]>;
  performanceByTaskType: Array<[string, Array<[CliName, PerformanceAccumulator]>]>;
  experienceByWorkflow: Array<
    [string, Array<[string, ExperienceAccumulator & { modelSequence: readonly CliName[] }]>]
  >;
  actionCache: Array<[string, CachedActionResult]>;
  cacheHits: number;
  cacheMisses: number;
  routingDecisions: RoutingDecision[];
  taskOutcomes: TaskOutcome[];
}
