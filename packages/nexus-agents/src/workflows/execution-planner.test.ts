/**
 * Tests for execution-planner.ts
 *
 * Covers createExecutionPlan, validateWorkflowDependencies, and getExecutionOrder.
 */

import { describe, it, expect } from 'vitest';
import type { WorkflowStep, WorkflowDefinition } from '../core/index.js';
import {
  createExecutionPlan,
  validateWorkflowDependencies,
  getExecutionOrder,
} from './execution-planner.js';

// ============================================================================
// Helpers
// ============================================================================

function makeStep(id: string, dependsOn?: string[]): WorkflowStep {
  return {
    id,
    action: `action-${id}`,
    agent: 'test-agent',
    dependsOn,
  } as WorkflowStep;
}

function makeWorkflow(steps: WorkflowStep[]): WorkflowDefinition {
  return {
    name: 'test-workflow',
    version: '1.0.0',
    steps,
  } as WorkflowDefinition;
}

// ============================================================================
// createExecutionPlan
// ============================================================================

describe('createExecutionPlan', () => {
  it('creates plan for empty workflow', () => {
    const result = createExecutionPlan(makeWorkflow([]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phases).toEqual([]);
      expect(result.value.totalSteps).toBe(0);
      expect(result.value.maxParallelism).toBe(0);
    }
  });

  it('creates single-phase plan for independent steps', () => {
    const workflow = makeWorkflow([makeStep('a'), makeStep('b'), makeStep('c')]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phases).toHaveLength(1);
      expect(result.value.phases[0]?.steps).toHaveLength(3);
      expect(result.value.maxParallelism).toBe(3);
      expect(result.value.totalSteps).toBe(3);
    }
  });

  it('creates sequential phases for linear dependencies', () => {
    const workflow = makeWorkflow([makeStep('a'), makeStep('b', ['a']), makeStep('c', ['b'])]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phases).toHaveLength(3);
      expect(result.value.maxParallelism).toBe(1);
      expect(result.value.phases[0]?.steps[0]?.id).toBe('a');
      expect(result.value.phases[1]?.steps[0]?.id).toBe('b');
      expect(result.value.phases[2]?.steps[0]?.id).toBe('c');
    }
  });

  it('groups parallel steps into same phase', () => {
    const workflow = makeWorkflow([
      makeStep('root'),
      makeStep('left', ['root']),
      makeStep('right', ['root']),
      makeStep('final', ['left', 'right']),
    ]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phases).toHaveLength(3);
      // Phase 0: root
      expect(result.value.phases[0]?.steps).toHaveLength(1);
      // Phase 1: left, right (parallel)
      expect(result.value.phases[1]?.steps).toHaveLength(2);
      expect(result.value.maxParallelism).toBe(2);
      // Phase 2: final
      expect(result.value.phases[2]?.steps).toHaveLength(1);
    }
  });

  it('returns error for duplicate step IDs', () => {
    const workflow = makeWorkflow([makeStep('a'), makeStep('a')]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Duplicate');
    }
  });

  it('returns error for missing dependency', () => {
    const workflow = makeWorkflow([makeStep('b', ['nonexistent'])]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('unknown step');
    }
  });

  it('returns error for circular dependency', () => {
    const workflow = makeWorkflow([makeStep('a', ['b']), makeStep('b', ['a'])]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Circular');
    }
  });

  it('assigns correct phase indices', () => {
    const workflow = makeWorkflow([makeStep('a'), makeStep('b', ['a'])]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phases[0]?.phaseIndex).toBe(0);
      expect(result.value.phases[1]?.phaseIndex).toBe(1);
    }
  });

  it('handles single step workflow', () => {
    const workflow = makeWorkflow([makeStep('only')]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phases).toHaveLength(1);
      expect(result.value.totalSteps).toBe(1);
      expect(result.value.maxParallelism).toBe(1);
    }
  });

  it('handles complex diamond dependencies', () => {
    //    a
    //   / \
    //  b   c
    //  |   |
    //  d   e
    //   \ /
    //    f
    const workflow = makeWorkflow([
      makeStep('a'),
      makeStep('b', ['a']),
      makeStep('c', ['a']),
      makeStep('d', ['b']),
      makeStep('e', ['c']),
      makeStep('f', ['d', 'e']),
    ]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phases).toHaveLength(4);
      expect(result.value.totalSteps).toBe(6);
    }
  });

  it('detects self-referencing cycle', () => {
    const workflow = makeWorkflow([makeStep('a', ['a'])]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Circular');
    }
  });

  it('detects cycle in longer chain', () => {
    const workflow = makeWorkflow([
      makeStep('a', ['c']),
      makeStep('b', ['a']),
      makeStep('c', ['b']),
    ]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Circular');
    }
  });

  it('handles step with empty dependsOn array', () => {
    const workflow = makeWorkflow([makeStep('a', []), makeStep('b')]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phases).toHaveLength(1);
      expect(result.value.phases[0]?.steps).toHaveLength(2);
    }
  });

  it('handles multiple independent subgraphs', () => {
    // Graph 1: a -> b
    // Graph 2: c -> d
    const workflow = makeWorkflow([
      makeStep('a'),
      makeStep('b', ['a']),
      makeStep('c'),
      makeStep('d', ['c']),
    ]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phases).toHaveLength(2);
      // Phase 0: a, c (parallel)
      expect(result.value.phases[0]?.steps).toHaveLength(2);
      // Phase 1: b, d (parallel)
      expect(result.value.phases[1]?.steps).toHaveLength(2);
    }
  });

  it('handles many parallel steps in single phase', () => {
    const steps = Array.from({ length: 10 }, (_, i) => makeStep(`step-${String(i)}`));
    const workflow = makeWorkflow(steps);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phases).toHaveLength(1);
      expect(result.value.phases[0]?.steps).toHaveLength(10);
      expect(result.value.maxParallelism).toBe(10);
    }
  });

  it('handles step depending on multiple steps', () => {
    const workflow = makeWorkflow([
      makeStep('a'),
      makeStep('b'),
      makeStep('c'),
      makeStep('final', ['a', 'b', 'c']),
    ]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phases).toHaveLength(2);
      expect(result.value.phases[0]?.steps).toHaveLength(3);
      expect(result.value.phases[1]?.steps).toHaveLength(1);
      expect(result.value.phases[1]?.steps[0]?.id).toBe('final');
    }
  });

  it('detects missing dependency in middle of chain', () => {
    const workflow = makeWorkflow([makeStep('a'), makeStep('c', ['b'])]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('unknown step');
      expect(result.error.message).toContain('b');
    }
  });

  it('handles wide dependency tree', () => {
    // root has 5 direct dependents
    const workflow = makeWorkflow([
      makeStep('root'),
      makeStep('child-1', ['root']),
      makeStep('child-2', ['root']),
      makeStep('child-3', ['root']),
      makeStep('child-4', ['root']),
      makeStep('child-5', ['root']),
    ]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phases).toHaveLength(2);
      expect(result.value.phases[0]?.steps).toHaveLength(1);
      expect(result.value.phases[1]?.steps).toHaveLength(5);
      expect(result.value.maxParallelism).toBe(5);
    }
  });

  it('assigns totalSteps correctly', () => {
    const workflow = makeWorkflow([makeStep('a'), makeStep('b'), makeStep('c')]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalSteps).toBe(3);
    }
  });

  it('calculates maxParallelism across all phases', () => {
    // Phase 0: 2 steps
    // Phase 1: 3 steps (max)
    // Phase 2: 1 step
    const workflow = makeWorkflow([
      makeStep('a1'),
      makeStep('a2'),
      makeStep('b1', ['a1']),
      makeStep('b2', ['a1']),
      makeStep('b3', ['a2']),
      makeStep('c', ['b1', 'b2', 'b3']),
    ]);
    const result = createExecutionPlan(workflow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.maxParallelism).toBe(3);
    }
  });
});

// ============================================================================
// validateWorkflowDependencies
// ============================================================================

describe('validateWorkflowDependencies', () => {
  it('returns ok for valid workflow', () => {
    const workflow = makeWorkflow([makeStep('a'), makeStep('b', ['a'])]);
    const result = validateWorkflowDependencies(workflow);
    expect(result.ok).toBe(true);
  });

  it('returns error for invalid workflow', () => {
    const workflow = makeWorkflow([makeStep('a', ['b']), makeStep('b', ['a'])]);
    const result = validateWorkflowDependencies(workflow);
    expect(result.ok).toBe(false);
  });

  it('returns ok for empty workflow', () => {
    const workflow = makeWorkflow([]);
    const result = validateWorkflowDependencies(workflow);
    expect(result.ok).toBe(true);
  });

  it('returns error for duplicate step IDs', () => {
    const workflow = makeWorkflow([makeStep('duplicate'), makeStep('duplicate')]);
    const result = validateWorkflowDependencies(workflow);
    expect(result.ok).toBe(false);
  });

  it('returns error for missing dependencies', () => {
    const workflow = makeWorkflow([makeStep('a', ['missing'])]);
    const result = validateWorkflowDependencies(workflow);
    expect(result.ok).toBe(false);
  });

  it('returns ok for complex valid workflow', () => {
    const workflow = makeWorkflow([
      makeStep('a'),
      makeStep('b', ['a']),
      makeStep('c', ['a']),
      makeStep('d', ['b', 'c']),
    ]);
    const result = validateWorkflowDependencies(workflow);
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// getExecutionOrder
// ============================================================================

describe('getExecutionOrder', () => {
  it('returns flat array of step IDs in phase order', () => {
    const workflow = makeWorkflow([makeStep('a'), makeStep('b', ['a']), makeStep('c', ['a'])]);
    const planResult = createExecutionPlan(workflow);
    expect(planResult.ok).toBe(true);
    if (planResult.ok) {
      const order = getExecutionOrder(planResult.value);
      expect(order).toHaveLength(3);
      // 'a' must come first
      expect(order[0]).toBe('a');
      // 'b' and 'c' in some order after
      expect(order.slice(1).sort()).toEqual(['b', 'c']);
    }
  });

  it('returns empty array for empty plan', () => {
    const order = getExecutionOrder({ phases: [], totalSteps: 0, maxParallelism: 0 });
    expect(order).toEqual([]);
  });

  it('includes all steps from all phases', () => {
    const workflow = makeWorkflow([makeStep('a'), makeStep('b'), makeStep('c', ['a', 'b'])]);
    const planResult = createExecutionPlan(workflow);
    expect(planResult.ok).toBe(true);
    if (planResult.ok) {
      const order = getExecutionOrder(planResult.value);
      expect(order).toHaveLength(3);
      expect(order).toContain('a');
      expect(order).toContain('b');
      expect(order).toContain('c');
    }
  });

  it('preserves phase order with multiple phases', () => {
    const workflow = makeWorkflow([
      makeStep('p0-a'),
      makeStep('p0-b'),
      makeStep('p1-a', ['p0-a']),
      makeStep('p1-b', ['p0-b']),
      makeStep('p2-final', ['p1-a', 'p1-b']),
    ]);
    const planResult = createExecutionPlan(workflow);
    expect(planResult.ok).toBe(true);
    if (planResult.ok) {
      const order = getExecutionOrder(planResult.value);
      expect(order).toHaveLength(5);
      // First 2 should be p0 steps
      const phase0Ids = order.slice(0, 2).sort();
      expect(phase0Ids).toEqual(['p0-a', 'p0-b']);
      // Next 2 should be p1 steps
      const phase1Ids = order.slice(2, 4).sort();
      expect(phase1Ids).toEqual(['p1-a', 'p1-b']);
      // Last should be p2
      expect(order[4]).toBe('p2-final');
    }
  });

  it('returns single step ID for single-step plan', () => {
    const workflow = makeWorkflow([makeStep('only')]);
    const planResult = createExecutionPlan(workflow);
    expect(planResult.ok).toBe(true);
    if (planResult.ok) {
      const order = getExecutionOrder(planResult.value);
      expect(order).toEqual(['only']);
    }
  });

  it('handles plan with single phase containing multiple steps', () => {
    const workflow = makeWorkflow([makeStep('a'), makeStep('b'), makeStep('c')]);
    const planResult = createExecutionPlan(workflow);
    expect(planResult.ok).toBe(true);
    if (planResult.ok) {
      const order = getExecutionOrder(planResult.value);
      expect(order).toHaveLength(3);
      expect(order.sort()).toEqual(['a', 'b', 'c']);
    }
  });
});
