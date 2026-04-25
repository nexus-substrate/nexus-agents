/**
 * nexus-agents/cli-adapters - Codex CLI Adapter Helpers
 *
 * CLI-specific helper functions for Codex subprocess adapter.
 * Model info lookups consolidated into config/model-config-helpers.ts (#886).
 */

import type { CliError, CliName, TokenUsage, CliResponse } from '../types.js';
import { createCliError as sharedCreateCliError } from '../cli-error-helpers.js';

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

/**
 * Creates a CLI error with the canonical retryable-flag logic.
 * Kept as an alias under this name for backward compatibility with callers
 * that imported `createCodexError` before the helper was consolidated in
 * `cli-error-helpers.ts` (#2181). Prefer `createCliError` from the shared
 * helper in new code.
 */
export function createCodexError(
  code: CliError['code'],
  message: string,
  cli: CliName,
  cause?: Error
): CliError {
  return sharedCreateCliError(code, message, cli, cause);
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
