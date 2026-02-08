/**
 * nexus-agents/cli-adapters - Codex CLI Adapter Helpers
 *
 * CLI-specific helper functions for Codex subprocess adapter.
 * Model info lookups consolidated into config/model-config-helpers.ts (#886).
 */

import type { CliError, CliName, TokenUsage, CliResponse } from '../types.js';

// -----------------------------------------------------------------------------
// Legacy Fallback Defaults (for non-canonical models)
// -----------------------------------------------------------------------------

/** Legacy fallback values for Codex models not in the canonical registry. */
export const CODEX_LEGACY_DEFAULTS = {
  displayNames: {
    o3: 'O3',
    'o3-mini': 'O3 Mini',
    'o4-mini': 'O4 Mini',
  } as Readonly<Record<string, string>>,
  inputCosts: {
    o3: 10.0,
    'o3-mini': 1.1,
    'o4-mini': 1.1,
  } as Readonly<Record<string, number>>,
  outputCosts: {
    o3: 40.0,
    'o3-mini': 4.4,
    'o4-mini': 4.4,
  } as Readonly<Record<string, number>>,
  contextWindow: 400_000,
  maxOutput: 100_000,
  inputCost: 1.1,
  outputCost: 4.4,
} as const;

// -----------------------------------------------------------------------------
// Error Handling
// -----------------------------------------------------------------------------

/** Error codes that are retryable. */
const RETRYABLE_ERROR_CODES: ReadonlySet<CliError['code']> = new Set([
  'RATE_LIMITED',
  'TIMEOUT',
  'CONNECTION_ERROR',
]);

/** Creates a CLI error with appropriate retryable flag. */
export function createCodexError(
  code: CliError['code'],
  message: string,
  cli: CliName,
  cause?: Error
): CliError {
  const retryable = RETRYABLE_ERROR_CODES.has(code);

  return {
    code,
    message,
    cli,
    retryable,
    ...(cause !== undefined && { cause }),
  };
}

// -----------------------------------------------------------------------------
// Response Normalization
// -----------------------------------------------------------------------------

/** Normalizes CLI response to common format. */
export function normalizeCodexResponse(
  text: string,
  usage?: TokenUsage,
  extra?: Partial<CliResponse>
): CliResponse {
  return {
    text,
    ...(usage !== undefined && { usage }),
    ...extra,
  };
}

// Re-export from canonical source for backward compatibility
export { delay } from '../../utils/async-utils.js';
