/**
 * Tests for API Error Helpers
 * @module api/error-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createApiError,
  createValidationError,
  createInternalError,
  createOrchestrationError,
  createNotFoundError,
  createTimeoutError,
} from './error-helpers.js';

vi.mock('../core/index.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getTimeProvider: () => ({
      now: () => 1700000000000,
      nowIso: () => '2023-11-14T22:13:20.000Z',
    }),
  };
});

// ============================================================================
// createApiError
// ============================================================================

describe('createApiError', () => {
  it('creates error with code and message', () => {
    const error = createApiError({
      requestId: 'req-1',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    });
    expect(error.error.code).toBe('INTERNAL_ERROR');
    expect(error.error.message).toBe('Something went wrong');
  });

  it('includes requestId', () => {
    const error = createApiError({
      requestId: 'req-42',
      code: 'VALIDATION_ERROR',
      message: 'Bad input',
    });
    expect(error.requestId).toBe('req-42');
  });

  it('includes timestamp', () => {
    const error = createApiError({
      requestId: 'req-1',
      code: 'INTERNAL_ERROR',
      message: 'test',
    });
    expect(error.timestamp).toBe('2023-11-14T22:13:20.000Z');
  });

  it('includes details when provided', () => {
    const error = createApiError({
      requestId: 'req-1',
      code: 'VALIDATION_ERROR',
      message: 'Invalid',
      details: { field: 'name', reason: 'too long' },
    });
    expect(error.error.details).toEqual({ field: 'name', reason: 'too long' });
  });

  it('omits details when not provided', () => {
    const error = createApiError({
      requestId: 'req-1',
      code: 'INTERNAL_ERROR',
      message: 'test',
    });
    expect('details' in error.error).toBe(false);
  });
});

// ============================================================================
// createValidationError
// ============================================================================

describe('createValidationError', () => {
  it('creates error with default message', () => {
    const error = createValidationError('req-1');
    expect(error.error.code).toBe('VALIDATION_ERROR');
    expect(error.error.message).toBe('Invalid request body');
  });

  it('uses string as message when only string passed', () => {
    const error = createValidationError('req-1', 'Custom validation message');
    expect(error.error.message).toBe('Custom validation message');
    expect('details' in error.error).toBe(false);
  });

  it('includes issues in details', () => {
    const issues = [{ path: 'name', message: 'Required' }];
    const error = createValidationError('req-1', issues);
    expect(error.error.details).toEqual({ issues });
  });

  it('uses custom message with issues', () => {
    const issues = [{ path: 'name', message: 'Required' }];
    const error = createValidationError('req-1', issues, 'Custom msg');
    expect(error.error.message).toBe('Custom msg');
    expect(error.error.details).toEqual({ issues });
  });
});

// ============================================================================
// createInternalError
// ============================================================================

describe('createInternalError', () => {
  it('creates internal error', () => {
    const error = createInternalError('req-1', 'Database connection failed');
    expect(error.error.code).toBe('INTERNAL_ERROR');
    expect(error.error.message).toBe('Database connection failed');
    expect(error.requestId).toBe('req-1');
  });
});

// ============================================================================
// createOrchestrationError
// ============================================================================

describe('createOrchestrationError', () => {
  it('creates orchestration error', () => {
    const error = createOrchestrationError('req-1', 'Agent coordination failed');
    expect(error.error.code).toBe('ORCHESTRATION_ERROR');
    expect(error.error.message).toBe('Agent coordination failed');
  });
});

// ============================================================================
// createNotFoundError
// ============================================================================

describe('createNotFoundError', () => {
  it('creates not found error with resource info', () => {
    const error = createNotFoundError('req-1', 'Expert', 'code_expert');
    expect(error.error.code).toBe('NOT_FOUND');
    expect(error.error.message).toBe('Expert not found: code_expert');
    expect(error.error.details).toEqual({ resource: 'Expert', id: 'code_expert' });
  });
});

// ============================================================================
// createTimeoutError
// ============================================================================

describe('createTimeoutError', () => {
  it('creates timeout error with operation info', () => {
    const error = createTimeoutError('req-1', 'orchestrate', 30000);
    expect(error.error.code).toBe('TIMEOUT');
    expect(error.error.message).toBe('Operation timed out: orchestrate');
    expect(error.error.details).toEqual({ operation: 'orchestrate', timeoutMs: 30000 });
  });
});
