/**
 * nexus-agents/cli-adapters - Type Definitions
 *
 * Interfaces for CLI adapter integration with evergreen architecture.
 * Supports both MCP and subprocess transports.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

import type { Result } from '../core/index.js';

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
  | 'UNKNOWN'; // Unknown error

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

/**
 * Model information from CLI.
 */
export interface ModelInfo {
  /** Model identifier */
  readonly id: string;
  /** Model display name */
  readonly name: string;
  /** Maximum context window in tokens */
  readonly contextWindow: number;
  /** Maximum output tokens */
  readonly maxOutput?: number;
  /** Cost per 1M input tokens */
  readonly costPerMillionInput?: number;
  /** Cost per 1M output tokens */
  readonly costPerMillionOutput?: number;
}

/**
 * Capability profile for task routing.
 * (Source: cli-project_plan.md Capability Matching Matrix)
 */
export interface CapabilityProfile {
  /** Complex reasoning ability (0-10) */
  readonly reasoning: number;
  /** Maximum context window in tokens */
  readonly contextWindow: number;
  /** Code generation quality (0-10) */
  readonly codeGeneration: number;
  /** Response speed (0-10, higher = faster) */
  readonly speed: number;
  /** Cost efficiency (0-10, higher = cheaper) */
  readonly cost: number;
}

/**
 * Task to execute on a CLI.
 */
export interface CliTask {
  /** Task content/prompt */
  readonly content: string;
  /** Optional system prompt */
  readonly systemPrompt?: string;
  /** Preferred model (if any) */
  readonly model?: string;
  /** Session ID for continuation */
  readonly sessionId?: string;
  /** Maximum tokens to generate */
  readonly maxTokens?: number;
  /** Timeout in milliseconds */
  readonly timeoutMs?: number;
  /** Additional CLI-specific options */
  readonly options?: Record<string, unknown>;
}

/**
 * Execution options for CLI adapters.
 */
export interface ExecutionOptions {
  /** Timeout in milliseconds */
  readonly timeoutMs?: number;
  /** Whether to allow retries */
  readonly allowRetry?: boolean;
  /** Maximum retry attempts */
  readonly maxRetries?: number;
  /** Whether to track usage */
  readonly trackUsage?: boolean;
}

/**
 * CLI adapter interface.
 * Abstracts CLI integration with transport-agnostic execution.
 * (Source: cli-project_plan.md v2.1.0, Phase 2)
 */
export interface ICliAdapter {
  /** CLI name */
  readonly name: CliName;
  /** Transport type */
  readonly transport: CliTransport;
  /** Capability profile */
  readonly capabilities: CapabilityProfile;

  /**
   * Executes a task on the CLI.
   *
   * @param task - Task to execute
   * @param options - Execution options
   * @returns Result with response or error
   */
  execute(task: CliTask, options?: ExecutionOptions): Promise<Result<CliResponse, CliError>>;

  /**
   * Performs a health check on the CLI.
   *
   * @returns Health status including version compatibility
   */
  healthCheck(): Promise<HealthStatus>;

  /**
   * Gets current capacity/rate limit status.
   *
   * @returns Capacity status
   */
  getCapacity(): Promise<CapacityStatus>;

  /**
   * Gets CLI version.
   *
   * @returns Version string
   */
  getVersion(): Promise<string>;

  /**
   * Gets model information.
   *
   * @returns Model info
   */
  getModelInfo(): ModelInfo;

  /**
   * Initializes the adapter (e.g., MCP connection).
   * Called before first use.
   */
  initialize(): Promise<void>;

  /**
   * Cleans up resources (e.g., subprocess, MCP connection).
   * Called on shutdown.
   */
  dispose(): Promise<void>;
}

/**
 * Response parser interface for defensive parsing.
 * (Source: docs/research/cli-integration-architecture.md)
 */
export interface ICliResponseParser<T = unknown> {
  /** Parser name (for logging) */
  readonly name: string;
  /** Supported version range (semver) */
  readonly supportedVersionRange: string;

  /**
   * Parses raw CLI output to typed response.
   *
   * @param raw - Raw CLI output
   * @returns Parsed response or null if unrecognized
   */
  parse(raw: string): T | null;

  /**
   * Extracts just the response text (most stable field).
   *
   * @param raw - Raw CLI output
   * @returns Response text or null
   */
  extractResponse(raw: string): string | null;

  /**
   * Extracts token usage (may not be present).
   *
   * @param raw - Raw CLI output
   * @returns Token usage or null
   */
  extractUsage(raw: string): TokenUsage | null;

  /**
   * Extracts session ID (for resumption).
   *
   * @param raw - Raw CLI output
   * @returns Session ID or null
   */
  extractSessionId(raw: string): string | null;
}

/**
 * Version requirements for CLIs.
 */
export interface VersionRequirements {
  /** Minimum supported version */
  readonly minimum: string;
  /** Recommended version */
  readonly recommended: string;
  /** Known breaking versions */
  readonly breaking: readonly string[];
}

/**
 * CLI version requirements.
 * (Source: docs/research/cli-integration-architecture.md)
 */
export const CLI_VERSION_REQUIREMENTS: Record<CliName, VersionRequirements> = {
  claude: {
    minimum: '2.0.0',
    recommended: '2.0.76',
    breaking: [],
  },
  gemini: {
    minimum: '0.20.0',
    recommended: '0.22.5',
    breaking: [],
  },
  codex: {
    minimum: '0.70.0',
    recommended: '0.77.0',
    breaking: [],
  },
} as const;

/**
 * Default capability profiles for each CLI.
 * (Source: cli-project_plan.md Capability Matching Matrix)
 */
export const DEFAULT_CAPABILITIES: Record<CliName, CapabilityProfile> = {
  claude: {
    reasoning: 10,
    contextWindow: 200_000,
    codeGeneration: 9,
    speed: 7,
    cost: 5,
  },
  gemini: {
    reasoning: 8,
    contextWindow: 1_000_000,
    codeGeneration: 7,
    speed: 8,
    cost: 9,
  },
  codex: {
    reasoning: 9,
    contextWindow: 400_000,
    codeGeneration: 10,
    speed: 8,
    cost: 7,
  },
} as const;

/**
 * Confidence estimation result.
 * (Source: Issue #99 - SATER pattern, arXiv:2510.05164)
 */
export interface ConfidenceEstimate {
  readonly score: number;
  readonly factors: ConfidenceFactors;
  readonly shouldEscalate: boolean;
  readonly reason: string;
}

export interface ConfidenceFactors {
  readonly lengthFactor: number;
  readonly hedgingFactor: number;
  readonly structureFactor: number;
  readonly uncertaintyFactor: number;
}

export interface CascadeOptions {
  readonly confidenceThreshold?: number;
  readonly fastModel?: CliName;
  readonly expensiveModel?: CliName;
  readonly maxEscalations?: number;
  readonly cacheResponses?: boolean;
}

export interface CascadeResult {
  readonly response: CliResponse;
  readonly escalated: boolean;
  readonly escalationCount: number;
  readonly modelsUsed: readonly CliName[];
  readonly confidenceHistory: readonly ConfidenceEstimate[];
  readonly totalCostUsd?: number;
  readonly totalDurationMs: number;
}

/**
 * Confidence-aware cascade router interface.
 * Routes tasks through fast models first, escalating to expensive models
 * only when confidence is below threshold.
 * (Source: Issue #99 - SATER pattern, arXiv:2510.05164)
 */
export interface IConfidenceRouter {
  estimateConfidence(task: CliTask, response: CliResponse): ConfidenceEstimate;
  shouldEscalate(confidence: ConfidenceEstimate, threshold: number): boolean;
  executeWithCascade(
    task: CliTask,
    options?: CascadeOptions
  ): Promise<import('../core/index.js').Result<CascadeResult, CliError>>;
}

// ============================================================================
// Budget-Constrained Task Routing (Issue #102)
// Based on PILOT pattern (arXiv:2508.21141)
// ============================================================================

/**
 * Budget constraints for task routing.
 * (Source: Issue #102 - PILOT pattern, arXiv:2508.21141)
 */
export interface BudgetConstraint {
  /** Maximum tokens per task */
  readonly maxTokens?: number;
  /** Maximum cost per task in USD */
  readonly maxCostUsd?: number;
  /** Maximum latency per request in milliseconds */
  readonly maxLatencyMs?: number;
}

/**
 * Session-level budget tracking.
 */
export interface SessionBudget {
  /** Total token budget for the session */
  readonly tokenBudget: number;
  /** Total cost budget for the session in USD */
  readonly costBudgetUsd: number;
  /** Tokens used so far */
  readonly tokensUsed: number;
  /** Cost spent so far in USD */
  readonly costSpentUsd: number;
  /** Remaining tokens */
  readonly tokensRemaining: number;
  /** Remaining cost budget in USD */
  readonly costRemainingUsd: number;
  /** Budget utilization percentage (0-100) */
  readonly utilizationPercent: number;
  /** Session start time */
  readonly startedAt: Date;
  /** Time until budget resets (if applicable) */
  readonly resetsAt?: Date;
}

/**
 * Budget exceeded error details.
 */
export interface BudgetExceededError extends CliError {
  readonly code: 'BUDGET_EXCEEDED';
  /** Which budget constraint was exceeded */
  readonly constraint: 'tokens' | 'cost' | 'latency';
  /** Budget limit that was exceeded */
  readonly limit: number;
  /** Current usage when limit was hit */
  readonly current: number;
  /** Suggested action */
  readonly suggestion: string;
}

/**
 * Budget warning when approaching limits.
 */
export interface BudgetWarning {
  /** Warning level */
  readonly level: 'info' | 'warning' | 'critical';
  /** Warning message */
  readonly message: string;
  /** Which budget is affected */
  readonly constraint: 'tokens' | 'cost' | 'latency';
  /** Current utilization percentage */
  readonly utilizationPercent: number;
  /** Estimated remaining capacity */
  readonly estimatedRemaining: number;
}

/**
 * Result of budget-aware routing decision.
 */
export interface BudgetRoutingResult {
  /** Selected adapter (if within budget) */
  readonly adapter: ICliAdapter | null;
  /** Whether the task can be executed within budget */
  readonly withinBudget: boolean;
  /** Estimated cost for this task */
  readonly estimatedCostUsd: number;
  /** Estimated tokens for this task */
  readonly estimatedTokens: number;
  /** Any budget warnings */
  readonly warnings: readonly BudgetWarning[];
  /** Budget after this task (if executed) */
  readonly projectedBudget: SessionBudget;
}

/**
 * Budget router options.
 */
export interface BudgetRouterOptions {
  /** Default per-task budget constraints */
  readonly defaultConstraints?: BudgetConstraint;
  /** Session budget configuration */
  readonly sessionBudget?: {
    readonly tokenBudget?: number;
    readonly costBudgetUsd?: number;
    readonly resetIntervalMs?: number;
  };
  /** Warning thresholds (percentage of budget used) */
  readonly warningThresholds?: {
    readonly info?: number;
    readonly warning?: number;
    readonly critical?: number;
  };
  /** Whether to block tasks that exceed budget (vs. warn only) */
  readonly enforceHardLimits?: boolean;
}

/**
 * Budget-aware task router interface.
 * Routes tasks with respect to token, cost, and latency budgets.
 * (Source: Issue #102 - PILOT pattern, arXiv:2508.21141)
 */
export interface IBudgetRouter {
  /** Get current session budget status */
  getSessionBudget(): SessionBudget;

  /** Update session budget (e.g., after task completion) */
  updateBudget(usage: { tokens?: number; costUsd?: number }): void;

  /** Reset session budget (e.g., on new session or timer) */
  resetBudget(): void;

  /** Check if task is within budget constraints */
  checkBudget(task: CliTask, constraint?: BudgetConstraint): BudgetRoutingResult;

  /**
   * Route task with budget awareness.
   * Returns the best adapter within budget, or error if budget exceeded.
   */
  routeWithBudget(
    task: CliTask,
    budget?: BudgetConstraint
  ): Promise<Result<BudgetRoutingResult, BudgetExceededError>>;

  /**
   * Execute task with budget tracking.
   * Combines routing and execution, updating budget on completion.
   */
  executeWithBudget(
    task: CliTask,
    budget?: BudgetConstraint
  ): Promise<Result<CliResponse & { budgetAfter: SessionBudget }, CliError>>;
}
