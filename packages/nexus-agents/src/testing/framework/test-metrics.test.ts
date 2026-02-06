/**
 * Tests for test-metrics.ts
 *
 * Covers groupBy, mean, stdDev, createEmptyMetrics, estimateCost,
 * computeCliMetrics, computeCategoryMetrics, computeDifficultyMetrics,
 * computeRoutingMetrics, and computeAggregatedMetrics.
 */

import { describe, it, expect } from 'vitest';
import {
  groupBy,
  mean,
  stdDev,
  createEmptyMetrics,
  estimateCost,
  computeCliMetrics,
  computeCategoryMetrics,
  computeDifficultyMetrics,
  computeRoutingMetrics,
  computeAggregatedMetrics,
} from './test-metrics.js';
import type { TaskTestResult } from './types.js';

// ============================================================================
// Fixtures
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeResult(overrides: Partial<TaskTestResult> = {}) {
  return {
    taskId: 'task-1',
    cli: 'claude' as const,
    success: true,
    durationMs: 1000,
    costUsd: 0.01,
    task: { category: 'code_generation', difficulty: 'easy' },
    rubricScore: { overallScore: 0.8 },
    tokenUsage: { inputTokens: 500, outputTokens: 200 },
    ...overrides,
  } as TaskTestResult;
}

// ============================================================================
// groupBy
// ============================================================================

describe('groupBy', () => {
  it('groups items by key function', () => {
    const items = [
      { name: 'a', type: 'x' },
      { name: 'b', type: 'y' },
      { name: 'c', type: 'x' },
    ];
    const grouped = groupBy(items, (i) => i.type);
    expect(grouped.get('x')).toHaveLength(2);
    expect(grouped.get('y')).toHaveLength(1);
  });

  it('returns empty map for empty input', () => {
    const grouped = groupBy([], (i: string) => i);
    expect(grouped.size).toBe(0);
  });

  it('handles single item', () => {
    const grouped = groupBy([{ val: 1 }], (i) => i.val);
    expect(grouped.get(1)).toHaveLength(1);
  });
});

// ============================================================================
// mean
// ============================================================================

describe('mean', () => {
  it('calculates mean of numbers', () => {
    expect(mean([2, 4, 6])).toBe(4);
  });

  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('returns single value for array of one', () => {
    expect(mean([7])).toBe(7);
  });

  it('handles floating point', () => {
    expect(mean([0.1, 0.2, 0.3])).toBeCloseTo(0.2);
  });
});

// ============================================================================
// stdDev
// ============================================================================

describe('stdDev', () => {
  it('calculates standard deviation', () => {
    // [2, 4, 6] → mean=4, diffs=[-2,0,2], squared=[4,0,4], mean=2.67, sqrt≈1.633
    expect(stdDev([2, 4, 6])).toBeCloseTo(1.633, 2);
  });

  it('returns 0 for fewer than 2 values', () => {
    expect(stdDev([])).toBe(0);
    expect(stdDev([5])).toBe(0);
  });

  it('returns 0 for identical values', () => {
    expect(stdDev([3, 3, 3])).toBe(0);
  });
});

// ============================================================================
// createEmptyMetrics
// ============================================================================

describe('createEmptyMetrics', () => {
  it('returns zeroed metrics', () => {
    const m = createEmptyMetrics();
    expect(m.totalTasks).toBe(0);
    expect(m.successfulTasks).toBe(0);
    expect(m.failedTasks).toBe(0);
    expect(m.successRate).toBe(0);
    expect(m.averageScore).toBe(0);
  });

  it('returns empty maps for breakdowns', () => {
    const m = createEmptyMetrics();
    expect(m.byCliMetrics.size).toBe(0);
    expect(m.byCategoryMetrics.size).toBe(0);
    expect(m.byDifficultyMetrics.size).toBe(0);
  });
});

// ============================================================================
// estimateCost
// ============================================================================

describe('estimateCost', () => {
  it('calculates cost for Claude', () => {
    const cost = estimateCost('claude', { inputTokens: 1_000_000, outputTokens: 100_000 });
    // 3.0 + 1.5 = 4.5
    expect(cost).toBeCloseTo(4.5);
  });

  it('calculates cost for Gemini', () => {
    const cost = estimateCost('gemini', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    // 0.075 + 0.3 = 0.375
    expect(cost).toBeCloseTo(0.375);
  });

  it('calculates cost for Codex', () => {
    const cost = estimateCost('codex', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    // 2.0 + 8.0 = 10.0
    expect(cost).toBeCloseTo(10.0);
  });

  it('returns 0 for zero tokens', () => {
    expect(estimateCost('claude', { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});

// ============================================================================
// computeCliMetrics
// ============================================================================

describe('computeCliMetrics', () => {
  it('computes metrics per CLI', () => {
    const results = [
      makeResult({ cli: 'claude' }),
      makeResult({ cli: 'claude', success: false }),
      makeResult({ cli: 'gemini' }),
    ];
    const metrics = computeCliMetrics(results);
    expect(metrics.size).toBe(2);

    const claude = metrics.get('claude');
    expect(claude?.taskCount).toBe(2);
    expect(claude?.successRate).toBe(0.5);

    const gemini = metrics.get('gemini');
    expect(gemini?.taskCount).toBe(1);
    expect(gemini?.successRate).toBe(1);
  });

  it('returns empty map for empty results', () => {
    expect(computeCliMetrics([]).size).toBe(0);
  });
});

// ============================================================================
// computeCategoryMetrics
// ============================================================================

describe('computeCategoryMetrics', () => {
  it('computes metrics per category', () => {
    const results = [
      makeResult({ task: { category: 'code_generation', difficulty: 'easy' } as never }),
      makeResult({ task: { category: 'code_review', difficulty: 'easy' } as never }),
    ];
    const metrics = computeCategoryMetrics(results);
    expect(metrics.size).toBe(2);
    expect(metrics.get('code_generation' as never)?.taskCount).toBe(1);
  });

  it('identifies best CLI for each category', () => {
    const results = [
      makeResult({
        cli: 'claude',
        task: { category: 'code_generation', difficulty: 'easy' } as never,
        rubricScore: { overallScore: 0.9 } as never,
      }),
      makeResult({
        cli: 'gemini',
        task: { category: 'code_generation', difficulty: 'easy' } as never,
        rubricScore: { overallScore: 0.5 } as never,
      }),
    ];
    const metrics = computeCategoryMetrics(results);
    expect(metrics.get('code_generation' as never)?.bestCli).toBe('claude');
  });
});

// ============================================================================
// computeDifficultyMetrics
// ============================================================================

describe('computeDifficultyMetrics', () => {
  it('computes metrics per difficulty', () => {
    const results = [
      makeResult({ task: { category: 'code_generation', difficulty: 'easy' } as never }),
      makeResult({ task: { category: 'code_generation', difficulty: 'hard' } as never }),
    ];
    const metrics = computeDifficultyMetrics(results);
    expect(metrics.size).toBe(2);
    expect(metrics.get('easy' as never)?.taskCount).toBe(1);
    expect(metrics.get('hard' as never)?.taskCount).toBe(1);
  });
});

// ============================================================================
// computeRoutingMetrics
// ============================================================================

describe('computeRoutingMetrics', () => {
  it('returns empty for no routing data', () => {
    const results = [makeResult()];
    const metrics = computeRoutingMetrics(results);
    expect(metrics.accuracy).toBeUndefined();
  });

  it('computes accuracy from routing scores', () => {
    const results = [
      makeResult({ routingScore: { matchedPreferred: true, confidenceCalibration: 0.9 } as never }),
      makeResult({
        routingScore: { matchedPreferred: false, confidenceCalibration: 0.5 } as never,
      }),
    ];
    const metrics = computeRoutingMetrics(results);
    expect(metrics.accuracy).toBe(0.5);
    expect(metrics.confidence).toBeCloseTo(0.7);
  });
});

// ============================================================================
// computeAggregatedMetrics
// ============================================================================

describe('computeAggregatedMetrics', () => {
  it('returns empty metrics for empty results', () => {
    const metrics = computeAggregatedMetrics([]);
    expect(metrics.totalTasks).toBe(0);
    expect(metrics.successRate).toBe(0);
  });

  it('computes aggregated metrics from results', () => {
    const results = [
      makeResult({ success: true, durationMs: 1000 }),
      makeResult({ success: false, durationMs: 2000 }),
    ];
    const metrics = computeAggregatedMetrics(results);
    expect(metrics.totalTasks).toBe(2);
    expect(metrics.successfulTasks).toBe(1);
    expect(metrics.failedTasks).toBe(1);
    expect(metrics.successRate).toBe(0.5);
    expect(metrics.totalDurationMs).toBe(3000);
    expect(metrics.averageDurationMs).toBe(1500);
  });

  it('includes CLI, category, and difficulty breakdowns', () => {
    const results = [makeResult()];
    const metrics = computeAggregatedMetrics(results);
    expect(metrics.byCliMetrics.size).toBeGreaterThan(0);
    expect(metrics.byCategoryMetrics.size).toBeGreaterThan(0);
    expect(metrics.byDifficultyMetrics.size).toBeGreaterThan(0);
  });

  it('includes routing metrics when present', () => {
    const results = [
      makeResult({ routingScore: { matchedPreferred: true, confidenceCalibration: 0.8 } as never }),
    ];
    const metrics = computeAggregatedMetrics(results);
    expect(metrics.routingAccuracy).toBe(1);
  });
});
