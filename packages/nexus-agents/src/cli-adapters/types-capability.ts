/**
 * nexus-agents/cli-adapters - Capability Type Definitions
 *
 * Capability types: ModelInfo, CapabilityProfile, CliTask, ICliAdapter, etc.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 */

import type { Result } from '../core/index.js';
import type {
  CliName,
  CliTransport,
  CliResponse,
  CliError,
  TokenUsage,
  HealthStatus,
  CapacityStatus,
} from './types-core.js';

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
