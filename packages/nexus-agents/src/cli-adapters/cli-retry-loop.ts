/**
 * nexus-agents/cli-adapters - Unified CLI Retry Loop
 *
 * Single retry loop used by all CLI adapters (base + Gemini).
 * Supports optional circuit breaker integration.
 *
 * (Source: Issue #1596 — Extract shared prompt utils and rate-limit patterns)
 */

import type { Result } from '../core/index.js';
import { err, ok, getRandomProvider } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import type { CliResponse, CliError, CliErrorCode, CliName } from './types.js';
import type { ICircuitBreaker, FailureCategory } from './circuit-breaker-types.js';
import { delay } from '../utils/async-utils.js';

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

/** Error codes that can be retried. */
const RETRYABLE_ERROR_CODES: ReadonlySet<CliErrorCode> = new Set([
  'TIMEOUT',
  'RATE_LIMITED',
  'CONNECTION_ERROR',
]);

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

    const delayMs = calculateBackoffDelay(attempt, config.baseDelayMs, config.maxDelayMs);
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
