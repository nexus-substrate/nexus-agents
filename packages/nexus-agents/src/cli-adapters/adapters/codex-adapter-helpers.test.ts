/**
 * Tests for Codex CLI Adapter Helpers
 * @module cli-adapters/adapters/codex-adapter-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { CliName } from '../types.js';
import {
  getModelDisplayName,
  getCostPerMillionInput,
  getCostPerMillionOutput,
  createCodexError,
  normalizeCodexResponse,
} from './codex-adapter-helpers.js';

// ============================================================================
// getModelDisplayName
// ============================================================================

describe('getModelDisplayName', () => {
  it('returns display name for known models', () => {
    expect(getModelDisplayName('o3')).toBe('O3');
    expect(getModelDisplayName('o3-mini')).toBe('O3 Mini');
    expect(getModelDisplayName('o4-mini')).toBe('O4 Mini');
  });

  it('returns raw model name for unknown models', () => {
    expect(getModelDisplayName('custom-model')).toBe('custom-model');
  });
});

// ============================================================================
// getCostPerMillionInput
// ============================================================================

describe('getCostPerMillionInput', () => {
  it('returns cost for known models', () => {
    expect(getCostPerMillionInput('o3')).toBe(10.0);
    expect(getCostPerMillionInput('o3-mini')).toBe(1.1);
    expect(getCostPerMillionInput('o4-mini')).toBe(1.1);
  });

  it('returns default cost for unknown model', () => {
    expect(getCostPerMillionInput('unknown')).toBe(1.1);
  });
});

// ============================================================================
// getCostPerMillionOutput
// ============================================================================

describe('getCostPerMillionOutput', () => {
  it('returns cost for known models', () => {
    expect(getCostPerMillionOutput('o3')).toBe(40.0);
    expect(getCostPerMillionOutput('o3-mini')).toBe(4.4);
    expect(getCostPerMillionOutput('o4-mini')).toBe(4.4);
  });

  it('returns default cost for unknown model', () => {
    expect(getCostPerMillionOutput('unknown')).toBe(4.4);
  });
});

// ============================================================================
// createCodexError
// ============================================================================

describe('createCodexError', () => {
  it('creates error with retryable flag for retryable codes', () => {
    const error = createCodexError('RATE_LIMITED', 'Too fast', 'codex' as CliName);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toBe('Too fast');
    expect(error.cli).toBe('codex');
    expect(error.retryable).toBe(true);
  });

  it('creates non-retryable error for non-retryable codes', () => {
    const error = createCodexError('PARSE_ERROR', 'Bad input', 'codex' as CliName);
    expect(error.retryable).toBe(false);
  });

  it('marks TIMEOUT as retryable', () => {
    expect(createCodexError('TIMEOUT', 'Timed out', 'codex' as CliName).retryable).toBe(true);
  });

  it('marks CONNECTION_ERROR as retryable', () => {
    expect(
      createCodexError('CONNECTION_ERROR', 'Lost connection', 'codex' as CliName).retryable
    ).toBe(true);
  });

  it('includes cause when provided', () => {
    const cause = new Error('Root cause');
    const error = createCodexError('UNKNOWN', 'Something', 'codex' as CliName, cause);
    expect(error.cause).toBe(cause);
  });

  it('omits cause when not provided', () => {
    const error = createCodexError('UNKNOWN', 'Something', 'codex' as CliName);
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
