/**
 * nexus-agents/testing/framework - Metrics Collector
 *
 * Collects and aggregates metrics during CLI test execution.
 * Supports latency measurements, token usage tracking, and reliability metrics.
 */

import type { CliName, TokenUsage } from '../../cli-adapters/types.js';
import type {
  LatencyMeasurement,
  MeasurementHandle,
  LatencyMetrics,
  ReliabilityMetrics,
  TokenMetrics,
  AggregateMetrics,
  TaskOutcome,
  TokenRecord,
  PendingMeasurement,
} from './metrics-collector-types.js';
import {
  EMPTY_LATENCY_METRICS,
  EMPTY_RELIABILITY_METRICS,
  EMPTY_TOKEN_METRICS,
} from './metrics-collector-types.js';

// Re-export types for backward compatibility
export type {
  LatencyMeasurement,
  MeasurementHandle,
  LatencyMetrics,
  ReliabilityMetrics,
  TokenMetrics,
  CliBreakdown,
  AggregateMetrics,
  TaskOutcome,
  TokenRecord,
  PendingMeasurement,
} from './metrics-collector-types.js';
export {
  EMPTY_LATENCY_METRICS,
  EMPTY_RELIABILITY_METRICS,
  EMPTY_TOKEN_METRICS,
} from './metrics-collector-types.js';

/**
 * Collects and aggregates metrics during CLI test execution.
 *
 * @example
 * ```typescript
 * const collector = new MetricsCollector();
 *
 * // Start a measurement
 * const handle = collector.startMeasurement('task-1', 'claude');
 *
 * // ... execute the task ...
 *
 * // Complete the measurement
 * handle.complete();
 *
 * // Record additional data
 * collector.recordTokenUsage('task-1', 'claude', { inputTokens: 100, outputTokens: 50 });
 * collector.recordSuccess('task-1', 'claude');
 *
 * // Get metrics
 * const metrics = collector.getAggregateMetrics();
 * ```
 */
export class MetricsCollector {
  private readonly latencyMeasurements: LatencyMeasurement[] = [];
  private readonly taskOutcomes: TaskOutcome[] = [];
  private readonly tokenRecords: TokenRecord[] = [];
  private readonly pendingMeasurements: Map<string, PendingMeasurement> = new Map();

  /**
   * Starts a latency measurement for a task.
   *
   * @param taskId - Unique identifier for the task
   * @param cli - CLI being measured
   * @returns Handle to complete or abort the measurement
   */
  startMeasurement(taskId: string, cli: CliName): MeasurementHandle {
    const key = this.makePendingKey(taskId, cli);

    if (this.pendingMeasurements.has(key)) {
      throw new Error(`Measurement already in progress for task ${taskId} on ${cli}`);
    }

    const startTime = process.hrtime.bigint();
    this.pendingMeasurements.set(key, { taskId, cli, startTime });

    return {
      complete: () => {
        this.completeMeasurement(taskId, cli);
      },
      abort: (reason: string) => {
        this.abortMeasurement(taskId, cli, reason);
      },
    };
  }

  /**
   * Records token usage for a task.
   *
   * @param taskId - Unique identifier for the task
   * @param cli - CLI that reported the usage
   * @param usage - Token usage data
   */
  recordTokenUsage(taskId: string, cli: CliName, usage: TokenUsage): void {
    this.tokenRecords.push({ taskId, cli, usage });
  }

  /**
   * Records a successful task execution.
   *
   * @param taskId - Unique identifier for the task
   * @param cli - CLI that executed the task
   */
  recordSuccess(taskId: string, cli: CliName): void {
    this.taskOutcomes.push({ taskId, cli, success: true, retryCount: 0 });
  }

  /**
   * Records a failed task execution.
   *
   * @param taskId - Unique identifier for the task
   * @param cli - CLI that executed the task
   * @param retryCount - Number of retries attempted
   */
  recordFailure(taskId: string, cli: CliName, retryCount: number): void {
    this.taskOutcomes.push({ taskId, cli, success: false, retryCount });
  }

  /**
   * Calculates latency metrics from all measurements.
   *
   * @returns Latency metrics including percentiles
   */
  calculateLatencyMetrics(): LatencyMetrics {
    return this.computeLatencyMetrics(this.latencyMeasurements);
  }

  /**
   * Calculates reliability metrics from all task outcomes.
   *
   * @returns Reliability metrics including success rates
   */
  calculateReliabilityMetrics(): ReliabilityMetrics {
    return this.computeReliabilityMetrics(this.taskOutcomes);
  }

  /**
   * Calculates token usage metrics from all records.
   *
   * @returns Token usage metrics
   */
  calculateTokenMetrics(): TokenMetrics {
    return this.computeTokenMetrics(this.tokenRecords);
  }

  /**
   * Gets aggregate metrics with per-CLI breakdowns.
   *
   * @returns Complete metrics summary
   */
  getAggregateMetrics(): AggregateMetrics {
    return {
      latency: this.calculateLatencyMetrics(),
      reliability: this.calculateReliabilityMetrics(),
      tokens: this.calculateTokenMetrics(),
      latencyByCli: this.getLatencyByCli(),
      reliabilityByCli: this.getReliabilityByCli(),
      tokensByCli: this.getTokensByCli(),
      timestamp: new Date(),
    };
  }

  /**
   * Resets all collected metrics.
   */
  reset(): void {
    this.latencyMeasurements.length = 0;
    this.taskOutcomes.length = 0;
    this.tokenRecords.length = 0;
    this.pendingMeasurements.clear();
  }

  /**
   * Gets the count of pending measurements.
   */
  getPendingCount(): number {
    return this.pendingMeasurements.size;
  }

  /**
   * Gets raw latency measurements for advanced analysis.
   */
  getRawLatencyMeasurements(): readonly LatencyMeasurement[] {
    return [...this.latencyMeasurements];
  }

  /**
   * Completes a pending measurement.
   */
  private completeMeasurement(taskId: string, cli: CliName): void {
    const key = this.makePendingKey(taskId, cli);
    const pending = this.pendingMeasurements.get(key);

    if (!pending) {
      throw new Error(`No pending measurement for task ${taskId} on ${cli}`);
    }

    const endTime = process.hrtime.bigint();
    const durationNs = endTime - pending.startTime;
    const durationMs = Number(durationNs) / 1_000_000;

    this.latencyMeasurements.push({
      taskId,
      cli,
      startTime: pending.startTime,
      endTime,
      durationMs,
    });

    this.pendingMeasurements.delete(key);
  }

  /**
   * Aborts a pending measurement.
   */
  private abortMeasurement(taskId: string, cli: CliName, _reason: string): void {
    const key = this.makePendingKey(taskId, cli);
    this.pendingMeasurements.delete(key);
  }

  /**
   * Creates a unique key for pending measurements.
   */
  private makePendingKey(taskId: string, cli: CliName): string {
    return `${cli}:${taskId}`;
  }

  /**
   * Computes latency metrics from a set of measurements.
   */
  private computeLatencyMetrics(measurements: LatencyMeasurement[]): LatencyMetrics {
    if (measurements.length === 0) {
      return EMPTY_LATENCY_METRICS;
    }

    const durations = measurements.map((m) => m.durationMs).sort((a, b) => a - b);
    const count = durations.length;
    const sum = durations.reduce((acc, d) => acc + d, 0);
    const mean = sum / count;

    // Calculate standard deviation
    const squaredDiffs = durations.map((d) => (d - mean) ** 2);
    const variance = squaredDiffs.reduce((acc, d) => acc + d, 0) / count;
    const stdDev = Math.sqrt(variance);

    // Safe access since we checked length > 0
    const minMs = durations[0] ?? 0;
    const maxMs = durations[count - 1] ?? 0;

    return {
      count,
      minMs,
      maxMs,
      meanMs: mean,
      p50Ms: this.percentile(durations, 50),
      p75Ms: this.percentile(durations, 75),
      p90Ms: this.percentile(durations, 90),
      p95Ms: this.percentile(durations, 95),
      p99Ms: this.percentile(durations, 99),
      stdDevMs: stdDev,
    };
  }

  /**
   * Computes reliability metrics from task outcomes.
   */
  private computeReliabilityMetrics(outcomes: TaskOutcome[]): ReliabilityMetrics {
    if (outcomes.length === 0) {
      return EMPTY_RELIABILITY_METRICS;
    }

    const totalTasks = outcomes.length;
    const successes = outcomes.filter((o) => o.success);
    const failures = outcomes.filter((o) => !o.success);
    const successCount = successes.length;
    const failureCount = failures.length;

    const totalRetries = outcomes.reduce((acc, o) => acc + o.retryCount, 0);
    const meanRetriesPerFailure = failureCount > 0 ? totalRetries / failureCount : 0;

    const firstAttemptSuccesses = successes.filter((o) => o.retryCount === 0);
    const firstAttemptSuccessCount = firstAttemptSuccesses.length;

    return {
      totalTasks,
      successCount,
      failureCount,
      successRate: successCount / totalTasks,
      totalRetries,
      meanRetriesPerFailure,
      firstAttemptSuccessCount,
      firstAttemptSuccessRate: firstAttemptSuccessCount / totalTasks,
    };
  }

  /**
   * Computes token metrics from token records.
   */
  private computeTokenMetrics(records: TokenRecord[]): TokenMetrics {
    if (records.length === 0) {
      return EMPTY_TOKEN_METRICS;
    }

    const taskCount = records.length;
    let totalInput = 0;
    let totalOutput = 0;

    for (const record of records) {
      totalInput += record.usage.inputTokens;
      totalOutput += record.usage.outputTokens;
    }

    const totalTokens = totalInput + totalOutput;

    return {
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalTokens,
      meanInputTokens: totalInput / taskCount,
      meanOutputTokens: totalOutput / taskCount,
      taskCount,
    };
  }

  /**
   * Gets latency metrics broken down by CLI.
   */
  private getLatencyByCli(): {
    claude: LatencyMetrics | null;
    gemini: LatencyMetrics | null;
    codex: LatencyMetrics | null;
  } {
    return {
      claude: this.getCliLatencyMetrics('claude'),
      gemini: this.getCliLatencyMetrics('gemini'),
      codex: this.getCliLatencyMetrics('codex'),
    };
  }

  /**
   * Gets reliability metrics broken down by CLI.
   */
  private getReliabilityByCli(): {
    claude: ReliabilityMetrics | null;
    gemini: ReliabilityMetrics | null;
    codex: ReliabilityMetrics | null;
  } {
    return {
      claude: this.getCliReliabilityMetrics('claude'),
      gemini: this.getCliReliabilityMetrics('gemini'),
      codex: this.getCliReliabilityMetrics('codex'),
    };
  }

  /**
   * Gets token metrics broken down by CLI.
   */
  private getTokensByCli(): {
    claude: TokenMetrics | null;
    gemini: TokenMetrics | null;
    codex: TokenMetrics | null;
  } {
    return {
      claude: this.getCliTokenMetrics('claude'),
      gemini: this.getCliTokenMetrics('gemini'),
      codex: this.getCliTokenMetrics('codex'),
    };
  }

  /**
   * Gets latency metrics for a specific CLI.
   */
  private getCliLatencyMetrics(cli: CliName): LatencyMetrics | null {
    const measurements = this.latencyMeasurements.filter((m) => m.cli === cli);
    if (measurements.length === 0) {
      return null;
    }
    return this.computeLatencyMetrics(measurements);
  }

  /**
   * Gets reliability metrics for a specific CLI.
   */
  private getCliReliabilityMetrics(cli: CliName): ReliabilityMetrics | null {
    const outcomes = this.taskOutcomes.filter((o) => o.cli === cli);
    if (outcomes.length === 0) {
      return null;
    }
    return this.computeReliabilityMetrics(outcomes);
  }

  /**
   * Gets token metrics for a specific CLI.
   */
  private getCliTokenMetrics(cli: CliName): TokenMetrics | null {
    const records = this.tokenRecords.filter((r) => r.cli === cli);
    if (records.length === 0) {
      return null;
    }
    return this.computeTokenMetrics(records);
  }

  /**
   * Calculates a percentile value from a sorted array.
   * Uses linear interpolation for non-integer indices.
   *
   * @param sortedValues - Array of values sorted in ascending order
   * @param p - Percentile to calculate (0-100)
   * @returns The percentile value
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) {
      return 0;
    }

    const firstValue = sortedValues[0];
    if (sortedValues.length === 1 || firstValue === undefined) {
      return firstValue ?? 0;
    }

    const index = (p / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    const lowerValue = sortedValues[lower] ?? 0;
    const upperValue = sortedValues[upper] ?? 0;

    if (lower === upper) {
      return lowerValue;
    }

    const fraction = index - lower;
    return lowerValue + fraction * (upperValue - lowerValue);
  }
}

/**
 * Creates a new MetricsCollector instance.
 *
 * @returns A new MetricsCollector
 */
export function createMetricsCollector(): MetricsCollector {
  return new MetricsCollector();
}
