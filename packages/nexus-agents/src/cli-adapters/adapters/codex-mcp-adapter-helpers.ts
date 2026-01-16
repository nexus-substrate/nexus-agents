/**
 * nexus-agents/cli-adapters - Codex MCP Adapter Helpers
 *
 * Pure helper functions for Codex MCP adapter.
 * Extracted to comply with 400-line file limit.
 *
 * (Source: cli-project_plan.md v2.1.0, Issue #90)
 */

import type { ExecutionOptions, CliError, CliName } from '../types.js';

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

/**
 * Model display name mappings.
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
const RETRYABLE_ERROR_CODES: ReadonlyArray<CliError['code']> = [
  'RATE_LIMITED',
  'TIMEOUT',
  'CONNECTION_ERROR',
];

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

/**
 * Delays for the specified milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
