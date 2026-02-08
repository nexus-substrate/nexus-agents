/**
 * nexus-agents/cli-adapters - Codex MCP Adapter Helpers
 *
 * Pure helper functions for Codex MCP adapter.
 * Extracted to comply with 400-line file limit.
 *
 * (Source: cli-project_plan.md v2.1.0, Issue #90)
 */

import type { ExecutionOptions, CliError, CliName } from '../types.js';
import { DEFAULT_MODEL_CAPABILITIES } from '../../config/model-capabilities.js';

/**
 * Default execution options for Codex MCP.
 */
export const DEFAULT_CODEX_MCP_OPTIONS: Required<ExecutionOptions> = {
  timeoutMs: 120_000, // 2 minutes
  allowRetry: true,
  maxRetries: 2,
  trackUsage: true,
};

/**
 * MCP tool call result structure.
 */
export interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

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
const RETRYABLE_ERROR_CODES: ReadonlyArray<CliError['code']> = [
  'RATE_LIMITED',
  'TIMEOUT',
  'CONNECTION_ERROR',
];

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
 * Extracts text from MCP content array.
 */
export function extractTextFromContent(
  content?: Array<{ type: string; text?: string }>
): string | null {
  if (content === undefined || content.length === 0) {
    return null;
  }

  const textContents = content
    .filter((c) => c.type === 'text' && c.text !== undefined)
    .map((c) => c.text as string);

  return textContents.length > 0 ? textContents.join('\n') : null;
}

/**
 * Checks if an error code is retryable.
 */
export function isRetryableErrorCode(code: CliError['code']): boolean {
  return RETRYABLE_ERROR_CODES.includes(code);
}

/**
 * Creates a CLI error object.
 */
export function createCliError(
  code: CliError['code'],
  message: string,
  cli: CliName,
  cause?: Error
): CliError {
  return {
    code,
    message,
    cli,
    retryable: isRetryableErrorCode(code),
    ...(cause !== undefined && { cause }),
  };
}

// Re-export from canonical source for backward compatibility
export { delay } from '../../utils/async-utils.js';

/**
 * Creates a timeout promise that resolves to null.
 */
export function createTimeout(ms: number): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(null);
    }, ms);
  });
}

/**
 * Determines error code from error message.
 */
export function determineErrorCode(message: string): CliError['code'] {
  if (message.includes('ENOENT') || message.includes('not found')) {
    return 'NOT_FOUND';
  }

  if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    return 'TIMEOUT';
  }

  if (message.includes('connection') || message.includes('disconnect')) {
    return 'CONNECTION_ERROR';
  }

  return 'EXECUTION_ERROR';
}

/**
 * Parses version string from codex --version output.
 */
export function parseVersionFromOutput(output: string): string {
  const match = /(\d+\.\d+\.\d+)/.exec(output.trim());
  return match?.[1] ?? '0.0.0';
}
