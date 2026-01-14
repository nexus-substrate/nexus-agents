/**
 * nexus-agents/cli-adapters - Core Type Definitions
 *
 * Core CLI types: CliName, CliTransport, CliResponse, CliError, etc.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

/**
 * Supported CLI names.
 */
export type CliName = 'claude' | 'gemini' | 'codex';

/**
 * Transport type for CLI communication.
 * - 'mcp': Uses Model Context Protocol (most stable)
 * - 'subprocess': Spawns CLI process with JSON output
 */
export type CliTransport = 'mcp' | 'subprocess';

/**
 * Token usage information from CLI response.
 */
export interface TokenUsage {
  /** Input tokens consumed */
  readonly inputTokens: number;
  /** Output tokens generated */
  readonly outputTokens: number;
  /** Cached input tokens (if applicable) */
  readonly cachedInputTokens?: number;
  /** Total tokens (input + output) */
  readonly totalTokens?: number;
}

/**
 * Unified CLI response format.
 * Normalized across all CLI output formats.
 */
export interface CliResponse {
  /** The response text */
  readonly text: string;
  /** Token usage statistics */
  readonly usage?: TokenUsage;
  /** Session ID for resumption */
  readonly sessionId?: string;
  /** Cost in USD (if available) */
  readonly costUsd?: number;
  /** Model used for generation */
  readonly model?: string;
  /** Duration in milliseconds */
  readonly durationMs?: number;
  /** Raw response (for debugging) */
  readonly raw?: unknown;
}

/**
 * Error codes for CLI operations.
 */
export type CliErrorCode =
  | 'NOT_FOUND' // CLI not installed
  | 'NOT_AUTHENTICATED' // OAuth/auth required
  | 'RATE_LIMITED' // Rate limit exceeded
  | 'TIMEOUT' // Execution timed out
  | 'PARSE_ERROR' // Response parsing failed
  | 'CONNECTION_ERROR' // MCP connection failed
  | 'EXECUTION_ERROR' // CLI returned error
  | 'UNSUPPORTED_VERSION' // CLI version not supported
  | 'BUDGET_EXCEEDED' // Budget limit exceeded
  | 'UNKNOWN'; // Unknown error

/**
 * CLI execution error.
 */
export interface CliError {
  /** Error code */
  readonly code: CliErrorCode;
  /** Human-readable message */
  readonly message: string;
  /** CLI that produced the error */
  readonly cli: CliName;
  /** Underlying error (if any) */
  readonly cause?: Error;
  /** Whether the error is retryable */
  readonly retryable: boolean;
}

/**
 * Version compatibility status.
 */
export type VersionStatus = 'supported' | 'outdated' | 'breaking' | 'unsupported';

/**
 * Health check status for a CLI.
 */
export interface HealthStatus {
  /** Whether the CLI is healthy */
  readonly healthy: boolean;
  /** CLI version */
  readonly version: string;
  /** Version compatibility status */
  readonly versionStatus: VersionStatus;
  /** Optional message (e.g., upgrade recommendation) */
  readonly message?: string;
  /** Last successful health check */
  readonly lastChecked: Date;
}

/**
 * Capacity status for rate limiting.
 */
export interface CapacityStatus {
  /** Remaining tokens in current window */
  readonly remainingTokens: number;
  /** Remaining requests in current window */
  readonly remainingRequests: number;
  /** When the rate limit resets */
  readonly resetTime: Date;
  /** Current utilization percentage (0-100) */
  readonly utilizationPercent: number;
  /** Whether capacity is exhausted */
  readonly exhausted: boolean;
}
