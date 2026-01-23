/**
 * nexus-agents/swe-bench - Evaluation Statistics Types
 *
 * Statistical summary and metrics types for evaluation reports.
 *
 * @module swe-bench/evaluation-statistics-types
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

/**
 * Statistical summary with distribution info.
 */
export interface StatisticalSummary {
  /** Minimum value. */
  readonly min: number;
  /** Maximum value. */
  readonly max: number;
  /** Mean (average). */
  readonly mean: number;
  /** Median (50th percentile). */
  readonly median: number;
  /** Standard deviation. */
  readonly stdDev: number;
  /** 25th percentile. */
  readonly p25: number;
  /** 75th percentile. */
  readonly p75: number;
  /** 90th percentile. */
  readonly p90: number;
  /** 95th percentile. */
  readonly p95: number;
  /** Sample count. */
  readonly count: number;
}

/**
 * Timing statistics for evaluation.
 */
export interface TimingStatistics {
  /** Per-instance duration stats (ms). */
  readonly instanceDuration: StatisticalSummary;
  /** Total wall-clock time (ms). */
  readonly totalWallTime: number;
  /** Total CPU time (ms). */
  readonly totalCpuTime?: number;
  /** Time spent applying patches (ms). */
  readonly patchApplicationTime: number;
  /** Time spent running tests (ms). */
  readonly testExecutionTime: number;
}

/**
 * Resource usage statistics.
 */
export interface ResourceStatistics {
  /** Peak memory usage (bytes). */
  readonly peakMemory: number;
  /** Average memory usage (bytes). */
  readonly avgMemory: number;
  /** Total disk space used (bytes). */
  readonly diskSpaceUsed: number;
  /** Number of Docker containers created. */
  readonly containersCreated: number;
}
