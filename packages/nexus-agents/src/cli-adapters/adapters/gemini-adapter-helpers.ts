/**
 * nexus-agents/cli-adapters - Gemini CLI Adapter Helpers
 *
 * CLI-specific helper functions for retry logic and error handling.
 * Model info lookups consolidated into config/model-config-helpers.ts (#886).
 */

import type { CliError, CliName } from '../types.js';

// -----------------------------------------------------------------------------
// Fallback Defaults (for unknown models not in canonical registry)
// -----------------------------------------------------------------------------

/**
 * Fallback defaults for Gemini models not in the canonical registry.
 * All current models are in config/in-tree-data.ts and served by
 * buildModelInfo('gemini', model). This provides sensible defaults
 * when an unknown model name is encountered at runtime.
 *
 * @see config/in-tree-data.ts — single source of truth for current models
 */
export const GEMINI_LEGACY_DEFAULTS = {
  displayNames: {} as Readonly<Record<string, string>>,
  contextWindows: {} as Readonly<Record<string, number>>,
  inputCosts: {} as Readonly<Record<string, number>>,
  outputCosts: {} as Readonly<Record<string, number>>,
  contextWindow: 1_000_000,
  inputCost: 0.15,
  outputCost: 0.6,
} as const;

// -----------------------------------------------------------------------------
// Re-exports from canonical cli-retry-loop.ts (Issue #1596)
// -----------------------------------------------------------------------------

export { calculateBackoffDelay, isRetryableError, categorizeError } from '../cli-retry-loop.js';

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
