/**
 * Tests for Expression Resolver Helpers
 * @module workflows/expression-resolver-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { WorkflowExecutionContext } from './execution-context.js';
import type { StepResult } from '../core/index.js';
import { ValidationError } from '../core/index.js';
import type { ParsedExpression, ResolveResult } from './expression-resolver-types.js';
import {
  getNestedValue,
  resolveInputs,
  resolveSteps,
  resolveVariables,
  valueToString,
  resolveSingleExpression,
} from './expression-resolver-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeContext(overrides: Partial<WorkflowExecutionContext> = {}): WorkflowExecutionContext {
  return {
    inputs: {},
    variables: new Map<string, unknown>(),
    stepResults: new Map<string, StepResult>(),
    ...overrides,
  } as WorkflowExecutionContext;
}

function makeStepResult(overrides: Partial<StepResult> = {}): StepResult {
  return {
    status: 'success',
    output: { data: 'result' },
    ...overrides,
  } as StepResult;
}

// ============================================================================
// getNestedValue
// ============================================================================

describe('getNestedValue', () => {
  it('returns value at path', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(getNestedValue(obj, ['a', 'b', 'c'])).toBe(42);
  });

  it('returns undefined for missing path', () => {
    expect(getNestedValue({ a: 1 }, ['b'])).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    expect(getNestedValue(null, ['a'])).toBeUndefined();
  });

  it('returns undefined for non-object', () => {
    expect(getNestedValue('string', ['a'])).toBeUndefined();
  });

  it('returns root for empty path', () => {
    const obj = { a: 1 };
    expect(getNestedValue(obj, [])).toEqual({ a: 1 });
  });

  it('handles nested arrays', () => {
    const obj = { items: [1, 2, 3] };
    expect(getNestedValue(obj, ['items', '1'])).toBe(2);
  });

  it('returns undefined for undefined intermediate value', () => {
    const obj = { a: undefined };
    expect(getNestedValue(obj, ['a', 'b'])).toBeUndefined();
  });
});

// ============================================================================
// resolveInputs
// ============================================================================

describe('resolveInputs', () => {
  it('resolves existing input', () => {
    const ctx = makeContext({ inputs: { name: 'test' } });
    const result = resolveInputs(['name'], ctx);
    expect(result.success).toBe(true);
    expect(result.value).toBe('test');
  });

  it('fails for missing input', () => {
    const ctx = makeContext({ inputs: {} });
    const result = resolveInputs(['missing'], ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('missing');
  });

  it('resolves nested input', () => {
    const ctx = makeContext({ inputs: { config: { port: 8080 } } });
    const result = resolveInputs(['config', 'port'], ctx);
    expect(result.success).toBe(true);
    expect(result.value).toBe(8080);
  });
});

// ============================================================================
// resolveSteps
// ============================================================================

describe('resolveSteps', () => {
  it('resolves step output', () => {
    const stepResults = new Map<string, StepResult>();
    stepResults.set('step1', makeStepResult({ output: { data: 'hello' } }));
    const ctx = makeContext({ stepResults });
    const result = resolveSteps(['step1', 'output'], ctx);
    expect(result.success).toBe(true);
    expect(result.value).toEqual({ data: 'hello' });
  });

  it('resolves nested step output', () => {
    const stepResults = new Map<string, StepResult>();
    stepResults.set('step1', makeStepResult({ output: { data: 'hello' } }));
    const ctx = makeContext({ stepResults });
    const result = resolveSteps(['step1', 'output', 'data'], ctx);
    expect(result.success).toBe(true);
    expect(result.value).toBe('hello');
  });

  it('fails for missing step', () => {
    const ctx = makeContext();
    const result = resolveSteps(['missing', 'output'], ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not completed');
  });

  it('fails for failed step', () => {
    const stepResults = new Map<string, StepResult>();
    stepResults.set('step1', makeStepResult({ status: 'error' as 'success' }));
    const ctx = makeContext({ stepResults });
    const result = resolveSteps(['step1', 'output'], ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not complete successfully');
  });

  it('resolves skipped step output as null', () => {
    const stepResults = new Map<string, StepResult>();
    stepResults.set('step1', makeStepResult({ status: 'skipped' as 'success', output: null }));
    const ctx = makeContext({ stepResults });
    const result = resolveSteps(['step1', 'output'], ctx);
    expect(result.success).toBe(true);
    expect(result.value).toBeNull();
  });

  it('fails for invalid output key', () => {
    const stepResults = new Map<string, StepResult>();
    stepResults.set('step1', makeStepResult());
    const ctx = makeContext({ stepResults });
    const result = resolveSteps(['step1', 'invalid'], ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('only');
  });

  it('fails for short path', () => {
    const ctx = makeContext();
    const result = resolveSteps(['step1'], ctx);
    expect(result.success).toBe(false);
  });

  it('fails for empty path', () => {
    const ctx = makeContext();
    const result = resolveSteps([], ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('requires at least');
  });

  it('fails for missing nested output field', () => {
    const stepResults = new Map<string, StepResult>();
    stepResults.set('step1', makeStepResult({ output: { data: 'hello' } }));
    const ctx = makeContext({ stepResults });
    const result = resolveSteps(['step1', 'output', 'nonexistent'], ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found in step');
  });
});

// ============================================================================
// resolveVariables
// ============================================================================

describe('resolveVariables', () => {
  it('resolves variable', () => {
    const variables = new Map<string, unknown>();
    variables.set('count', 42);
    const ctx = makeContext({ variables });
    const result = resolveVariables(['count'], ctx);
    expect(result.success).toBe(true);
    expect(result.value).toBe(42);
  });

  it('resolves nested variable', () => {
    const variables = new Map<string, unknown>();
    variables.set('config', { port: 8080 });
    const ctx = makeContext({ variables });
    const result = resolveVariables(['config', 'port'], ctx);
    expect(result.success).toBe(true);
    expect(result.value).toBe(8080);
  });

  it('fails for missing variable', () => {
    const ctx = makeContext();
    const result = resolveVariables(['missing'], ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('fails for empty path', () => {
    const ctx = makeContext();
    const result = resolveVariables([], ctx);
    expect(result.success).toBe(false);
  });

  it('fails for missing nested variable field', () => {
    const variables = new Map<string, unknown>();
    variables.set('config', { port: 8080 });
    const ctx = makeContext({ variables });
    const result = resolveVariables(['config', 'host'], ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

// ============================================================================
// valueToString
// ============================================================================

describe('valueToString', () => {
  it('returns empty for undefined', () => {
    expect(valueToString(undefined)).toBe('');
  });

  it('returns empty for null', () => {
    expect(valueToString(null)).toBe('');
  });

  it('returns string as-is', () => {
    expect(valueToString('hello')).toBe('hello');
  });

  it('converts number', () => {
    expect(valueToString(42)).toBe('42');
  });

  it('converts boolean', () => {
    expect(valueToString(true)).toBe('true');
  });

  it('serializes object', () => {
    expect(valueToString({ key: 'value' })).toBe('{"key":"value"}');
  });
});

// ============================================================================
// resolveSingleExpression
// ============================================================================

describe('resolveSingleExpression', () => {
  it('resolves valid expression', () => {
    const parse = (_expr: string): ParsedExpression | null => ({
      original: 'inputs.name',
      type: 'inputs',
      path: ['name'],
    });
    const resolve = (_parsed: ParsedExpression, _ctx: WorkflowExecutionContext): ResolveResult => ({
      success: true,
      value: 'test',
    });
    const ctx = makeContext();
    expect(resolveSingleExpression('inputs.name', ctx, parse, resolve)).toBe('test');
  });

  it('throws for invalid syntax', () => {
    const parse = (_expr: string): ParsedExpression | null => null;
    const resolve = (): ResolveResult => ({ success: true, value: 'x' });
    const ctx = makeContext();
    expect(() => resolveSingleExpression('bad', ctx, parse, resolve)).toThrow(ValidationError);
  });

  it('throws for failed resolution', () => {
    const parse = (_expr: string): ParsedExpression | null => ({
      original: 'inputs.missing',
      type: 'inputs',
      path: ['missing'],
    });
    const resolve = (): ResolveResult => ({ success: false, error: 'not found' });
    const ctx = makeContext();
    expect(() => resolveSingleExpression('inputs.missing', ctx, parse, resolve)).toThrow(
      ValidationError
    );
  });

  it('throws with fallback message when error is undefined', () => {
    const parse = (_expr: string): ParsedExpression | null => ({
      original: 'inputs.x',
      type: 'inputs',
      path: ['x'],
    });

    const resolve = (): ResolveResult => ({ success: false });
    const ctx = makeContext();
    expect(() => resolveSingleExpression('inputs.x', ctx, parse, resolve)).toThrow(
      'Failed to resolve'
    );
  });
});
