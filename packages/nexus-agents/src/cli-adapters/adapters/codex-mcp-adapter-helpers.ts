/**
 * nexus-agents/cli-adapters - Codex MCP Adapter Helpers
 *
 * CLI-specific helper functions for Codex MCP adapter.
 * Model info lookups consolidated into config/model-config-helpers.ts (#886).
 *
 * (Source: cli-project_plan.md v2.1.0, Issue #90)
 */

import type { ResolvedExecutionOptions, CliError, CliName } from '../types.js';
import { CODEX_MCP_TIMEOUTS } from '../../config/timeouts.js';
import {
  createCliError as sharedCreateCliError,
  isRetryableErrorCode as sharedIsRetryableErrorCode,
} from '../cli-error-helpers.js';

// Re-export legacy defaults from the subprocess helpers (DRY)
export { CODEX_LEGACY_DEFAULTS } from './codex-adapter-helpers.js';

/**
 * Default execution options for Codex MCP.
 * Timeout and retry values derived from config/timeouts.ts (#1220).
 */
export const DEFAULT_CODEX_MCP_OPTIONS: ResolvedExecutionOptions = {
  timeoutMs: CODEX_MCP_TIMEOUTS.defaultMs,
  allowRetry: true,
  maxRetries: CODEX_MCP_TIMEOUTS.maxRetries,
  trackUsage: true,
  onProgress: undefined,
};

// ---------------------------------------------------------------------------
// Recursion guard for `codex mcp-server` spawning (#3350)
// ---------------------------------------------------------------------------

/**
 * Env var stamped on the `codex mcp-server` child nexus spawns, marking how
 * deep we are in the nexus→codex-mcp spawn nesting. Inherited by anything the
 * codex MCP server itself spawns (including a nested `nexus-agents
 * --mode=server` if codex is misconfigured to launch one).
 */
export const NEXUS_MCP_DEPTH_ENV = 'NEXUS_MCP_DEPTH';

/**
 * Highest nesting depth at which nexus will spawn `codex mcp-server`. `0`
 * means only the top-level nexus process spawns it; any deeper attempt is the
 * recursive codex↔nexus loop and is refused.
 */
export const MAX_CODEX_MCP_SPAWN_DEPTH = 0;

/** Read the current nesting depth from an env bag; clamps missing/junk to 0. */
export function readMcpDepth(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt(env[NEXUS_MCP_DEPTH_ENV] ?? '0', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * Recursion guard (#3350). Returns the depth string to stamp on the spawned
 * `codex mcp-server` child, or throws if we are already nested — which would
 * re-enter the codex↔nexus MCP spawn loop that corrupted the codex OAuth
 * token (dozens of leaked servers racing the shared refresh-token rotation).
 */
export function nextCodexMcpDepthOrThrow(env: NodeJS.ProcessEnv = process.env): string {
  const depth = readMcpDepth(env);
  if (depth > MAX_CODEX_MCP_SPAWN_DEPTH) {
    throw new Error(
      `Refusing to spawn 'codex mcp-server': already nested inside a ` +
        `nexus-spawned codex MCP context (${NEXUS_MCP_DEPTH_ENV}=${String(depth)}). ` +
        `This breaks the recursive codex↔nexus MCP spawn loop (#3350). If you ` +
        `intentionally configured codex to launch nexus-agents as an MCP ` +
        `server, remove that '[mcp_servers.nexus-agents]' entry from ~/.codex/config.toml.`
    );
  }
  return String(depth + 1);
}

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

/**
 * Checks if an error code is retryable. Kept exported for backward
 * compatibility with callers that imported from this module; delegates
 * to the canonical helper (#2181).
 */
export function isRetryableErrorCode(code: CliError['code']): boolean {
  return sharedIsRetryableErrorCode(code);
}

/**
 * Creates a CLI error object with the canonical retryable-flag logic.
 * Kept exported for backward compatibility (#2181).
 */
export function createCliError(
  code: CliError['code'],
  message: string,
  cli: CliName,
  cause?: Error
): CliError {
  return sharedCreateCliError(code, message, cli, cause);
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
    .filter((c): c is { type: string; text: string } => c.type === 'text' && c.text !== undefined)
    .map((c) => c.text);

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
