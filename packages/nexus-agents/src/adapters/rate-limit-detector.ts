/**
 * Rate Limit Detection and Tracking
 *
 * Detects rate limit errors from model adapter responses and tracks
 * rate limit events for weather report metrics.
 *
 * @module adapters/rate-limit-detector
 * (Source: Issue #996 — Rate limit error surfacing)
 */

import { RateLimitError, getErrorMessage, getTimeProvider } from '../core/index.js';

// ============================================================================
// Detection
// ============================================================================

/**
 * Patterns for a TRANSIENT throttle — one that clears on its own, in seconds.
 *
 * Retrying these is correct, and they must not open a circuit breaker: an
 * ordinary 7-voter panel trips a per-minute limit while plenty of quota
 * remains.
 */
const TRANSIENT_RATE_LIMIT_PATTERNS = [
  'rate limit',
  'rate_limit',
  'too many requests',
  '429',
  'throttl',
  'requests per minute',
  'tokens per minute',
] as const;

/**
 * Patterns for a DURABLE capacity cap — a spend or usage ceiling on the
 * credential itself, which does not clear until a human raises it (#5359).
 *
 * These sat in one list with the transient patterns, so an exhausted key was
 * classified retryable and retried three times against a condition that cannot
 * change. Observed live across four consecutive 7-voter panels: an upstream
 * gateway key over its total limit burned three ~9s retries per vote, and
 * because `computeOverallConsensusDeadlineMs` budgets
 * `timeoutMs * (maxRetries + 1)` as a SHARED wall-clock deadline, that waste
 * starved a healthy voter on a different adapter. One dead credential cost two
 * voices, on a panel where supermajority is 5 of 7.
 *
 * `usage limit` is the least certain of the three — some providers use it for
 * a rolling window that does clear. It is grouped here because the observed
 * failures were spend caps; revisit against real per-provider message text
 * rather than wording alone if a false durable classification shows up.
 */
const DURABLE_CAPACITY_PATTERNS = ['quota exceeded', 'key limit', 'usage limit'] as const;

/**
 * Canonical rate-limit detection patterns — the union.
 *
 * The two halves are NOT exported: their only non-test consumer is this file,
 * which the producer/consumer gate (#3024) rejects, and callers should ask the
 * predicates rather than re-implement matching over a raw list.
 *
 * Kept as the union so every existing call site keeps its current meaning; the
 * two consumers that need the distinction ask for it specifically (#5359).
 * Shared by API adapters and CLI subprocess adapters. (Issue #1596)
 */
export const RATE_LIMIT_PATTERNS = [
  ...TRANSIENT_RATE_LIMIT_PATTERNS,
  ...DURABLE_CAPACITY_PATTERNS,
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
 * True when the text names a DURABLE capacity cap rather than a transient
 * throttle (#5359).
 *
 * Callers use this to decide two things a shared list cannot express:
 * whether retrying is worth anything, and whether the failure should count
 * toward a circuit breaker. Retrying a spend ceiling is guaranteed-futile work,
 * and excluding it from the breaker keeps a dead credential being re-attempted
 * on every subsequent call.
 */
export function isDurableCapacityText(text: string): boolean {
  const lower = text.toLowerCase();
  return DURABLE_CAPACITY_PATTERNS.some((p) => lower.includes(p));
}

/** {@link isDurableCapacityText} over an unknown error value. */
export function isDurableCapacityError(error: unknown): boolean {
  return isDurableCapacityText(getErrorMessage(error));
}

/**
 * Detects whether an error is a rate limit error.
 * Pattern-matches against common provider error messages.
 */
export function isRateLimitLikeError(error: unknown): boolean {
  return isRateLimitText(getErrorMessage(error));
}

/**
 * Wait-hint patterns providers put in an error message, in precedence order.
 * Each captures one number; `msPerUnit` converts it to milliseconds.
 *
 * The body is the FALLBACK for the HTTP `Retry-After` header — see
 * {@link resolveRetryAfterMs}. It is the only channel for vendors that state
 * the horizon nowhere else (#4606).
 */
const RETRY_HINT_PATTERNS: readonly { readonly pattern: RegExp; readonly msPerUnit: number }[] = [
  // "retry after X seconds" / "retry-after: X sec"
  { pattern: /retry[- ]?after[:\s]+(\d+(?:\.\d+)?)\s*(?:s|sec)/i, msPerUnit: 1000 },
  // "retry after X ms" / "wait X milliseconds"
  { pattern: /(?:retry[- ]?after|wait)[:\s]+(\d+)\s*(?:ms|millisecond)/i, msPerUnit: 1 },
  // "try again in X seconds" — the OpenAI family's phrasing.
  { pattern: /try again in (\d+(?:\.\d+)?)\s*(?:s|sec)/i, msPerUnit: 1000 },
  // #4606: the sub-second variant. The rule above cannot match "try again in
  // 632ms" — `632` is followed by `m`, not `s` — so the OpenAI family silently
  // lost every horizon shorter than a second.
  { pattern: /try again in (\d+(?:\.\d+)?)\s*ms\b/i, msPerUnit: 1 },
  // #4606: Gemini states its horizon only as google.rpc.RetryInfo inside the
  // response body, and `@google/genai` stringifies that whole body into the
  // error message (its `ApiError` carries `{message, status}` and no headers),
  // so this is the only place the horizon is reachable on that vendor.
  { pattern: /"retrydelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i, msPerUnit: 1000 },
];

/**
 * Parses retry-after metadata from an error message.
 * Providers often include timing hints in error messages.
 */
export function parseRetryAfterMs(errorMessage: string): number | undefined {
  const lower = errorMessage.toLowerCase();
  for (const { pattern, msPerUnit } of RETRY_HINT_PATTERNS) {
    const match = pattern.exec(lower);
    const captured = match?.[1];
    if (captured !== undefined) {
      return Math.ceil(Number.parseFloat(captured) * msPerUnit);
    }
  }
  return undefined;
}

// ============================================================================
// HTTP Retry-After capture (#4606)
// ============================================================================

/**
 * The ONLY header this module ever reads.
 *
 * A 429 response's header bag also carries `Authorization` / `x-api-key` and
 * every other credential the request was made with. Nothing here accepts,
 * returns, or stores a header object: the named field is read at the boundary
 * and converted to a number before anything travels inward.
 */
const RETRY_AFTER_HEADER = 'retry-after';

/** Error fields under which the SDKs hang their response header bag. */
const HEADER_BAG_FIELDS = ['headers', 'responseHeaders'] as const;

/** How far to follow `cause` looking for the originating provider error. */
const MAX_CAUSE_DEPTH = 3;

/** Day-of-week prefix shared by all three legal HTTP-date spellings. */
const HTTP_DATE_PREFIX = /^(?:mon|tue|wed|thu|fri|sat|sun)/i;

/**
 * Parse an HTTP `Retry-After` header value (RFC 9110 §10.2.3).
 *
 * Both legal forms are accepted: delta-seconds (`"120"`) and an HTTP-date
 * (`"Wed, 21 Oct 2015 07:28:00 GMT"`), resolved against the current clock. A
 * date already past yields 0 — the server said "now", which is a real answer.
 *
 * An absent or unparseable value returns `undefined`, never 0. A 0 horizon
 * reads downstream as "retry immediately"; substituting it for a value we
 * could not read would report a vacuous default as a provider measurement,
 * which is the shape `.rules/development-disciplines.md` prohibits. A literal
 * `"0"` still parses to 0 and stays distinguishable from absence.
 */
export function parseRetryAfterHeader(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;

  // delta-seconds — a non-negative integer, per the grammar. Anything else
  // (fractions, negatives) is not this form and falls through to the date try.
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10) * 1000;
  }

  // HTTP-date. All three legal spellings (IMF-fixdate, the obsolete RFC 850
  // form, and asctime) begin with a day-of-week name, so gate on that before
  // handing anything to `Date.parse`. Ungated, `Date.parse` is lenient enough
  // to turn junk like "12.5" into a date in 2001 — which then clamps to 0 and
  // reports "retry immediately" for a header we could not actually read.
  if (!HTTP_DATE_PREFIX.test(trimmed)) return undefined;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, at - getTimeProvider().now());
}

/**
 * Read `Retry-After` out of one header bag, whatever shape the SDK used.
 *
 * `@anthropic-ai/sdk` and `openai` hand back a `Headers` instance (a `.get()`
 * surface); the Vercel AI SDK hands back a plain `Record<string, string>`.
 * Header names are case-insensitive either way. Returns the raw string so the
 * caller can decide; nothing else in the bag is read.
 */
function readRetryAfterField(bag: unknown): string | undefined {
  if (bag === null || typeof bag !== 'object') return undefined;

  const getter = (bag as { get?: unknown }).get;
  if (typeof getter === 'function') {
    const raw = (bag as { get(name: string): unknown }).get(RETRY_AFTER_HEADER);
    return typeof raw === 'string' ? raw : undefined;
  }

  for (const [key, val] of Object.entries(bag as Record<string, unknown>)) {
    if (key.toLowerCase() === RETRY_AFTER_HEADER && typeof val === 'string') return val;
  }
  return undefined;
}

/**
 * Capture the provider's stated retry horizon from a thrown SDK error (#4606).
 *
 * `transformError` used to drop the HTTP response, so the horizon survived
 * only when a vendor happened to repeat it in prose — which the OpenAI family
 * does and Anthropic does not. Both SDKs attach the response headers directly
 * to the thrown `APIError`, so the boundary is reachable without holding the
 * response open.
 *
 * The `cause` chain is followed (bounded) because the OpenAI adapter
 * re-classifies on a clean probe `Error` and hangs the original off `cause`.
 *
 * @returns Milliseconds until retry, or `undefined` when no readable header
 *   was found. Never a header object, and never a substituted 0.
 */
export function extractRetryAfterMs(error: unknown): number | undefined {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth++) {
    if (current === null || typeof current !== 'object') return undefined;
    const obj = current as Record<string, unknown>;
    for (const field of HEADER_BAG_FIELDS) {
      const parsed = parseRetryAfterHeader(readRetryAfterField(obj[field]));
      if (parsed !== undefined) return parsed;
    }
    current = obj['cause'];
  }
  return undefined;
}

/**
 * Context key under which the adapters park a captured horizon on a
 * `ModelError`. Single authoritative spelling — the bridge reads it back
 * through {@link retryAfterMsFromContext}, never by hand.
 */
export const RETRY_AFTER_CONTEXT_KEY = 'retryAfterMs';

/** Read a previously captured horizon back off a `ModelError`'s context. */
export function retryAfterMsFromContext(
  context: Record<string, unknown> | undefined
): number | undefined {
  const raw = context?.[RETRY_AFTER_CONTEXT_KEY];
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : undefined;
}

/**
 * The horizon a provider stated, header first and body second (#4606).
 *
 * `Retry-After` is the authoritative field; the message patterns are the
 * fallback for vendors that state the wait only in the response body.
 */
export function resolveRetryAfterMs(error: unknown, message: string): number | undefined {
  return extractRetryAfterMs(error) ?? parseRetryAfterMs(message);
}

/**
 * Wraps a generic error as a RateLimitError with parsed metadata.
 */
export function toRateLimitError(error: unknown, provider?: string): RateLimitError {
  const message = getErrorMessage(error);
  // #4606: header first — the message prose is only a fallback for vendors
  // that state the wait in the body instead of `Retry-After`.
  const retryAfterMs = resolveRetryAfterMs(error, message);
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
