/**
 * Type definitions for configuration defaults.
 *
 * Provides type safety for the centralized defaults system.
 * Includes Zod schemas for runtime validation at config boundaries.
 *
 * @module config/defaults-types
 */

import { z } from 'zod';

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

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Positive integer validator.
 */
const positiveInt = z.number().int().positive();

/**
 * Non-negative integer validator.
 */
const nonNegativeInt = z.number().int().nonnegative();

/**
 * Positive duration in milliseconds validator.
 */
const durationMs = z.number().int().positive().describe('Duration in milliseconds');

/**
 * Schema for TimeoutProfile.
 */
export const TimeoutProfileSchema = z.object({
  simple: durationMs.describe('Timeout for simple tasks'),
  standard: durationMs.describe('Timeout for standard tasks'),
  complex: durationMs.describe('Timeout for complex tasks'),
});

/**
 * Schema for RetryDefaults.
 */
export const RetryDefaultsSchema = z.object({
  maxRetries: nonNegativeInt.max(10).describe('Maximum retry attempts'),
  baseDelayMs: durationMs.describe('Base delay between retries'),
  maxDelayMs: durationMs.describe('Maximum delay between retries'),
  jitterFactor: z.number().min(0).max(1).describe('Jitter factor (0-1)'),
});

/**
 * Schema for RateLimitDefaults.
 */
export const RateLimitDefaultsSchema = z.object({
  requestsPerMinute: positiveInt.max(1000).describe('Max requests per minute'),
  enabled: z.boolean().describe('Whether rate limiting is enabled'),
  maxConcurrent: positiveInt.max(100).describe('Max concurrent requests'),
  capacity: positiveInt.describe('Token bucket capacity'),
  refillRate: positiveInt.describe('Token refill rate'),
  refillIntervalMs: durationMs.describe('Token refill interval'),
});

/**
 * Schema for CircuitBreakerDefaults.
 */
export const CircuitBreakerDefaultsSchema = z.object({
  failureThreshold: z.number().int().min(1).max(100).describe('Failures before opening'),
  resetTimeoutMs: durationMs.describe('Time before attempting reset'),
  halfOpenSuccessThreshold: z.number().int().min(1).max(10).describe('Successes to close'),
  countTimeoutsAsFailures: z.boolean().describe('Count timeouts as failures'),
  countAuthFailuresAsFailures: z.boolean().describe('Count auth failures as failures'),
  halfOpenMaxRequests: positiveInt.describe('Max requests in half-open state'),
});

/**
 * Schema for ToolRateLimitConfig.
 */
export const ToolRateLimitConfigSchema = z.object({
  capacity: positiveInt.describe('Token bucket capacity'),
  refillRate: positiveInt.describe('Token refill rate'),
  refillIntervalMs: durationMs.describe('Token refill interval'),
});

/**
 * Schema for WorkerDefaults.
 */
export const WorkerDefaultsSchema = z.object({
  maxWorkers: positiveInt.max(32).describe('Maximum worker threads'),
  poolSize: positiveInt.max(32).describe('Worker pool size'),
  idleTimeoutMs: durationMs.describe('Worker idle timeout'),
  workflowMaxParallel: positiveInt.max(10).describe('Max parallel workflow tasks'),
  testParallelism: positiveInt.max(16).describe('Test parallelism'),
  evaluationMaxWorkers: positiveInt.max(16).describe('Evaluation worker count'),
  eventBusMaxHistory: nonNegativeInt.max(10000).describe('Event bus history limit'),
  swarmObserverMaxEvents: nonNegativeInt.max(10000).describe('Swarm observer event limit'),
});

/**
 * Schema for TimeoutDefaults.
 */
export const TimeoutDefaultsSchema = z.object({
  cliMs: durationMs.describe('Default CLI timeout'),
  cliSimpleMs: durationMs.describe('Simple CLI task timeout'),
  cliComplexMs: durationMs.describe('Complex CLI task timeout'),
  apiMs: durationMs.describe('Default API timeout'),
  apiMaxMs: durationMs.describe('Maximum API timeout'),
  workflowMs: durationMs.describe('Default workflow timeout'),
  workflowMaxMs: durationMs.describe('Maximum workflow timeout'),
  stepMs: durationMs.describe('Default step timeout'),
  mcpMs: durationMs.describe('Default MCP timeout'),
  mcpMaxMs: durationMs.describe('Maximum MCP timeout'),
  healthCheckMs: durationMs.describe('Health check timeout'),
  testGlobalMs: durationMs.describe('Global test timeout'),
  testTaskMs: durationMs.describe('Task test timeout'),
  circuitBreakerResetMs: durationMs.describe('Circuit breaker reset timeout'),
});
