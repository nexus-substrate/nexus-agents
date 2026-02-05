/**
 * Tests for Validation Dashboard Calculation Helpers
 * @module observability/validation-dashboard-calc.test
 */

import { describe, it, expect } from 'vitest';
import type { DashboardOutcome } from './validation-dashboard-types.js';
import {
  getUniqueModels,
  getUniqueTaskTypes,
  calculateConvergenceScore,
  calculateAvgReward,
  computeHealthScore,
} from './validation-dashboard-calc.js';

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

  it('returns single model', () => {
    const outcomes = [makeOutcome({ model: 'claude' }), makeOutcome({ model: 'claude' })];
    expect(getUniqueModels(outcomes)).toEqual(['claude']);
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
});
