/**
 * Tests for Expression Resolver
 * @module workflows/expression-resolver.test
 */

import { describe, it, expect } from 'vitest';
import type { WorkflowExecutionContext } from './execution-context.js';
import type { StepResult } from '../core/index.js';
import { ValidationError } from '../core/index.js';
import {
  parseExpression,
  resolveExpression,
  containsExpressions,
  resolveStringExpressions,
  resolveInput,
  validateExpressions,
  extractExpressions,
  getReferencedSteps,
} from './expression-resolver.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeContext(overrides: Partial<WorkflowExecutionContext> = {}) {
  return {
    workflowId: 'wf-1',
    executionId: 'exec-1',
    inputs: {},
    stepResults: new Map<string, StepResult>(),
    variables: new Map<string, unknown>(),
    startedAt: new Date(),
    cancelled: false,
    ...overrides,
  } as WorkflowExecutionContext;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeStepResult(overrides: Partial<StepResult> = {}) {
  return {
    stepId: 'step1',
    status: 'success' as const,
    output: { data: 'result' },
    durationMs: 100,
    ...overrides,
  };
}

describe('parseExpression', () => {
  it('parses inputs expression', () => {
    const result = parseExpression('inputs.name');
    expect(result).toEqual({ original: 'inputs.name', type: 'inputs', path: ['name'] });
  });

  it('parses steps expression with nested path', () => {
    const result = parseExpression('steps.analyze.output.summary');
    expect(result).toEqual({
      original: 'steps.analyze.output.summary',
      type: 'steps',
      path: ['analyze', 'output', 'summary'],
    });
  });

  it('parses variables expression', () => {
    const result = parseExpression('variables.count');
    expect(result).toEqual({ original: 'variables.count', type: 'variables', path: ['count'] });
  });

  it('returns null for single segment (no dot)', () => {
    expect(parseExpression('inputs')).toBeNull();
  });

  it('returns null for unknown type prefix', () => {
    expect(parseExpression('env.HOME')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseExpression('')).toBeNull();
  });

  it('trims whitespace before parsing', () => {
    const result = parseExpression('  inputs.name  ');
    expect(result).toEqual({ original: '  inputs.name  ', type: 'inputs', path: ['name'] });
  });

  it('handles deeply nested paths', () => {
    expect(parseExpression('inputs.a.b.c.d')?.path).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('resolveExpression', () => {
  it('resolves inputs type', () => {
    const ctx = makeContext({ inputs: { url: 'https://example.com' } });
    const result = resolveExpression(parseExpression('inputs.url')!, ctx);
    expect(result).toEqual({ success: true, value: 'https://example.com' });
  });

  it('resolves steps type', () => {
    const stepResults = new Map<string, StepResult>();
    stepResults.set('s1', makeStepResult({ output: 'done' }));
    const ctx = makeContext({ stepResults });
    const result = resolveExpression(parseExpression('steps.s1.output')!, ctx);
    expect(result).toEqual({ success: true, value: 'done' });
  });

  it('resolves variables type', () => {
    const variables = new Map<string, unknown>();
    variables.set('mode', 'fast');
    const ctx = makeContext({ variables });
    const result = resolveExpression(parseExpression('variables.mode')!, ctx);
    expect(result).toEqual({ success: true, value: 'fast' });
  });

  it('returns failure for missing input', () => {
    const ctx = makeContext();
    const result = resolveExpression(parseExpression('inputs.missing')!, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('missing');
  });
});

describe('containsExpressions', () => {
  it('detects ${{ }} syntax in string', () => {
    expect(containsExpressions('Hello ${{ inputs.name }}')).toBe(true);
  });

  it('returns false for plain strings', () => {
    expect(containsExpressions('no expressions here')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(containsExpressions(42)).toBe(false);
    expect(containsExpressions(null)).toBe(false);
    expect(containsExpressions(undefined)).toBe(false);
    expect(containsExpressions(true)).toBe(false);
    expect(containsExpressions({ key: 'val' })).toBe(false);
  });

  it('detects expression without spaces', () => {
    expect(containsExpressions('${{inputs.name}}')).toBe(true);
  });

  it('works correctly when called multiple times (regex lastIndex reset)', () => {
    expect(containsExpressions('${{ inputs.a }}')).toBe(true);
    expect(containsExpressions('${{ inputs.b }}')).toBe(true);
    expect(containsExpressions('plain text')).toBe(false);
  });
});

describe('resolveStringExpressions', () => {
  it('resolves single expression returning raw value', () => {
    const ctx = makeContext({ inputs: { count: 42 } });
    expect(resolveStringExpressions('${{ inputs.count }}', ctx)).toBe(42);
  });

  it('resolves expression embedded in text', () => {
    const ctx = makeContext({ inputs: { name: 'world' } });
    expect(resolveStringExpressions('Hello ${{ inputs.name }}!', ctx)).toBe('Hello world!');
  });

  it('resolves multiple expressions in one string', () => {
    const ctx = makeContext({ inputs: { first: 'Jane', last: 'Doe' } });
    const result = resolveStringExpressions('${{ inputs.first }} ${{ inputs.last }}', ctx);
    expect(result).toBe('Jane Doe');
  });

  it('resolves duplicate expressions in one string', () => {
    const ctx = makeContext({ inputs: { name: 'Alice' } });
    const result = resolveStringExpressions('${{ inputs.name }} and ${{ inputs.name }}', ctx);
    expect(result).toBe('Alice and Alice');
  });

  it('throws ValidationError for invalid expression syntax', () => {
    const ctx = makeContext();
    expect(() => resolveStringExpressions('${{ badref }}', ctx)).toThrow(ValidationError);
  });

  it('throws ValidationError for undefined input', () => {
    const ctx = makeContext();
    expect(() => resolveStringExpressions('${{ inputs.missing }}', ctx)).toThrow(ValidationError);
  });

  it('converts object values to JSON in mixed strings', () => {
    const ctx = makeContext({ inputs: { data: { a: 1 } } });
    expect(resolveStringExpressions('Result: ${{ inputs.data }}', ctx)).toBe('Result: {"a":1}');
  });

  it('returns object directly for single expression', () => {
    const ctx = makeContext({ inputs: { data: { key: 'val' } } });
    expect(resolveStringExpressions('${{ inputs.data }}', ctx)).toEqual({ key: 'val' });
  });

  it('converts boolean in mixed string', () => {
    const ctx = makeContext({ inputs: { flag: true } });
    expect(resolveStringExpressions('flag=${{ inputs.flag }}', ctx)).toBe('flag=true');
  });
});

describe('resolveInput', () => {
  it('resolves string with expression', () => {
    const ctx = makeContext({ inputs: { x: 10 } });
    expect(resolveInput('${{ inputs.x }}', ctx)).toBe(10);
  });

  it('returns plain string unchanged', () => {
    expect(resolveInput('hello', makeContext())).toBe('hello');
  });

  it('resolves expressions in array items', () => {
    const ctx = makeContext({ inputs: { a: 'one', b: 'two' } });
    expect(resolveInput(['${{ inputs.a }}', '${{ inputs.b }}'], ctx)).toEqual(['one', 'two']);
  });

  it('resolves expressions in object values', () => {
    const ctx = makeContext({ inputs: { name: 'test' } });
    expect(resolveInput({ label: '${{ inputs.name }}' }, ctx)).toEqual({ label: 'test' });
  });

  it('resolves nested objects recursively', () => {
    const ctx = makeContext({ inputs: { v: 42 } });
    const result = resolveInput({ outer: { inner: '${{ inputs.v }}' } }, ctx);
    expect((result as Record<string, Record<string, unknown>>).outer!.inner).toBe(42);
  });

  it('returns primitives unchanged', () => {
    const ctx = makeContext();
    expect(resolveInput(99, ctx)).toBe(99);
    expect(resolveInput(true, ctx)).toBe(true);
    expect(resolveInput(null, ctx)).toBeNull();
    expect(resolveInput(undefined, ctx)).toBeUndefined();
  });

  it('handles mixed array with primitives and expressions', () => {
    const ctx = makeContext({ inputs: { x: 'resolved' } });
    expect(resolveInput([1, '${{ inputs.x }}', true], ctx)).toEqual([1, 'resolved', true]);
  });
});

describe('validateExpressions', () => {
  it('returns empty array when all expressions are valid', () => {
    const ctx = makeContext({ inputs: { name: 'ok' } });
    expect(validateExpressions('${{ inputs.name }}', ctx)).toEqual([]);
  });

  it('returns errors for unresolvable expressions', () => {
    const errors = validateExpressions('${{ inputs.missing }}', makeContext());
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('missing');
  });

  it('returns errors for invalid syntax', () => {
    expect(validateExpressions('${{ badref }}', makeContext()).length).toBeGreaterThan(0);
  });

  it('validates expressions inside arrays', () => {
    const errors = validateExpressions(['${{ inputs.a }}', '${{ inputs.b }}'], makeContext());
    expect(errors.length).toBe(2);
  });

  it('validates expressions inside objects', () => {
    expect(validateExpressions({ key: '${{ inputs.x }}' }, makeContext()).length).toBe(1);
  });

  it('returns empty for non-string primitives', () => {
    const ctx = makeContext();
    expect(validateExpressions(42, ctx)).toEqual([]);
    expect(validateExpressions(null, ctx)).toEqual([]);
    expect(validateExpressions(true, ctx)).toEqual([]);
  });

  it('validates nested objects', () => {
    expect(validateExpressions({ a: { b: '${{ inputs.z }}' } }, makeContext()).length).toBe(1);
  });

  it('validates mixed valid and invalid', () => {
    const ctx = makeContext({ inputs: { ok: 'yes' } });
    const errors = validateExpressions(
      { good: '${{ inputs.ok }}', bad: '${{ inputs.nope }}' },
      ctx
    );
    expect(errors.length).toBe(1);
  });
});

describe('extractExpressions', () => {
  it('extracts single expression from string', () => {
    const result = extractExpressions('${{ inputs.name }}');
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('inputs');
    expect(result[0]?.path).toEqual(['name']);
  });

  it('extracts multiple expressions from string', () => {
    const result = extractExpressions('${{ inputs.a }} and ${{ steps.s1.output }}');
    expect(result).toHaveLength(2);
    expect(result[0]?.type).toBe('inputs');
    expect(result[1]?.type).toBe('steps');
  });

  it('extracts from array items', () => {
    expect(extractExpressions(['${{ inputs.x }}', '${{ variables.y }}']).length).toBe(2);
  });

  it('extracts from object values', () => {
    expect(extractExpressions({ key: '${{ inputs.val }}' }).length).toBe(1);
  });

  it('extracts from nested objects', () => {
    const result = extractExpressions({ a: { b: '${{ steps.s1.output.f }}' } });
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toEqual(['s1', 'output', 'f']);
  });

  it('returns empty for plain string', () => {
    expect(extractExpressions('no expressions')).toEqual([]);
  });

  it('returns empty for non-string primitives', () => {
    expect(extractExpressions(42)).toEqual([]);
    expect(extractExpressions(null)).toEqual([]);
    expect(extractExpressions(undefined)).toEqual([]);
  });

  it('skips invalid expressions (unknown type prefix)', () => {
    expect(extractExpressions('${{ env.HOME }}')).toEqual([]);
  });

  it('handles repeated calls (regex lastIndex reset)', () => {
    extractExpressions('${{ inputs.a }}');
    const result = extractExpressions('${{ inputs.b }}');
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toEqual(['b']);
  });
});

describe('getReferencedSteps', () => {
  it('returns step IDs from step expressions', () => {
    expect(getReferencedSteps('${{ steps.analyze.output }}')).toEqual(['analyze']);
  });

  it('returns unique step IDs (deduplicates)', () => {
    const input = '${{ steps.s1.output }} ${{ steps.s1.output.field }}';
    expect(getReferencedSteps(input)).toEqual(['s1']);
  });

  it('returns multiple distinct step IDs', () => {
    const result = getReferencedSteps({
      a: '${{ steps.first.output }}',
      b: '${{ steps.second.output.data }}',
    });
    expect(result).toContain('first');
    expect(result).toContain('second');
    expect(result).toHaveLength(2);
  });

  it('ignores non-step expressions', () => {
    expect(getReferencedSteps('${{ inputs.name }}')).toEqual([]);
  });

  it('returns empty for no expressions', () => {
    expect(getReferencedSteps('plain text')).toEqual([]);
  });

  it('returns empty for primitives', () => {
    expect(getReferencedSteps(123)).toEqual([]);
  });

  it('extracts from nested structures', () => {
    expect(getReferencedSteps([{ val: '${{ steps.deep.output }}' }])).toEqual(['deep']);
  });
});
