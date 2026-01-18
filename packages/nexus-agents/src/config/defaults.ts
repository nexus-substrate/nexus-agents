/**
 * Central Configuration Defaults
 *
 * Consolidates common default values used across the codebase.
 * This prevents scattered magic numbers and ensures consistency.
 *
 * Usage:
 *   import { DEFAULTS, getTimeout, TIMEOUT_PROFILES } from '../config/defaults.js';
 *   const timeout = options.timeout ?? DEFAULTS.TIMEOUT_DEFAULTS.cliMs;
 *   const cliTimeout = getTimeoutForCli('claude', 'complex');
 *
 * Environment overrides can be added via NEXUS_* environment variables.
 *
 * @module config/defaults
 * (Source: Central config consolidation initiative)
 */

// ============================================================================
// CLI Timeout Profiles
// ============================================================================

/**
 * Task complexity levels for CLI timeout selection.
 */
export type TaskComplexity = 'simple' | 'standard' | 'complex';

/**
 * Timeout profile structure for CLI tools.
 */
export interface TimeoutProfile {
  /** Timeout for simple tasks (single function, quick analysis) in ms */
  readonly simple: number;
  /** Timeout for standard tasks (multi-file changes, moderate analysis) in ms */
  readonly standard: number;
  /** Timeout for complex tasks (codebase-wide changes, deep analysis) in ms */
  readonly complex: number;
}

/**
 * Known CLI names for timeout profiles.
 */
export type KnownCliName = 'claude' | 'gemini' | 'codex' | 'default';

/**
 * CLI-specific timeout profiles based on real-world performance testing.
 *
 * Values derived from testing documented in Issue #357:
 * - Claude: 30-120s depending on complexity
 * - Gemini: 15-90s (times out on complex file analysis >60s)
 * - Codex: 10-60s (optimized for code generation)
 */
export const TIMEOUT_PROFILES = {
  claude: { simple: 30_000, standard: 60_000, complex: 120_000 },
  gemini: { simple: 15_000, standard: 45_000, complex: 90_000 },
  codex: { simple: 10_000, standard: 30_000, complex: 60_000 },
  /** Default profile for unknown CLIs */
  default: { simple: 30_000, standard: 60_000, complex: 120_000 },
} as const satisfies Record<KnownCliName, TimeoutProfile>;

// ============================================================================
// Central Defaults Object
// ============================================================================

/**
 * Central defaults object containing all configuration categories.
 */
export const DEFAULTS = {
  /**
   * Default timeout settings in milliseconds.
   */
  TIMEOUT_DEFAULTS: {
    /** CLI tool execution timeout in milliseconds. */
    cliMs: 60_000,
    /** Simple CLI task timeout (single function, quick query). */
    cliSimpleMs: 30_000,
    /** Complex CLI task timeout (codebase-wide, deep analysis). */
    cliComplexMs: 120_000,
    /** API request timeout in milliseconds. */
    apiMs: 30_000,
    /** Maximum API timeout in milliseconds. */
    apiMaxMs: 300_000,
    /** Workflow-level timeout in milliseconds (5 minutes). */
    workflowMs: 5 * 60_000,
    /** Maximum workflow timeout in milliseconds (30 minutes). */
    workflowMaxMs: 30 * 60_000,
    /** Step-level timeout in milliseconds. */
    stepMs: 2 * 60_000,
    /** MCP operation default timeout in milliseconds. */
    mcpMs: 30_000,
    /** MCP operation maximum timeout in milliseconds. */
    mcpMaxMs: 300_000,
    /** Health check timeout in milliseconds. */
    healthCheckMs: 5_000,
    /** Global test run timeout in milliseconds (10 minutes). */
    testGlobalMs: 10 * 60_000,
    /** Per-task test timeout in milliseconds. */
    testTaskMs: 2 * 60_000,
    /** Circuit breaker reset timeout in milliseconds. */
    circuitBreakerResetMs: 30_000,
  },

  /**
   * Default rate limit settings for outbound operations.
   */
  RATE_LIMIT_DEFAULTS: {
    /** Global requests per minute. */
    requestsPerMinute: 60,
    /** Whether rate limiting is enabled by default. */
    enabled: true,
    /** Maximum number of concurrent requests. */
    maxConcurrent: 4,
    /** Token bucket capacity. */
    capacity: 100,
    /** Token bucket refill rate per second. */
    refillRate: 10,
    /** Refill interval in milliseconds. */
    refillIntervalMs: 100,
  },

  /**
   * Per-tool rate limit defaults for MCP tools.
   * (Source: Issue #274 Phase 2 - per-tool rate limits)
   */
  TOOL_RATE_LIMITS: {
    orchestrate: { capacity: 10, refillRate: 10, refillIntervalMs: 60_000 },
    delegate: { capacity: 20, refillRate: 20, refillIntervalMs: 60_000 },
    workflow: { capacity: 5, refillRate: 5, refillIntervalMs: 60_000 },
    expert: { capacity: 30, refillRate: 30, refillIntervalMs: 60_000 },
  },

  /**
   * Default retry strategy settings for transient failures.
   */
  RETRY_DEFAULTS: {
    /** Maximum retry attempts before failing. */
    maxRetries: 3,
    /** Base delay between retries in milliseconds. */
    baseDelayMs: 1_000,
    /** Maximum delay between retries in milliseconds. */
    maxDelayMs: 30_000,
    /** Jitter factor (0-1) to randomize retry delays. */
    jitterFactor: 0.1,
  },

  /**
   * Workflow-specific retry defaults.
   */
  WORKFLOW_RETRY_DEFAULTS: {
    /** Maximum retry attempts for workflow steps. */
    maxRetries: 2,
    /** Base delay for workflow retries in milliseconds. */
    baseDelayMs: 2_000,
    /** Maximum delay for workflow retries in milliseconds. */
    maxDelayMs: 60_000,
    /** Jitter factor for workflow retries. */
    jitterFactor: 0.15,
  },

  /**
   * CLI-specific retry defaults.
   */
  CLI_RETRY_DEFAULTS: {
    /** Maximum retry attempts for CLI operations. */
    maxRetries: 2,
    /** Base delay for CLI retries in milliseconds. */
    baseDelayMs: 5_000,
    /** Maximum delay for CLI retries in milliseconds. */
    maxDelayMs: 60_000,
    /** Jitter factor for CLI retries. */
    jitterFactor: 0.2,
  },

  /**
   * Test framework retry defaults.
   */
  TEST_RETRY_DEFAULTS: {
    /** Maximum retries per test task. */
    maxRetries: 2,
    /** Whether to retry failed tasks by default. */
    retryFailedTasks: true,
  },

  /**
   * Default buffer sizing for batching and chunked processing.
   */
  BUFFER_DEFAULTS: {
    /** Preferred batch size for bulk operations. */
    batchSize: 100,
    /** Chunk size for streaming or segmented processing. */
    chunkSize: 256,
    /** Maximum items allowed in a buffer. */
    maxItems: 1_000,
    /** Maximum memory size in bytes (10 MB). */
    maxMemoryBytes: 10 * 1024 * 1024,
    /** Log buffer flush interval in milliseconds. */
    logFlushIntervalMs: 5_000,
  },

  /**
   * Default worker pool sizing.
   */
  WORKER_DEFAULTS: {
    /** Maximum number of workers. */
    maxWorkers: 8,
    /** Default worker pool size. */
    poolSize: 4,
    /** Worker idle timeout in milliseconds (5 minutes). */
    idleTimeoutMs: 5 * 60_000,
    /** Maximum parallel workflow steps. */
    workflowMaxParallel: 5,
    /** Test framework parallelism. */
    testParallelism: 3,
    /** Evaluation harness max workers. */
    evaluationMaxWorkers: 8,
    /** EventBus max history size. */
    eventBusMaxHistory: 1_000,
    /** Swarm observer max events. */
    swarmObserverMaxEvents: 10_000,
  },

  /**
   * Default circuit breaker settings.
   * (Source: Issue #81 - Circuit breaker for CLI failures)
   */
  CIRCUIT_BREAKER_DEFAULTS: {
    /** Failure threshold to open circuit. */
    failureThreshold: 5,
    /** Reset timeout in milliseconds. */
    resetTimeoutMs: 30_000,
    /** Success threshold to close circuit in half-open state. */
    halfOpenSuccessThreshold: 2,
    /** Whether to count timeouts as failures. */
    countTimeoutsAsFailures: true,
    /** Whether to count auth failures as failures. */
    countAuthFailuresAsFailures: false,
    /** Maximum requests allowed in half-open state. */
    halfOpenMaxRequests: 3,
  },

  /**
   * Default context/memory settings.
   */
  CONTEXT_DEFAULTS: {
    /** Maximum context tokens. */
    maxTokens: 100_000,
    /** Token budget warning threshold (80%). */
    warningThreshold: 0.8,
    /** Token budget critical threshold (95%). */
    criticalThreshold: 0.95,
    /** Maximum history entries to retain. */
    maxHistoryEntries: 1_000,
  },

  /**
   * Default provider/model settings.
   */
  PROVIDER_DEFAULTS: {
    /** Default timeout for provider API calls in ms. */
    timeout: 30_000,
    /** Maximum retries for provider requests. */
    maxRetries: 3,
    /** Default model tier. */
    defaultTier: 'balanced' as const,
    /** Default temperature. */
    temperatureDefault: 0.3,
    /** Minimum temperature. */
    temperatureMin: 0,
    /** Maximum temperature. */
    temperatureMax: 1,
  },

  /**
   * Security-related defaults.
   */
  SECURITY_DEFAULTS: {
    /** Maximum system prompt length in characters. */
    maxSystemPromptLength: 4_000,
    /** Default policy execution mode. */
    policyDefaultMode: 'read-only' as const,
    /** Default policy mode. */
    policyMode: 'enforce' as const,
    /** Default sandbox mode. */
    sandboxMode: 'policy' as const,
    /** Whether to fall back to policy mode if container unavailable. */
    sandboxFallbackToPolicy: true,
    /** Whether network is enabled in container mode. */
    sandboxNetworkEnabled: false,
  },
} as const;

// ============================================================================
// Type Exports
// ============================================================================

/** Type for the DEFAULTS object (readonly/const). */
export type DefaultsConfig = typeof DEFAULTS;

/** Type for timeout defaults (readonly/const). */
export type TimeoutDefaultsConst = typeof DEFAULTS.TIMEOUT_DEFAULTS;

/** Mutable type for timeout defaults (for functions returning overridden values). */
export interface TimeoutDefaults {
  cliMs: number;
  cliSimpleMs: number;
  cliComplexMs: number;
  apiMs: number;
  apiMaxMs: number;
  workflowMs: number;
  workflowMaxMs: number;
  stepMs: number;
  mcpMs: number;
  mcpMaxMs: number;
  healthCheckMs: number;
  testGlobalMs: number;
  testTaskMs: number;
  circuitBreakerResetMs: number;
}

/** Type for rate limit defaults (readonly/const). */
export type RateLimitDefaultsConst = typeof DEFAULTS.RATE_LIMIT_DEFAULTS;

/** Mutable type for rate limit defaults. */
export interface RateLimitDefaults {
  requestsPerMinute: number;
  enabled: boolean;
  maxConcurrent: number;
  capacity: number;
  refillRate: number;
  refillIntervalMs: number;
}

/** Type for tool rate limit configuration. */
export interface ToolRateLimitConfig {
  readonly capacity: number;
  readonly refillRate: number;
  readonly refillIntervalMs: number;
}

/** Type for retry defaults (readonly/const). */
export type RetryDefaultsConst = typeof DEFAULTS.RETRY_DEFAULTS;

/** Mutable type for retry defaults. */
export interface RetryDefaults {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

/** Type for buffer defaults (readonly/const). */
export type BufferDefaults = typeof DEFAULTS.BUFFER_DEFAULTS;

/** Type for worker defaults (readonly/const). */
export type WorkerDefaultsConst = typeof DEFAULTS.WORKER_DEFAULTS;

/** Mutable type for worker defaults. */
export interface WorkerDefaults {
  maxWorkers: number;
  poolSize: number;
  idleTimeoutMs: number;
  workflowMaxParallel: number;
  testParallelism: number;
  evaluationMaxWorkers: number;
  eventBusMaxHistory: number;
  swarmObserverMaxEvents: number;
}

/** Type for circuit breaker defaults (readonly/const). */
export type CircuitBreakerDefaultsConst = typeof DEFAULTS.CIRCUIT_BREAKER_DEFAULTS;

/** Mutable type for circuit breaker defaults. */
export interface CircuitBreakerDefaults {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenSuccessThreshold: number;
  countTimeoutsAsFailures: boolean;
  countAuthFailuresAsFailures: boolean;
  halfOpenMaxRequests: number;
}

/** Type for context defaults (readonly/const). */
export type ContextDefaults = typeof DEFAULTS.CONTEXT_DEFAULTS;

/** Type for provider defaults (readonly/const). */
export type ProviderDefaults = typeof DEFAULTS.PROVIDER_DEFAULTS;

/** Type for security defaults (readonly/const). */
export type SecurityDefaults = typeof DEFAULTS.SECURITY_DEFAULTS;

// ============================================================================
// Environment Variable Override Helpers
// ============================================================================

/**
 * Parses an integer from an environment variable with fallback.
 */
function parseIntEnv(envKey: string, fallback: number): number {
  const envValue = process.env[envKey];
  if (envValue === undefined) {
    return fallback;
  }
  const parsed = parseInt(envValue, 10);
  return isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

/**
 * Parses a float from an environment variable with fallback.
 */
function parseFloatEnv(envKey: string, fallback: number): number {
  const envValue = process.env[envKey];
  if (envValue === undefined) {
    return fallback;
  }
  const parsed = parseFloat(envValue);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Parses a boolean from an environment variable with fallback.
 */
function parseBoolEnv(envKey: string, fallback: boolean): boolean {
  const envValue = process.env[envKey];
  if (envValue === undefined) {
    return fallback;
  }
  return envValue !== 'false';
}

// ============================================================================
// Environment Variable Override Functions
// ============================================================================

/**
 * Get timeout with environment override support.
 *
 * @param key - Timeout key (e.g., 'cliMs', 'apiMs')
 * @returns Timeout value in milliseconds
 */
export function getTimeout(key: keyof TimeoutDefaultsConst): number {
  const envKey = `NEXUS_TIMEOUT_${key.replace(/Ms$/, '').toUpperCase()}`;
  return parseIntEnv(envKey, DEFAULTS.TIMEOUT_DEFAULTS[key]);
}

/**
 * Get retry config with environment override support.
 *
 * @returns Retry configuration
 */
export function getRetryConfig(): RetryDefaults {
  const d = DEFAULTS.RETRY_DEFAULTS;
  return {
    maxRetries: parseIntEnv('NEXUS_RETRY_MAX_RETRIES', d.maxRetries),
    baseDelayMs: parseIntEnv('NEXUS_RETRY_BASE_DELAY', d.baseDelayMs),
    maxDelayMs: parseIntEnv('NEXUS_RETRY_MAX_DELAY', d.maxDelayMs),
    jitterFactor: parseFloatEnv('NEXUS_RETRY_JITTER', d.jitterFactor),
  };
}

/**
 * Get rate limit config with environment override support.
 *
 * @returns Rate limit configuration
 */
export function getRateLimitConfig(): RateLimitDefaults {
  const d = DEFAULTS.RATE_LIMIT_DEFAULTS;
  return {
    requestsPerMinute: parseIntEnv('NEXUS_RATE_LIMIT_RPM', d.requestsPerMinute),
    enabled: parseBoolEnv('NEXUS_RATE_LIMIT_ENABLED', d.enabled),
    maxConcurrent: parseIntEnv('NEXUS_RATE_LIMIT_MAX_CONCURRENT', d.maxConcurrent),
    capacity: parseIntEnv('NEXUS_RATE_LIMIT_CAPACITY', d.capacity),
    refillRate: parseIntEnv('NEXUS_RATE_LIMIT_REFILL_RATE', d.refillRate),
    refillIntervalMs: parseIntEnv('NEXUS_RATE_LIMIT_REFILL_INTERVAL', d.refillIntervalMs),
  };
}

/**
 * Get worker config with environment override support.
 *
 * @returns Worker configuration
 */
export function getWorkerConfig(): WorkerDefaults {
  const d = DEFAULTS.WORKER_DEFAULTS;
  return {
    maxWorkers: parseIntEnv('NEXUS_WORKERS_MAX', d.maxWorkers),
    poolSize: parseIntEnv('NEXUS_WORKERS_POOL_SIZE', d.poolSize),
    idleTimeoutMs: parseIntEnv('NEXUS_WORKERS_IDLE_TIMEOUT', d.idleTimeoutMs),
    workflowMaxParallel: parseIntEnv('NEXUS_WORKFLOW_MAX_PARALLEL', d.workflowMaxParallel),
    testParallelism: parseIntEnv('NEXUS_TEST_PARALLELISM', d.testParallelism),
    evaluationMaxWorkers: parseIntEnv('NEXUS_EVALUATION_MAX_WORKERS', d.evaluationMaxWorkers),
    eventBusMaxHistory: parseIntEnv('NEXUS_EVENTBUS_MAX_HISTORY', d.eventBusMaxHistory),
    swarmObserverMaxEvents: parseIntEnv(
      'NEXUS_SWARM_OBSERVER_MAX_EVENTS',
      d.swarmObserverMaxEvents
    ),
  };
}

// ============================================================================
// Convenience Accessor Functions
// ============================================================================

/**
 * Checks if a string is a known CLI name.
 */
function isKnownCliName(cli: string): cli is KnownCliName {
  return cli in TIMEOUT_PROFILES;
}

/**
 * Gets the timeout profile for a specific CLI.
 *
 * @param cli - CLI name (claude, gemini, codex)
 * @returns TimeoutProfile for the CLI
 */
export function getTimeoutProfile(cli: string): TimeoutProfile {
  if (isKnownCliName(cli)) {
    return (TIMEOUT_PROFILES as Record<KnownCliName, TimeoutProfile>)[cli];
  }
  return TIMEOUT_PROFILES.default;
}

/**
 * Gets timeout for a task based on CLI and complexity.
 *
 * @param cli - CLI name
 * @param complexity - Task complexity level
 * @returns Timeout in milliseconds
 */
export function getTimeoutForCli(cli: string, complexity: TaskComplexity): number {
  const profile = getTimeoutProfile(cli);
  return profile[complexity];
}

/**
 * Gets the tool rate limit configuration for a specific tool category.
 *
 * @param tool - Tool category (orchestrate, delegate, workflow, expert)
 * @returns Rate limit configuration
 */
export function getToolRateLimit(
  tool: keyof typeof DEFAULTS.TOOL_RATE_LIMITS
): ToolRateLimitConfig {
  return DEFAULTS.TOOL_RATE_LIMITS[tool];
}

/**
 * Gets the circuit breaker configuration.
 *
 * @returns Circuit breaker configuration
 */
export function getCircuitBreakerConfig(): CircuitBreakerDefaults {
  const d = DEFAULTS.CIRCUIT_BREAKER_DEFAULTS;
  return {
    failureThreshold: parseIntEnv('NEXUS_CIRCUIT_BREAKER_THRESHOLD', d.failureThreshold),
    resetTimeoutMs: parseIntEnv('NEXUS_CIRCUIT_BREAKER_RESET_TIMEOUT', d.resetTimeoutMs),
    halfOpenSuccessThreshold: d.halfOpenSuccessThreshold,
    countTimeoutsAsFailures: d.countTimeoutsAsFailures,
    countAuthFailuresAsFailures: d.countAuthFailuresAsFailures,
    halfOpenMaxRequests: d.halfOpenMaxRequests,
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for task complexity.
 */
export function isTaskComplexity(value: unknown): value is TaskComplexity {
  return value === 'simple' || value === 'standard' || value === 'complex';
}

// ============================================================================
// Documentation Helper
// ============================================================================

/**
 * Returns documentation for all environment variable overrides.
 *
 * @returns Markdown documentation string
 */
export function getEnvVarDocumentation(): string {
  return `# Environment Variable Overrides

All defaults can be overridden via environment variables using the NEXUS_ prefix.

## Timeouts

| Variable | Default | Description |
|----------|---------|-------------|
| NEXUS_TIMEOUT_CLI | ${String(DEFAULTS.TIMEOUT_DEFAULTS.cliMs)} | CLI execution timeout (ms) |
| NEXUS_TIMEOUT_API | ${String(DEFAULTS.TIMEOUT_DEFAULTS.apiMs)} | API request timeout (ms) |
| NEXUS_TIMEOUT_WORKFLOW | ${String(DEFAULTS.TIMEOUT_DEFAULTS.workflowMs)} | Workflow timeout (ms) |
| NEXUS_TIMEOUT_MCP | ${String(DEFAULTS.TIMEOUT_DEFAULTS.mcpMs)} | MCP operation timeout (ms) |

## Rate Limits

| Variable | Default | Description |
|----------|---------|-------------|
| NEXUS_RATE_LIMIT_RPM | ${String(DEFAULTS.RATE_LIMIT_DEFAULTS.requestsPerMinute)} | Requests per minute |
| NEXUS_RATE_LIMIT_ENABLED | ${String(DEFAULTS.RATE_LIMIT_DEFAULTS.enabled)} | Enable rate limiting |
| NEXUS_RATE_LIMIT_CAPACITY | ${String(DEFAULTS.RATE_LIMIT_DEFAULTS.capacity)} | Token bucket capacity |

## Retries

| Variable | Default | Description |
|----------|---------|-------------|
| NEXUS_RETRY_MAX_RETRIES | ${String(DEFAULTS.RETRY_DEFAULTS.maxRetries)} | Maximum retry attempts |
| NEXUS_RETRY_BASE_DELAY | ${String(DEFAULTS.RETRY_DEFAULTS.baseDelayMs)} | Base delay (ms) |
| NEXUS_RETRY_MAX_DELAY | ${String(DEFAULTS.RETRY_DEFAULTS.maxDelayMs)} | Maximum delay (ms) |
| NEXUS_RETRY_JITTER | ${String(DEFAULTS.RETRY_DEFAULTS.jitterFactor)} | Jitter factor (0-1) |

## Workers

| Variable | Default | Description |
|----------|---------|-------------|
| NEXUS_WORKERS_MAX | ${String(DEFAULTS.WORKER_DEFAULTS.maxWorkers)} | Maximum workers |
| NEXUS_WORKERS_POOL_SIZE | ${String(DEFAULTS.WORKER_DEFAULTS.poolSize)} | Worker pool size |
| NEXUS_WORKFLOW_MAX_PARALLEL | ${String(DEFAULTS.WORKER_DEFAULTS.workflowMaxParallel)} | Max parallel workflow steps |
| NEXUS_TEST_PARALLELISM | ${String(DEFAULTS.WORKER_DEFAULTS.testParallelism)} | Test parallelism |

## Circuit Breaker

| Variable | Default | Description |
|----------|---------|-------------|
| NEXUS_CIRCUIT_BREAKER_THRESHOLD | ${String(DEFAULTS.CIRCUIT_BREAKER_DEFAULTS.failureThreshold)} | Failure threshold |
| NEXUS_CIRCUIT_BREAKER_RESET_TIMEOUT | ${String(DEFAULTS.CIRCUIT_BREAKER_DEFAULTS.resetTimeoutMs)} | Reset timeout (ms) |
`;
}
