/**
 * nexus-agents/benchmarks - Type Definitions
 *
 * Types for performance benchmarking and metrics collection.
 *
 * @module benchmarks/benchmark-types
 * (Source: Issue #156, Mem0 metrics validation)
 */

/**
 * Latency percentile metrics.
 */
export interface LatencyMetrics {
  /** Minimum latency in milliseconds. */
  readonly min: number;
  /** Maximum latency in milliseconds. */
  readonly max: number;
  /** Mean latency in milliseconds. */
  readonly mean: number;
  /** 50th percentile (median) in milliseconds. */
  readonly p50: number;
  /** 75th percentile in milliseconds. */
  readonly p75: number;
  /** 90th percentile in milliseconds. */
  readonly p90: number;
  /** 95th percentile in milliseconds. */
  readonly p95: number;
  /** 99th percentile in milliseconds. */
  readonly p99: number;
  /** Standard deviation in milliseconds. */
  readonly stdDev: number;
  /** Total number of samples. */
  readonly sampleCount: number;
}

/**
 * Throughput metrics.
 */
export interface ThroughputMetrics {
  /** Operations per second. */
  readonly opsPerSecond: number;
  /** Total operations completed. */
  readonly totalOps: number;
  /** Total duration in milliseconds. */
  readonly durationMs: number;
}

/**
 * Token usage metrics.
 */
export interface TokenMetrics {
  /** Total input tokens. */
  readonly inputTokens: number;
  /** Total output tokens. */
  readonly outputTokens: number;
  /** Total tokens (input + output). */
  readonly totalTokens: number;
  /** Average tokens per operation. */
  readonly avgTokensPerOp: number;
}

/**
 * Quality metrics for retrieval operations.
 */
export interface QualityMetrics {
  /** Precision: relevant retrieved / total retrieved. */
  readonly precision: number;
  /** Recall: relevant retrieved / total relevant. */
  readonly recall: number;
  /** F1 score: harmonic mean of precision and recall. */
  readonly f1Score: number;
  /** Mean reciprocal rank. */
  readonly mrr: number;
  /** Normalized discounted cumulative gain at k. */
  readonly ndcgAtK: number;
}

/**
 * Resource usage metrics.
 */
export interface ResourceMetrics {
  /** Peak memory usage in bytes. */
  readonly peakMemoryBytes: number;
  /** Average memory usage in bytes. */
  readonly avgMemoryBytes: number;
  /** CPU time in milliseconds. */
  readonly cpuTimeMs: number;
  /** Database file size in bytes (if applicable). */
  readonly dbSizeBytes?: number;
}

/**
 * Benchmark result for a single operation type.
 */
export interface OperationBenchmark {
  /** Operation name. */
  readonly operation: string;
  /** Dataset size used. */
  readonly datasetSize: number;
  /** Latency metrics. */
  readonly latency: LatencyMetrics;
  /** Throughput metrics. */
  readonly throughput: ThroughputMetrics;
  /** Resource metrics. */
  readonly resources: ResourceMetrics;
  /** Quality metrics (for retrieval operations). */
  readonly quality?: QualityMetrics;
  /** Timestamp when benchmark was run. */
  readonly timestamp: string;
}

/**
 * Complete benchmark suite result.
 */
export interface BenchmarkSuiteResult {
  /** Suite name. */
  readonly name: string;
  /** Component being benchmarked. */
  readonly component: string;
  /** Version of the component. */
  readonly version: string;
  /** Individual operation benchmarks. */
  readonly operations: readonly OperationBenchmark[];
  /** Environment information. */
  readonly environment: BenchmarkEnvironment;
  /** Overall summary. */
  readonly summary: BenchmarkSummary;
}

/**
 * Benchmark environment information.
 */
export interface BenchmarkEnvironment {
  /** Node.js version. */
  readonly nodeVersion: string;
  /** Platform. */
  readonly platform: string;
  /** Architecture. */
  readonly arch: string;
  /** CPU model. */
  readonly cpuModel: string;
  /** CPU cores. */
  readonly cpuCores: number;
  /** Total memory in bytes. */
  readonly totalMemory: number;
}

/**
 * Benchmark summary.
 */
export interface BenchmarkSummary {
  /** Total benchmark duration in milliseconds. */
  readonly totalDurationMs: number;
  /** Total operations run. */
  readonly totalOperations: number;
  /** Overall throughput. */
  readonly overallThroughput: number;
  /** Average p95 latency across operations. */
  readonly avgP95Latency: number;
  /** Pass/fail status based on thresholds. */
  readonly passed: boolean;
  /** Failures if any. */
  readonly failures: readonly string[];
}

/**
 * Configuration for running benchmarks.
 */
export interface BenchmarkConfig {
  /** Dataset sizes to test. */
  readonly datasetSizes: readonly number[];
  /** Number of warmup iterations. */
  readonly warmupIterations: number;
  /** Number of measurement iterations per size. */
  readonly measurementIterations: number;
  /** Timeout per operation in milliseconds. */
  readonly timeoutMs: number;
  /** Thresholds for pass/fail. */
  readonly thresholds: BenchmarkThresholds;
}

/**
 * Pass/fail thresholds.
 */
export interface BenchmarkThresholds {
  /** Maximum acceptable p95 latency in milliseconds. */
  readonly maxP95LatencyMs: number;
  /** Minimum acceptable throughput (ops/sec). */
  readonly minThroughput: number;
  /** Maximum acceptable memory usage in bytes. */
  readonly maxMemoryBytes: number;
  /** Minimum precision for retrieval (0-1). */
  readonly minPrecision?: number;
  /** Minimum recall for retrieval (0-1). */
  readonly minRecall?: number;
}

/**
 * Default benchmark configuration.
 */
export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  datasetSizes: [100, 1000, 10000],
  warmupIterations: 10,
  measurementIterations: 100,
  timeoutMs: 30000,
  thresholds: {
    maxP95LatencyMs: 100,
    minThroughput: 100,
    maxMemoryBytes: 512 * 1024 * 1024, // 512MB
    minPrecision: 0.8,
    minRecall: 0.7,
  },
};
