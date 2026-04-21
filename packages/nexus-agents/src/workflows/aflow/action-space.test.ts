/**
 * Tests for action-space.ts
 *
 * Covers ActionSpace class: getValidActions, applyAction, sampleAction,
 * isTerminateAction, describeAction, and createActionSpace factory.
 */

import { describe, it, expect } from 'vitest';
import { ActionSpace, createActionSpace } from './action-space.js';
import type { WorkflowDefinition } from '../../core/index.js';
import type { TaskSpecification } from './aflow-types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
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
  };
}

function makeTask(overrides: Partial<TaskSpecification> = {}): TaskSpecification {
  return {
    description: 'Build feature',
    requiredCapabilities: ['code'],
    constraints: { requiredAgents: ['code_expert'] },
    ...overrides,
  } as unknown as TaskSpecification;
}

// ============================================================================
// ActionSpace constructor
// ============================================================================

describe('ActionSpace - constructor', () => {
  it('creates with default config', () => {
    const space = new ActionSpace();
    expect(space).toBeInstanceOf(ActionSpace);
  });

  it('creates with seed for deterministic behavior', () => {
    const space = new ActionSpace({}, 42);
    expect(space).toBeInstanceOf(ActionSpace);
  });
});

// ============================================================================
// getValidActions
// ============================================================================

describe('ActionSpace - getValidActions', () => {
  it('returns actions for a valid workflow', () => {
    const space = new ActionSpace();
    const actions = space.getValidActions(makeWorkflow(), makeTask(), 10);
    expect(actions.length).toBeGreaterThan(0);
  });

  it('includes terminate action when steps >= 2', () => {
    const space = new ActionSpace();
    const actions = space.getValidActions(makeWorkflow(), makeTask(), 10);
    expect(actions.some((a) => a.type === 'terminate')).toBe(true);
  });

  it('excludes terminate when fewer than 2 steps', () => {
    const space = new ActionSpace();
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'do', inputs: {} }],
    });
    const actions = space.getValidActions(wf, makeTask(), 10);
    expect(actions.some((a) => a.type === 'terminate')).toBe(false);
  });

  it('excludes add_step when at max steps', () => {
    const space = new ActionSpace();
    const actions = space.getValidActions(makeWorkflow(), makeTask(), 2);
    expect(actions.some((a) => a.type === 'add_step')).toBe(false);
  });

  it('includes add_step when below max steps', () => {
    const space = new ActionSpace();
    const actions = space.getValidActions(makeWorkflow(), makeTask(), 10);
    expect(actions.some((a) => a.type === 'add_step')).toBe(true);
  });

  it('returns empty for empty workflow', () => {
    const space = new ActionSpace();
    const wf = makeWorkflow({ steps: [] });
    const actions = space.getValidActions(wf, makeTask(), 10);
    // Only add_step should be available (no remove, modify, deps, parallel, terminate)
    expect(actions.every((a) => a.type === 'add_step')).toBe(true);
  });
});

// ============================================================================
// applyAction
// ============================================================================

describe('ActionSpace - applyAction', () => {
  it('delegates to action applicators', () => {
    const space = new ActionSpace();
    const wf = makeWorkflow();
    const result = space.applyAction(wf, { type: 'terminate' });
    expect(result).toBe(wf);
  });

  it('adds a step', () => {
    const space = new ActionSpace();
    const result = space.applyAction(makeWorkflow(), {
      type: 'add_step',
      newStep: { id: 's3', agent: 'worker', action: 'exec', inputs: {} },
    });
    expect(result.steps).toHaveLength(3);
  });
});

// ============================================================================
// sampleAction
// ============================================================================

describe('ActionSpace - sampleAction', () => {
  it('returns null for empty actions', () => {
    const space = new ActionSpace();
    expect(space.sampleAction([])).toBeNull();
  });

  it('returns an action from the list', () => {
    const space = new ActionSpace({}, 42);
    const actions = [{ type: 'terminate' as const }, { type: 'terminate' as const }];
    const result = space.sampleAction(actions);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('terminate');
  });
});

// ============================================================================
// isTerminateAction
// ============================================================================

describe('ActionSpace - isTerminateAction', () => {
  it('returns true for terminate action', () => {
    const space = new ActionSpace();
    expect(space.isTerminateAction({ type: 'terminate' })).toBe(true);
  });

  it('returns false for non-terminate action', () => {
    const space = new ActionSpace();
    expect(space.isTerminateAction({ type: 'add_step' })).toBe(false);
  });
});

// ============================================================================
// describeAction
// ============================================================================

describe('ActionSpace - describeAction', () => {
  it('describes terminate action', () => {
    const space = new ActionSpace();
    const desc = space.describeAction({ type: 'terminate' });
    expect(desc.toLowerCase()).toContain('terminate');
  });

  it('describes add_step action', () => {
    const space = new ActionSpace();
    const desc = space.describeAction({
      type: 'add_step',
      newStep: { id: 's1', agent: 'code_expert', action: 'implement', inputs: {} },
    });
    expect(desc.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// createActionSpace factory
// ============================================================================

describe('createActionSpace', () => {
  it('creates an ActionSpace instance', () => {
    expect(createActionSpace()).toBeInstanceOf(ActionSpace);
  });

  it('accepts optional config and seed', () => {
    const space = createActionSpace({}, 42);
    expect(space).toBeInstanceOf(ActionSpace);
  });
});
