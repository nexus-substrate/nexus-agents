/**
 * nexus-agents/cli-adapters - Codex CLI Adapter Helpers
 *
 * Extracted helper functions for model info and response handling.
 */

import type { CliError, CliName, TokenUsage, CliResponse } from '../types.js';

/**
 * Model display name mappings for Codex models.
 */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  o3: 'O3',
  'o3-mini': 'O3 Mini',
  'o4-mini': 'O4 Mini',
};

/**
 * Cost per million input tokens by model.
 */
const INPUT_COSTS: Record<string, number> = {
  o3: 10.0,
  'o3-mini': 1.1,
  'o4-mini': 1.1,
};

/**
 * Cost per million output tokens by model.
 */
const OUTPUT_COSTS: Record<string, number> = {
  o3: 40.0,
  'o3-mini': 4.4,
  'o4-mini': 4.4,
};

/**
 * Error codes that are retryable.
 */
const RETRYABLE_ERROR_CODES: ReadonlySet<CliError['code']> = new Set([
  'RATE_LIMITED',
  'TIMEOUT',
  'CONNECTION_ERROR',
]);

/**
 * Gets model display name.
 */
export function getModelDisplayName(model: string): string {
  return MODEL_DISPLAY_NAMES[model] ?? model;
}

/**
 * Gets cost per million input tokens.
 */
export function getCostPerMillionInput(model: string): number {
  return INPUT_COSTS[model] ?? 1.1;
}

/**
 * Gets cost per million output tokens.
 */
export function getCostPerMillionOutput(model: string): number {
  return OUTPUT_COSTS[model] ?? 4.4;
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

/**
 * Delays for the specified milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
