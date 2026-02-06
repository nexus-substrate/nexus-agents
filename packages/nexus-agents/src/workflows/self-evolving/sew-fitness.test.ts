/**
 * Tests for sew-fitness.ts
 *
 * Covers fitness score computation with default and custom weights,
 * individual component scoring, edge cases, and constants.
 */

import { describe, it, expect } from 'vitest';
import {
  computeFitnessScore,
  DEFAULT_FITNESS_WEIGHTS,
  DEFAULT_FITNESS_METRICS,
} from './sew-fitness.js';
import type { FitnessMetrics, FitnessWeights } from './sew-fitness.js';

// ============================================================================
// Constants
// ============================================================================

describe('DEFAULT_FITNESS_WEIGHTS', () => {
  it('weights sum to 1', () => {
    const sum =
      DEFAULT_FITNESS_WEIGHTS.successRate +
      DEFAULT_FITNESS_WEIGHTS.duration +
      DEFAULT_FITNESS_WEIGHTS.cost +
      DEFAULT_FITNESS_WEIGHTS.stability +
      DEFAULT_FITNESS_WEIGHTS.retryRate;
    expect(sum).toBeCloseTo(1.0);
  });
});

describe('DEFAULT_FITNESS_METRICS', () => {
  it('has all zero values', () => {
    expect(DEFAULT_FITNESS_METRICS.successRate).toBe(0);
    expect(DEFAULT_FITNESS_METRICS.avgDurationMs).toBe(0);
    expect(DEFAULT_FITNESS_METRICS.avgCost).toBe(0);
    expect(DEFAULT_FITNESS_METRICS.executionCount).toBe(0);
    expect(DEFAULT_FITNESS_METRICS.durationVariance).toBe(0);
    expect(DEFAULT_FITNESS_METRICS.retryRate).toBe(0);
  });
});

// ============================================================================
// computeFitnessScore — basic
// ============================================================================

describe('computeFitnessScore - basic', () => {
  it('returns a number between 0 and 1', () => {
    const metrics: FitnessMetrics = {
      successRate: 0.8,
      avgDurationMs: 5000,
      avgCost: 500,
      executionCount: 10,
      durationVariance: 100000,
      retryRate: 0.1,
    };
    const score = computeFitnessScore(metrics);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns max score for perfect metrics', () => {
    const metrics: FitnessMetrics = {
      successRate: 1.0,
      avgDurationMs: 0,
      avgCost: 0,
      executionCount: 100,
      durationVariance: 0,
      retryRate: 0,
    };
    const score = computeFitnessScore(metrics);
    // All components at max: 0.4 + 0.2 + 0.15 + 0.15 + 0.1 = 1.0
    expect(score).toBeCloseTo(1.0);
  });

  it('returns low score for worst metrics', () => {
    const metrics: FitnessMetrics = {
      successRate: 0,
      avgDurationMs: 1000000,
      avgCost: 100000,
      executionCount: 1,
      durationVariance: 10000000,
      retryRate: 1.0,
    };
    const score = computeFitnessScore(metrics);
    expect(score).toBeLessThan(0.1);
  });

  it('uses default weights when none provided', () => {
    const metrics: FitnessMetrics = {
      successRate: 0.5,
      avgDurationMs: 5000,
      avgCost: 500,
      executionCount: 10,
      durationVariance: 100000,
      retryRate: 0.2,
    };
    const withDefault = computeFitnessScore(metrics);
    const withExplicit = computeFitnessScore(metrics, DEFAULT_FITNESS_WEIGHTS);
    expect(withDefault).toBeCloseTo(withExplicit);
  });
});

// ============================================================================
// computeFitnessScore — individual components
// ============================================================================

describe('computeFitnessScore - components', () => {
  // Use unit weights to isolate each component
  const zeroWeights: FitnessWeights = {
    successRate: 0,
    duration: 0,
    cost: 0,
    stability: 0,
    retryRate: 0,
  };

  it('success rate component is proportional', () => {
    const metrics: FitnessMetrics = {
      successRate: 0.8,
      avgDurationMs: 0,
      avgCost: 0,
      executionCount: 10,
      durationVariance: 0,
      retryRate: 0,
    };
    const weights: FitnessWeights = { ...zeroWeights, successRate: 1.0 };
    expect(computeFitnessScore(metrics, weights)).toBeCloseTo(0.8);
  });

  it('duration component: 0ms gives max score', () => {
    const metrics: FitnessMetrics = {
      successRate: 0,
      avgDurationMs: 0,
      avgCost: 0,
      executionCount: 10,
      durationVariance: 0,
      retryRate: 0,
    };
    const weights: FitnessWeights = { ...zeroWeights, duration: 1.0 };
    expect(computeFitnessScore(metrics, weights)).toBeCloseTo(1.0);
  });

  it('duration component: high duration gives lower score', () => {
    const fast: FitnessMetrics = {
      successRate: 0,
      avgDurationMs: 1000,
      avgCost: 0,
      executionCount: 10,
      durationVariance: 0,
      retryRate: 0,
    };
    const slow: FitnessMetrics = { ...fast, avgDurationMs: 100000 };
    const weights: FitnessWeights = { ...zeroWeights, duration: 1.0 };
    expect(computeFitnessScore(fast, weights)).toBeGreaterThan(computeFitnessScore(slow, weights));
  });

  it('cost component: 0 cost gives max score', () => {
    const metrics: FitnessMetrics = {
      successRate: 0,
      avgDurationMs: 0,
      avgCost: 0,
      executionCount: 10,
      durationVariance: 0,
      retryRate: 0,
    };
    const weights: FitnessWeights = { ...zeroWeights, cost: 1.0 };
    expect(computeFitnessScore(metrics, weights)).toBeCloseTo(1.0);
  });

  it('cost component: high cost gives lower score', () => {
    const cheap: FitnessMetrics = {
      successRate: 0,
      avgDurationMs: 0,
      avgCost: 100,
      executionCount: 10,
      durationVariance: 0,
      retryRate: 0,
    };
    const expensive: FitnessMetrics = { ...cheap, avgCost: 50000 };
    const weights: FitnessWeights = { ...zeroWeights, cost: 1.0 };
    expect(computeFitnessScore(cheap, weights)).toBeGreaterThan(
      computeFitnessScore(expensive, weights)
    );
  });

  it('stability component: 0 variance gives max score', () => {
    const metrics: FitnessMetrics = {
      successRate: 0,
      avgDurationMs: 0,
      avgCost: 0,
      executionCount: 10,
      durationVariance: 0,
      retryRate: 0,
    };
    const weights: FitnessWeights = { ...zeroWeights, stability: 1.0 };
    expect(computeFitnessScore(metrics, weights)).toBeCloseTo(1.0);
  });

  it('retry rate component: 0 retry gives max score', () => {
    const metrics: FitnessMetrics = {
      successRate: 0,
      avgDurationMs: 0,
      avgCost: 0,
      executionCount: 10,
      durationVariance: 0,
      retryRate: 0,
    };
    const weights: FitnessWeights = { ...zeroWeights, retryRate: 1.0 };
    expect(computeFitnessScore(metrics, weights)).toBeCloseTo(1.0);
  });

  it('retry rate component: full retry gives 0', () => {
    const metrics: FitnessMetrics = {
      successRate: 0,
      avgDurationMs: 0,
      avgCost: 0,
      executionCount: 10,
      durationVariance: 0,
      retryRate: 1.0,
    };
    const weights: FitnessWeights = { ...zeroWeights, retryRate: 1.0 };
    expect(computeFitnessScore(metrics, weights)).toBeCloseTo(0);
  });
});

// ============================================================================
// computeFitnessScore — custom weights
// ============================================================================

describe('computeFitnessScore - custom weights', () => {
  it('respects custom weight distribution', () => {
    const metrics: FitnessMetrics = {
      successRate: 1.0,
      avgDurationMs: 0,
      avgCost: 0,
      executionCount: 10,
      durationVariance: 0,
      retryRate: 0,
    };
    // All weight on success rate
    const weights: FitnessWeights = {
      successRate: 1.0,
      duration: 0,
      cost: 0,
      stability: 0,
      retryRate: 0,
    };
    expect(computeFitnessScore(metrics, weights)).toBeCloseTo(1.0);
  });

  it('zero success rate with all weight on success gives 0', () => {
    const metrics: FitnessMetrics = {
      successRate: 0,
      avgDurationMs: 0,
      avgCost: 0,
      executionCount: 10,
      durationVariance: 0,
      retryRate: 0,
    };
    const weights: FitnessWeights = {
      successRate: 1.0,
      duration: 0,
      cost: 0,
      stability: 0,
      retryRate: 0,
    };
    expect(computeFitnessScore(metrics, weights)).toBe(0);
  });
});

// ============================================================================
// computeFitnessScore — edge cases
// ============================================================================

describe('computeFitnessScore - edge cases', () => {
  it('handles default metrics (all zeros)', () => {
    const score = computeFitnessScore(DEFAULT_FITNESS_METRICS);
    // successRate=0(→0) + duration=0(→1*0.2=0.2) + cost=0(→1*0.15=0.15)
    // + stability=0(→1*0.15=0.15) + retry=0(→1*0.1=0.1) = 0.6
    expect(score).toBeCloseTo(0.6);
  });

  it('handles very large duration', () => {
    const metrics: FitnessMetrics = {
      successRate: 1.0,
      avgDurationMs: 1e12,
      avgCost: 0,
      executionCount: 1,
      durationVariance: 0,
      retryRate: 0,
    };
    const score = computeFitnessScore(metrics);
    // Duration component approaches 0, others remain
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});
