/**
 * Tests for rate limit detection and tracking.
 *
 * (Source: Issue #996 — Rate limit error surfacing)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isRateLimitLikeError,
  isRateLimitText,
  RATE_LIMIT_PATTERNS,
  parseRetryAfterMs,
  toRateLimitError,
  recordRateLimitEvent,
  getRateLimitStats,
  clearRateLimitEvents,
} from './rate-limit-detector.js';
import { RateLimitError } from '../core/errors.js';

beforeEach(() => {
  clearRateLimitEvents();
});

// ============================================================================
// Shared Pattern Tests (Issue #1596)
// ============================================================================

describe('RATE_LIMIT_PATTERNS', () => {
  it('is exported as a readonly array', () => {
    expect(Array.isArray(RATE_LIMIT_PATTERNS)).toBe(true);
    expect(RATE_LIMIT_PATTERNS.length).toBeGreaterThan(0);
  });

  it('includes all canonical patterns', () => {
    expect(RATE_LIMIT_PATTERNS).toContain('rate limit');
    expect(RATE_LIMIT_PATTERNS).toContain('429');
    expect(RATE_LIMIT_PATTERNS).toContain('quota exceeded');
    expect(RATE_LIMIT_PATTERNS).toContain('usage limit');
  });
});

describe('isRateLimitText', () => {
  it('detects rate limit patterns in plain text', () => {
    expect(isRateLimitText('Error: rate limit exceeded')).toBe(true);
    expect(isRateLimitText('HTTP 429')).toBe(true);
    expect(isRateLimitText('API quota exceeded')).toBe(true);
    expect(isRateLimitText('usage limit reached')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isRateLimitText('RATE LIMIT')).toBe(true);
    expect(isRateLimitText('Rate Limit')).toBe(true);
  });

  it('returns false for non-rate-limit text', () => {
    expect(isRateLimitText('Connection refused')).toBe(false);
    expect(isRateLimitText('Success')).toBe(false);
    expect(isRateLimitText('')).toBe(false);
  });
});

// ============================================================================
// Detection Tests
// ============================================================================

describe('isRateLimitLikeError', () => {
  it('detects "rate limit" in error message', () => {
    expect(isRateLimitLikeError(new Error('Rate limit exceeded'))).toBe(true);
  });

  it('detects "429" in error message', () => {
    expect(isRateLimitLikeError(new Error('HTTP 429 Too Many Requests'))).toBe(true);
  });

  it('detects "too many requests"', () => {
    expect(isRateLimitLikeError(new Error('too many requests'))).toBe(true);
  });

  it('detects "quota exceeded"', () => {
    expect(isRateLimitLikeError(new Error('API quota exceeded'))).toBe(true);
  });

  it('detects "throttle"', () => {
    expect(isRateLimitLikeError(new Error('Request throttled'))).toBe(true);
  });

  it('detects "tokens per minute"', () => {
    expect(isRateLimitLikeError(new Error('tokens per minute limit reached'))).toBe(true);
  });

  it('returns false for non-rate-limit errors', () => {
    expect(isRateLimitLikeError(new Error('Connection refused'))).toBe(false);
    expect(isRateLimitLikeError(new Error('Invalid API key'))).toBe(false);
    expect(isRateLimitLikeError(new Error('Internal server error'))).toBe(false);
  });

  it('handles non-Error values', () => {
    expect(isRateLimitLikeError('rate limit exceeded')).toBe(true);
    expect(isRateLimitLikeError(429)).toBe(true);
    expect(isRateLimitLikeError(null)).toBe(false);
  });
});

// ============================================================================
// Retry-After Parsing Tests
// ============================================================================

describe('parseRetryAfterMs', () => {
  it('parses "retry after X seconds"', () => {
    expect(parseRetryAfterMs('Rate limited. Retry after 30 seconds')).toBe(30000);
  });

  it('parses "retry-after: X sec"', () => {
    expect(parseRetryAfterMs('retry-after: 5 sec')).toBe(5000);
  });

  it('parses fractional seconds', () => {
    expect(parseRetryAfterMs('Retry after 1.5 seconds')).toBe(1500);
  });

  it('parses "wait X milliseconds"', () => {
    expect(parseRetryAfterMs('Please wait 500 milliseconds')).toBe(500);
  });

  it('parses "try again in X seconds"', () => {
    expect(parseRetryAfterMs('Try again in 10 seconds')).toBe(10000);
  });

  it('returns undefined when no timing found', () => {
    expect(parseRetryAfterMs('Rate limit exceeded')).toBeUndefined();
    expect(parseRetryAfterMs('Too many requests')).toBeUndefined();
  });
});

// ============================================================================
// Error Wrapping Tests
// ============================================================================

describe('toRateLimitError', () => {
  it('creates RateLimitError from generic error', () => {
    const original = new Error('Rate limit exceeded. Retry after 30 seconds');
    const rlError = toRateLimitError(original, 'anthropic');

    expect(rlError).toBeInstanceOf(RateLimitError);
    expect(rlError.retryAfterMs).toBe(30000);
    expect(rlError.provider).toBe('anthropic');
    expect(rlError.cause).toBe(original);
  });

  it('creates RateLimitError without timing info', () => {
    const rlError = toRateLimitError(new Error('Too many requests'), 'openai');
    expect(rlError).toBeInstanceOf(RateLimitError);
    expect(rlError.retryAfterMs).toBeUndefined();
    expect(rlError.provider).toBe('openai');
  });

  it('handles non-Error values', () => {
    const rlError = toRateLimitError('rate limit', 'test');
    expect(rlError).toBeInstanceOf(RateLimitError);
    expect(rlError.message).toBe('rate limit');
  });
});

// ============================================================================
// Tracking Tests
// ============================================================================

describe('rate limit tracking', () => {
  it('records and retrieves stats by provider', () => {
    recordRateLimitEvent({ provider: 'anthropic', timestamp: 1000, retryAfterMs: 30000 });
    recordRateLimitEvent({ provider: 'anthropic', timestamp: 2000, retryAfterMs: 60000 });
    recordRateLimitEvent({ provider: 'openai', timestamp: 3000, retryAfterMs: undefined });

    const stats = getRateLimitStats();
    expect(stats).toHaveLength(2);

    const anthropic = stats.find((s) => s.provider === 'anthropic');
    expect(anthropic).toBeDefined();
    expect(anthropic?.totalHits).toBe(2);
    expect(anthropic?.lastHitAt).toBe(2000);
    expect(anthropic?.avgRetryAfterMs).toBe(45000);

    const openai = stats.find((s) => s.provider === 'openai');
    expect(openai).toBeDefined();
    expect(openai?.totalHits).toBe(1);
    expect(openai?.avgRetryAfterMs).toBeUndefined();
  });

  it('returns empty stats when no events recorded', () => {
    expect(getRateLimitStats()).toHaveLength(0);
  });

  it('clears events correctly', () => {
    recordRateLimitEvent({ provider: 'test', timestamp: 1000, retryAfterMs: undefined });
    expect(getRateLimitStats()).toHaveLength(1);

    clearRateLimitEvents();
    expect(getRateLimitStats()).toHaveLength(0);
  });

  it('caps events at MAX_EVENTS limit', () => {
    for (let i = 0; i < 250; i++) {
      recordRateLimitEvent({ provider: 'test', timestamp: i, retryAfterMs: undefined });
    }
    const stats = getRateLimitStats();
    expect(stats).toHaveLength(1);
    // Should cap at 200
    const testStat = stats.find((s) => s.provider === 'test');
    expect(testStat?.totalHits).toBe(200);
  });
});
