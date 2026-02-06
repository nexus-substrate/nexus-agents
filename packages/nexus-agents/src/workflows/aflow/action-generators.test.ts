/**
 * Tests for action-generators.ts
 *
 * Covers add/remove/modify step generation, dependency actions,
 * parallel actions, and cycle detection.
 */

import { describe, it, expect } from 'vitest';
import {
  generateAddStepActions,
  createAddStepActionsForAgent,
  generateRemoveStepActions,
  generateModifyStepActions,
  generateDependencyActions,
  generateParallelActions,
  wouldCreateCycle,
} from './action-generators.js';
import type { WorkflowDefinition } from '../../core/index.js';
import type { ActionSpaceConfig, TaskSpecification } from './aflow-types.js';

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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeConfig(overrides: Partial<ActionSpaceConfig> = {}) {
  return {
    availableAgents: ['code_expert', 'testing_expert', 'security_expert'],
    availableActions: ['implement', 'review'],
    defaultTimeout: 60000,
    defaultRetries: 2,
    ...overrides,
  } as ActionSpaceConfig;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeTask(overrides: Partial<TaskSpecification> = {}) {
  return {
    description: 'Build feature',
    requiredCapabilities: ['code'],
    constraints: {
      requiredAgents: ['code_expert', 'testing_expert'],
    },
    ...overrides,
  } as TaskSpecification;
}

// ============================================================================
// generateAddStepActions
// ============================================================================

describe('generateAddStepActions', () => {
  it('generates add actions for available agents', () => {
    const actions = generateAddStepActions(makeWorkflow(), makeTask(), makeConfig());
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.type === 'add_step')).toBe(true);
  });

  it('prioritizes required agents not yet used', () => {
    const task = makeTask({
      constraints: { requiredAgents: ['security_expert'] },
    });
    const wf = makeWorkflow(); // security_expert not used
    const actions = generateAddStepActions(wf, task, makeConfig());
    // First actions should be for security_expert
    expect(actions[0]?.newStep?.agent).toBe('security_expert');
  });

  it('excludes forbidden agents', () => {
    const task = makeTask({
      constraints: {
        requiredAgents: [],
        forbiddenAgents: ['security_expert'],
      },
    });
    const actions = generateAddStepActions(makeWorkflow(), task, makeConfig());
    const agents = actions.map((a) => a.newStep?.agent);
    expect(agents).not.toContain('security_expert');
  });

  it('returns empty for empty config', () => {
    const config = makeConfig({ availableAgents: [], availableActions: [] });
    const actions = generateAddStepActions(makeWorkflow(), makeTask(), config);
    expect(actions).toHaveLength(0);
  });
});

// ============================================================================
// createAddStepActionsForAgent
// ============================================================================

describe('createAddStepActionsForAgent', () => {
  it('creates one action per available action', () => {
    const config = makeConfig({ availableActions: ['implement', 'review', 'analyze'] });
    const actions = createAddStepActionsForAgent('code_expert', makeWorkflow(), config);
    expect(actions).toHaveLength(3);
  });

  it('sets agent on new step', () => {
    const actions = createAddStepActionsForAgent('security_expert', makeWorkflow(), makeConfig());
    expect(actions.every((a) => a.newStep?.agent === 'security_expert')).toBe(true);
  });

  it('sets dependency on last step', () => {
    const actions = createAddStepActionsForAgent('code_expert', makeWorkflow(), makeConfig());
    expect(actions[0]?.newStep?.dependsOn).toEqual(['step2']);
  });

  it('sets empty dependencies for empty workflow', () => {
    const wf = makeWorkflow({ steps: [] });
    const actions = createAddStepActionsForAgent('code_expert', wf, makeConfig());
    expect(actions[0]?.newStep?.dependsOn).toEqual([]);
  });
});

// ============================================================================
// generateRemoveStepActions
// ============================================================================

describe('generateRemoveStepActions', () => {
  it('creates one remove action per step', () => {
    const actions = generateRemoveStepActions(makeWorkflow());
    expect(actions).toHaveLength(2);
    expect(actions.every((a) => a.type === 'remove_step')).toBe(true);
  });

  it('targets correct step IDs', () => {
    const actions = generateRemoveStepActions(makeWorkflow());
    const ids = actions.map((a) => a.targetStepId);
    expect(ids).toEqual(['step1', 'step2']);
  });

  it('returns empty for empty workflow', () => {
    const actions = generateRemoveStepActions(makeWorkflow({ steps: [] }));
    expect(actions).toHaveLength(0);
  });
});

// ============================================================================
// generateModifyStepActions
// ============================================================================

describe('generateModifyStepActions', () => {
  it('generates timeout and retry modifications per step', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {} }],
    });
    const actions = generateModifyStepActions(wf);
    // 2 timeout mods + 2 retry mods = 4 per step
    expect(actions).toHaveLength(4);
    expect(actions.every((a) => a.type === 'modify_step')).toBe(true);
  });

  it('halves and doubles timeout', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {}, timeout: 10000 }],
    });
    const actions = generateModifyStepActions(wf);
    const timeouts = actions
      .filter((a) => a.modifications?.timeout !== undefined)
      .map((a) => a.modifications?.timeout);
    expect(timeouts).toContain(5000);
    expect(timeouts).toContain(20000);
  });

  it('uses default timeout when not specified', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {} }],
    });
    const actions = generateModifyStepActions(wf);
    const timeouts = actions
      .filter((a) => a.modifications?.timeout !== undefined)
      .map((a) => a.modifications?.timeout);
    expect(timeouts).toContain(30000); // 60000 * 0.5
    expect(timeouts).toContain(120000); // 60000 * 2
  });

  it('clamps retries between 0 and 10', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {}, retries: 0 }],
    });
    const actions = generateModifyStepActions(wf);
    const retries = actions
      .filter((a) => a.modifications?.retries !== undefined)
      .map((a) => a.modifications?.retries);
    expect(retries).toContain(0); // Math.max(0, 0-1) = 0
    expect(retries).toContain(1); // Math.min(10, 0+1) = 1
  });
});

// ============================================================================
// generateDependencyActions
// ============================================================================

describe('generateDependencyActions', () => {
  it('generates add and remove dependency actions', () => {
    const actions = generateDependencyActions(makeWorkflow());
    expect(actions.length).toBeGreaterThan(0);
  });

  it('allows removing existing dependency', () => {
    const actions = generateDependencyActions(makeWorkflow());
    const removes = actions.filter((a) => a.type === 'remove_dependency');
    // step2 depends on step1, so removing it should be possible
    expect(removes.some((a) => a.targetStepId === 'step2' && a.sourceStepId === 'step1')).toBe(
      true
    );
  });

  it('returns empty for single step', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {} }],
    });
    const actions = generateDependencyActions(wf);
    expect(actions).toHaveLength(0);
  });
});

// ============================================================================
// generateParallelActions
// ============================================================================

describe('generateParallelActions', () => {
  it('generates toggle actions for each step', () => {
    const actions = generateParallelActions(makeWorkflow());
    expect(actions).toHaveLength(2);
    expect(actions.every((a) => a.type === 'set_parallel')).toBe(true);
  });

  it('toggles parallel from false to true', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {}, parallel: false }],
    });
    const actions = generateParallelActions(wf);
    expect(actions[0]?.modifications?.parallel).toBe(true);
  });

  it('toggles parallel from true to false', () => {
    const wf = makeWorkflow({
      steps: [{ id: 's1', agent: 'code_expert', action: 'Do', inputs: {}, parallel: true }],
    });
    const actions = generateParallelActions(wf);
    expect(actions[0]?.modifications?.parallel).toBe(false);
  });
});

// ============================================================================
// wouldCreateCycle
// ============================================================================

describe('wouldCreateCycle', () => {
  it('returns false for independent steps', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 'a', agent: 'code_expert', action: 'Do', inputs: {} },
        { id: 'b', agent: 'code_expert', action: 'Do', inputs: {} },
      ],
    });
    expect(wouldCreateCycle(wf, 'a', 'b')).toBe(false);
  });

  it('returns true for direct cycle', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 'a', agent: 'code_expert', action: 'Do', inputs: {}, dependsOn: ['b'] },
        { id: 'b', agent: 'code_expert', action: 'Do', inputs: {} },
      ],
    });
    // Adding b -> a would create a → b → a cycle
    expect(wouldCreateCycle(wf, 'b', 'a')).toBe(true);
  });

  it('returns true for transitive cycle', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 'a', agent: 'code_expert', action: 'Do', inputs: {}, dependsOn: ['b'] },
        { id: 'b', agent: 'code_expert', action: 'Do', inputs: {}, dependsOn: ['c'] },
        { id: 'c', agent: 'code_expert', action: 'Do', inputs: {} },
      ],
    });
    // Adding c -> a would create a → b → c → a cycle
    expect(wouldCreateCycle(wf, 'c', 'a')).toBe(true);
  });

  it('returns false when no path exists', () => {
    const wf = makeWorkflow({
      steps: [
        { id: 'a', agent: 'code_expert', action: 'Do', inputs: {} },
        { id: 'b', agent: 'code_expert', action: 'Do', inputs: {}, dependsOn: ['c'] },
        { id: 'c', agent: 'code_expert', action: 'Do', inputs: {} },
      ],
    });
    // Adding a -> b would not create cycle (no path from b back to a)
    expect(wouldCreateCycle(wf, 'a', 'b')).toBe(false);
  });
});
