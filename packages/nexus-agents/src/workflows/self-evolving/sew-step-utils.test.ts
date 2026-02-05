/**
 * Tests for SEW Step Utilities
 * @module workflows/self-evolving/sew-step-utils.test
 */

import { describe, it, expect } from 'vitest';
import type { WorkflowStep } from '../../core/index.js';
import {
  stepsAreDependent,
  findReorderableSteps,
  findParallelizableSteps,
} from './sew-step-utils.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeStep(id: string, dependsOn?: string[], parallel?: boolean): WorkflowStep {
  return {
    id,
    agent: 'code_expert',
    action: 'analyze',
    inputs: {},
    ...(dependsOn !== undefined ? { dependsOn } : {}),
    ...(parallel !== undefined ? { parallel } : {}),
  };
}

// ============================================================================
// stepsAreDependent
// ============================================================================

describe('stepsAreDependent', () => {
  it('detects direct dependency (A depends on B)', () => {
    const stepA = makeStep('a', ['b']);
    const stepB = makeStep('b');
    expect(stepsAreDependent(stepA, stepB, [stepA, stepB])).toBe(true);
  });

  it('detects direct dependency (B depends on A)', () => {
    const stepA = makeStep('a');
    const stepB = makeStep('b', ['a']);
    expect(stepsAreDependent(stepA, stepB, [stepA, stepB])).toBe(true);
  });

  it('returns false for independent steps', () => {
    const stepA = makeStep('a');
    const stepB = makeStep('b');
    expect(stepsAreDependent(stepA, stepB, [stepA, stepB])).toBe(false);
  });

  it('detects transitive dependency (A -> C -> B)', () => {
    const stepA = makeStep('a', ['c']);
    const stepB = makeStep('b');
    const stepC = makeStep('c', ['b']);
    expect(stepsAreDependent(stepA, stepB, [stepA, stepB, stepC])).toBe(true);
  });

  it('detects transitive dependency (B -> C -> A)', () => {
    const stepA = makeStep('a');
    const stepB = makeStep('b', ['c']);
    const stepC = makeStep('c', ['a']);
    expect(stepsAreDependent(stepA, stepB, [stepA, stepB, stepC])).toBe(true);
  });

  it('handles steps with no dependsOn', () => {
    const stepA = makeStep('a');
    const stepB = makeStep('b');
    expect(stepsAreDependent(stepA, stepB, [stepA, stepB])).toBe(false);
  });

  it('handles circular dependency without infinite loop', () => {
    const stepA = makeStep('a', ['b']);
    const stepB = makeStep('b', ['a']);
    // Should detect direct dependency and return true
    expect(stepsAreDependent(stepA, stepB, [stepA, stepB])).toBe(true);
  });

  it('handles deep transitive chain', () => {
    const steps = [
      makeStep('a', ['b']),
      makeStep('b', ['c']),
      makeStep('c', ['d']),
      makeStep('d'),
      makeStep('e'),
    ];
    // a -> b -> c -> d, so a depends on d
    expect(stepsAreDependent(steps[0]!, steps[3]!, steps)).toBe(true);
    // a and e are independent
    expect(stepsAreDependent(steps[0]!, steps[4]!, steps)).toBe(false);
  });
});

// ============================================================================
// findReorderableSteps
// ============================================================================

describe('findReorderableSteps', () => {
  it('returns empty for empty steps', () => {
    expect(findReorderableSteps([])).toEqual([]);
  });

  it('returns empty for single step', () => {
    expect(findReorderableSteps([makeStep('a')])).toEqual([]);
  });

  it('finds independent pairs', () => {
    const steps = [makeStep('a'), makeStep('b'), makeStep('c')];
    const pairs = findReorderableSteps(steps);
    // All 3 are independent, so 3 pairs: (a,b), (a,c), (b,c)
    expect(pairs).toHaveLength(3);
  });

  it('excludes dependent pairs', () => {
    const steps = [makeStep('a'), makeStep('b', ['a']), makeStep('c')];
    const pairs = findReorderableSteps(steps);
    // a and b are dependent, a and c are independent, b and c are independent
    expect(pairs).toHaveLength(2);
    const pairIds = pairs.map(([s1, s2]) => `${s1.id}-${s2.id}`);
    expect(pairIds).toContain('a-c');
    expect(pairIds).toContain('b-c');
  });

  it('returns empty when all steps depend on each other', () => {
    const steps = [makeStep('a'), makeStep('b', ['a']), makeStep('c', ['b'])];
    const pairs = findReorderableSteps(steps);
    // a->b->c: all transitively dependent
    expect(pairs).toHaveLength(0);
  });
});

// ============================================================================
// findParallelizableSteps
// ============================================================================

describe('findParallelizableSteps', () => {
  it('returns empty for empty steps', () => {
    expect(findParallelizableSteps([])).toEqual([]);
  });

  it('returns empty for single step', () => {
    expect(findParallelizableSteps([makeStep('a')])).toEqual([]);
  });

  it('groups independent steps', () => {
    const steps = [makeStep('a'), makeStep('b'), makeStep('c')];
    const groups = findParallelizableSteps(steps);
    // All 3 can be parallelized
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it('excludes steps already marked parallel', () => {
    const steps = [makeStep('a'), makeStep('b', undefined, true), makeStep('c')];
    const groups = findParallelizableSteps(steps);
    // b is already parallel, so only a and c can form a group
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
    const ids = groups[0]!.map((s) => s.id);
    expect(ids).toContain('a');
    expect(ids).toContain('c');
  });

  it('does not group dependent steps', () => {
    const steps = [makeStep('a'), makeStep('b', ['a'])];
    const groups = findParallelizableSteps(steps);
    // a and b are dependent, no groups of size > 1
    expect(groups).toHaveLength(0);
  });

  it('finds multiple parallel groups', () => {
    // a -> b, c -> d, but a and c are independent
    const steps = [makeStep('a'), makeStep('b', ['a']), makeStep('c'), makeStep('d', ['c'])];
    const groups = findParallelizableSteps(steps);
    // a and c can be parallelized (both are independent)
    // b depends on a, d depends on c
    // The algorithm greedily groups: a,c,b (b is independent of c),d could be independent of a
    // Actually let me think... a and c are independent, b depends on a but not c,
    // d depends on c but not a. So a,c,d can't all be in one group because c and d are dependent.
    // The greedy algorithm: start with a, check b (depends on a: skip), check c (independent: add), check d (depends on c: skip)
    // Group: [a, c] — that's 1 group of size 2
    expect(groups.length).toBeGreaterThanOrEqual(1);
    expect(groups.some((g) => g.length >= 2)).toBe(true);
  });
});
