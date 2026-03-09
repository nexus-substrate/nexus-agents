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
  extractNonErrorMessage,
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
      'parse',
      'execution',
      'generic',
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

  it('returns unknown for generic Error instances', () => {
    expect(categorizeOutcomeError(new Error('Something broke'))).toBe('unknown');
  });

  it('classifies string errors by content (#1466)', () => {
    expect(categorizeOutcomeError('connection refused')).toBe('connection');
  });

  it('classifies objects with .message property (#1466)', () => {
    expect(categorizeOutcomeError({ message: 'timed out' })).toBe('timeout');
  });

  it('classifies plain objects via JSON.stringify (#1466)', () => {
    expect(categorizeOutcomeError({ code: 'ENOENT' })).not.toBe('unknown');
  });

  it('returns unknown for circular references (#1466)', () => {
    const obj: Record<string, unknown> = {};
    obj['self'] = obj;
    expect(categorizeOutcomeError(obj)).toBe('unknown');
  });

  it('returns unknown for null and undefined (#1466)', () => {
    expect(categorizeOutcomeError(null)).toBe('unknown');
    expect(categorizeOutcomeError(undefined)).toBe('unknown');
  });

  it('returns unknown for non-classifiable primitives (#1466)', () => {
    expect(categorizeOutcomeError(42)).toBe('unknown');
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

  it('returns unknown for unrecognized messages', () => {
    expect(categorizeOutcomeErrorMessage('Something went wrong')).toBe('unknown');
  });

  it('classifies deadline exceeded as timeout', () => {
    expect(categorizeOutcomeErrorMessage('deadline exceeded')).toBe('timeout');
  });

  it('classifies socket hang up as timeout', () => {
    expect(categorizeOutcomeErrorMessage('socket hang up')).toBe('timeout');
  });

  it('classifies quota exceeded as rate_limit', () => {
    expect(categorizeOutcomeErrorMessage('quota exceeded for project')).toBe('rate_limit');
  });

  it('classifies model not found as adapter_unavailable', () => {
    expect(categorizeOutcomeErrorMessage('Model not found: claude-opus')).toBe(
      'adapter_unavailable'
    );
  });

  it('classifies ECONNRESET as connection', () => {
    expect(categorizeOutcomeErrorMessage('read ECONNRESET')).toBe('connection');
  });

  it('classifies out of memory as crash', () => {
    expect(categorizeOutcomeErrorMessage('JavaScript heap out of memory')).toBe('crash');
  });

  it('classifies spawn error as crash', () => {
    expect(categorizeOutcomeErrorMessage('spawn error: ENOENT')).toBe('crash');
  });

  it('classifies api error as execution', () => {
    expect(categorizeOutcomeErrorMessage('APIError: Internal server error')).toBe('execution');
  });

  it('classifies 401 as authentication', () => {
    expect(categorizeOutcomeErrorMessage('HTTP 401 Unauthorized')).toBe('authentication');
  });

  it('classifies JSON syntax errors as parse (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('Unexpected token < in JSON at position 0')).toBe('parse');
  });

  it('classifies unexpected token as parse (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('Unexpected token < in JSON')).toBe('parse');
  });

  it('classifies malformed response as parse (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('malformed NDJSON response')).toBe('parse');
  });

  it('classifies TypeError as execution (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('TypeError: Cannot read properties')).toBe('execution');
  });

  it('classifies non-zero exit as execution (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('Process non-zero exit code 1')).toBe('execution');
  });

  it('classifies empty response as execution (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('Got empty response from model')).toBe('execution');
  });

  it('classifies empty string as execution (#1475)', () => {
    expect(categorizeOutcomeErrorMessage('')).toBe('execution');
  });

  it('classifies whitespace-only string as execution (#1475)', () => {
    expect(categorizeOutcomeErrorMessage('   ')).toBe('execution');
  });

  it('returns unknown for truly unrecognized messages (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('xyzzy plugh nothing happens')).toBe('unknown');
  });

  it('classifies getaddrinfo as connection (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('getaddrinfo ENOTFOUND api.example.com')).toBe(
      'connection'
    );
  });

  it('classifies SSL certificate as connection (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('certificate has expired')).toBe('connection');
  });

  it('classifies ENOMEM as crash (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('ENOMEM: not enough memory')).toBe('crash');
  });

  it('classifies max retries as rate_limit (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('max retries exceeded')).toBe('rate_limit');
  });

  it('classifies 502 bad gateway as execution (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('502 Bad Gateway')).toBe('execution');
  });

  it('classifies service unavailable as execution (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('503 Service Unavailable')).toBe('execution');
  });

  it('classifies truncated response as execution (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('response was truncated')).toBe('execution');
  });

  it('classifies proxy errors as connection (#1401)', () => {
    expect(categorizeOutcomeErrorMessage('proxy connection refused')).toBe('connection');
  });

  it('classifies generic error: prefix as generic (#1457)', () => {
    expect(categorizeOutcomeErrorMessage('error: something went wrong')).toBe('generic');
  });

  it('classifies generic failed as generic (#1457)', () => {
    expect(categorizeOutcomeErrorMessage('task failed during processing')).toBe('generic');
  });

  it('classifies generic failure as generic (#1457)', () => {
    expect(categorizeOutcomeErrorMessage('total failure in pipeline')).toBe('generic');
  });

  it('classifies unhandled exception as execution (specific pattern wins) (#1457)', () => {
    // 'unhandled' is in EXECUTION_PATTERNS, checked before generic 'exception'
    expect(categorizeOutcomeErrorMessage('unhandled exception in worker')).toBe('execution');
  });

  it('classifies standalone exception as generic (#1457)', () => {
    expect(categorizeOutcomeErrorMessage('exception thrown during processing')).toBe('generic');
  });

  it('classifies not supported as generic (#1457)', () => {
    expect(categorizeOutcomeErrorMessage('operation not supported')).toBe('generic');
  });

  it('classifies unable to as generic (#1457)', () => {
    expect(categorizeOutcomeErrorMessage('unable to complete request')).toBe('generic');
  });

  it('classifies could not as generic (#1457)', () => {
    expect(categorizeOutcomeErrorMessage('could not process input')).toBe('generic');
  });

  it('classifies missing as generic (#1457)', () => {
    expect(categorizeOutcomeErrorMessage('missing required field')).toBe('generic');
  });

  it('preserves specific categories over broad patterns (#1401)', () => {
    // 'model not found' should still be adapter_unavailable, not execution
    expect(categorizeOutcomeErrorMessage('model not found: gpt-5')).toBe('adapter_unavailable');
    // 'invalid input' should still be validation, not execution
    expect(categorizeOutcomeErrorMessage('invalid input provided')).toBe('validation');
    // 'unexpected token' should still be parse, not execution
    expect(categorizeOutcomeErrorMessage('unexpected token in JSON')).toBe('parse');
  });

  it('classifies "failed to connect" as connection, not execution (#1461)', () => {
    expect(categorizeOutcomeErrorMessage('failed to connect to server')).toBe('connection');
  });

  it('classifies "failed to authenticate" as auth, not execution (#1461)', () => {
    expect(categorizeOutcomeErrorMessage('failed to authenticate')).toBe('authentication');
  });

  it('classifies "request timed out after 30s" as timeout, not execution (#1461)', () => {
    expect(categorizeOutcomeErrorMessage('request timed out after 30s')).toBe('timeout');
  });

  it('classifies "cannot parse JSON response" as parse, not execution (#1461)', () => {
    expect(categorizeOutcomeErrorMessage('cannot parse JSON response')).toBe('parse');
  });

  it('classifies "failed to resolve DNS" as connection, not execution (#1461)', () => {
    expect(categorizeOutcomeErrorMessage('failed to resolve DNS')).toBe('connection');
  });
});

describe('extractNonErrorMessage (#1466)', () => {
  it('returns string directly', () => {
    expect(extractNonErrorMessage('some error')).toBe('some error');
  });

  it('returns undefined for null', () => {
    expect(extractNonErrorMessage(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(extractNonErrorMessage(undefined)).toBeUndefined();
  });

  it('extracts .message from objects', () => {
    expect(extractNonErrorMessage({ message: 'hello' })).toBe('hello');
  });

  it('falls back to JSON.stringify for objects without .message', () => {
    const result = extractNonErrorMessage({ code: 'ENOENT' });
    expect(result).toContain('ENOENT');
  });

  it('returns undefined for circular references', () => {
    const obj: Record<string, unknown> = {};
    obj['self'] = obj;
    expect(extractNonErrorMessage(obj)).toBeUndefined();
  });

  it('truncates long strings to 500 chars', () => {
    const long = 'x'.repeat(600);
    const result = extractNonErrorMessage(long);
    expect(result).toHaveLength(500);
  });

  it('truncates long .message to 500 chars', () => {
    const result = extractNonErrorMessage({ message: 'y'.repeat(600) });
    expect(result).toHaveLength(500);
  });

  it('returns undefined for non-object primitives', () => {
    expect(extractNonErrorMessage(42)).toBeUndefined();
    expect(extractNonErrorMessage(true)).toBeUndefined();
  });
});
