/**
 * nexus-agents/testing/framework - Metrics Collector Types
 *
 * Type definitions for CLI test metrics collection.
 */

import type { CliName, TokenUsage } from '../../cli-adapters/types.js';

/**
 * A single latency measurement for a task execution.
 */
export interface LatencyMeasurement {
  readonly taskId: string;
  readonly cli: CliName;
  readonly startTime: bigint;
  readonly endTime: bigint;
  readonly durationMs: number;
}

/**
 * Handle for an in-progress measurement.
 * Call complete() when the operation finishes successfully.
 * Call abort() if the operation fails or is cancelled.
 */
export interface MeasurementHandle {
  /**
   * Marks the measurement as complete and records the duration.
   */
  complete(): void;

  /**
   * Aborts the measurement with the given reason.
   * @param reason - Why the measurement was aborted
   */
  abort(reason: string): void;
}

/**
 * Latency metrics with percentile calculations.
 */
export interface LatencyMetrics {
  /** Total number of measurements */
  readonly count: number;
  /** Minimum latency in milliseconds */
  readonly minMs: number;
  /** Maximum latency in milliseconds */
  readonly maxMs: number;
  /** Mean latency in milliseconds */
  readonly meanMs: number;
  /** Median (p50) latency in milliseconds */
  readonly p50Ms: number;
  /** 75th percentile latency in milliseconds */
  readonly p75Ms: number;
  /** 90th percentile latency in milliseconds */
  readonly p90Ms: number;
  /** 95th percentile latency in milliseconds */
  readonly p95Ms: number;
  /** 99th percentile latency in milliseconds */
  readonly p99Ms: number;
  /** Standard deviation in milliseconds */
  readonly stdDevMs: number;
}

/**
 * Reliability metrics for task execution.
 */
export interface ReliabilityMetrics {
  /** Total task count */
  readonly totalTasks: number;
  /** Number of successful tasks */
  readonly successCount: number;
  /** Number of failed tasks */
  readonly failureCount: number;
  /** Success rate as a decimal (0.0 - 1.0) */
  readonly successRate: number;
  /** Total number of retries across all tasks */
  readonly totalRetries: number;
  /** Mean retries per failed task */
  readonly meanRetriesPerFailure: number;
  /** Tasks that succeeded without retries */
  readonly firstAttemptSuccessCount: number;
  /** First attempt success rate */
  readonly firstAttemptSuccessRate: number;
}

/**
 * Token usage metrics.
 */
export interface TokenMetrics {
  /** Total input tokens consumed */
  readonly totalInputTokens: number;
  /** Total output tokens generated */
  readonly totalOutputTokens: number;
  /** Total tokens (input + output) */
  readonly totalTokens: number;
  /** Mean input tokens per task */
  readonly meanInputTokens: number;
  /** Mean output tokens per task */
  readonly meanOutputTokens: number;
  /** Number of tasks with token data */
  readonly taskCount: number;
}

/**
 * Per-CLI breakdown of metrics.
 */
export interface CliBreakdown<T> {
  readonly claude: T | null;
  readonly gemini: T | null;
  readonly codex: T | null;
}

/**
 * Aggregate metrics across all CLIs.
 */
export interface AggregateMetrics {
  /** Overall latency metrics */
  readonly latency: LatencyMetrics;
  /** Overall reliability metrics */
  readonly reliability: ReliabilityMetrics;
  /** Overall token metrics */
  readonly tokens: TokenMetrics;
  /** Per-CLI latency breakdown */
  readonly latencyByCli: CliBreakdown<LatencyMetrics>;
  /** Per-CLI reliability breakdown */
  readonly reliabilityByCli: CliBreakdown<ReliabilityMetrics>;
  /** Per-CLI token breakdown */
  readonly tokensByCli: CliBreakdown<TokenMetrics>;
  /** Timestamp when metrics were calculated */
  readonly timestamp: Date;
}

/**
 * Internal tracking for success/failure counts.
 */
export interface TaskOutcome {
  readonly taskId: string;
  readonly cli: CliName;
  readonly success: boolean;
  readonly retryCount: number;
}

/**
 * Internal tracking for token usage.
 */
export interface TokenRecord {
  readonly taskId: string;
  readonly cli: CliName;
  readonly usage: TokenUsage;
}

/**
 * Internal state for in-progress measurements.
 */
export interface PendingMeasurement {
  readonly taskId: string;
  readonly cli: CliName;
  readonly startTime: bigint;
}

/**
 * Empty latency metrics for CLIs with no data.
 */
export const EMPTY_LATENCY_METRICS: LatencyMetrics = {
  count: 0,
  minMs: 0,
  maxMs: 0,
  meanMs: 0,
  p50Ms: 0,
  p75Ms: 0,
  p90Ms: 0,
  p95Ms: 0,
  p99Ms: 0,
  stdDevMs: 0,
};

/**
 * Empty reliability metrics for CLIs with no data.
 */
export const EMPTY_RELIABILITY_METRICS: ReliabilityMetrics = {
  totalTasks: 0,
  successCount: 0,
  failureCount: 0,
  successRate: 0,
  totalRetries: 0,
  meanRetriesPerFailure: 0,
  firstAttemptSuccessCount: 0,
  firstAttemptSuccessRate: 0,
};

/**
 * Empty token metrics for CLIs with no data.
 */
export const EMPTY_TOKEN_METRICS: TokenMetrics = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalTokens: 0,
  meanInputTokens: 0,
  meanOutputTokens: 0,
  taskCount: 0,
};
