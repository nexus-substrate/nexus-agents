/**
 * nexus-agents/cli-adapters - Gemini CLI Adapter Helpers
 *
 * Extracted helper functions for model info, retry logic, and error handling.
 * Keeps gemini-adapter.ts under 400 lines per CODING_STANDARDS.md.
 */

import { getRandomProvider } from '../../core/index.js';
import type { CliError, CliName } from '../types.js';
import type { FailureCategory } from '../circuit-breaker-types.js';

// -----------------------------------------------------------------------------
// Model Information Constants
// -----------------------------------------------------------------------------

/**
 * Model display name mappings for Gemini models.
 */
const MODEL_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
};

/**
 * Context window sizes by model (tokens).
 */
const CONTEXT_WINDOWS: Readonly<Record<string, number>> = {
  'gemini-2.5-pro': 1_000_000,
  'gemini-2.5-flash': 1_000_000,
  'gemini-2.5-flash-lite': 1_000_000,
};

/**
 * Cost per million input tokens by model (USD).
 */
const INPUT_COSTS: Readonly<Record<string, number>> = {
  'gemini-2.5-pro': 1.25,
  'gemini-2.5-flash': 0.075,
  'gemini-2.5-flash-lite': 0.015,
};

/**
 * Cost per million output tokens by model (USD).
 */
const OUTPUT_COSTS: Readonly<Record<string, number>> = {
  'gemini-2.5-pro': 10.0,
  'gemini-2.5-flash': 0.3,
  'gemini-2.5-flash-lite': 0.06,
};

/**
 * Default values for model info lookups.
 */
const DEFAULTS = {
  contextWindow: 1_000_000,
  inputCost: 0.075,
  outputCost: 0.3,
} as const;

// -----------------------------------------------------------------------------
// Model Information Functions
// -----------------------------------------------------------------------------

/**
 * Gets human-readable display name for a Gemini model.
 */
export function getModelDisplayName(model: string): string {
  return MODEL_DISPLAY_NAMES[model] ?? model;
}

/**
 * Gets context window size for a Gemini model.
 */
export function getContextWindow(model: string): number {
  return CONTEXT_WINDOWS[model] ?? DEFAULTS.contextWindow;
}

/**
 * Gets cost per million input tokens for a Gemini model.
 */
export function getCostPerMillionInput(model: string): number {
  return INPUT_COSTS[model] ?? DEFAULTS.inputCost;
}

/**
 * Gets cost per million output tokens for a Gemini model.
 */
export function getCostPerMillionOutput(model: string): number {
  return OUTPUT_COSTS[model] ?? DEFAULTS.outputCost;
}

// -----------------------------------------------------------------------------
// Retry Logic
// -----------------------------------------------------------------------------

/**
 * Error codes that can be retried.
 */
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

/**
 * Determines if an error code is retryable.
 */
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

/**
 * Creates a circuit breaker open error.
 */
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

/**
 * Delays execution for the specified milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
