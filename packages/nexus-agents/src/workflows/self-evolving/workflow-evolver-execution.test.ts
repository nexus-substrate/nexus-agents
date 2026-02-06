/**
 * Tests for Workflow Evolver Execution Helpers
 *
 * @module workflows/self-evolving/workflow-evolver-execution.test
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateOutcomes,
  computeFitness,
  createOutcome,
  selectCrossoverIndices,
  calculateFitnessStats,
} from './workflow-evolver-execution.js';
import type { ExecutionOutcome } from './sew-types.js';
import type { StepResult } from '../../core/index.js';

// ============================================================================
// Helpers
// ============================================================================

function makeStepResult(id: string, status: StepResult['status'] = 'success'): StepResult {
  return {
    stepId: id,
    output: null,
    durationMs: 100,
    status,
  };
}

function makeOutcome(overrides: Partial<ExecutionOutcome> = {}): ExecutionOutcome {
  return {
    executionId: 'exec-1',
    versionId: 'v1',
    success: true,
    durationMs: 1000,
    cost: 0.5,
    stepResults: [makeStepResult('s1')],
    totalRetries: 0,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// evaluateOutcomes
// ============================================================================

describe('evaluateOutcomes', () => {
  it('returns default metrics for empty outcomes', () => {
    const metrics = evaluateOutcomes([]);

    expect(metrics.successRate).toBe(0);
    expect(metrics.avgDurationMs).toBe(0);
    expect(metrics.avgCost).toBe(0);
    expect(metrics.executionCount).toBe(0);
    expect(metrics.retryRate).toBe(0);
  });

  it('calculates success rate', () => {
    const outcomes = [
      makeOutcome({ success: true }),
      makeOutcome({ success: true }),
      makeOutcome({ success: false }),
    ];

    const metrics = evaluateOutcomes(outcomes);
    expect(metrics.successRate).toBeCloseTo(2 / 3);
    expect(metrics.executionCount).toBe(3);
  });

  it('calculates average duration', () => {
    const outcomes = [
      makeOutcome({ durationMs: 100 }),
      makeOutcome({ durationMs: 200 }),
      makeOutcome({ durationMs: 300 }),
    ];

    const metrics = evaluateOutcomes(outcomes);
    expect(metrics.avgDurationMs).toBe(200);
  });

  it('calculates average cost', () => {
    const outcomes = [makeOutcome({ cost: 1.0 }), makeOutcome({ cost: 2.0 })];

    const metrics = evaluateOutcomes(outcomes);
    expect(metrics.avgCost).toBe(1.5);
  });

  it('calculates retry rate', () => {
    const outcomes = [
      makeOutcome({
        totalRetries: 2,
        stepResults: [makeStepResult('s1'), makeStepResult('s2')],
      }),
      makeOutcome({
        totalRetries: 1,
        stepResults: [makeStepResult('s3')],
      }),
    ];

    const metrics = evaluateOutcomes(outcomes);
    // 3 retries / 3 steps = 1.0
    expect(metrics.retryRate).toBe(1.0);
  });

  it('handles zero total steps for retry rate', () => {
    const outcomes = [makeOutcome({ totalRetries: 0, stepResults: [] })];

    const metrics = evaluateOutcomes(outcomes);
    expect(metrics.retryRate).toBe(0);
  });

  it('calculates duration variance', () => {
    const outcomes = [makeOutcome({ durationMs: 100 }), makeOutcome({ durationMs: 300 })];

    const metrics = evaluateOutcomes(outcomes);
    // avg = 200, variance = ((100-200)^2 + (300-200)^2) / 2 = 10000
    expect(metrics.durationVariance).toBe(10000);
  });

  it('returns zero variance for single outcome', () => {
    const metrics = evaluateOutcomes([makeOutcome({ durationMs: 500 })]);
    expect(metrics.durationVariance).toBe(0);
  });
});

// ============================================================================
// computeFitness
// ============================================================================

describe('computeFitness', () => {
  it('delegates to computeFitnessScore', () => {
    const metrics = evaluateOutcomes([makeOutcome()]);
    const score = computeFitness(metrics);

    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('returns higher score for better metrics', () => {
    const good = evaluateOutcomes([makeOutcome({ success: true, durationMs: 100, cost: 0.1 })]);
    const bad = evaluateOutcomes([makeOutcome({ success: false, durationMs: 10000, cost: 10 })]);

    expect(computeFitness(good)).toBeGreaterThan(computeFitness(bad));
  });
});

// ============================================================================
// createOutcome
// ============================================================================

describe('createOutcome', () => {
  it('creates outcome with all fields', () => {
    const outcome = createOutcome({
      executionId: 'e1',
      versionId: 'v1',
      success: true,
      durationMs: 500,
      cost: 0.3,
      stepResults: [makeStepResult('s1')],
      totalRetries: 1,
    });

    expect(outcome.executionId).toBe('e1');
    expect(outcome.versionId).toBe('v1');
    expect(outcome.success).toBe(true);
    expect(outcome.durationMs).toBe(500);
    expect(outcome.cost).toBe(0.3);
    expect(outcome.stepResults).toHaveLength(1);
    expect(outcome.totalRetries).toBe(1);
    expect(typeof outcome.timestamp).toBe('number');
  });
});

// ============================================================================
// selectCrossoverIndices
// ============================================================================

describe('selectCrossoverIndices', () => {
  it('returns two indices within bounds', () => {
    const [i1, i2] = selectCrossoverIndices(10);

    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i1).toBeLessThan(10);
    expect(i2).toBeGreaterThanOrEqual(0);
    expect(i2).toBeLessThan(10);
  });

  it('returns different indices for population > 1', () => {
    // Run multiple times to increase confidence
    let foundDifferent = false;
    for (let i = 0; i < 20; i++) {
      const [i1, i2] = selectCrossoverIndices(5);
      if (i1 !== i2) {
        foundDifferent = true;
        break;
      }
    }
    expect(foundDifferent).toBe(true);
  });

  it('handles population size 1', () => {
    const [i1, i2] = selectCrossoverIndices(1);
    expect(i1).toBe(0);
    expect(i2).toBe(0);
  });
});

// ============================================================================
// calculateFitnessStats
// ============================================================================

describe('calculateFitnessStats', () => {
  it('returns zeros for empty array', () => {
    const stats = calculateFitnessStats([]);
    expect(stats.best).toBe(0);
    expect(stats.average).toBe(0);
  });

  it('calculates best and average', () => {
    const stats = calculateFitnessStats([0.5, 0.8, 0.3]);

    expect(stats.best).toBe(0.8);
    expect(stats.average).toBeCloseTo(0.533, 2);
  });

  it('handles single value', () => {
    const stats = calculateFitnessStats([0.7]);
    expect(stats.best).toBe(0.7);
    expect(stats.average).toBe(0.7);
  });

  it('handles all same values', () => {
    const stats = calculateFitnessStats([0.5, 0.5, 0.5]);
    expect(stats.best).toBe(0.5);
    expect(stats.average).toBe(0.5);
  });
});
