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
});
