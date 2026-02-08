/**
 * nexus-agents/cli-adapters - Gemini CLI Adapter Helpers
 *
 * CLI-specific helper functions for retry logic and error handling.
 * Model info lookups consolidated into config/model-config-helpers.ts (#886).
 */

import { getRandomProvider } from '../../core/index.js';
import type { CliError, CliName } from '../types.js';
import type { FailureCategory } from '../circuit-breaker-types.js';

// -----------------------------------------------------------------------------
// Legacy Fallback Defaults (for non-canonical models)
// -----------------------------------------------------------------------------

/** Legacy fallback values for Gemini models not in the canonical registry. */
export const GEMINI_LEGACY_DEFAULTS = {
  displayNames: {
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
  } as Readonly<Record<string, string>>,
  contextWindows: {
    'gemini-2.5-pro': 1_000_000,
    'gemini-2.5-flash': 1_000_000,
    'gemini-2.5-flash-lite': 1_000_000,
  } as Readonly<Record<string, number>>,
  inputCosts: {
    'gemini-2.5-pro': 1.25,
    'gemini-2.5-flash': 0.075,
    'gemini-2.5-flash-lite': 0.015,
  } as Readonly<Record<string, number>>,
  outputCosts: {
    'gemini-2.5-pro': 10.0,
    'gemini-2.5-flash': 0.3,
    'gemini-2.5-flash-lite': 0.06,
  } as Readonly<Record<string, number>>,
  contextWindow: 1_000_000,
  inputCost: 0.075,
  outputCost: 0.3,
} as const;

// -----------------------------------------------------------------------------
// Retry Logic
// -----------------------------------------------------------------------------

/** Error codes that can be retried. */
const RETRYABLE_ERROR_CODES: ReadonlySet<CliError['code']> = new Set([
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
  const delay = exponentialDelay + jitter;

  return Math.min(delay, maxDelayMs);
}

/** Determines if an error code is retryable. */
export function isRetryableError(code: CliError['code']): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}

// -----------------------------------------------------------------------------
// Error Categorization
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Error Factory
// -----------------------------------------------------------------------------

/** Creates a circuit breaker open error. */
export function createCircuitOpenError(cli: CliName): CliError {
  return {
    code: 'EXECUTION_ERROR',
    message: `Circuit breaker is open - ${cli} CLI temporarily unavailable`,
    cli,
    retryable: false,
  };
}

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

// Re-export from canonical source for backward compatibility
export { delay } from '../../utils/async-utils.js';
