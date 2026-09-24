/**
 * Canonical helpers for constructing CliError values with the correct
 * `retryable` flag.
 *
 * Consolidates three previously-duplicated copies:
 * - `cli-retry-loop.ts` (as a module-local set + `isRetryableError`)
 * - `adapters/codex-adapter-helpers.ts` (as `createCodexError`)
 * - `adapters/codex-mcp-adapter-helpers.ts` (as `createCliError`)
 * - `testing/adapters/mock-adapter-helpers.ts` (as `createCliError`)
 *
 * Every call path that classifies retryable CLI errors should now flow
 * through here. Adding a new retryable code is a one-line change in one
 * place instead of four.
 *
 * (Issue #2181 — adapter harness consolidation)
 *
 * @module cli-adapters/cli-error-helpers
 */

import { parseRetryAfterMs, isDurableCapacityText } from '../adapters/rate-limit-detector.js';
import type { CliError, CliErrorCode, CliName } from './types.js';
import { ValidationError } from '../core/errors.js';

/** Error codes the retry machinery treats as transient. */
export const RETRYABLE_ERROR_CODES: ReadonlySet<CliErrorCode> = new Set<CliErrorCode>([
  'TIMEOUT',
  'RATE_LIMITED',
  'CONNECTION_ERROR',
]);

/** Whether a given CLI error code should be retried. */
export function isRetryableErrorCode(code: CliErrorCode): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}

/**
 * Text patterns that classify a CLI failure as `TIMEOUT`. One list, shared by
 * the subprocess stderr classifier and the voter fallover disclosure (#6115)
 * so the reason a seat fell over is the class the adapter layer assigned.
 */
const TIMEOUT_TEXT_PATTERNS = ['timeout', 'timed out', 'etimedout'] as const;

/** Whether an error message names a timeout (the `TIMEOUT` code's text signature). */
export function isTimeoutText(text: string): boolean {
  const lower = text.toLowerCase();
  return TIMEOUT_TEXT_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Constructs a CliError with `retryable` auto-derived from the code.
 * Every adapter that needs to surface a CliError should prefer this
 * helper (or the `createError` method on `BaseCliAdapter`, which calls
 * into the same logic) rather than building the shape inline.
 *
 * A durable capacity cap is `retryable: false` even under a retryable code
 * (#6120): it arrives as RATE_LIMITED, but a spend ceiling does not clear on
 * a retry (#5359), and a flag that says otherwise sends every retry layer
 * back at the same dead model.
 */
export function createCliError(
  code: CliErrorCode,
  message: string,
  cli: CliName,
  cause?: Error
): CliError {
  const retryable = isRetryableErrorCode(code) && !isDurableCapacityText(message);
  // #4373: honor a provider-stated retry window here too, so the shared helper
  // and BaseCliAdapter.createError produce the same shape — otherwise which
  // construction path an adapter happened to use would decide whether the hint
  // survived.
  const retryAfterMs = retryable ? parseRetryAfterMs(message) : undefined;
  return {
    code,
    message,
    cli,
    retryable,
    ...(retryAfterMs !== undefined && { retryAfterMs }),
    ...(cause !== undefined && { cause }),
  };
}

/**
 * A CliError caused by the caller's input — e.g. a requested model the CLI
 * cannot resolve or has in cooldown (#6599) — rather than by the CLI's health.
 * Marked by a {@link ValidationError} cause so every layer can tell it apart:
 * the model bridge maps it to `ErrorCode.INVALID_INPUT`, and circuit breakers
 * must not count it, or one bad model preference opens the breaker for every
 * caller of that CLI. Non-retryable: the same input fails the same way.
 */
export function createCallerInputCliError(message: string, cli: CliName): CliError {
  return createCliError('EXECUTION_ERROR', message, cli, new ValidationError(message));
}

/** Whether `error` was built by {@link createCallerInputCliError}. */
export function isCallerInputCliError(error: CliError): boolean {
  return error.cause instanceof ValidationError;
}

/**
 * Checks whether an abort reason indicates a timeout rather than a cancellation (#6691).
 * Matches TimeoutError / WatchdogTimeoutError names or timeout text in message/string.
 */
export function isTimeoutReason(reason: unknown): boolean {
  if (reason === null || reason === undefined) {
    return false;
  }
  if (typeof reason === 'string') {
    return isTimeoutText(reason);
  }
  if (typeof reason === 'object') {
    const obj = reason as Record<string, unknown>;
    if (
      typeof obj['name'] === 'string' &&
      (obj['name'] === 'TimeoutError' || obj['name'] === 'WatchdogTimeoutError')
    ) {
      return true;
    }
    if (typeof obj['message'] === 'string' && isTimeoutText(obj['message'])) {
      return true;
    }
  }
  return false;
}

/**
 * Builds an abort CliError, distinguishing caller cancellations ('CANCELLED')
 * from watchdog timeouts ('TIMEOUT') based on the signal abort reason (#6691).
 */
export function createAbortCliError(
  cli: CliName,
  reason: unknown,
  context: 'before_spawn' | 'mid_execution'
): CliError {
  if (isTimeoutReason(reason)) {
    const message =
      context === 'before_spawn'
        ? 'Execution timed out before spawn'
        : 'Execution timed out by watchdog';
    return createCliError('TIMEOUT', message, cli);
  }
  const message = context === 'before_spawn' ? 'Aborted before spawn' : 'Aborted by caller signal';
  return createCliError('CANCELLED', message, cli);
}

/** Whether `error` was caused by a caller cancellation (#6691). */
export function isCancelledCliError(error: CliError): boolean {
  return error.code === 'CANCELLED';
}

