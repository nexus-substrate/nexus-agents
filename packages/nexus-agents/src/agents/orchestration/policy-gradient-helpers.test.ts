/**
 * Tests for Policy Gradient Helpers
 * @module agents/orchestration/policy-gradient-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { PolicyTrajectoryStep } from './policy-types.js';
import type { PuppeteerState } from './puppeteer-types.js';
import {
  LEARNABLE_WEIGHTS,
  computeReturns,
  computeGradients,
  extractFeatureValues,
  normalizeWeights,
  applyGradientUpdate,
} from './policy-gradient-helpers.js';
import type { ScoringFeatures } from './policy-feature-extraction.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeStep(overrides: Partial<PolicyTrajectoryStep> = {}): PolicyTrajectoryStep {
  return {
    state: {
      taskDescription: 'test task',
      availableAgents: [],
      stepHistory: [],
      currentStep: 0,
      maxSteps: 10,
    } as unknown as PuppeteerState,
    action: 'agent-1',
    reward: 0.5,
    logProb: -1.0,
    ...overrides,
  };
}

// ============================================================================
// LEARNABLE_WEIGHTS
// ============================================================================

describe('LEARNABLE_WEIGHTS', () => {
  it('contains expected weight keys', () => {
    expect(LEARNABLE_WEIGHTS).toContain('recency');
    expect(LEARNABLE_WEIGHTS).toContain('capability_match');
    expect(LEARNABLE_WEIGHTS).toContain('cost_efficiency');
    expect(LEARNABLE_WEIGHTS).toContain('pattern_match');
  });

  it('has 4 weight keys', () => {
    expect(LEARNABLE_WEIGHTS).toHaveLength(4);
  });
});

// ============================================================================
// computeReturns
// ============================================================================

describe('computeReturns', () => {
  it('returns empty array for empty trajectory', () => {
    expect(computeReturns([], 1.0, 0.99)).toEqual([]);
  });

  it('computes single step return', () => {
    const steps = [makeStep({ reward: 0.5 })];
    const returns = computeReturns(steps, 1.0, 0.99);
    // return[0] = 0.5 + 0.99 * 1.0 = 1.49
    expect(returns).toHaveLength(1);
    expect(returns[0]).toBeCloseTo(1.49);
  });

  it('computes multi-step returns with discounting', () => {
    const steps = [makeStep({ reward: 0.0 }), makeStep({ reward: 0.0 }), makeStep({ reward: 1.0 })];
    const returns = computeReturns(steps, 0.0, 0.9);
    // return[2] = 1.0 + 0.9 * 0.0 = 1.0
    // return[1] = 0.0 + 0.9 * 1.0 = 0.9
    // return[0] = 0.0 + 0.9 * 0.9 = 0.81
    expect(returns[2]).toBeCloseTo(1.0);
    expect(returns[1]).toBeCloseTo(0.9);
    expect(returns[0]).toBeCloseTo(0.81);
  });

  it('applies discount factor correctly', () => {
    const steps = [makeStep({ reward: 1.0 }), makeStep({ reward: 1.0 })];
    const returns = computeReturns(steps, 0.0, 0.5);
    // return[1] = 1.0 + 0.5 * 0.0 = 1.0
    // return[0] = 1.0 + 0.5 * 1.0 = 1.5
    expect(returns[1]).toBeCloseTo(1.0);
    expect(returns[0]).toBeCloseTo(1.5);
  });
});

// ============================================================================
// computeGradients
// ============================================================================

describe('computeGradients', () => {
  it('returns zero gradients for empty trajectory (regression: no NaN)', () => {
    const gradients = computeGradients([], [], 0);
    for (const key of LEARNABLE_WEIGHTS) {
      expect(gradients[key]).toBe(0);
      expect(Number.isNaN(gradients[key])).toBe(false);
    }
  });
});

// ============================================================================
// extractFeatureValues
// ============================================================================

describe('extractFeatureValues', () => {
  it('returns recency 0.5 when recent agents present', () => {
    const features: ScoringFeatures = {
      stepCount: 5,
      recentAgents: ['agent-1'],
      progress: 0.5,
      isStuck: false,
      taskKeywords: ['test'],
      lastPattern: 'decomposition',
    };
    const values = extractFeatureValues(features);
    expect(values.recency).toBe(0.5);
  });

  it('returns recency 1.0 when no recent agents', () => {
    const features: ScoringFeatures = {
      stepCount: 0,
      recentAgents: [],
      progress: 0,
      isStuck: false,
      taskKeywords: [],
    };
    const values = extractFeatureValues(features);
    expect(values.recency).toBe(1.0);
  });

  it('returns capability_match 0.8 when keywords present', () => {
    const features: ScoringFeatures = {
      stepCount: 0,
      recentAgents: [],
      progress: 0,
      isStuck: false,
      taskKeywords: ['review'],
    };
    expect(extractFeatureValues(features).capability_match).toBe(0.8);
  });

  it('returns capability_match 0.2 when no keywords', () => {
    const features: ScoringFeatures = {
      stepCount: 0,
      recentAgents: [],
      progress: 0,
      isStuck: false,
      taskKeywords: [],
    };
    expect(extractFeatureValues(features).capability_match).toBe(0.2);
  });

  it('returns cost_efficiency 0.5 always', () => {
    const features: ScoringFeatures = {
      stepCount: 0,
      recentAgents: [],
      progress: 0,
      isStuck: false,
      taskKeywords: [],
    };
    expect(extractFeatureValues(features).cost_efficiency).toBe(0.5);
  });

  it('returns pattern_match 0.7 when lastPattern present', () => {
    const features: ScoringFeatures = {
      stepCount: 0,
      recentAgents: [],
      progress: 0,
      isStuck: false,
      taskKeywords: [],
      lastPattern: 'reflection',
    };
    expect(extractFeatureValues(features).pattern_match).toBe(0.7);
  });

  it('returns pattern_match 0.3 when lastPattern empty', () => {
    const features: ScoringFeatures = {
      stepCount: 0,
      recentAgents: [],
      progress: 0,
      isStuck: false,
      taskKeywords: [],
      lastPattern: '',
    };
    expect(extractFeatureValues(features).pattern_match).toBe(0.3);
  });
});

// ============================================================================
// normalizeWeights
// ============================================================================

describe('normalizeWeights', () => {
  it('normalizes weights to sum to 1', () => {
    const weights = { a: 0.4, b: 0.6 };
    const normalized = normalizeWeights(weights);
    const sum = Object.values(normalized).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0);
  });

  it('returns same weights if all zero', () => {
    const weights = { a: 0, b: 0 };
    const normalized = normalizeWeights(weights);
    expect(normalized).toEqual({ a: 0, b: 0 });
  });

  it('uses absolute values', () => {
    const weights = { a: -0.3, b: 0.7 };
    const normalized = normalizeWeights(weights);
    expect(normalized.a).toBeCloseTo(0.3);
    expect(normalized.b).toBeCloseTo(0.7);
  });

  it('handles single weight', () => {
    const normalized = normalizeWeights({ a: 5.0 });
    expect(normalized.a).toBeCloseTo(1.0);
  });
});

// ============================================================================
// applyGradientUpdate
// ============================================================================

describe('applyGradientUpdate', () => {
  it('applies gradient with no clipping', () => {
    const gradients = {
      recency: 0.1,
      capability_match: 0.2,
      cost_efficiency: 0.0,
      pattern_match: 0.0,
    };
    const currentWeights = {
      recency: 0.3,
      capability_match: 0.4,
      cost_efficiency: 0.2,
      pattern_match: 0.1,
    };
    const result = applyGradientUpdate(gradients, currentWeights, 0.01, 10.0);
    expect(result.gradientNorm).toBeGreaterThan(0);
    // Weights should be normalized
    const sum = Object.values(result.weights).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0);
  });

  it('clips gradients when norm exceeds clip value', () => {
    const gradients = {
      recency: 10.0,
      capability_match: 10.0,
      cost_efficiency: 10.0,
      pattern_match: 10.0,
    };
    const currentWeights = {
      recency: 0.25,
      capability_match: 0.25,
      cost_efficiency: 0.25,
      pattern_match: 0.25,
    };
    const result = applyGradientUpdate(gradients, currentWeights, 0.1, 1.0);
    // Gradient norm = sqrt(4 * 100) = 20, clip ratio = 1/20 = 0.05
    expect(result.gradientNorm).toBeCloseTo(20.0);
  });

  it('returns normalized weights', () => {
    const gradients = { recency: 0, capability_match: 0, cost_efficiency: 0, pattern_match: 0 };
    const currentWeights = {
      recency: 0.3,
      capability_match: 0.4,
      cost_efficiency: 0.2,
      pattern_match: 0.1,
    };
    const result = applyGradientUpdate(gradients, currentWeights, 0.01, 10.0);
    const sum = Object.values(result.weights).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0);
  });
});
