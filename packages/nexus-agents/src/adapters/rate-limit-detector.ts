/**
 * Rate Limit Detection and Tracking
 *
 * Detects rate limit errors from model adapter responses and tracks
 * rate limit events for weather report metrics.
 *
 * @module adapters/rate-limit-detector
 * (Source: Issue #996 — Rate limit error surfacing)
 */

import { RateLimitError, getErrorMessage } from '../core/index.js';

// ============================================================================
// Detection
// ============================================================================

/**
 * Canonical rate-limit detection patterns.
 * Shared by API adapters and CLI subprocess adapters. (Issue #1596)
 */
export const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'rate_limit',
  'too many requests',
  '429',
  'quota exceeded',
  'key limit',
  'throttl',
  'usage limit',
  'requests per minute',
  'tokens per minute',
] as const;

/**
 * Checks whether a text string contains rate-limit indicators.
 * Used by CLI subprocess adapters for stdout/stderr classification. (Issue #1596)
 */
export function isRateLimitText(text: string): boolean {
  const lower = text.toLowerCase();
  return RATE_LIMIT_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Detects whether an error is a rate limit error.
 * Pattern-matches against common provider error messages.
 */
export function isRateLimitLikeError(error: unknown): boolean {
  return isRateLimitText(getErrorMessage(error));
}

/**
 * Parses retry-after metadata from an error message.
 * Providers often include timing hints in error messages.
 */
export function parseRetryAfterMs(errorMessage: string): number | undefined {
  const lower = errorMessage.toLowerCase();

  // Match "retry after X seconds" or "retry-after: X"
  const secondsMatch = /retry[- ]?after[:\s]+(\d+(?:\.\d+)?)\s*(?:s|sec)/i.exec(lower);
  if (secondsMatch !== null) {
    const parsed = parseFloat(secondsMatch[1] ?? '0');
    return Math.ceil(parsed * 1000);
  }

  // Match "retry after X ms" or "wait X milliseconds"
  const msMatch = /(?:retry[- ]?after|wait)[:\s]+(\d+)\s*(?:ms|millisecond)/i.exec(lower);
  if (msMatch !== null) {
    return parseInt(msMatch[1] ?? '0', 10);
  }

  // Match "try again in X seconds"
  const againMatch = /try again in (\d+(?:\.\d+)?)\s*(?:s|sec)/i.exec(lower);
  if (againMatch !== null) {
    const parsed = parseFloat(againMatch[1] ?? '0');
    return Math.ceil(parsed * 1000);
  }

  return undefined;
}

/**
 * Wraps a generic error as a RateLimitError with parsed metadata.
 */
export function toRateLimitError(error: unknown, provider?: string): RateLimitError {
  const message = getErrorMessage(error);
  const retryAfterMs = parseRetryAfterMs(message);
  return new RateLimitError(message, {
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    ...(provider !== undefined ? { provider } : {}),
    ...(error instanceof Error ? { cause: error } : {}),
  });
}

// ============================================================================
// Tracking
// ============================================================================

/** A single rate limit event record. */
export interface RateLimitEvent {
  readonly provider: string;
  readonly timestamp: number;
  readonly retryAfterMs: number | undefined;
}

/** Aggregate stats for rate limit events per provider. */
export interface RateLimitStats {
  readonly provider: string;
  readonly totalHits: number;
  readonly lastHitAt: number;
  readonly avgRetryAfterMs: number | undefined;
}

const MAX_EVENTS = 200;
const events: RateLimitEvent[] = [];

/** Records a rate limit event for tracking. */
export function recordRateLimitEvent(event: RateLimitEvent): void {
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
}

/** Gets rate limit stats grouped by provider. */
export function getRateLimitStats(): readonly RateLimitStats[] {
  const grouped = new Map<string, RateLimitEvent[]>();
  for (const event of events) {
    const existing = grouped.get(event.provider);
    if (existing !== undefined) {
      existing.push(event);
    } else {
      grouped.set(event.provider, [event]);
    }
  }

  const stats: RateLimitStats[] = [];
  for (const [provider, providerEvents] of grouped) {
    const retryValues = providerEvents
      .map((e) => e.retryAfterMs)
      .filter((v): v is number => v !== undefined);
    const avgRetry =
      retryValues.length > 0
        ? retryValues.reduce((a, b) => a + b, 0) / retryValues.length
        : undefined;
    const lastEvent = providerEvents[providerEvents.length - 1];

    stats.push({
      provider,
      totalHits: providerEvents.length,
      lastHitAt: lastEvent?.timestamp ?? 0,
      ...(avgRetry !== undefined
        ? { avgRetryAfterMs: Math.round(avgRetry) }
        : { avgRetryAfterMs: undefined }),
    });
  }

  return stats;
}

/** Clears all tracked rate limit events. Useful for testing. */
export function clearRateLimitEvents(): void {
  events.length = 0;
}
