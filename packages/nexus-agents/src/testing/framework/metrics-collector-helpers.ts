/**
 * nexus-agents/testing/framework - Metrics Collector Helpers
 *
 * Pure helper functions for metrics computation.
 * Extracted from metrics-collector.ts to reduce file size.
 */

import type {
  LatencyMeasurement,
  LatencyMetrics,
  ReliabilityMetrics,
  TokenMetrics,
  TaskOutcome,
  TokenRecord,
} from './metrics-collector-types.js';
import {
  EMPTY_LATENCY_METRICS,
  EMPTY_RELIABILITY_METRICS,
  EMPTY_TOKEN_METRICS,
} from './metrics-collector-types.js';

/**
 * Calculates a percentile value from a sorted array.
 * Uses linear interpolation for non-integer indices.
 *
 * @param sortedValues - Array of values sorted in ascending order
 * @param p - Percentile to calculate (0-100)
 * @returns The percentile value
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const firstValue = sortedValues[0];
  if (sortedValues.length === 1 || firstValue === undefined) {
    return firstValue ?? 0;
  }

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? 0;

  if (lower === upper) {
    return lowerValue;
  }

  const fraction = index - lower;
  return lowerValue + fraction * (upperValue - lowerValue);
}

/**
 * Computes latency metrics from a set of measurements.
 *
 * @param measurements - Array of latency measurements
 * @returns Computed latency metrics with percentiles
 */
export function computeLatencyMetrics(measurements: LatencyMeasurement[]): LatencyMetrics {
  if (measurements.length === 0) {
    return EMPTY_LATENCY_METRICS;
  }

  const durations = measurements.map((m) => m.durationMs).sort((a, b) => a - b);
  const count = durations.length;
  const sum = durations.reduce((acc, d) => acc + d, 0);
  const mean = sum / count;

  // Calculate standard deviation
  const squaredDiffs = durations.map((d) => (d - mean) ** 2);
  const variance = squaredDiffs.reduce((acc, d) => acc + d, 0) / count;
  const stdDev = Math.sqrt(variance);

  // Safe access since we checked length > 0
  const minMs = durations[0] ?? 0;
  const maxMs = durations[count - 1] ?? 0;

  return {
    count,
    minMs,
    maxMs,
    meanMs: mean,
    p50Ms: percentile(durations, 50),
    p75Ms: percentile(durations, 75),
    p90Ms: percentile(durations, 90),
    p95Ms: percentile(durations, 95),
    p99Ms: percentile(durations, 99),
    stdDevMs: stdDev,
  };
}

/**
 * Computes reliability metrics from task outcomes.
 *
 * @param outcomes - Array of task outcomes
 * @returns Computed reliability metrics
 */
export function computeReliabilityMetrics(outcomes: TaskOutcome[]): ReliabilityMetrics {
  if (outcomes.length === 0) {
    return EMPTY_RELIABILITY_METRICS;
  }

  const totalTasks = outcomes.length;
  const successes = outcomes.filter((o) => o.success);
  const failures = outcomes.filter((o) => !o.success);
  const successCount = successes.length;
  const failureCount = failures.length;

  const totalRetries = outcomes.reduce((acc, o) => acc + o.retryCount, 0);
  const meanRetriesPerFailure = failureCount > 0 ? totalRetries / failureCount : 0;

  const firstAttemptSuccesses = successes.filter((o) => o.retryCount === 0);
  const firstAttemptSuccessCount = firstAttemptSuccesses.length;

  return {
    totalTasks,
    successCount,
    failureCount,
    successRate: successCount / totalTasks,
    totalRetries,
    meanRetriesPerFailure,
    firstAttemptSuccessCount,
    firstAttemptSuccessRate: firstAttemptSuccessCount / totalTasks,
  };
}

/**
 * Computes token metrics from token records.
 *
 * @param records - Array of token records
 * @returns Computed token metrics
 */
export function computeTokenMetrics(records: TokenRecord[]): TokenMetrics {
  if (records.length === 0) {
    return EMPTY_TOKEN_METRICS;
  }

  const taskCount = records.length;
  let totalInput = 0;
  let totalOutput = 0;

  for (const record of records) {
    totalInput += record.usage.inputTokens;
    totalOutput += record.usage.outputTokens;
  }

  const totalTokens = totalInput + totalOutput;

  return {
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens,
    meanInputTokens: totalInput / taskCount,
    meanOutputTokens: totalOutput / taskCount,
    taskCount,
  };
}
