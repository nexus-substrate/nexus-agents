/**
 * Tests for Metrics Collector Helpers
 * @module testing/framework/metrics-collector-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { LatencyMeasurement, TaskOutcome, TokenRecord } from './metrics-collector-types.js';
import {
  percentile,
  computeLatencyMetrics,
  computeReliabilityMetrics,
  computeTokenMetrics,
} from './metrics-collector-helpers.js';

// ============================================================================
// percentile
// ============================================================================

describe('percentile', () => {
  it('returns 0 for empty array', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('returns single value for array of one', () => {
    expect(percentile([42], 50)).toBe(42);
  });

  it('returns median for sorted array', () => {
    expect(percentile([10, 20, 30], 50)).toBe(20);
  });

  it('returns min for 0th percentile', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
  });

  it('returns max for 100th percentile', () => {
    expect(percentile([10, 20, 30], 100)).toBe(30);
  });

  it('interpolates between values', () => {
    // p25 of [10, 20, 30, 40]: index = 0.75, between 10 and 20
    expect(percentile([10, 20, 30, 40], 25)).toBe(17.5);
  });
});

// ============================================================================
// computeLatencyMetrics
// ============================================================================

describe('computeLatencyMetrics', () => {
  it('returns empty metrics for no measurements', () => {
    const metrics = computeLatencyMetrics([]);
    expect(metrics.count).toBe(0);
    expect(metrics.meanMs).toBe(0);
  });

  it('computes correct metrics', () => {
    const measurements: LatencyMeasurement[] = [
      { durationMs: 100 },
      { durationMs: 200 },
      { durationMs: 300 },
    ] as LatencyMeasurement[];
    const metrics = computeLatencyMetrics(measurements);
    expect(metrics.count).toBe(3);
    expect(metrics.minMs).toBe(100);
    expect(metrics.maxMs).toBe(300);
    expect(metrics.meanMs).toBe(200);
    expect(metrics.p50Ms).toBe(200);
    expect(metrics.stdDevMs).toBeGreaterThan(0);
  });

  it('handles single measurement', () => {
    const metrics = computeLatencyMetrics([{ durationMs: 50 }] as LatencyMeasurement[]);
    expect(metrics.count).toBe(1);
    expect(metrics.minMs).toBe(50);
    expect(metrics.maxMs).toBe(50);
    expect(metrics.meanMs).toBe(50);
    expect(metrics.stdDevMs).toBe(0);
  });
});

// ============================================================================
// computeReliabilityMetrics
// ============================================================================

describe('computeReliabilityMetrics', () => {
  it('returns empty metrics for no outcomes', () => {
    const metrics = computeReliabilityMetrics([]);
    expect(metrics.totalTasks).toBe(0);
    expect(metrics.successRate).toBe(0);
  });

  it('computes success rate correctly', () => {
    const outcomes: TaskOutcome[] = [
      { success: true, retryCount: 0 },
      { success: true, retryCount: 0 },
      { success: false, retryCount: 2 },
    ] as TaskOutcome[];
    const metrics = computeReliabilityMetrics(outcomes);
    expect(metrics.totalTasks).toBe(3);
    expect(metrics.successCount).toBe(2);
    expect(metrics.failureCount).toBe(1);
    expect(metrics.successRate).toBeCloseTo(2 / 3);
    expect(metrics.totalRetries).toBe(2);
    expect(metrics.meanRetriesPerFailure).toBe(2);
  });

  it('computes first attempt success rate', () => {
    const outcomes: TaskOutcome[] = [
      { success: true, retryCount: 0 },
      { success: true, retryCount: 1 },
      { success: false, retryCount: 3 },
    ] as TaskOutcome[];
    const metrics = computeReliabilityMetrics(outcomes);
    expect(metrics.firstAttemptSuccessCount).toBe(1);
    expect(metrics.firstAttemptSuccessRate).toBeCloseTo(1 / 3);
  });
});

// ============================================================================
// computeTokenMetrics
// ============================================================================

describe('computeTokenMetrics', () => {
  it('returns empty metrics for no records', () => {
    const metrics = computeTokenMetrics([]);
    expect(metrics.totalTokens).toBe(0);
    expect(metrics.taskCount).toBe(0);
  });

  it('computes token totals and means', () => {
    const records: TokenRecord[] = [
      { usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } },
      { usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 } },
    ] as TokenRecord[];
    const metrics = computeTokenMetrics(records);
    expect(metrics.totalInputTokens).toBe(300);
    expect(metrics.totalOutputTokens).toBe(150);
    expect(metrics.totalTokens).toBe(450);
    expect(metrics.meanInputTokens).toBe(150);
    expect(metrics.meanOutputTokens).toBe(75);
    expect(metrics.taskCount).toBe(2);
  });
});
