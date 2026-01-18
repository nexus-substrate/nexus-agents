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

// Re-export types from defaults-types
export type {
  TaskComplexity,
  TimeoutProfile,
  KnownCliName,
  TimeoutDefaults,
  RateLimitDefaults,
  ToolRateLimitConfig,
  RetryDefaults,
  WorkerDefaults,
  CircuitBreakerDefaults,
} from './defaults-types.js';

export { isTaskComplexity, isKnownCliName } from './defaults-types.js';

// Re-export timeout profiles
export {
  TIMEOUT_PROFILES,
  getTimeoutProfile,
  getTimeoutForCli,
} from './defaults-timeout-profiles.js';

// Re-export env helpers (internal use)
export { parseIntEnv, parseFloatEnv, parseBoolEnv } from './defaults-env.js';

import {
  createGetTimeout,
  createGetRetryConfig,
  createGetRateLimitConfig,
  createGetWorkerConfig,
  createGetCircuitBreakerConfig,
  createGetToolRateLimit,
  createGetEnvVarDocumentation,
} from './defaults-env.js';

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
// Type Exports for DEFAULTS
// ============================================================================

/** Type for the DEFAULTS object (readonly/const). */
export type DefaultsConfig = typeof DEFAULTS;

/** Type for timeout defaults (readonly/const). */
export type TimeoutDefaultsConst = typeof DEFAULTS.TIMEOUT_DEFAULTS;

/** Type for rate limit defaults (readonly/const). */
export type RateLimitDefaultsConst = typeof DEFAULTS.RATE_LIMIT_DEFAULTS;

/** Type for retry defaults (readonly/const). */
export type RetryDefaultsConst = typeof DEFAULTS.RETRY_DEFAULTS;

/** Type for buffer defaults (readonly/const). */
export type BufferDefaults = typeof DEFAULTS.BUFFER_DEFAULTS;

/** Type for worker defaults (readonly/const). */
export type WorkerDefaultsConst = typeof DEFAULTS.WORKER_DEFAULTS;

/** Type for circuit breaker defaults (readonly/const). */
export type CircuitBreakerDefaultsConst = typeof DEFAULTS.CIRCUIT_BREAKER_DEFAULTS;

/** Type for context defaults (readonly/const). */
export type ContextDefaults = typeof DEFAULTS.CONTEXT_DEFAULTS;

/** Type for provider defaults (readonly/const). */
export type ProviderDefaults = typeof DEFAULTS.PROVIDER_DEFAULTS;

/** Type for security defaults (readonly/const). */
export type SecurityDefaults = typeof DEFAULTS.SECURITY_DEFAULTS;

// ============================================================================
// Environment Override Functions (bound to DEFAULTS)
// ============================================================================

/**
 * Get timeout with environment override support.
 *
 * @param key - Timeout key (e.g., 'cliMs', 'apiMs')
 * @returns Timeout value in milliseconds
 */
export const getTimeout = createGetTimeout(DEFAULTS.TIMEOUT_DEFAULTS);

/**
 * Get retry config with environment override support.
 *
 * @returns Retry configuration
 */
export const getRetryConfig = createGetRetryConfig(DEFAULTS.RETRY_DEFAULTS);

/**
 * Get rate limit config with environment override support.
 *
 * @returns Rate limit configuration
 */
export const getRateLimitConfig = createGetRateLimitConfig(DEFAULTS.RATE_LIMIT_DEFAULTS);

/**
 * Get worker config with environment override support.
 *
 * @returns Worker configuration
 */
export const getWorkerConfig = createGetWorkerConfig(DEFAULTS.WORKER_DEFAULTS);

/**
 * Gets the circuit breaker configuration.
 *
 * @returns Circuit breaker configuration
 */
export const getCircuitBreakerConfig = createGetCircuitBreakerConfig(
  DEFAULTS.CIRCUIT_BREAKER_DEFAULTS
);

/**
 * Gets the tool rate limit configuration for a specific tool category.
 *
 * @param tool - Tool category (orchestrate, delegate, workflow, expert)
 * @returns Rate limit configuration
 */
export const getToolRateLimit = createGetToolRateLimit(DEFAULTS.TOOL_RATE_LIMITS);

// ============================================================================
// Documentation Helper
// ============================================================================

/**
 * Returns documentation for all environment variable overrides.
 *
 * @returns Markdown documentation string
 */
export const getEnvVarDocumentation = createGetEnvVarDocumentation(DEFAULTS);
