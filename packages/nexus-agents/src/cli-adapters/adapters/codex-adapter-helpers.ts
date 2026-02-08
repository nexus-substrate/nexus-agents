/**
 * nexus-agents/cli-adapters - Codex CLI Adapter Helpers
 *
 * Extracted helper functions for model info and response handling.
 */

import type { CliError, CliName, TokenUsage, CliResponse } from '../types.js';
import { DEFAULT_MODEL_CAPABILITIES } from '../../config/model-capabilities.js';

// -----------------------------------------------------------------------------
// Model Information — Canonical Registry + Legacy Fallbacks
// (Issue #885: Canonical models from registry, legacy for older variants)
// -----------------------------------------------------------------------------

/** Find a canonical Codex model by its cliModelName (e.g., 'o3'). */
function findCanonicalCodexModel(
  cliModelName: string
): (typeof DEFAULT_MODEL_CAPABILITIES.models)[number] | undefined {
  return DEFAULT_MODEL_CAPABILITIES.models.find(
    (m) => m.cliName === 'codex' && m.cliModelName === cliModelName
  );
}

/** Legacy model display names for non-canonical Codex models. */
const LEGACY_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  o3: 'O3',
  'o3-mini': 'O3 Mini',
  'o4-mini': 'O4 Mini',
};

/** Legacy costs for non-canonical models. */
const LEGACY_INPUT_COSTS: Readonly<Record<string, number>> = {
  o3: 10.0,
  'o3-mini': 1.1,
  'o4-mini': 1.1,
};

const LEGACY_OUTPUT_COSTS: Readonly<Record<string, number>> = {
  o3: 40.0,
  'o3-mini': 4.4,
  'o4-mini': 4.4,
};

const DEFAULTS = {
  contextWindow: 400_000,
  maxOutput: 100_000,
  inputCost: 1.1,
  outputCost: 4.4,
} as const;

/**
 * Error codes that are retryable.
 */
const RETRYABLE_ERROR_CODES: ReadonlySet<CliError['code']> = new Set([
  'RATE_LIMITED',
  'TIMEOUT',
  'CONNECTION_ERROR',
]);

// -----------------------------------------------------------------------------
// Model Information Functions
// -----------------------------------------------------------------------------

/**
 * Gets human-readable display name for a Codex model.
 */
export function getModelDisplayName(model: string): string {
  const canonical = findCanonicalCodexModel(model);
  if (canonical !== undefined) return canonical.displayName;
  return LEGACY_DISPLAY_NAMES[model] ?? model;
}

/**
 * Gets context window size for a Codex model.
 */
export function getContextWindow(model: string): number {
  const canonical = findCanonicalCodexModel(model);
  if (canonical !== undefined) return canonical.contextWindow;
  return DEFAULTS.contextWindow;
}

/**
 * Gets max output tokens for a Codex model.
 */
export function getMaxOutput(model: string): number {
  const canonical = findCanonicalCodexModel(model);
  if (canonical?.maxOutputTokens !== undefined) return canonical.maxOutputTokens;
  return DEFAULTS.maxOutput;
}

/**
 * Gets cost per million input tokens for a Codex model.
 */
export function getCostPerMillionInput(model: string): number {
  const canonical = findCanonicalCodexModel(model);
  if (canonical?.pricing !== undefined) return canonical.pricing.inputPer1M;
  return LEGACY_INPUT_COSTS[model] ?? DEFAULTS.inputCost;
}

/**
 * Gets cost per million output tokens for a Codex model.
 */
export function getCostPerMillionOutput(model: string): number {
  const canonical = findCanonicalCodexModel(model);
  if (canonical?.pricing !== undefined) return canonical.pricing.outputPer1M;
  return LEGACY_OUTPUT_COSTS[model] ?? DEFAULTS.outputCost;
}

/**
 * Creates a CLI error with appropriate retryable flag.
 */
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

/**
 * Normalizes CLI response to common format.
 */
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
