/**
 * nexus-agents/cli-adapters - Unified CLI Retry Loop
 *
 * CLI-specific retry loop used by all CLI adapters (base + Gemini).
 * Supports optional circuit-breaker integration, returns CliResponse
 * with retryCount, and maps to FailureCategory for breaker tracking.
 *
 * Sibling implementation (see #2230): adapters/retry.ts holds the
 * generic, type-parameterized `withRetry<T>` for non-CLI use. Don't
 * reach for that one when you need circuit-breaker coupling; don't
 * reach for this one from non-CLI code. Math primitives differ
 * deliberately:
 *   - this file: 1-indexed attempt, +0..30% jitter, cap-after
 *   - adapters/retry.ts: 0-indexed attempt, ±jitterFactor, cap-before-jitter
 *
 * If you find yourself writing a third retry loop: stop, run
 * `consensus_vote` with scope_steward in the panel, and pick whichever
 * of these two fits — don't add a third.
 *
 * (Source: Issue #1596 — Extract shared prompt utils and rate-limit patterns)
 */

import type { Result } from '../core/index.js';
import { err, ok, getRandomProvider } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import type { CliResponse, CliError, CliErrorCode, CliName } from './types.js';
import type { ICircuitBreaker, FailureCategory } from './circuit-breaker-types.js';
import { delay } from '../utils/async-utils.js';
import { RETRYABLE_ERROR_CODES } from './cli-error-helpers.js';

// ============================================================================
// Types
// ============================================================================

export interface CliRetryLoopConfig {
  readonly maxRetries: number;
  readonly allowRetry: boolean;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly circuitBreaker?: ICircuitBreaker | null;
  readonly cli: CliName;
  readonly logger: ILogger;
}

export interface CliRetryResult {
  readonly response: CliResponse;
  readonly retryCount: number;
}

// ============================================================================
// Retry Logic (moved from gemini-adapter-helpers.ts)
// ============================================================================

/**
 * Calculates exponential backoff delay with jitter.
 *
 * @param attempt - Current attempt number (1-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay cap in milliseconds
 * @returns Delay in milliseconds with jitter applied
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = getRandomProvider().random() * 0.3 * exponentialDelay;
  const delayMs = exponentialDelay + jitter;
  return Math.min(delayMs, maxDelayMs);
}

/**
 * Resolve how long to wait before the next attempt (#4373).
 *
 * Prefers a provider-supplied `retryAfterMs` over the computed exponential
 * backoff — a provider that names its window knows better than our guess — but
 * still clamps to the caller's ceiling so a CLI claiming a multi-hour window
 * cannot wedge the retry loop. A zero or negative hint is ignored rather than
 * retried instantly.
 */
export function resolveRetryDelayMs(
  error: CliError,
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  const hint = error.retryAfterMs;
  if (hint !== undefined && hint > 0) {
    return Math.min(hint, maxDelayMs);
  }
  return calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs);
}

/** Determines if an error code is retryable. */
export function isRetryableError(code: CliErrorCode): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}

/**
 * Categorizes a CLI error for circuit breaker tracking.
 * Returns a FailureCategory compatible with the circuit breaker.
 */
export function categorizeError(error: CliError): FailureCategory {
  switch (error.code) {
    case 'TIMEOUT':
      return 'timeout';
    case 'RATE_LIMITED':
      return 'rate_limit';
    case 'NOT_AUTHENTICATED':
      return 'authentication';
    case 'CONNECTION_ERROR':
      return 'connection';
    default:
      return 'unknown';
  }
}

// ============================================================================
// Unified Retry Loop
// ============================================================================

/**
 * Executes a CLI operation with retry logic and optional circuit breaker.
 *
 * Used by both BaseCliAdapter (no circuit breaker) and GeminiCliAdapter
 * (with circuit breaker) to eliminate duplicate retry implementations.
 */
export async function executeCliRetryLoop(
  executeFn: () => Promise<Result<CliResponse, CliError>>,
  config: CliRetryLoopConfig
): Promise<Result<CliRetryResult, CliError>> {
  const maxAttempts = config.allowRetry ? config.maxRetries + 1 : 1;
  let lastError: CliError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await executeFn();

    if (result.ok) {
      return ok({ response: result.value, retryCount: attempt - 1 });
    }

    lastError = result.error;

    // Record failure with circuit breaker if present
    if (config.circuitBreaker !== undefined && config.circuitBreaker !== null) {
      config.circuitBreaker.recordFailure(categorizeError(lastError));
    }

    // Check if we should retry
    if (!shouldRetry(lastError, attempt, maxAttempts, config.circuitBreaker)) {
      return err(lastError);
    }

    const delayMs = resolveRetryDelayMs(lastError, attempt, config.baseDelayMs, config.maxDelayMs);
    config.logger.debug('Retrying CLI execution', {
      cli: config.cli,
      attempt,
      nextAttempt: attempt + 1,
      delayMs: Math.round(delayMs),
    });

    await delay(delayMs);
  }

  return err(
    lastError ?? {
      code: 'UNKNOWN',
      message: 'Max retries exceeded',
      cli: config.cli,
      retryable: false,
    }
  );
}

function shouldRetry(
  error: CliError,
  attempt: number,
  maxAttempts: number,
  circuitBreaker?: ICircuitBreaker | null
): boolean {
  if (attempt >= maxAttempts) return false;
  if (!error.retryable) return false;
  if (!isRetryableError(error.code)) return false;
  if (circuitBreaker?.getState() === 'open') return false;
  return true;
}
