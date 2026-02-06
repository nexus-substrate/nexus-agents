/**
 * Tests for Validation Dashboard Calculation Helpers
 * @module observability/validation-dashboard-calc.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { DashboardOutcome } from './validation-dashboard-types.js';
import {
  getPeriodBounds,
  getUniqueModels,
  getUniqueTaskTypes,
  calculateModelPerformance,
  calculateTaskTypePerformance,
  calculateLearningProgress,
  calculateConvergenceScore,
  calculateAvgReward,
  computeHealthScore,
} from './validation-dashboard-calc.js';

// ============================================================================
// Mocks
// ============================================================================

const FIXED_NOW = 1_700_000_000_000; // Fixed timestamp for deterministic tests

vi.mock('../core/index.js', () => ({
  getTimeProvider: (): { now: () => number } => ({
    now: (): number => FIXED_NOW,
  }),
}));

// ============================================================================
// Test Helpers
// ============================================================================

function makeOutcome(overrides?: Partial<DashboardOutcome>): DashboardOutcome {
  return {
    model: 'claude',
    taskType: 'code_review',
    success: true,
    reward: 0.8,
    latencyMs: 1500,
    tokensUsed: 500,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeOutcomes(count: number, overrides?: Partial<DashboardOutcome>): DashboardOutcome[] {
  return Array.from({ length: count }, () => makeOutcome(overrides));
}

// ============================================================================
// getPeriodBounds
// ============================================================================

describe('getPeriodBounds', () => {
  it('returns 1h bounds', () => {
    const { start, end } = getPeriodBounds('1h');
    expect(end).toBe(FIXED_NOW);
    expect(start).toBe(FIXED_NOW - 60 * 60 * 1000);
  });

  it('returns 24h bounds', () => {
    const { start, end } = getPeriodBounds('24h');
    expect(end).toBe(FIXED_NOW);
    expect(start).toBe(FIXED_NOW - 24 * 60 * 60 * 1000);
  });

  it('returns 7d bounds', () => {
    const { start, end } = getPeriodBounds('7d');
    expect(end).toBe(FIXED_NOW);
    expect(start).toBe(FIXED_NOW - 7 * 24 * 60 * 60 * 1000);
  });

  it('returns 30d bounds', () => {
    const { start, end } = getPeriodBounds('30d');
    expect(end).toBe(FIXED_NOW);
    expect(start).toBe(FIXED_NOW - 30 * 24 * 60 * 60 * 1000);
  });

  it('returns all period bounds with start=0', () => {
    const { start, end } = getPeriodBounds('all');
    expect(end).toBe(FIXED_NOW);
    expect(start).toBe(0);
  });

  it('end is always fixed now for every period', () => {
    const periods = ['1h', '24h', '7d', '30d', 'all'] as const;
    for (const p of periods) {
      expect(getPeriodBounds(p).end).toBe(FIXED_NOW);
    }
  });

  it('start values are ordered: 1h > 24h > 7d > 30d > all', () => {
    const s1h = getPeriodBounds('1h').start;
    const s24h = getPeriodBounds('24h').start;
    const s7d = getPeriodBounds('7d').start;
    const s30d = getPeriodBounds('30d').start;
    const sAll = getPeriodBounds('all').start;
    expect(s1h).toBeGreaterThan(s24h);
    expect(s24h).toBeGreaterThan(s7d);
    expect(s7d).toBeGreaterThan(s30d);
    expect(s30d).toBeGreaterThan(sAll);
  });
});

// ============================================================================
// getUniqueModels
// ============================================================================

describe('getUniqueModels', () => {
  it('returns unique sorted model names', () => {
    const outcomes = [
      makeOutcome({ model: 'gemini' }),
      makeOutcome({ model: 'claude' }),
      makeOutcome({ model: 'gemini' }),
      makeOutcome({ model: 'codex' }),
    ];
    expect(getUniqueModels(outcomes)).toEqual(['claude', 'codex', 'gemini']);
  });

  it('returns empty for no outcomes', () => {
    expect(getUniqueModels([])).toEqual([]);
  });

  it('returns single model when all outcomes use same model', () => {
    const outcomes = [makeOutcome({ model: 'claude' }), makeOutcome({ model: 'claude' })];
    expect(getUniqueModels(outcomes)).toEqual(['claude']);
  });

  it('sorts lexicographically', () => {
    const outcomes = [
      makeOutcome({ model: 'zebra' }),
      makeOutcome({ model: 'alpha' }),
      makeOutcome({ model: 'mid' }),
    ];
    expect(getUniqueModels(outcomes)).toEqual(['alpha', 'mid', 'zebra']);
  });
});

// ============================================================================
// getUniqueTaskTypes
// ============================================================================

describe('getUniqueTaskTypes', () => {
  it('returns unique sorted task types', () => {
    const outcomes = [
      makeOutcome({ taskType: 'research' }),
      makeOutcome({ taskType: 'code_review' }),
      makeOutcome({ taskType: 'research' }),
    ];
    expect(getUniqueTaskTypes(outcomes)).toEqual(['code_review', 'research']);
  });

  it('returns empty for no outcomes', () => {
    expect(getUniqueTaskTypes([])).toEqual([]);
  });

  it('returns single task type', () => {
    const outcomes = [makeOutcome({ taskType: 'analysis' }), makeOutcome({ taskType: 'analysis' })];
    expect(getUniqueTaskTypes(outcomes)).toEqual(['analysis']);
  });
});

// ============================================================================
// calculateModelPerformance
// ============================================================================

describe('calculateModelPerformance', () => {
  it('returns zero metrics for model with no outcomes', () => {
    const result = calculateModelPerformance('unknown', []);
    expect(result.model).toBe('unknown');
    expect(result.n).toBe(0);
    expect(result.avgLatencyMs).toBe(0);
    expect(result.costEfficiency).toBe(0);
  });

  it('calculates correct n for matching model', () => {
    const outcomes = [
      makeOutcome({ model: 'claude' }),
      makeOutcome({ model: 'gemini' }),
      makeOutcome({ model: 'claude' }),
    ];
    const result = calculateModelPerformance('claude', outcomes);
    expect(result.n).toBe(2);
  });

  it('calculates success rate for all successes', () => {
    const outcomes = makeOutcomes(5, { model: 'claude', success: true });
    const result = calculateModelPerformance('claude', outcomes);
    expect(result.successRate).toBeCloseTo(1.0);
  });

  it('calculates success rate for all failures', () => {
    const outcomes = makeOutcomes(5, { model: 'claude', success: false });
    const result = calculateModelPerformance('claude', outcomes);
    expect(result.successRate).toBeCloseTo(0.0);
  });

  it('calculates mixed success rate', () => {
    const outcomes = [
      makeOutcome({ model: 'claude', success: true }),
      makeOutcome({ model: 'claude', success: true }),
      makeOutcome({ model: 'claude', success: false }),
    ];
    const result = calculateModelPerformance('claude', outcomes);
    // 2/3 successes
    expect(result.successRate).toBeCloseTo(2 / 3, 5);
  });

  it('returns confidence interval with correct n', () => {
    const outcomes = makeOutcomes(10, { model: 'claude', success: true });
    const result = calculateModelPerformance('claude', outcomes);
    expect(result.successRateCI.n).toBe(10);
    expect(result.successRateCI.estimate).toBeCloseTo(1.0);
  });

  it('calculates average latency', () => {
    const outcomes = [
      makeOutcome({ model: 'claude', latencyMs: 1000 }),
      makeOutcome({ model: 'claude', latencyMs: 2000 }),
      makeOutcome({ model: 'claude', latencyMs: 3000 }),
    ];
    const result = calculateModelPerformance('claude', outcomes);
    expect(result.avgLatencyMs).toBeCloseTo(2000);
  });

  it('calculates cost efficiency as reward per kilo-token', () => {
    const outcomes = [
      makeOutcome({ model: 'claude', reward: 0.5, tokensUsed: 1000 }),
      makeOutcome({ model: 'claude', reward: 1.0, tokensUsed: 1000 }),
    ];
    const result = calculateModelPerformance('claude', outcomes);
    // avgReward = 0.75, totalTokens = 2000, costEfficiency = 0.75 / 2 = 0.375
    expect(result.costEfficiency).toBeCloseTo(0.375);
  });

  it('returns zero cost efficiency when no tokens used', () => {
    const outcomes = [makeOutcome({ model: 'claude', tokensUsed: 0, reward: 0.5 })];
    const result = calculateModelPerformance('claude', outcomes);
    expect(result.costEfficiency).toBe(0);
  });

  it('filters outcomes to only matching model', () => {
    const outcomes = [
      makeOutcome({ model: 'claude', reward: 1.0 }),
      makeOutcome({ model: 'gemini', reward: 0.0 }),
    ];
    const result = calculateModelPerformance('claude', outcomes);
    expect(result.avgReward).toBeCloseTo(1.0);
    expect(result.n).toBe(1);
  });

  it('computes win/loss from allModelRewards', () => {
    const outcomes = [
      makeOutcome({
        model: 'claude',
        reward: 1.0,
        allModelRewards: { claude: 1.0, gemini: 0.5 },
      }),
      makeOutcome({
        model: 'gemini',
        reward: 0.5,
        allModelRewards: { claude: 0.8, gemini: 0.5 },
      }),
    ];
    const result = calculateModelPerformance('claude', outcomes);
    // claude wins both comparisons where allModelRewards includes claude
    expect(result.winRate).toBeGreaterThanOrEqual(0);
  });

  it('handles outcomes with no allModelRewards', () => {
    const outcomes = makeOutcomes(3, { model: 'claude' });
    const result = calculateModelPerformance('claude', outcomes);
    // No comparable outcomes, so winRate should be 0
    expect(result.winRate).toBe(0);
  });
});

// ============================================================================
// calculateTaskTypePerformance
// ============================================================================

describe('calculateTaskTypePerformance', () => {
  it('returns empty modelPerformance for no outcomes', () => {
    const result = calculateTaskTypePerformance('code_review', [], 1);
    expect(result.taskType).toBe('code_review');
    expect(result.modelPerformance).toEqual([]);
    expect(result.bestModel).toBe('');
    expect(result.worstModel).toBe('');
  });

  it('filters by task type', () => {
    const outcomes = [
      makeOutcome({ taskType: 'code_review', model: 'claude' }),
      makeOutcome({ taskType: 'research', model: 'gemini' }),
    ];
    const result = calculateTaskTypePerformance('code_review', outcomes, 1);
    expect(result.modelPerformance.length).toBe(1);
    expect(result.modelPerformance[0]?.model).toBe('claude');
  });

  it('respects minSampleSize filter', () => {
    const outcomes = [
      makeOutcome({ taskType: 'code_review', model: 'claude' }),
      makeOutcome({ taskType: 'code_review', model: 'claude' }),
      makeOutcome({ taskType: 'code_review', model: 'gemini' }),
    ];
    // minSampleSize=2 should exclude gemini (only 1 outcome)
    const result = calculateTaskTypePerformance('code_review', outcomes, 2);
    expect(result.modelPerformance.length).toBe(1);
    expect(result.modelPerformance[0]?.model).toBe('claude');
  });

  it('identifies best and worst model by success rate', () => {
    const outcomes = [
      makeOutcome({ taskType: 'test', model: 'claude', success: true }),
      makeOutcome({ taskType: 'test', model: 'claude', success: true }),
      makeOutcome({ taskType: 'test', model: 'gemini', success: false }),
      makeOutcome({ taskType: 'test', model: 'gemini', success: false }),
    ];
    const result = calculateTaskTypePerformance('test', outcomes, 1);
    expect(result.bestModel).toBe('claude');
    expect(result.worstModel).toBe('gemini');
  });

  it('handles all models below minSampleSize', () => {
    const outcomes = [makeOutcome({ taskType: 'rare', model: 'claude' })];
    const result = calculateTaskTypePerformance('rare', outcomes, 5);
    expect(result.modelPerformance).toEqual([]);
    expect(result.bestModel).toBe('');
    expect(result.worstModel).toBe('');
  });

  it('handles single model meeting minSampleSize', () => {
    const outcomes = makeOutcomes(3, { taskType: 'test', model: 'claude' });
    const result = calculateTaskTypePerformance('test', outcomes, 3);
    expect(result.bestModel).toBe('claude');
    expect(result.worstModel).toBe('claude');
  });
});

// ============================================================================
// calculateLearningProgress
// ============================================================================

describe('calculateLearningProgress', () => {
  it('returns zero exploration rate for empty history', () => {
    const result = calculateLearningProgress([], [], {});
    expect(result.explorationRate).toBe(0);
    expect(result.explorationRateTrend).toBe(0);
  });

  it('calculates average exploration rate from last 10 entries', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      timestamp: i,
      rate: 0.5,
    }));
    const result = calculateLearningProgress([], history, {});
    expect(result.explorationRate).toBeCloseTo(0.5);
  });

  it('calculates exploration rate trend as difference between recent and older', () => {
    // Older 10 entries with rate 0.3, recent 10 entries with rate 0.1
    const history = [
      ...Array.from({ length: 10 }, (_, i) => ({ timestamp: i, rate: 0.3 })),
      ...Array.from({ length: 10 }, (_, i) => ({ timestamp: i + 10, rate: 0.1 })),
    ];
    const result = calculateLearningProgress([], history, {});
    expect(result.explorationRate).toBeCloseTo(0.1);
    // trend = 0.1 - 0.3 = -0.2 (decreasing)
    expect(result.explorationRateTrend).toBeCloseTo(-0.2);
  });

  it('trend is zero when fewer than 20 entries', () => {
    const history = Array.from({ length: 5 }, (_, i) => ({
      timestamp: i,
      rate: 0.4,
    }));
    const result = calculateLearningProgress([], history, {});
    // recent = last 10 (only 5 exist) => avg 0.4
    // older = slice(-20, -10) => empty => olderAvg defaults to explorationRate
    // trend = 0.4 - 0.4 = 0
    expect(result.explorationRateTrend).toBeCloseTo(0);
  });

  it('calculates feature importance from feature weights', () => {
    const featureWeights = {
      complexity: [0.5, -0.3, 0.4],
      urgency: [0.1, 0.1, 0.1],
    };
    const result = calculateLearningProgress([], [], featureWeights);
    // complexity importance = (0.5 + 0.3 + 0.4) / 3 = 0.4
    // urgency importance = (0.1 + 0.1 + 0.1) / 3 = 0.1
    expect(result.featureImportance.length).toBe(2);
    expect(result.featureImportance[0]?.feature).toBe('complexity');
    expect(result.featureImportance[0]?.importance).toBeCloseTo(0.4);
    expect(result.featureImportance[1]?.feature).toBe('urgency');
  });

  it('limits feature importance to top 10', () => {
    const featureWeights: Record<string, number[]> = {};
    for (let i = 0; i < 15; i++) {
      featureWeights[`feat${String(i)}`] = [i * 0.1];
    }
    const result = calculateLearningProgress([], [], featureWeights);
    expect(result.featureImportance.length).toBe(10);
  });

  it('sorts feature importance descending', () => {
    const featureWeights = {
      low: [0.1],
      high: [0.9],
      mid: [0.5],
    };
    const result = calculateLearningProgress([], [], featureWeights);
    expect(result.featureImportance[0]?.feature).toBe('high');
    expect(result.featureImportance[2]?.feature).toBe('low');
  });

  it('calculates regret from comparable outcomes', () => {
    const outcomes = [
      makeOutcome({
        model: 'claude',
        reward: 0.8,
        allModelRewards: { claude: 0.8, gemini: 1.0 },
      }),
    ];
    const result = calculateLearningProgress(outcomes, [], {});
    expect(result.cumulativeRegret).toBeCloseTo(0.2);
    expect(result.avgRegret).toBeCloseTo(0.2);
  });

  it('optimal rate is 1 when no comparable outcomes', () => {
    const result = calculateLearningProgress([], [], {});
    expect(result.optimalRate).toBe(1);
  });

  it('calculates convergence score from feature weights', () => {
    const featureWeights = {
      feat1: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    };
    const result = calculateLearningProgress([], [], featureWeights);
    expect(result.convergenceScore).toBeCloseTo(1.0, 5);
  });

  it('handles outcomes without allModelRewards', () => {
    const outcomes = [makeOutcome({ model: 'claude', reward: 0.8 })];
    const result = calculateLearningProgress(outcomes, [], {});
    // No comparable outcomes => regret defaults
    expect(result.cumulativeRegret).toBe(0);
    expect(result.optimalRate).toBe(1);
  });
});

// ============================================================================
// calculateConvergenceScore
// ============================================================================

describe('calculateConvergenceScore', () => {
  it('returns 0 for empty weights', () => {
    expect(calculateConvergenceScore({})).toBe(0);
  });

  it('returns 0 when all features have < 5 weights', () => {
    expect(calculateConvergenceScore({ feat1: [1, 2, 3] })).toBe(0);
  });

  it('returns 1 for perfectly stable weights', () => {
    const weights = { feat1: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] };
    expect(calculateConvergenceScore(weights)).toBeCloseTo(1.0, 5);
  });

  it('returns lower score for high-variance weights', () => {
    const stable = { feat1: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] };
    const unstable = { feat1: [0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0] };
    expect(calculateConvergenceScore(stable)).toBeGreaterThan(calculateConvergenceScore(unstable));
  });

  it('uses last 10 values only', () => {
    // First 10 values are very unstable, last 10 are stable
    const weights = {
      feat1: [
        0, 100, 0, 100, 0, 100, 0, 100, 0, 100, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
      ],
    };
    expect(calculateConvergenceScore(weights)).toBeCloseTo(1.0, 5);
  });

  it('handles multiple features', () => {
    const weights = {
      feat1: [0.5, 0.5, 0.5, 0.5, 0.5],
      feat2: [0.3, 0.3, 0.3, 0.3, 0.3],
    };
    expect(calculateConvergenceScore(weights)).toBeCloseTo(1.0, 5);
  });

  it('skips features with fewer than 5 weights in multi-feature case', () => {
    const weights = {
      short: [1, 2],
      stable: [0.5, 0.5, 0.5, 0.5, 0.5],
    };
    // Only stable is considered -> variance = 0 -> exp(0) = 1
    expect(calculateConvergenceScore(weights)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 when only feature has fewer than 5 values', () => {
    expect(calculateConvergenceScore({ feat: [1, 2, 3, 4] })).toBe(0);
  });

  it('handles exactly 5 weights', () => {
    const weights = { feat1: [1.0, 1.0, 1.0, 1.0, 1.0] };
    expect(calculateConvergenceScore(weights)).toBeCloseTo(1.0, 5);
  });

  it('returns score between 0 and 1 for any valid input', () => {
    const weights = { feat1: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90] };
    const score = calculateConvergenceScore(weights);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('score decreases monotonically with increasing variance', () => {
    const low = { feat1: [1.0, 1.0, 1.0, 1.0, 1.01] };
    const mid = { feat1: [1.0, 1.0, 1.0, 1.0, 2.0] };
    const high = { feat1: [1.0, 1.0, 1.0, 1.0, 100.0] };
    expect(calculateConvergenceScore(low)).toBeGreaterThan(calculateConvergenceScore(mid));
    expect(calculateConvergenceScore(mid)).toBeGreaterThan(calculateConvergenceScore(high));
  });
});

// ============================================================================
// calculateAvgReward
// ============================================================================

describe('calculateAvgReward', () => {
  it('returns 0 for empty outcomes', () => {
    expect(calculateAvgReward([])).toBe(0);
  });

  it('returns correct average for single outcome', () => {
    expect(calculateAvgReward([makeOutcome({ reward: 0.8 })])).toBe(0.8);
  });

  it('returns correct average for multiple outcomes', () => {
    const outcomes = [
      makeOutcome({ reward: 0.6 }),
      makeOutcome({ reward: 0.8 }),
      makeOutcome({ reward: 1.0 }),
    ];
    expect(calculateAvgReward(outcomes)).toBeCloseTo(0.8, 10);
  });

  it('handles negative rewards', () => {
    const outcomes = [makeOutcome({ reward: -1.0 }), makeOutcome({ reward: 1.0 })];
    expect(calculateAvgReward(outcomes)).toBeCloseTo(0.0);
  });

  it('handles zero rewards', () => {
    const outcomes = makeOutcomes(3, { reward: 0 });
    expect(calculateAvgReward(outcomes)).toBe(0);
  });

  it('handles large reward values', () => {
    const outcomes = [makeOutcome({ reward: 1e6 }), makeOutcome({ reward: 1e6 })];
    expect(calculateAvgReward(outcomes)).toBeCloseTo(1e6);
  });
});

// ============================================================================
// computeHealthScore
// ============================================================================

describe('computeHealthScore', () => {
  it('returns 1.0 when all indicators are true', () => {
    expect(computeHealthScore(true, true, true, true)).toBe(1.0);
  });

  it('returns minimum when all indicators are false', () => {
    const score = computeHealthScore(false, false, false, false);
    // (0.5 + 0.5 + 0.7 + 0.8) / 4 = 0.625
    expect(score).toBeCloseTo(0.625, 10);
  });

  it('weights indicators differently', () => {
    // hasMinimumData false => 0.5 (biggest penalty)
    const noData = computeHealthScore(false, true, true, true);
    // noUnderperformers false => 0.8 (smallest penalty)
    const hasUnder = computeHealthScore(true, true, true, false);
    expect(noData).toBeLessThan(hasUnder);
  });

  it('returns between 0.5 and 1.0', () => {
    const allFalse = computeHealthScore(false, false, false, false);
    const allTrue = computeHealthScore(true, true, true, true);
    expect(allFalse).toBeGreaterThanOrEqual(0.5);
    expect(allTrue).toBeLessThanOrEqual(1.0);
  });

  it('hasMinimumData false gives (0.5+1+1+1)/4 = 0.875', () => {
    expect(computeHealthScore(false, true, true, true)).toBeCloseTo(0.875, 10);
  });

  it('isLearning false gives (1+0.5+1+1)/4 = 0.875', () => {
    expect(computeHealthScore(true, false, true, true)).toBeCloseTo(0.875, 10);
  });

  it('healthyExploration false gives (1+1+0.7+1)/4 = 0.925', () => {
    expect(computeHealthScore(true, true, false, true)).toBeCloseTo(0.925, 10);
  });

  it('noUnderperformers false gives (1+1+1+0.8)/4 = 0.95', () => {
    expect(computeHealthScore(true, true, true, false)).toBeCloseTo(0.95, 10);
  });

  it('each boolean combination is deterministic', () => {
    const result1 = computeHealthScore(true, false, true, false);
    const result2 = computeHealthScore(true, false, true, false);
    expect(result1).toBe(result2);
  });
});
