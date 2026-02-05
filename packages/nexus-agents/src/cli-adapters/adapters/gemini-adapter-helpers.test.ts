/**
 * Tests for Gemini Adapter Helpers
 * @module cli-adapters/adapters/gemini-adapter-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { CliError, CliName } from '../types.js';
import {
  getModelDisplayName,
  getContextWindow,
  getCostPerMillionInput,
  getCostPerMillionOutput,
  isRetryableError,
  categorizeError,
  createCircuitOpenError,
} from './gemini-adapter-helpers.js';

// ============================================================================
// getModelDisplayName
// ============================================================================

describe('getModelDisplayName', () => {
  it('returns display name for known model', () => {
    expect(getModelDisplayName('gemini-2.5-pro')).toBe('Gemini 2.5 Pro');
  });

  it('returns display name for flash', () => {
    expect(getModelDisplayName('gemini-2.5-flash')).toBe('Gemini 2.5 Flash');
  });

  it('returns model string for unknown model', () => {
    expect(getModelDisplayName('unknown-model')).toBe('unknown-model');
  });
});

// ============================================================================
// getContextWindow
// ============================================================================

describe('getContextWindow', () => {
  it('returns context window for known model', () => {
    expect(getContextWindow('gemini-2.5-pro')).toBe(1_000_000);
  });

  it('returns default for unknown model', () => {
    expect(getContextWindow('unknown')).toBe(1_000_000);
  });
});

// ============================================================================
// getCostPerMillionInput / getCostPerMillionOutput
// ============================================================================

describe('getCostPerMillionInput', () => {
  it('returns cost for pro model', () => {
    expect(getCostPerMillionInput('gemini-2.5-pro')).toBe(1.25);
  });

  it('returns cost for flash model', () => {
    expect(getCostPerMillionInput('gemini-2.5-flash')).toBe(0.075);
  });

  it('returns default for unknown', () => {
    expect(getCostPerMillionInput('unknown')).toBe(0.075);
  });
});

describe('getCostPerMillionOutput', () => {
  it('returns cost for pro model', () => {
    expect(getCostPerMillionOutput('gemini-2.5-pro')).toBe(10.0);
  });

  it('returns default for unknown', () => {
    expect(getCostPerMillionOutput('unknown')).toBe(0.3);
  });
});

// ============================================================================
// isRetryableError
// ============================================================================

describe('isRetryableError', () => {
  it('returns true for TIMEOUT', () => {
    expect(isRetryableError('TIMEOUT')).toBe(true);
  });

  it('returns true for RATE_LIMITED', () => {
    expect(isRetryableError('RATE_LIMITED')).toBe(true);
  });

  it('returns true for CONNECTION_ERROR', () => {
    expect(isRetryableError('CONNECTION_ERROR')).toBe(true);
  });

  it('returns false for EXECUTION_ERROR', () => {
    expect(isRetryableError('EXECUTION_ERROR')).toBe(false);
  });

  it('returns false for NOT_AUTHENTICATED', () => {
    expect(isRetryableError('NOT_AUTHENTICATED')).toBe(false);
  });
});

// ============================================================================
// categorizeError
// ============================================================================

describe('categorizeError', () => {
  it('categorizes TIMEOUT', () => {
    expect(categorizeError({ code: 'TIMEOUT' } as CliError)).toBe('timeout');
  });

  it('categorizes RATE_LIMITED', () => {
    expect(categorizeError({ code: 'RATE_LIMITED' } as CliError)).toBe('rate_limit');
  });

  it('categorizes NOT_AUTHENTICATED', () => {
    expect(categorizeError({ code: 'NOT_AUTHENTICATED' } as CliError)).toBe('authentication');
  });

  it('categorizes CONNECTION_ERROR', () => {
    expect(categorizeError({ code: 'CONNECTION_ERROR' } as CliError)).toBe('connection');
  });

  it('categorizes unknown as unknown', () => {
    expect(categorizeError({ code: 'EXECUTION_ERROR' } as CliError)).toBe('unknown');
  });
});

// ============================================================================
// createCircuitOpenError
// ============================================================================

describe('createCircuitOpenError', () => {
  it('creates error for given CLI', () => {
    const error = createCircuitOpenError('gemini' as CliName);
    expect(error.code).toBe('EXECUTION_ERROR');
    expect(error.message).toContain('gemini');
    expect(error.message).toContain('Circuit breaker');
    expect(error.retryable).toBe(false);
    expect(error.cli).toBe('gemini');
  });
});
