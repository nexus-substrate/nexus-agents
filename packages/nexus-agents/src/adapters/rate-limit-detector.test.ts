/**
 * Tests for rate limit detection and tracking.
 *
 * (Source: Issue #996 — Rate limit error surfacing)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isRateLimitLikeError,
  isRateLimitText,
  RATE_LIMIT_PATTERNS,
  isDurableCapacityText,
  parseRetryAfterMs,
  parseRetryAfterHeader,
  extractRetryAfterMs,
  toRateLimitError,
  recordRateLimitEvent,
  getRateLimitStats,
  clearRateLimitEvents,
} from './rate-limit-detector.js';
import { RateLimitError } from '../core/errors.js';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../core/index.js';

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

  it('detects "key limit" provider quota errors', () => {
    expect(isRateLimitLikeError(new Error('Key limit exceeded'))).toBe(true);
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

// ============================================================================
// Retry-After HEADER Capture Tests (#4606)
// ============================================================================

/**
 * The horizon only ever arrived for the OpenAI family, because it was parsed
 * out of prose and the HTTP `Retry-After` header was dropped with the
 * response. Anthropic states nothing in its 429 body and Gemini states it as
 * `"retryDelay":"33s"` — so neither arm could report a quota horizon at all.
 */
describe('parseRetryAfterHeader (#4606)', () => {
  beforeEach(() => {
    setTimeProvider(new FixedTimeProvider(Date.parse('Wed, 21 Oct 2015 07:28:00 GMT')));
  });

  afterEach(() => {
    resetTimeProvider();
  });

  it('parses the delta-seconds form', () => {
    expect(parseRetryAfterHeader('120')).toBe(120_000);
  });

  it('parses the HTTP-date form against the current clock', () => {
    expect(parseRetryAfterHeader('Wed, 21 Oct 2015 07:29:00 GMT')).toBe(60_000);
  });

  it('clamps an HTTP-date already in the past to zero rather than negative', () => {
    expect(parseRetryAfterHeader('Wed, 21 Oct 2015 07:27:00 GMT')).toBe(0);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseRetryAfterHeader('  45  ')).toBe(45_000);
  });

  /**
   * Names the empty case. A `0` horizon reads downstream as "retry
   * immediately", which is a measurement; defaulting to it when the header
   * could not be read would report a vacuous default as a provider assertion.
   */
  it('reports an UNPARSEABLE header as absent, never as a zero horizon', () => {
    for (const bogus of ['soon', '', '   ', 'later today', '-30', '12.5', 'NaN']) {
      const parsed = parseRetryAfterHeader(bogus);
      expect(parsed, `"${bogus}" must be absent, not 0`).toBeUndefined();
    }
  });

  it('reports an ABSENT header as absent, never as a zero horizon', () => {
    expect(parseRetryAfterHeader(undefined)).toBeUndefined();
    expect(parseRetryAfterHeader(null)).toBeUndefined();
  });

  it('keeps a literal "0" distinguishable from an absent header', () => {
    // A server that really said 0 said "retry now"; that is a measurement and
    // survives as one. Only the unreadable case collapses to undefined.
    expect(parseRetryAfterHeader('0')).toBe(0);
  });
});

describe('extractRetryAfterMs (#4606)', () => {
  it('reads a Headers-style bag (Anthropic/OpenAI SDK APIError.headers)', () => {
    const error = Object.assign(new Error('429 rate_limit_error'), {
      status: 429,
      headers: new Headers({ 'retry-after': '3600' }),
    });
    expect(extractRetryAfterMs(error)).toBe(3_600_000);
  });

  it('reads a plain record bag (Vercel AI SDK APICallError.responseHeaders)', () => {
    const error = Object.assign(new Error('rate limit exceeded'), {
      responseHeaders: { 'content-type': 'application/json', 'Retry-After': '90' },
    });
    expect(extractRetryAfterMs(error)).toBe(90_000);
  });

  it('follows the cause chain, so a re-classification probe keeps the horizon', () => {
    // The OpenAI adapter classifies on a clean probe Error and sets
    // `probe.cause = originalError`; the header lives on the original.
    const original = Object.assign(new Error('429'), {
      headers: new Headers({ 'retry-after': '75' }),
    });
    const probe = Object.assign(new Error('429'), { cause: original });
    expect(extractRetryAfterMs(probe)).toBe(75_000);
  });

  it('returns absent for an error with no header bag at all', () => {
    expect(extractRetryAfterMs(new Error('429 too many requests'))).toBeUndefined();
    expect(extractRetryAfterMs('a string')).toBeUndefined();
    expect(extractRetryAfterMs(undefined)).toBeUndefined();
  });

  it('returns absent — not zero — when the bag holds an unparseable value', () => {
    const error = Object.assign(new Error('429'), {
      headers: new Headers({ 'retry-after': 'whenever' }),
    });
    expect(extractRetryAfterMs(error)).toBeUndefined();
  });

  it('extracts ONLY retry-after and never returns the header bag itself', () => {
    // Security constraint: Authorization and API keys ride in the same bag.
    const error = Object.assign(new Error('429'), {
      headers: new Headers({
        authorization: 'Bearer sk-test-not-a-real-key',
        'x-api-key': 'sk-test-also-not-real',
        'retry-after': '30',
      }),
    });
    const captured = extractRetryAfterMs(error);
    expect(typeof captured).toBe('number');
    expect(JSON.stringify(captured)).not.toContain('Bearer');
    expect(JSON.stringify(captured)).not.toContain('sk-test');
  });
});

describe('parseRetryAfterMs body fallbacks (#4606)', () => {
  it('parses the Gemini RetryInfo shape stringified into the message', () => {
    const body =
      '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":' +
      '[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"33s"}]}}';
    expect(parseRetryAfterMs(body)).toBe(33_000);
  });

  it('parses a fractional Gemini retryDelay', () => {
    expect(parseRetryAfterMs('{"retryDelay":"1.5s"}')).toBe(1500);
  });

  it('parses the sub-second OpenAI phrasing that the second-granularity rule missed', () => {
    expect(parseRetryAfterMs('Please try again in 632ms')).toBe(632);
  });

  it('still parses the whole-second OpenAI phrasing', () => {
    expect(parseRetryAfterMs('Please try again in 20s')).toBe(20_000);
  });

  it('stays absent when the body states no horizon (Anthropic 429)', () => {
    expect(
      parseRetryAfterMs('{"type":"error","error":{"type":"rate_limit_error","message":"..."}}')
    ).toBeUndefined();
  });
});

describe('toRateLimitError header capture (#4606)', () => {
  it('prefers the header horizon over the message prose', () => {
    const error = Object.assign(new Error('rate limit; try again in 20s'), {
      headers: new Headers({ 'retry-after': '600' }),
    });
    expect(toRateLimitError(error, 'openai').retryAfterMs).toBe(600_000);
  });
});

/**
 * Durable capacity caps vs transient throttles (#5359).
 *
 * The two sat in one list, so an exhausted credential was classified retryable
 * and retried three times against a condition that cannot clear in seconds.
 * Observed across four consecutive live 7-voter panels.
 */
describe('durable capacity caps are distinguished from transient throttles', () => {
  it('classifies a spend ceiling as durable', () => {
    // The exact message that burned three retries per vote, four runs running.
    const msg = 'Key limit exceeded (total limit). Manage it using https://…';
    expect(isDurableCapacityText(msg)).toBe(true);
    // Still a rate limit for every existing call site — the union is unchanged.
    expect(isRateLimitText(msg)).toBe(true);
  });

  it.each(['quota exceeded', 'usage limit reached'])('classifies %s as durable', (msg) => {
    expect(isDurableCapacityText(msg)).toBe(true);
  });

  it.each([
    'rate limit exceeded',
    'HTTP 429 Too Many Requests',
    'request throttled, retry shortly',
    'requests per minute exceeded',
    'tokens per minute exceeded',
  ])('does not classify the transient %s as durable', (msg) => {
    // These clear on their own. Treating one as durable would fail a voter fast
    // for a condition that resolves within the minute — the mirror-image defect.
    expect(isDurableCapacityText(msg)).toBe(false);
    expect(isRateLimitText(msg)).toBe(true);
  });

  it('leaves an unrelated error in neither class', () => {
    expect(isDurableCapacityText('connection reset by peer')).toBe(false);
    expect(isRateLimitText('connection reset by peer')).toBe(false);
  });

  // The union and non-overlap invariants are asserted BEHAVIOURALLY above —
  // every durable sample matches both predicates, every transient sample
  // matches only `isRateLimitText`. That covers the same ground without
  // exporting the raw lists, which the producer/consumer gate rejects and which
  // would invite callers to re-implement matching instead of asking.
  it('keeps every pattern in the union reachable through isRateLimitText', () => {
    for (const p of RATE_LIMIT_PATTERNS) {
      expect(isRateLimitText(`prefix ${p} suffix`)).toBe(true);
    }
  });
});
