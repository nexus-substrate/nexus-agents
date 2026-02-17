/**
 * nexus-agents/cli-adapters - Codex MCP Adapter Helpers
 *
 * CLI-specific helper functions for Codex MCP adapter.
 * Model info lookups consolidated into config/model-config-helpers.ts (#886).
 *
 * (Source: cli-project_plan.md v2.1.0, Issue #90)
 */

import type { ExecutionOptions, CliError, CliName } from '../types.js';

// Re-export legacy defaults from the subprocess helpers (DRY)
export { CODEX_LEGACY_DEFAULTS } from './codex-adapter-helpers.js';

/**
 * Default execution options for Codex MCP.
 */
export const DEFAULT_CODEX_MCP_OPTIONS: Required<ExecutionOptions> = {
  timeoutMs: 120_000, // 2 minutes
  allowRetry: true,
  maxRetries: 2,
  trackUsage: true,
  onProgress: undefined,
};

/**
 * MCP tool call result structure.
 */
export interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

// -----------------------------------------------------------------------------
// Error Handling
// -----------------------------------------------------------------------------

/** Error codes that are retryable. */
const RETRYABLE_ERROR_CODES: ReadonlyArray<CliError['code']> = [
  'RATE_LIMITED',
  'TIMEOUT',
  'CONNECTION_ERROR',
];

/** Checks if an error code is retryable. */
export function isRetryableErrorCode(code: CliError['code']): boolean {
  return RETRYABLE_ERROR_CODES.includes(code);
}

/** Creates a CLI error object. */
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

// -----------------------------------------------------------------------------
// Content Extraction
// -----------------------------------------------------------------------------

/** Extracts text from MCP content array. */
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

// Re-export from canonical source for backward compatibility
export { delay } from '../../utils/async-utils.js';

/** Creates a timeout promise that resolves to null. */
export function createTimeout(ms: number): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(null);
    }, ms);
  });
}

/** Determines error code from error message. */
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

/** Parses version string from codex --version output. */
export function parseVersionFromOutput(output: string): string {
  const match = /(\d+\.\d+\.\d+)/.exec(output.trim());
  return match?.[1] ?? '0.0.0';
}
