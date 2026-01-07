/**
 * nexus-agents/testing/framework - Metrics Collector
 *
 * Collects and aggregates metrics during CLI test execution.
 * Supports latency measurements, token usage tracking, and reliability metrics.
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
interface TaskOutcome {
  readonly taskId: string;
  readonly cli: CliName;
  readonly success: boolean;
  readonly retryCount: number;
}

/**
 * Internal tracking for token usage.
 */
interface TokenRecord {
  readonly taskId: string;
  readonly cli: CliName;
  readonly usage: TokenUsage;
}

/**
 * Internal state for in-progress measurements.
 */
interface PendingMeasurement {
  readonly taskId: string;
  readonly cli: CliName;
  readonly startTime: bigint;
}

/**
 * Empty latency metrics for CLIs with no data.
 */
const EMPTY_LATENCY_METRICS: LatencyMetrics = {
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
const EMPTY_RELIABILITY_METRICS: ReliabilityMetrics = {
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
const EMPTY_TOKEN_METRICS: TokenMetrics = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalTokens: 0,
  meanInputTokens: 0,
  meanOutputTokens: 0,
  taskCount: 0,
};

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
  private getLatencyByCli(): CliBreakdown<LatencyMetrics> {
    return {
      claude: this.getCliLatencyMetrics('claude'),
      gemini: this.getCliLatencyMetrics('gemini'),
      codex: this.getCliLatencyMetrics('codex'),
    };
  }

  /**
   * Gets reliability metrics broken down by CLI.
   */
  private getReliabilityByCli(): CliBreakdown<ReliabilityMetrics> {
    return {
      claude: this.getCliReliabilityMetrics('claude'),
      gemini: this.getCliReliabilityMetrics('gemini'),
      codex: this.getCliReliabilityMetrics('codex'),
    };
  }

  /**
   * Gets token metrics broken down by CLI.
   */
  private getTokensByCli(): CliBreakdown<TokenMetrics> {
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
