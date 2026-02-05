/**
 * Tests for AFlow Generator Helpers
 * @module workflows/aflow/aflow-generator-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { WorkflowAction, TaskSpecification } from './aflow-types.js';
import { actionsEqual, createInitialWorkflow } from './aflow-generator-helpers.js';

vi.mock('../../core/index.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getTimeProvider: () => ({ now: () => 1700000000000 }),
  };
});

// ============================================================================
// actionsEqual
// ============================================================================

describe('actionsEqual', () => {
  it('returns true for identical actions', () => {
    const action: WorkflowAction = { type: 'add_step', targetStepId: 's1' };
    expect(actionsEqual(action, { ...action })).toBe(true);
  });

  it('returns false for different types', () => {
    const a: WorkflowAction = { type: 'add_step' };
    const b: WorkflowAction = { type: 'remove_step' };
    expect(actionsEqual(a, b)).toBe(false);
  });

  it('returns false for different targetStepId', () => {
    const a: WorkflowAction = { type: 'modify_step', targetStepId: 's1' };
    const b: WorkflowAction = { type: 'modify_step', targetStepId: 's2' };
    expect(actionsEqual(a, b)).toBe(false);
  });

  it('returns false for different sourceStepId', () => {
    const a: WorkflowAction = { type: 'add_dependency', sourceStepId: 's1' };
    const b: WorkflowAction = { type: 'add_dependency', sourceStepId: 's2' };
    expect(actionsEqual(a, b)).toBe(false);
  });

  it('compares newStep.id for add_step actions', () => {
    const a: WorkflowAction = {
      type: 'add_step',
      newStep: { id: 'new-1' },
    };
    const b: WorkflowAction = {
      type: 'add_step',
      newStep: { id: 'new-1' },
    };
    expect(actionsEqual(a, b)).toBe(true);
  });

  it('returns false for add_step with different newStep.id', () => {
    const a: WorkflowAction = {
      type: 'add_step',
      newStep: { id: 'new-1' },
    };
    const b: WorkflowAction = {
      type: 'add_step',
      newStep: { id: 'new-2' },
    };
    expect(actionsEqual(a, b)).toBe(false);
  });

  it('handles add_step with undefined newStep', () => {
    const a: WorkflowAction = { type: 'add_step' };
    const b: WorkflowAction = { type: 'add_step' };
    // Both undefined: undefined === undefined is true
    expect(actionsEqual(a, b)).toBe(true);
  });

  it('returns true for non-add_step with same type and targets', () => {
    const a: WorkflowAction = { type: 'set_parallel', targetStepId: 's1' };
    const b: WorkflowAction = { type: 'set_parallel', targetStepId: 's1' };
    expect(actionsEqual(a, b)).toBe(true);
  });

  it('returns true for terminate actions', () => {
    const a: WorkflowAction = { type: 'terminate' };
    const b: WorkflowAction = { type: 'terminate' };
    expect(actionsEqual(a, b)).toBe(true);
  });
});

// ============================================================================
// createInitialWorkflow
// ============================================================================

describe('createInitialWorkflow', () => {
  const baseTask: TaskSpecification = {
    description: 'Test task',
    requiredCapabilities: ['coding'],
    expectedInputs: ['code', 'tests'],
    expectedOutput: 'reviewed_code',
  };

  it('creates workflow with name including timestamp', () => {
    const workflow = createInitialWorkflow(baseTask);
    expect(workflow.name).toBe('generated-1700000000000');
  });

  it('includes description from task', () => {
    const workflow = createInitialWorkflow(baseTask);
    expect(workflow.description).toBe('Workflow for: Test task');
  });

  it('maps expected inputs to input definitions', () => {
    const workflow = createInitialWorkflow(baseTask);
    expect(workflow.inputs).toHaveLength(2);
    expect(workflow.inputs[0]).toEqual({ name: 'code', type: 'string', required: true });
    expect(workflow.inputs[1]).toEqual({ name: 'tests', type: 'string', required: true });
  });

  it('starts with empty steps', () => {
    const workflow = createInitialWorkflow(baseTask);
    expect(workflow.steps).toEqual([]);
  });

  it('uses default timeout when no constraints', () => {
    const workflow = createInitialWorkflow(baseTask);
    expect(workflow.timeout).toBe(300000);
  });

  it('uses constraint timeout when provided', () => {
    const task: TaskSpecification = {
      ...baseTask,
      constraints: { maxTotalTimeout: 60000 },
    };
    const workflow = createInitialWorkflow(task);
    expect(workflow.timeout).toBe(60000);
  });

  it('sets version to 1.0.0', () => {
    const workflow = createInitialWorkflow(baseTask);
    expect(workflow.version).toBe('1.0.0');
  });

  it('handles empty expectedInputs', () => {
    const task: TaskSpecification = {
      ...baseTask,
      expectedInputs: [],
    };
    const workflow = createInitialWorkflow(task);
    expect(workflow.inputs).toEqual([]);
  });
});
