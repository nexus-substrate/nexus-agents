/**
 * Tests for honoring a provider-supplied retry-after hint (#4373).
 *
 * `parseRetryAfterMs` (`adapters/rate-limit-detector.ts:55-79`) has existed with
 * regexes for "retry after Xs" / "try again in Xs" and was called from nowhere
 * under `cli-adapters/`. `CliError` had no field to carry the value, so when a
 * provider told us exactly how long to wait, the retry loop ignored it and used
 * its own exponential backoff instead — retrying too early (wasting an attempt
 * against a window that has not reopened) or too late.
 *
 * @module cli-adapters/retry-after-honored.test
 */

import { describe, it, expect } from 'vitest';
import { resolveRetryDelayMs } from './cli-retry-loop.js';
import type { CliError } from './types.js';

function rateLimited(overrides: Partial<CliError> = {}): CliError {
  return {
    code: 'RATE_LIMITED',
    message: 'rate limit exceeded',
    cli: 'opencode',
    retryable: true,
    ...overrides,
  };
}

describe('retry-after is honored over computed backoff (#4373)', () => {
  it('uses the provider hint when the error carries one', () => {
    const error = rateLimited({ retryAfterMs: 45_000 });

    expect(resolveRetryDelayMs(error, 1, 1_000, 60_000)).toBe(45_000);
  });

  it('falls back to computed backoff when there is no hint', () => {
    const delay = resolveRetryDelayMs(rateLimited(), 1, 1_000, 16_000);

    // Exponential base with jitter — bounded, but definitely not a fixed hint.
    expect(delay).toBeGreaterThanOrEqual(1_000);
    expect(delay).toBeLessThanOrEqual(16_000);
  });

  it('clamps a hint longer than the ceiling', () => {
    // A provider claiming a multi-hour window must not wedge the retry loop for
    // hours; the caller's ceiling still governs.
    const error = rateLimited({ retryAfterMs: 7_200_000 });

    expect(resolveRetryDelayMs(error, 1, 1_000, 16_000)).toBe(16_000);
  });

  it('ignores a zero or negative hint rather than retrying instantly', () => {
    expect(resolveRetryDelayMs(rateLimited({ retryAfterMs: 0 }), 1, 1_000, 16_000)).toBeGreaterThan(
      0
    );
  });

  it('grows the computed backoff across attempts, unlike a fixed hint', () => {
    const first = resolveRetryDelayMs(rateLimited(), 1, 1_000, 60_000);
    const third = resolveRetryDelayMs(rateLimited(), 3, 1_000, 60_000);

    expect(third).toBeGreaterThan(first);
  });
});
