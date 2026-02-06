/**
 * Tests for execution-context.ts
 *
 * Covers createExecutionContext, storeStepResult, getStepResult,
 * setVariable, getVariable, getCompletedSteps, isStepCompleted,
 * areStepsCompleted, getExecutionDuration, cancelExecution,
 * isCancelled, snapshotContext, and validateRequiredInputs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createExecutionContext,
  storeStepResult,
  getStepResult,
  setVariable,
  getVariable,
  getCompletedSteps,
  isStepCompleted,
  areStepsCompleted,
  cancelExecution,
  isCancelled,
  snapshotContext,
  validateRequiredInputs,
} from './execution-context.js';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../core/index.js';
import type { StepResult } from '../core/index.js';

// ============================================================================
// Setup
// ============================================================================

const FIXED_TIME = 1700000000000;

beforeEach(() => {
  setTimeProvider(new FixedTimeProvider(FIXED_TIME));
});

afterEach(() => {
  resetTimeProvider();
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeStepResult(output: unknown = 'done') {
  return {
    status: 'completed' as const,
    output,
    startedAt: new Date(FIXED_TIME).toISOString(),
    completedAt: new Date(FIXED_TIME).toISOString(),
    durationMs: 100,
  } as unknown as StepResult;
}

// ============================================================================
// createExecutionContext
// ============================================================================

describe('createExecutionContext', () => {
  it('creates context with required fields', () => {
    const ctx = createExecutionContext({ workflowId: 'wf-1', inputs: { key: 'val' } });
    expect(ctx.workflowId).toBe('wf-1');
    expect(ctx.inputs).toEqual({ key: 'val' });
    expect(ctx.cancelled).toBe(false);
    expect(ctx.stepResults.size).toBe(0);
    expect(ctx.variables.size).toBe(0);
  });

  it('uses custom executionId when provided', () => {
    const ctx = createExecutionContext({
      workflowId: 'wf-1',
      inputs: {},
      executionId: 'custom-id',
    });
    expect(ctx.executionId).toBe('custom-id');
  });

  it('auto-generates executionId when not provided', () => {
    const ctx = createExecutionContext({ workflowId: 'wf-1', inputs: {} });
    expect(ctx.executionId).toContain('exec_');
  });

  it('does not share input reference', () => {
    const inputs = { a: 1 };
    const ctx = createExecutionContext({ workflowId: 'wf-1', inputs });
    expect(ctx.inputs).toEqual(inputs);
    expect(ctx.inputs).not.toBe(inputs);
  });
});

// ============================================================================
// Step results
// ============================================================================

describe('storeStepResult / getStepResult', () => {
  it('stores and retrieves step result', () => {
    const ctx = createExecutionContext({ workflowId: 'wf-1', inputs: {} });
    const result = makeStepResult();
    storeStepResult(ctx, 'step-1', result);
    expect(getStepResult(ctx, 'step-1')).toBe(result);
  });

  it('returns undefined for missing step', () => {
    const ctx = createExecutionContext({ workflowId: 'wf-1', inputs: {} });
    expect(getStepResult(ctx, 'missing')).toBeUndefined();
  });
});

// ============================================================================
// Variables
// ============================================================================

describe('setVariable / getVariable', () => {
  it('sets and gets a variable', () => {
    const ctx = createExecutionContext({ workflowId: 'wf-1', inputs: {} });
    setVariable(ctx, 'count', 42);
    expect(getVariable(ctx, 'count')).toBe(42);
  });

  it('returns undefined for unset variable', () => {
    const ctx = createExecutionContext({ workflowId: 'wf-1', inputs: {} });
    expect(getVariable(ctx, 'missing')).toBeUndefined();
  });
});

// ============================================================================
// Completion tracking
// ============================================================================

describe('getCompletedSteps / isStepCompleted / areStepsCompleted', () => {
  it('tracks completed steps', () => {
    const ctx = createExecutionContext({ workflowId: 'wf-1', inputs: {} });
    storeStepResult(ctx, 'step-1', makeStepResult());
    storeStepResult(ctx, 'step-2', makeStepResult());

    expect(getCompletedSteps(ctx)).toEqual(['step-1', 'step-2']);
    expect(isStepCompleted(ctx, 'step-1')).toBe(true);
    expect(isStepCompleted(ctx, 'step-3')).toBe(false);
  });

  it('areStepsCompleted checks all steps', () => {
    const ctx = createExecutionContext({ workflowId: 'wf-1', inputs: {} });
    storeStepResult(ctx, 'step-1', makeStepResult());

    expect(areStepsCompleted(ctx, ['step-1'])).toBe(true);
    expect(areStepsCompleted(ctx, ['step-1', 'step-2'])).toBe(false);
    expect(areStepsCompleted(ctx, [])).toBe(true);
  });
});

// ============================================================================
// Cancellation
// ============================================================================

describe('cancelExecution / isCancelled', () => {
  it('marks context as cancelled', () => {
    const ctx = createExecutionContext({ workflowId: 'wf-1', inputs: {} });
    expect(isCancelled(ctx)).toBe(false);
    cancelExecution(ctx);
    expect(isCancelled(ctx)).toBe(true);
  });
});

// ============================================================================
// snapshotContext
// ============================================================================

describe('snapshotContext', () => {
  it('produces a plain object snapshot', () => {
    const ctx = createExecutionContext({
      workflowId: 'wf-1',
      inputs: { x: 1 },
      executionId: 'exec-test',
    });
    storeStepResult(ctx, 'step-1', makeStepResult('hello'));
    setVariable(ctx, 'v1', 'world');

    const snap = snapshotContext(ctx);
    expect(snap.workflowId).toBe('wf-1');
    expect(snap.executionId).toBe('exec-test');
    expect(snap.cancelled).toBe(false);
    expect(snap.inputs).toEqual({ x: 1 });
    expect(snap.stepResults).toHaveProperty('step-1');
    expect(snap.variables).toHaveProperty('v1', 'world');
    expect(typeof snap.durationMs).toBe('number');
  });
});

// ============================================================================
// validateRequiredInputs
// ============================================================================

describe('validateRequiredInputs', () => {
  it('returns null when all required inputs present', () => {
    expect(validateRequiredInputs({ a: 1, b: 2 }, ['a', 'b'])).toBeNull();
  });

  it('returns error for missing inputs', () => {
    const err = validateRequiredInputs({ a: 1 }, ['a', 'b', 'c']);
    expect(err).not.toBeNull();
    expect(err?.message).toContain('b');
    expect(err?.message).toContain('c');
  });

  it('treats undefined values as missing', () => {
    const err = validateRequiredInputs({ a: undefined }, ['a']);
    expect(err).not.toBeNull();
  });

  it('returns null for empty required list', () => {
    expect(validateRequiredInputs({}, [])).toBeNull();
  });
});
