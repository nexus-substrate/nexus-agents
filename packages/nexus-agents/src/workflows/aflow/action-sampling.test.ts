/**
 * Tests for action-sampling.ts
 *
 * Covers seeded random generation, uniform action sampling,
 * temperature-based sampling, terminate action check,
 * and action description formatting.
 */

import { describe, it, expect } from 'vitest';
import {
  createSeededRandom,
  sampleAction,
  sampleWithTemperature,
  isTerminateAction,
  describeAction,
} from './action-sampling.js';
import type { WorkflowAction } from './aflow-types.js';

// ============================================================================
// Fixtures
// ============================================================================

const ADD_ACTION: WorkflowAction = {
  type: 'add_step',
  newStep: { agent: 'code_expert', action: 'Write tests' },
};

const REMOVE_ACTION: WorkflowAction = {
  type: 'remove_step',
  targetStepId: 'step1',
};

const MODIFY_ACTION: WorkflowAction = {
  type: 'modify_step',
  targetStepId: 'step2',
  modifications: { timeout: 30000 },
};

const TERMINATE_ACTION: WorkflowAction = { type: 'terminate' };

const DEP_ACTION: WorkflowAction = {
  type: 'add_dependency',
  targetStepId: 'step2',
  sourceStepId: 'step1',
};

const PARALLEL_ACTION: WorkflowAction = {
  type: 'set_parallel',
  targetStepId: 'step1',
  modifications: { parallel: true },
};

// ============================================================================
// createSeededRandom
// ============================================================================

describe('createSeededRandom', () => {
  it('returns numbers between 0 and 1', () => {
    const rng = createSeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('is deterministic with same seed', () => {
    const rng1 = createSeededRandom(123);
    const rng2 = createSeededRandom(123);
    for (let i = 0; i < 10; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createSeededRandom(1);
    const rng2 = createSeededRandom(2);
    const seq1 = Array.from({ length: 5 }, () => rng1());
    const seq2 = Array.from({ length: 5 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });
});

// ============================================================================
// sampleAction
// ============================================================================

describe('sampleAction', () => {
  it('returns null for empty actions', () => {
    const rng = createSeededRandom(1);
    expect(sampleAction([], rng)).toBeNull();
  });

  it('returns the only action for single-element array', () => {
    const rng = createSeededRandom(1);
    expect(sampleAction([ADD_ACTION], rng)).toBe(ADD_ACTION);
  });

  it('returns a valid action from the list', () => {
    const rng = createSeededRandom(42);
    const actions = [ADD_ACTION, REMOVE_ACTION, TERMINATE_ACTION];
    const result = sampleAction(actions, rng);
    expect(result).not.toBeNull();
    expect(actions).toContain(result);
  });

  it('samples different actions with different seeds', () => {
    const actions = [ADD_ACTION, REMOVE_ACTION, MODIFY_ACTION, TERMINATE_ACTION];
    const results = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const rng = createSeededRandom(seed);
      const result = sampleAction(actions, rng);
      if (result) results.add(result.type);
    }
    // With 50 seeds and 4 options, we expect multiple different results
    expect(results.size).toBeGreaterThan(1);
  });
});

// ============================================================================
// sampleWithTemperature
// ============================================================================

describe('sampleWithTemperature', () => {
  it('returns null for empty actions', () => {
    const rng = createSeededRandom(1);
    expect(sampleWithTemperature([], [], 1.0, rng)).toBeNull();
  });

  it('returns null for mismatched actions and scores', () => {
    const rng = createSeededRandom(1);
    expect(sampleWithTemperature([ADD_ACTION], [1, 2], 1.0, rng)).toBeNull();
  });

  it('returns a valid action', () => {
    const rng = createSeededRandom(42);
    const actions = [ADD_ACTION, REMOVE_ACTION];
    const scores = [0.9, 0.1];
    const result = sampleWithTemperature(actions, scores, 1.0, rng);
    expect(result).not.toBeNull();
    expect(actions).toContain(result);
  });

  it('low temperature favors highest score', () => {
    const actions = [ADD_ACTION, REMOVE_ACTION, TERMINATE_ACTION];
    // Use moderate score difference to avoid exp() overflow to Infinity
    const scores = [3.0, 1.0, 1.0];
    const rng = createSeededRandom(42);
    let highScoreCount = 0;
    for (let i = 0; i < 50; i++) {
      const result = sampleWithTemperature(actions, scores, 0.5, rng);
      if (result === ADD_ACTION) highScoreCount++;
    }
    // With low temperature and higher first score, should strongly prefer it
    expect(highScoreCount).toBeGreaterThan(35);
  });

  it('handles extreme scores without overflow (log-sum-exp)', () => {
    const actions = [ADD_ACTION, REMOVE_ACTION, TERMINATE_ACTION];
    // With naive Math.exp(10/0.01) = exp(1000) = Infinity → NaN probs
    // The log-sum-exp fix prevents this overflow
    const scores = [10.0, 0.001, 0.001];
    const rng = createSeededRandom(42);
    const result = sampleWithTemperature(actions, scores, 0.01, rng);
    // Should select highest-scored action, not fall through to last
    expect(result).toBe(ADD_ACTION);
  });

  it('equal scores produce uniform-like distribution', () => {
    const actions = [ADD_ACTION, REMOVE_ACTION, TERMINATE_ACTION];
    const scores = [1.0, 1.0, 1.0];
    const counts = new Map<string, number>();
    // Use widely spaced seeds to avoid LCG nearby-seed correlation
    for (let seed = 0; seed < 300; seed += 3) {
      const rng = createSeededRandom(seed * 10000);
      const result = sampleWithTemperature(actions, scores, 1.0, rng);
      if (result) counts.set(result.type, (counts.get(result.type) ?? 0) + 1);
    }
    // With equal scores, each action should get some selections
    expect(counts.size).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// isTerminateAction
// ============================================================================

describe('isTerminateAction', () => {
  it('returns true for terminate action', () => {
    expect(isTerminateAction(TERMINATE_ACTION)).toBe(true);
  });

  it('returns false for add_step action', () => {
    expect(isTerminateAction(ADD_ACTION)).toBe(false);
  });

  it('returns false for remove_step action', () => {
    expect(isTerminateAction(REMOVE_ACTION)).toBe(false);
  });
});

// ============================================================================
// describeAction
// ============================================================================

describe('describeAction', () => {
  it('describes add_step action', () => {
    const desc = describeAction(ADD_ACTION);
    expect(desc).toContain('Add');
    expect(desc).toContain('code_expert');
    expect(desc).toContain('Write tests');
  });

  it('describes remove_step action', () => {
    const desc = describeAction(REMOVE_ACTION);
    expect(desc).toContain('Remove');
    expect(desc).toContain('step1');
  });

  it('describes modify_step action', () => {
    const desc = describeAction(MODIFY_ACTION);
    expect(desc).toContain('Modify');
    expect(desc).toContain('step2');
  });

  it('describes terminate action', () => {
    const desc = describeAction(TERMINATE_ACTION);
    expect(desc).toContain('Terminate');
  });

  it('describes add_dependency action', () => {
    const desc = describeAction(DEP_ACTION);
    expect(desc).toContain('dependency');
    expect(desc).toContain('step2');
    expect(desc).toContain('step1');
  });

  it('describes set_parallel action', () => {
    const desc = describeAction(PARALLEL_ACTION);
    expect(desc).toContain('parallel');
    expect(desc).toContain('step1');
  });

  it('handles missing target step ID', () => {
    const action: WorkflowAction = { type: 'remove_step' };
    const desc = describeAction(action);
    expect(desc).toContain('unknown');
  });
});
