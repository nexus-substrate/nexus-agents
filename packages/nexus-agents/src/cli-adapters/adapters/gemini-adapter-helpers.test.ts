/**
 * Tests for Gemini Adapter Helpers
 *
 * Model info lookup functions consolidated into config/model-config-helpers.ts (#886).
 * Tests here cover CLI-specific helpers only.
 *
 * @module cli-adapters/adapters/gemini-adapter-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { CliError, CliName } from '../types.js';
import {
  GEMINI_LEGACY_DEFAULTS,
  isRetryableError,
  categorizeError,
  createCircuitOpenError,
} from './gemini-adapter-helpers.js';

// ============================================================================
// GEMINI_LEGACY_DEFAULTS
// ============================================================================

describe('GEMINI_LEGACY_DEFAULTS', () => {
  it('has display names for known models', () => {
    expect(GEMINI_LEGACY_DEFAULTS.displayNames['gemini-2.5-pro']).toBe('Gemini 2.5 Pro');
    expect(GEMINI_LEGACY_DEFAULTS.displayNames['gemini-2.5-flash']).toBe('Gemini 2.5 Flash');
    expect(GEMINI_LEGACY_DEFAULTS.displayNames['gemini-2.5-flash-lite']).toBe(
      'Gemini 2.5 Flash Lite'
    );
  });

  it('has context windows for known models', () => {
    expect(GEMINI_LEGACY_DEFAULTS.contextWindows['gemini-2.5-pro']).toBe(1_000_000);
  });

  it('has fallback cost values', () => {
    expect(GEMINI_LEGACY_DEFAULTS.inputCost).toBe(0.075);
    expect(GEMINI_LEGACY_DEFAULTS.outputCost).toBe(0.3);
    expect(GEMINI_LEGACY_DEFAULTS.contextWindow).toBe(1_000_000);
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
