/**
 * Error taxonomy — Unit Tests (Issue #1025)
 *
 * Tests for OutcomeFailureCategory schema and error classification functions.
 */

import { describe, it, expect } from 'vitest';
import {
  OutcomeFailureCategorySchema,
  categorizeOutcomeError,
  categorizeOutcomeErrorMessage,
} from './outcome-types.js';
import { TaskOutcomeSchema } from './outcome-types.js';

describe('OutcomeFailureCategorySchema', () => {
  it('accepts all valid categories', () => {
    const categories = [
      'timeout',
      'authentication',
      'rate_limit',
      'connection',
      'crash',
      'adapter_unavailable',
      'validation',
      'execution',
      'unknown',
    ];
    for (const c of categories) {
      expect(OutcomeFailureCategorySchema.parse(c)).toBe(c);
    }
  });

  it('rejects invalid category', () => {
    expect(() => OutcomeFailureCategorySchema.parse('bogus')).toThrow();
  });
});

describe('TaskOutcomeSchema with failureCategory', () => {
  const base = {
    id: 'test-1',
    cli: 'claude' as const,
    category: 'code_generation' as const,
    model: 'claude-sonnet',
    success: false,
    durationMs: 500,
    timestamp: '2026-01-01T00:00:00Z',
    source: 'delegate' as const,
  };

  it('accepts outcome without failureCategory', () => {
    const result = TaskOutcomeSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('accepts outcome with valid failureCategory', () => {
    const result = TaskOutcomeSchema.safeParse({ ...base, failureCategory: 'timeout' });
    expect(result.success).toBe(true);
  });

  it('rejects outcome with invalid failureCategory', () => {
    const result = TaskOutcomeSchema.safeParse({ ...base, failureCategory: 'bogus' });
    expect(result.success).toBe(false);
  });
});

describe('categorizeOutcomeError', () => {
  it('returns timeout for timeout errors', () => {
    expect(categorizeOutcomeError(new Error('Request timed out'))).toBe('timeout');
  });

  it('returns authentication for auth errors', () => {
    expect(categorizeOutcomeError(new Error('Unauthorized access'))).toBe('authentication');
  });

  it('returns rate_limit for 429 errors', () => {
    expect(categorizeOutcomeError(new Error('429 Too Many Requests'))).toBe('rate_limit');
  });

  it('returns connection for connection errors', () => {
    expect(categorizeOutcomeError(new Error('ECONNREFUSED'))).toBe('connection');
  });

  it('returns crash for process crash errors', () => {
    expect(categorizeOutcomeError(new Error('Process killed by SIGTERM'))).toBe('crash');
  });

  it('returns adapter_unavailable for adapter errors', () => {
    expect(categorizeOutcomeError(new Error('No model adapter configured'))).toBe(
      'adapter_unavailable'
    );
  });

  it('returns validation for validation errors', () => {
    expect(categorizeOutcomeError(new Error('Validation failed for input'))).toBe('validation');
  });

  it('returns execution for generic Error instances', () => {
    expect(categorizeOutcomeError(new Error('Something broke'))).toBe('execution');
  });

  it('returns unknown for non-Error values', () => {
    expect(categorizeOutcomeError('string error')).toBe('unknown');
    expect(categorizeOutcomeError(42)).toBe('unknown');
    expect(categorizeOutcomeError(null)).toBe('unknown');
  });

  it('checks error name for classification', () => {
    const err = new Error('generic');
    err.name = 'TimeoutError';
    expect(categorizeOutcomeError(err)).toBe('timeout');
  });
});

describe('categorizeOutcomeErrorMessage', () => {
  it('classifies timeout messages', () => {
    expect(categorizeOutcomeErrorMessage('Operation timed out after 30s')).toBe('timeout');
  });

  it('classifies rate limit messages', () => {
    expect(categorizeOutcomeErrorMessage('rate limit exceeded')).toBe('rate_limit');
  });

  it('classifies adapter unavailable messages', () => {
    expect(categorizeOutcomeErrorMessage('No model adapter available')).toBe('adapter_unavailable');
  });

  it('classifies zod validation messages', () => {
    expect(categorizeOutcomeErrorMessage('Zod parse error')).toBe('validation');
  });

  it('returns execution for unrecognized messages', () => {
    expect(categorizeOutcomeErrorMessage('Something went wrong')).toBe('execution');
  });
});
