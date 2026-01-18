/**
 * Type definitions for configuration defaults.
 *
 * Provides type safety for the centralized defaults system.
 *
 * @module config/defaults-types
 */

// ============================================================================
// CLI Timeout Types
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

// ============================================================================
// Defaults Type Definitions
// ============================================================================

/**
 * Mutable type for timeout defaults (for functions returning overridden values).
 */
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

/**
 * Mutable type for rate limit defaults.
 */
export interface RateLimitDefaults {
  requestsPerMinute: number;
  enabled: boolean;
  maxConcurrent: number;
  capacity: number;
  refillRate: number;
  refillIntervalMs: number;
}

/**
 * Type for tool rate limit configuration.
 */
export interface ToolRateLimitConfig {
  readonly capacity: number;
  readonly refillRate: number;
  readonly refillIntervalMs: number;
}

/**
 * Mutable type for retry defaults.
 */
export interface RetryDefaults {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

/**
 * Mutable type for worker defaults.
 */
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

/**
 * Mutable type for circuit breaker defaults.
 */
export interface CircuitBreakerDefaults {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenSuccessThreshold: number;
  countTimeoutsAsFailures: boolean;
  countAuthFailuresAsFailures: boolean;
  halfOpenMaxRequests: number;
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

/**
 * Type guard for known CLI names.
 */
export function isKnownCliName(cli: string): cli is KnownCliName {
  return cli === 'claude' || cli === 'gemini' || cli === 'codex' || cli === 'default';
}
