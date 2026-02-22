/**
 * nexus-agents/testing - Core Type Definitions
 *
 * Types and interfaces for the CLI integration testing framework.
 * Supports Claude CLI, Gemini CLI, and Codex CLI testing.
 */

import type { Result } from '../core/result.js';
import type { CliNameLiteral } from '../config/model-capabilities-types.js';

/**
 * Supported CLI names for testing.
 * Derived from canonical source: config/model-capabilities-types.ts CliNameLiteral
 */
export type CliName = CliNameLiteral;

/**
 * CLI transport mechanism.
 */
export type CliTransport = 'mcp' | 'subprocess';

/**
 * Configuration for a CLI adapter.
 */
export interface CliAdapterConfig {
  /** CLI identifier */
  readonly name: CliName;
  /** Transport mechanism */
  readonly transport: CliTransport;
  /** Path to CLI executable (for subprocess transport) */
  readonly executablePath?: string;
  /** Environment variables to set */
  readonly env?: Readonly<Record<string, string>>;
  /** Timeout for CLI operations in milliseconds */
  readonly timeoutMs: number;
  /** Maximum retries on transient failures */
  readonly maxRetries: number;
  /** Fixed temperature for reproducibility (should be 0.0) */
  readonly temperature: number;
  /** Model ID to use */
  readonly modelId: string;
}

/**
 * Request to send to a CLI.
 */
export interface CliRequest {
  /** Unique request identifier */
  readonly id: string;
  /** Task prompt to execute */
  readonly prompt: string;
  /** System prompt override */
  readonly systemPrompt?: string;
  /** Maximum tokens to generate */
  readonly maxTokens?: number;
  /** Request timeout override in milliseconds */
  readonly timeoutMs?: number;
  /** Additional context files */
  readonly contextFiles?: readonly string[];
  /** Request metadata */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Response from a CLI execution.
 */
export interface CliResponse {
  /** Request ID this response corresponds to */
  readonly requestId: string;
  /** CLI that executed the request */
  readonly cli: CliName;
  /** Response content */
  readonly content: string;
  /** Structured output if available */
  readonly structuredOutput?: unknown;
  /** Token usage statistics */
  readonly usage: CliTokenUsage;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Model that generated the response */
  readonly model: string;
  /** Whether the response was truncated */
  readonly truncated: boolean;
  /** Stop reason */
  readonly stopReason: CliStopReason;
  /** Response timestamp (ISO 8601, America/New_York) */
  readonly timestamp: string;
}

/**
 * Reason the CLI stopped generating.
 */
export type CliStopReason = 'end_turn' | 'max_tokens' | 'timeout' | 'error' | 'stop_sequence';

/**
 * Token usage statistics for a CLI response.
 */
export interface CliTokenUsage {
  /** Input tokens consumed */
  readonly inputTokens: number;
  /** Output tokens generated */
  readonly outputTokens: number;
  /** Total tokens (input + output) */
  readonly totalTokens: number;
  /** Cached tokens (if applicable) */
  readonly cachedTokens?: number;
}

/**
 * Health status of a CLI.
 */
export interface CliHealth {
  /** CLI identifier */
  readonly cli: CliName;
  /** Whether the CLI is available */
  readonly available: boolean;
  /** CLI version if available */
  readonly version?: string;
  /** Model ID if available */
  readonly modelId?: string;
  /** Last health check timestamp (ISO 8601) */
  readonly checkedAt: string;
  /** Error message if unavailable */
  readonly error?: string;
  /** Response latency in milliseconds */
  readonly latencyMs?: number;
}

/**
 * CLI execution error.
 */
export interface CliExecutionError {
  /** Error code */
  readonly code: CliErrorCode;
  /** Error message */
  readonly message: string;
  /** CLI that produced the error */
  readonly cli: CliName;
  /** Request ID if applicable */
  readonly requestId?: string;
  /** Whether the error is retryable */
  readonly retryable: boolean;
  /** Underlying cause if available */
  readonly cause?: string;
}

/**
 * CLI error codes.
 */
export const CliErrorCode = {
  /** CLI executable not found */
  CLI_NOT_FOUND: 'CLI_NOT_FOUND',
  /** Authentication failed */
  AUTH_FAILED: 'AUTH_FAILED',
  /** Request timed out */
  TIMEOUT: 'TIMEOUT',
  /** Rate limited by provider */
  RATE_LIMITED: 'RATE_LIMITED',
  /** Model not available */
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  /** Invalid request */
  INVALID_REQUEST: 'INVALID_REQUEST',
  /** Network error */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /** Internal CLI error */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /** Circuit breaker open */
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
} as const;

export type CliErrorCode = (typeof CliErrorCode)[keyof typeof CliErrorCode];

/**
 * Capability profile for a CLI.
 * Scores are 0-10 where 10 is best.
 */
export interface CliCapabilityProfile {
  /** Complex reasoning ability (0-10) */
  readonly reasoning: number;
  /** Maximum context window in tokens */
  readonly contextWindow: number;
  /** Code generation quality (0-10) */
  readonly codeGeneration: number;
  /** Response speed (0-10, 10 = fastest) */
  readonly speed: number;
  /** Cost efficiency (0-10, 10 = cheapest) */
  readonly cost: number;
}

/**
 * Interface for CLI test adapters.
 * Each CLI (Claude, Gemini, Codex) implements this interface.
 */
export interface ICliTestAdapter {
  /** CLI identifier */
  readonly name: CliName;
  /** Transport mechanism */
  readonly transport: CliTransport;
  /** Capability profile for routing decisions */
  readonly capabilities: CliCapabilityProfile;

  /**
   * Execute a request against the CLI.
   * @param request - The request to execute
   * @returns Result with response or error
   */
  execute(request: CliRequest): Promise<Result<CliResponse, CliExecutionError>>;

  /**
   * Check CLI health and availability.
   * @returns Health status
   */
  healthCheck(): Promise<CliHealth>;

  /**
   * Initialize the adapter.
   * @returns Result with void or error
   */
  initialize(): Promise<Result<void, CliExecutionError>>;

  /**
   * Cleanup adapter resources.
   */
  cleanup(): Promise<void>;
}

/**
 * Mock response configuration for unit testing.
 */
export interface MockCliResponse {
  /** Response content to return */
  readonly content: string;
  /** Simulated token usage */
  readonly usage: CliTokenUsage;
  /** Simulated duration in milliseconds */
  readonly durationMs: number;
  /** Error to simulate (if any) */
  readonly error?: CliExecutionError;
  /** Delay before responding in milliseconds */
  readonly delayMs?: number;
}

/**
 * Configuration for the mock CLI adapter.
 */
export interface MockCliConfig {
  /** CLI to mock */
  readonly name: CliName;
  /** Default response for unmatched requests */
  readonly defaultResponse: MockCliResponse;
  /** Pattern-matched responses */
  readonly responses?: ReadonlyMap<string, MockCliResponse>;
  /** Whether to simulate failures */
  readonly simulateFailures?: boolean;
  /** Failure rate (0.0 - 1.0) */
  readonly failureRate?: number;
}

// ============================================================================
// Task Testing Types
// ============================================================================

/**
 * Task categories for routing analysis.
 */
export const TaskCategory = {
  /** Complex reasoning and architecture decisions */
  REASONING: 'reasoning',
  /** Code generation and implementation */
  CODE_GENERATION: 'code_generation',
  /** Large context analysis (requires 200k+ tokens) */
  LARGE_CONTEXT: 'large_context',
  /** Quick utility tasks */
  QUICK_TASK: 'quick_task',
  /** Test generation and coverage analysis */
  TESTING: 'testing',
  /** Bulk operations (batch processing) */
  BULK_OPERATION: 'bulk_operation',
  /** General purpose tasks */
  GENERAL: 'general',
} as const;

export type TaskCategory = (typeof TaskCategory)[keyof typeof TaskCategory];

/**
 * Result of a single task test execution.
 */
export interface TaskTestResult {
  /** Unique test identifier */
  readonly testId: string;
  /** Task description */
  readonly taskDescription: string;
  /** Task category */
  readonly category: TaskCategory;
  /** CLI that was selected for this task */
  readonly selectedCli: CliName;
  /** Optimal CLI for this task (ground truth) */
  readonly optimalCli: CliName;
  /** List of acceptable CLIs for this task */
  readonly acceptableClis: readonly CliName[];
  /** Reason the router selected this CLI */
  readonly routingReason: string;
  /** Whether the routing was optimal */
  readonly isOptimal: boolean;
  /** Whether the routing was acceptable (not optimal but still valid) */
  readonly isAcceptable: boolean;
  /** CLI response if executed */
  readonly response?: CliResponse;
  /** Execution duration in milliseconds */
  readonly durationMs?: number;
  /** Test timestamp (ISO 8601) */
  readonly timestamp: string;
  /** Additional metadata */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Per-CLI statistics from routing analysis.
 */
export interface CliRoutingStats {
  /** Number of times this CLI was selected */
  readonly selected: number;
  /** Number of times this CLI was optimal */
  readonly optimal: number;
  /** Number of times this CLI was acceptable when selected */
  readonly acceptableWhenSelected: number;
}

/**
 * Aggregate routing metrics from test results.
 */
export interface RoutingMetrics {
  /** Total number of tasks evaluated */
  readonly totalTasks: number;
  /** Number of tasks routed to optimal CLI */
  readonly optimalCount: number;
  /** Number of tasks routed to acceptable CLI */
  readonly acceptableCount: number;
  /** Percentage of tasks routed optimally (0-100) */
  readonly optimalRate: number;
  /** Percentage of tasks routed acceptably (0-100) */
  readonly acceptableRate: number;
  /** Accuracy broken down by task category */
  readonly byCategory: Readonly<Record<TaskCategory, number>>;
  /** Statistics per CLI */
  readonly byCli: Readonly<Record<CliName, CliRoutingStats>>;
  /** Timestamp when metrics were calculated (ISO 8601) */
  readonly calculatedAt: string;
}

/**
 * Result of evaluating a single routing decision.
 */
export interface RoutingResult {
  /** CLI that was selected */
  readonly selectedCli: CliName;
  /** Optimal CLI for the task */
  readonly optimalCli: CliName;
  /** Whether the selection was optimal */
  readonly isOptimal: boolean;
  /** Whether the selection was acceptable */
  readonly isAcceptable: boolean;
  /** Reason for the routing decision */
  readonly routingReason: string;
}
