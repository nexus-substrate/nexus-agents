/**
 * Tests for Step Executor Helpers
 * @module workflows/step-executor-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { WorkflowStep } from '../core/index.js';
import { WorkflowError, NexusError, ErrorCode } from '../core/index.js';
import type { WorkflowExecutionContext } from './execution-context.js';
import {
  MAX_RETRY_DELAY_MS,
  checkSimpleCondition,
  checkStepStatusCondition,
  checkStepOutputCondition,
  evaluateCondition,
  calculateRetryDelay,
  formatValue,
  buildTaskDescription,
  extractErrorMessage,
  isNonRetryableError,
} from './step-executor-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeContext(
  stepResults: Record<string, { status: string; output?: unknown }>
): WorkflowExecutionContext {
  const map = new Map<string, { status: string; output?: unknown }>();
  for (const [key, value] of Object.entries(stepResults)) {
    map.set(key, value);
  }
  return { stepResults: map } as unknown as WorkflowExecutionContext;
}

// ============================================================================
// checkSimpleCondition
// ============================================================================

describe('checkSimpleCondition', () => {
  it('returns true for "always"', () => {
    expect(checkSimpleCondition('always')).toBe(true);
  });

  it('returns true for "true"', () => {
    expect(checkSimpleCondition('true')).toBe(true);
  });

  it('returns false for "never"', () => {
    expect(checkSimpleCondition('never')).toBe(false);
  });

  it('returns false for "false"', () => {
    expect(checkSimpleCondition('false')).toBe(false);
  });

  it('returns null for unrecognized', () => {
    expect(checkSimpleCondition('something')).toBeNull();
  });
});

// ============================================================================
// checkStepStatusCondition
// ============================================================================

describe('checkStepStatusCondition', () => {
  it('matches step status condition', () => {
    const context = makeContext({ step1: { status: 'success' } });
    expect(checkStepStatusCondition("steps.step1.status == 'success'", context)).toBe(true);
  });

  it('returns false for non-matching status', () => {
    const context = makeContext({ step1: { status: 'failed' } });
    expect(checkStepStatusCondition("steps.step1.status == 'success'", context)).toBe(false);
  });

  it('returns null for non-matching pattern', () => {
    const context = makeContext({});
    expect(checkStepStatusCondition('not a valid condition', context)).toBeNull();
  });

  it('returns false for missing step', () => {
    const context = makeContext({});
    expect(checkStepStatusCondition("steps.missing.status == 'success'", context)).toBe(false);
  });
});

// ============================================================================
// checkStepOutputCondition
// ============================================================================

describe('checkStepOutputCondition', () => {
  it('returns true when step has output', () => {
    const context = makeContext({ step1: { status: 'success', output: 'result' } });
    expect(checkStepOutputCondition('steps.step1.output', context)).toBe(true);
  });

  it('returns false when step has no output', () => {
    const context = makeContext({ step1: { status: 'success' } });
    expect(checkStepOutputCondition('steps.step1.output', context)).toBe(false);
  });

  it('returns null for non-matching pattern', () => {
    expect(checkStepOutputCondition('not valid', makeContext({}))).toBeNull();
  });
});

// ============================================================================
// evaluateCondition
// ============================================================================

describe('evaluateCondition', () => {
  it('evaluates simple true condition', () => {
    expect(evaluateCondition('always', makeContext({}))).toBe(true);
  });

  it('evaluates simple false condition', () => {
    expect(evaluateCondition('never', makeContext({}))).toBe(false);
  });

  it('evaluates step status condition', () => {
    const context = makeContext({ s1: { status: 'success' } });
    expect(evaluateCondition("steps.s1.status == 'success'", context)).toBe(true);
  });

  it('evaluates step output condition', () => {
    const context = makeContext({ s1: { status: 'success', output: 'data' } });
    expect(evaluateCondition('steps.s1.output', context)).toBe(true);
  });

  it('defaults to true for unrecognized conditions', () => {
    expect(evaluateCondition('unknown condition', makeContext({}))).toBe(true);
  });
});

// ============================================================================
// calculateRetryDelay
// ============================================================================

describe('calculateRetryDelay', () => {
  it('computes exponential backoff', () => {
    expect(calculateRetryDelay(0, 1000)).toBe(1000);
    expect(calculateRetryDelay(1, 1000)).toBe(2000);
    expect(calculateRetryDelay(2, 1000)).toBe(4000);
  });

  it('caps at MAX_RETRY_DELAY_MS', () => {
    expect(calculateRetryDelay(20, 1000)).toBe(MAX_RETRY_DELAY_MS);
  });
});

// ============================================================================
// formatValue
// ============================================================================

describe('formatValue', () => {
  it('formats null', () => {
    expect(formatValue(null)).toBe('null');
  });

  it('formats undefined', () => {
    expect(formatValue(undefined)).toBe('null');
  });

  it('formats short string', () => {
    expect(formatValue('hello')).toBe('hello');
  });

  it('truncates long string', () => {
    const long = 'x'.repeat(200);
    const result = formatValue(long);
    expect(result.length).toBeLessThan(110);
    expect(result).toContain('...');
  });

  it('formats number', () => {
    expect(formatValue(42)).toBe('42');
  });

  it('formats boolean', () => {
    expect(formatValue(true)).toBe('true');
  });

  it('formats object as JSON', () => {
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
  });

  it('truncates long objects', () => {
    const obj = { key: 'x'.repeat(200) };
    const result = formatValue(obj);
    expect(result).toContain('...');
  });
});

// ============================================================================
// buildTaskDescription
// ============================================================================

describe('buildTaskDescription', () => {
  it('builds description with inputs', () => {
    const step = { action: 'analyze' } as WorkflowStep;
    const inputs = { file: 'main.ts', mode: 'strict' };
    const result = buildTaskDescription(step, inputs);
    expect(result).toContain('analyze');
    expect(result).toContain('file: main.ts');
    expect(result).toContain('mode: strict');
  });
});

// ============================================================================
// extractErrorMessage
// ============================================================================

describe('extractErrorMessage', () => {
  it('returns message from regular error', () => {
    expect(extractErrorMessage(new Error('test error'))).toBe('test error');
  });

  it('returns "Unknown error" for undefined', () => {
    expect(extractErrorMessage(undefined)).toBe('Unknown error');
  });

  it('unwraps WorkflowError cause', () => {
    const cause = new Error('root cause');
    const wfError = new WorkflowError('wrapper', { cause });
    expect(extractErrorMessage(wfError)).toBe('root cause');
  });
});

// ============================================================================
// isNonRetryableError
// ============================================================================

describe('isNonRetryableError', () => {
  it('returns true for ValidationError', () => {
    const error = new Error('validation failed');
    error.name = 'ValidationError';
    expect(isNonRetryableError(error)).toBe(true);
  });

  it('returns false for WorkflowError (code is always WORKFLOW_ERROR)', () => {
    const error = new WorkflowError('invalid');
    // WorkflowError always has code WORKFLOW_ERROR which is not in the non-retryable list
    expect(isNonRetryableError(error)).toBe(false);
  });

  it('returns true for NexusError with VALIDATION_ERROR code via name check', () => {
    const error = new NexusError('invalid', { code: ErrorCode.VALIDATION_ERROR });
    error.name = 'ValidationError';
    expect(isNonRetryableError(error)).toBe(true);
  });

  it('returns false for regular errors', () => {
    expect(isNonRetryableError(new Error('timeout'))).toBe(false);
  });

  it('returns false for retryable WorkflowError', () => {
    const error = new WorkflowError('step failed');
    expect(isNonRetryableError(error)).toBe(false);
  });
});
