/**
 * Tests for action-applicators.ts
 *
 * Covers all action types: add_step, remove_step, modify_step,
 * add_dependency, remove_dependency, set_parallel, terminate.
 */

import { describe, it, expect } from 'vitest';
import {
  applyAction,
  applyAddStep,
  applyRemoveStep,
  applyModifyStep,
  applyModifications,
  applyAddDependency,
  applyRemoveDependency,
  applySetParallel,
} from './action-applicators.js';
import type { WorkflowDefinition, WorkflowStep } from '../../core/index.js';

// ============================================================================
// Fixtures
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeWorkflow(overrides: Partial<WorkflowDefinition> = {}) {
  return {
    name: 'test',
    version: '1.0.0',
    inputs: [],
    steps: [
      { id: 'step1', agent: 'code_expert', action: 'implement', inputs: {} },
      {
        id: 'step2',
        agent: 'testing_expert',
        action: 'test',
        inputs: {},
        dependsOn: ['step1'],
      },
    ],
    ...overrides,
  } as WorkflowDefinition;
}

// ============================================================================
// applyAction dispatcher
// ============================================================================

describe('applyAction', () => {
  it('dispatches add_step', () => {
    const result = applyAction(makeWorkflow(), {
      type: 'add_step',
      newStep: { id: 's3', agent: 'security_expert', action: 'audit', inputs: {} },
    });
    expect(result.steps).toHaveLength(3);
  });

  it('dispatches remove_step', () => {
    const result = applyAction(makeWorkflow(), { type: 'remove_step', targetStepId: 'step1' });
    expect(result.steps).toHaveLength(1);
  });

  it('dispatches terminate (returns same workflow)', () => {
    const wf = makeWorkflow();
    const result = applyAction(wf, { type: 'terminate' });
    expect(result).toBe(wf);
  });

  it('returns same workflow for unknown type', () => {
    const wf = makeWorkflow();
    const result = applyAction(wf, { type: 'unknown' as never });
    expect(result).toBe(wf);
  });
});

// ============================================================================
// applyAddStep
// ============================================================================

describe('applyAddStep', () => {
  it('adds new step to workflow', () => {
    const result = applyAddStep(makeWorkflow(), {
      type: 'add_step',
      newStep: { id: 's3', agent: 'security_expert', action: 'audit', inputs: {} },
    });
    expect(result.steps).toHaveLength(3);
    expect(result.steps[2]?.agent).toBe('security_expert');
  });

  it('preserves existing steps', () => {
    const result = applyAddStep(makeWorkflow(), {
      type: 'add_step',
      newStep: { id: 's3', agent: 'worker', action: 'do', inputs: {} },
    });
    expect(result.steps[0]?.id).toBe('step1');
    expect(result.steps[1]?.id).toBe('step2');
  });

  it('returns unchanged workflow when newStep is missing', () => {
    const wf = makeWorkflow();
    const result = applyAddStep(wf, { type: 'add_step' });
    expect(result).toBe(wf);
  });

  it('includes optional properties when provided', () => {
    const result = applyAddStep(makeWorkflow(), {
      type: 'add_step',
      newStep: {
        id: 's3',
        agent: 'worker',
        action: 'do',
        inputs: {},
        timeout: 5000,
        retries: 3,
        dependsOn: ['step1'],
        parallel: true,
      },
    });
    const added = result.steps[2];
    expect(added?.timeout).toBe(5000);
    expect(added?.retries).toBe(3);
    expect(added?.dependsOn).toEqual(['step1']);
    expect(added?.parallel).toBe(true);
  });
});

// ============================================================================
// applyRemoveStep
// ============================================================================

describe('applyRemoveStep', () => {
  it('removes step by ID', () => {
    const result = applyRemoveStep(makeWorkflow(), {
      type: 'remove_step',
      targetStepId: 'step1',
    });
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.id).toBe('step2');
  });

  it('cleans up dependencies referencing removed step', () => {
    const result = applyRemoveStep(makeWorkflow(), {
      type: 'remove_step',
      targetStepId: 'step1',
    });
    // step2 depended on step1, now that dependency should be removed
    expect(result.steps[0]?.dependsOn).toBeUndefined();
  });

  it('returns unchanged workflow when targetStepId is missing', () => {
    const wf = makeWorkflow();
    const result = applyRemoveStep(wf, { type: 'remove_step' });
    expect(result).toBe(wf);
  });

  it('preserves other dependencies', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 'a', agent: 'code_expert', action: 'do', inputs: {} },
        { id: 'b', agent: 'code_expert', action: 'do', inputs: {} },
        { id: 'c', agent: 'code_expert', action: 'do', inputs: {}, dependsOn: ['a', 'b'] },
      ],
    });
    const result = applyRemoveStep(wf, { type: 'remove_step', targetStepId: 'a' });
    const stepC = result.steps.find((s) => s.id === 'c');
    expect(stepC?.dependsOn).toEqual(['b']);
  });
});

// ============================================================================
// applyModifyStep
// ============================================================================

describe('applyModifyStep', () => {
  it('modifies step timeout', () => {
    const result = applyModifyStep(makeWorkflow(), {
      type: 'modify_step',
      targetStepId: 'step1',
      modifications: { timeout: 30000 },
    });
    expect(result.steps[0]?.timeout).toBe(30000);
  });

  it('does not modify other steps', () => {
    const result = applyModifyStep(makeWorkflow(), {
      type: 'modify_step',
      targetStepId: 'step1',
      modifications: { timeout: 30000 },
    });
    expect(result.steps[1]?.timeout).toBeUndefined();
  });

  it('returns unchanged workflow when targetStepId is missing', () => {
    const wf = makeWorkflow();
    const result = applyModifyStep(wf, {
      type: 'modify_step',
      modifications: { timeout: 5000 },
    });
    expect(result).toBe(wf);
  });
});

// ============================================================================
// applyModifications
// ============================================================================

describe('applyModifications', () => {
  const step: WorkflowStep = {
    id: 's1',
    agent: 'code_expert',
    action: 'implement',
    inputs: {},
  } as WorkflowStep;

  it('applies timeout modification', () => {
    const result = applyModifications(step, { timeout: 5000 });
    expect(result.timeout).toBe(5000);
  });

  it('applies retries modification', () => {
    const result = applyModifications(step, { retries: 3 });
    expect(result.retries).toBe(3);
  });

  it('applies parallel modification', () => {
    const result = applyModifications(step, { parallel: true });
    expect(result.parallel).toBe(true);
  });

  it('applies agent modification', () => {
    const result = applyModifications(step, { agent: 'security_expert' });
    expect(result.agent).toBe('security_expert');
  });

  it('applies multiple modifications at once', () => {
    const result = applyModifications(step, { timeout: 5000, retries: 2, parallel: true });
    expect(result.timeout).toBe(5000);
    expect(result.retries).toBe(2);
    expect(result.parallel).toBe(true);
  });

  it('preserves existing step properties', () => {
    const result = applyModifications(step, { timeout: 5000 });
    expect(result.id).toBe('s1');
    expect(result.agent).toBe('code_expert');
    expect(result.action).toBe('implement');
  });
});

// ============================================================================
// applyAddDependency
// ============================================================================

describe('applyAddDependency', () => {
  it('adds dependency to target step', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 'a', agent: 'code_expert', action: 'do', inputs: {} },
        { id: 'b', agent: 'code_expert', action: 'do', inputs: {} },
      ],
    });
    const result = applyAddDependency(wf, {
      type: 'add_dependency',
      targetStepId: 'b',
      sourceStepId: 'a',
    });
    expect(result.steps[1]?.dependsOn).toEqual(['a']);
  });

  it('does not add duplicate dependency', () => {
    const result = applyAddDependency(makeWorkflow(), {
      type: 'add_dependency',
      targetStepId: 'step2',
      sourceStepId: 'step1', // already exists
    });
    expect(result.steps[1]?.dependsOn).toEqual(['step1']);
  });

  it('returns unchanged when missing IDs', () => {
    const wf = makeWorkflow();
    expect(applyAddDependency(wf, { type: 'add_dependency' })).toBe(wf);
  });
});

// ============================================================================
// applyRemoveDependency
// ============================================================================

describe('applyRemoveDependency', () => {
  it('removes dependency from target step', () => {
    const result = applyRemoveDependency(makeWorkflow(), {
      type: 'remove_dependency',
      targetStepId: 'step2',
      sourceStepId: 'step1',
    });
    // step2 had only step1 as dep, so dependsOn should be removed entirely
    expect(result.steps[1]?.dependsOn).toBeUndefined();
  });

  it('preserves other dependencies', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 'a', agent: 'code_expert', action: 'do', inputs: {} },
        { id: 'b', agent: 'code_expert', action: 'do', inputs: {} },
        { id: 'c', agent: 'code_expert', action: 'do', inputs: {}, dependsOn: ['a', 'b'] },
      ],
    });
    const result = applyRemoveDependency(wf, {
      type: 'remove_dependency',
      targetStepId: 'c',
      sourceStepId: 'a',
    });
    expect(result.steps[2]?.dependsOn).toEqual(['b']);
  });

  it('returns unchanged when missing IDs', () => {
    const wf = makeWorkflow();
    expect(applyRemoveDependency(wf, { type: 'remove_dependency' })).toBe(wf);
  });
});

// ============================================================================
// applySetParallel
// ============================================================================

describe('applySetParallel', () => {
  it('sets parallel on target step', () => {
    const result = applySetParallel(makeWorkflow(), {
      type: 'set_parallel',
      targetStepId: 'step1',
      modifications: { parallel: true },
    });
    expect(result.steps[0]?.parallel).toBe(true);
  });

  it('does not affect other steps', () => {
    const result = applySetParallel(makeWorkflow(), {
      type: 'set_parallel',
      targetStepId: 'step1',
      modifications: { parallel: true },
    });
    expect(result.steps[1]?.parallel).toBeUndefined();
  });

  it('returns unchanged when missing IDs', () => {
    const wf = makeWorkflow();
    expect(applySetParallel(wf, { type: 'set_parallel' })).toBe(wf);
  });
});
