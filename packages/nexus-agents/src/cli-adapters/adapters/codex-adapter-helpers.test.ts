/**
 * Tests for Codex CLI Adapter Helpers
 *
 * Model info lookup functions consolidated into config/model-config-helpers.ts (#886).
 * Tests here cover CLI-specific helpers only.
 *
 * @module cli-adapters/adapters/codex-adapter-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type {} from '../types.js';
import {
  CODEX_LEGACY_DEFAULTS,
  createCodexError,
  normalizeCodexResponse,
} from './codex-adapter-helpers.js';

// ============================================================================
// CODEX_LEGACY_DEFAULTS
// ============================================================================

describe('CODEX_LEGACY_DEFAULTS', () => {
  it('has display names for known models', () => {
    expect(CODEX_LEGACY_DEFAULTS.displayNames['o3']).toBe('O3');
    expect(CODEX_LEGACY_DEFAULTS.displayNames['o3-mini']).toBe('O3 Mini');
    expect(CODEX_LEGACY_DEFAULTS.displayNames['o4-mini']).toBe('O4 Mini');
  });

  it('has fallback cost values', () => {
    expect(CODEX_LEGACY_DEFAULTS.inputCost).toBe(1.1);
    expect(CODEX_LEGACY_DEFAULTS.outputCost).toBe(4.4);
    expect(CODEX_LEGACY_DEFAULTS.contextWindow).toBe(400_000);
    expect(CODEX_LEGACY_DEFAULTS.maxOutput).toBe(100_000);
  });
});

// ============================================================================
// createCodexError
// ============================================================================

describe('createCodexError', () => {
  it('creates error with retryable flag for retryable codes', () => {
    const error = createCodexError('RATE_LIMITED', 'Too fast', 'codex');
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toBe('Too fast');
    expect(error.cli).toBe('codex');
    expect(error.retryable).toBe(true);
  });

  it('creates non-retryable error for non-retryable codes', () => {
    const error = createCodexError('PARSE_ERROR', 'Bad input', 'codex');
    expect(error.retryable).toBe(false);
  });

  it('marks TIMEOUT as retryable', () => {
    expect(createCodexError('TIMEOUT', 'Timed out', 'codex').retryable).toBe(true);
  });

  it('marks CONNECTION_ERROR as retryable', () => {
    expect(createCodexError('CONNECTION_ERROR', 'Lost connection', 'codex').retryable).toBe(true);
  });

  it('includes cause when provided', () => {
    const cause = new Error('Root cause');
    const error = createCodexError('UNKNOWN', 'Something', 'codex', cause);
    expect(error.cause).toBe(cause);
  });

  it('omits cause when not provided', () => {
    const error = createCodexError('UNKNOWN', 'Something', 'codex');
    expect('cause' in error).toBe(false);
  });
});

// ============================================================================
// normalizeCodexResponse
// ============================================================================

describe('normalizeCodexResponse', () => {
  it('creates response with text only', () => {
    const response = normalizeCodexResponse('Hello world');
    expect(response.text).toBe('Hello world');
  });

  it('includes usage when provided', () => {
    const usage = { inputTokens: 10, outputTokens: 20 };
    const response = normalizeCodexResponse('Hello', usage);
    expect(response.usage).toEqual(usage);
  });

  it('omits usage when not provided', () => {
    const response = normalizeCodexResponse('Hello');
    expect(response.usage).toBeUndefined();
  });

  it('merges extra properties', () => {
    const response = normalizeCodexResponse('Hello', undefined, { model: 'o3' });
    expect(response.text).toBe('Hello');
    expect(response.model).toBe('o3');
  });
});
