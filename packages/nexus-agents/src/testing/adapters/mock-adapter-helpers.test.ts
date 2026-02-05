/**
 * Tests for Mock Adapter Helpers
 * @module testing/adapters/mock-adapter-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { CliName, CliErrorCode } from '../../cli-adapters/types.js';
import {
  DEFAULT_CONFIG,
  MODEL_INFO_BY_NAME,
  createCliError,
  createCliResponse,
  shouldFailByRate,
  mergeResponseMaps,
  calculateEffectiveLatency,
} from './mock-adapter-helpers.js';

vi.mock('../../core/index.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getRandomProvider: () => ({ random: () => 0.5 }),
  };
});

// ============================================================================
// DEFAULT_CONFIG
// ============================================================================

describe('DEFAULT_CONFIG', () => {
  it('has expected defaults', () => {
    expect(DEFAULT_CONFIG.name).toBe('claude');
    expect(DEFAULT_CONFIG.defaultResponse).toBe('Mock response');
    expect(DEFAULT_CONFIG.defaultLatencyMs).toBe(0);
    expect(DEFAULT_CONFIG.failureRate).toBe(0);
  });
});

// ============================================================================
// MODEL_INFO_BY_NAME
// ============================================================================

describe('MODEL_INFO_BY_NAME', () => {
  it('contains info for claude', () => {
    expect(MODEL_INFO_BY_NAME.claude.id).toBe('claude-sonnet-4');
    expect(MODEL_INFO_BY_NAME.claude.contextWindow).toBe(200_000);
  });

  it('contains info for gemini', () => {
    expect(MODEL_INFO_BY_NAME.gemini.id).toBe('gemini-2.0-flash');
  });

  it('contains info for codex', () => {
    expect(MODEL_INFO_BY_NAME.codex.id).toBe('gpt-5-codex');
  });
});

// ============================================================================
// createCliError
// ============================================================================

describe('createCliError', () => {
  it('creates error with retryable flag for retryable codes', () => {
    const error = createCliError('RATE_LIMITED' as CliErrorCode, 'Too fast', 'claude' as CliName);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryable).toBe(true);
  });

  it('creates non-retryable error for non-retryable codes', () => {
    const error = createCliError('INVALID_REQUEST' as CliErrorCode, 'Bad', 'claude' as CliName);
    expect(error.retryable).toBe(false);
  });

  it('marks TIMEOUT as retryable', () => {
    const error = createCliError('TIMEOUT' as CliErrorCode, 'Timed out', 'gemini' as CliName);
    expect(error.retryable).toBe(true);
  });

  it('marks CONNECTION_ERROR as retryable', () => {
    const error = createCliError('CONNECTION_ERROR' as CliErrorCode, 'Lost', 'codex' as CliName);
    expect(error.retryable).toBe(true);
  });

  it('includes cli name', () => {
    const error = createCliError('UNKNOWN' as CliErrorCode, 'msg', 'gemini' as CliName);
    expect(error.cli).toBe('gemini');
  });
});

// ============================================================================
// createCliResponse
// ============================================================================

describe('createCliResponse', () => {
  it('creates response with text and model', () => {
    const resp = createCliResponse('Hello world', 100, 'claude-sonnet-4');
    expect(resp.text).toBe('Hello world');
    expect(resp.model).toBe('claude-sonnet-4');
    expect(resp.durationMs).toBe(100);
  });

  it('estimates token usage from text length', () => {
    const resp = createCliResponse('Hello world', 0, 'test');
    // "Hello world" = 11 chars, floor(11/4) = 2
    expect(resp.usage?.inputTokens).toBe(2);
    expect(resp.usage?.outputTokens).toBe(2);
  });

  it('handles empty text', () => {
    const resp = createCliResponse('', 0, 'test');
    expect(resp.usage?.inputTokens).toBe(0);
    expect(resp.usage?.outputTokens).toBe(0);
  });
});

// ============================================================================
// shouldFailByRate
// ============================================================================

describe('shouldFailByRate', () => {
  it('returns false for rate 0', () => {
    expect(shouldFailByRate(0)).toBe(false);
  });

  it('returns false for negative rate', () => {
    expect(shouldFailByRate(-0.5)).toBe(false);
  });

  it('returns true for rate 1', () => {
    expect(shouldFailByRate(1)).toBe(true);
  });

  it('returns true for rate > 1', () => {
    expect(shouldFailByRate(1.5)).toBe(true);
  });

  it('uses random provider for intermediate rates', () => {
    // Mock random() returns 0.5, so rate > 0.5 should fail
    expect(shouldFailByRate(0.6)).toBe(true);
    expect(shouldFailByRate(0.4)).toBe(false);
  });
});

// ============================================================================
// mergeResponseMaps
// ============================================================================

describe('mergeResponseMaps', () => {
  it('copies defaults when no source', () => {
    const defaults = new Map([['a', '1']]);
    const merged = mergeResponseMaps(defaults, undefined);
    expect(merged.get('a')).toBe('1');
  });

  it('source overrides defaults', () => {
    const defaults = new Map([['a', '1']]);
    const source = new Map([['a', '2']]);
    const merged = mergeResponseMaps(defaults, source);
    expect(merged.get('a')).toBe('2');
  });

  it('merges both maps', () => {
    const defaults = new Map([['a', '1']]);
    const source = new Map([['b', '2']]);
    const merged = mergeResponseMaps(defaults, source);
    expect(merged.get('a')).toBe('1');
    expect(merged.get('b')).toBe('2');
  });

  it('handles empty defaults', () => {
    const merged = mergeResponseMaps(new Map(), new Map([['a', '1']]));
    expect(merged.get('a')).toBe('1');
  });
});

// ============================================================================
// calculateEffectiveLatency
// ============================================================================

describe('calculateEffectiveLatency', () => {
  it('returns default latency when no timeout', () => {
    expect(calculateEffectiveLatency(100, undefined)).toBe(100);
  });

  it('returns default latency when timeout is larger', () => {
    expect(calculateEffectiveLatency(100, 500)).toBe(100);
  });

  it('returns timeout when smaller than default', () => {
    expect(calculateEffectiveLatency(100, 50)).toBe(50);
  });

  it('returns default when timeout equals default', () => {
    expect(calculateEffectiveLatency(100, 100)).toBe(100);
  });
});
