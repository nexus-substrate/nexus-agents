/**
 * nexus-agents/benchmarks - Benchmark Runner
 *
 * Utilities for running benchmarks and collecting metrics.
 *
 * @module benchmarks/benchmark-runner
 * (Source: Issue #156, Mem0 metrics validation)
 */

import { cpus, totalmem, platform, arch } from 'node:os';
import { createLogger } from '../core/index.js';
import type {
  LatencyMetrics,
  ThroughputMetrics,
  ResourceMetrics,
  OperationBenchmark,
  BenchmarkConfig,
  BenchmarkEnvironment,
  BenchmarkSummary,
  BenchmarkSuiteResult,
} from './benchmark-types.js';
import { DEFAULT_BENCHMARK_CONFIG } from './benchmark-types.js';

const logger = createLogger({ component: 'benchmark-runner' });

/**
 * Sample collector for latency measurements.
 */
export class LatencySampler {
  private readonly samples: number[] = [];
  private readonly startTimes: Map<string, bigint> = new Map();

  /**
   * Start timing an operation.
   */
  start(id: string): void {
    this.startTimes.set(id, process.hrtime.bigint());
  }

  /**
   * End timing and record the sample.
   */
  end(id: string): number {
    const startTime = this.startTimes.get(id);
    if (startTime === undefined) {
      throw new Error(`No start time for ${id}`);
    }

    const endTime = process.hrtime.bigint();
    const durationNs = Number(endTime - startTime);
    const durationMs = durationNs / 1_000_000;

    this.samples.push(durationMs);
    this.startTimes.delete(id);

    return durationMs;
  }

  /**
   * Record a sample directly.
   */
  record(durationMs: number): void {
    this.samples.push(durationMs);
  }

  /**
   * Calculate latency metrics from collected samples.
   */
  getMetrics(): LatencyMetrics {
    if (this.samples.length === 0) {
      return createEmptyLatencyMetrics();
    }

    const sorted = [...this.samples].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / sorted.length;

    // Calculate standard deviation
    const squaredDiffs = sorted.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / sorted.length;
    const stdDev = Math.sqrt(variance);

    return {
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      mean,
      p50: percentile(sorted, 50),
      p75: percentile(sorted, 75),
      p90: percentile(sorted, 90),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      stdDev,
      sampleCount: sorted.length,
    };
  }

  /**
   * Reset collected samples.
   */
  reset(): void {
    this.samples.length = 0;
    this.startTimes.clear();
  }
}

/**
 * Calculate percentile using linear interpolation.
 */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;

  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? 0;

  return lowerValue + fraction * (upperValue - lowerValue);
}

/**
 * Create empty latency metrics.
 */
function createEmptyLatencyMetrics(): LatencyMetrics {
  return {
    min: 0,
    max: 0,
    mean: 0,
    p50: 0,
    p75: 0,
    p90: 0,
    p95: 0,
    p99: 0,
    stdDev: 0,
    sampleCount: 0,
  };
}

/**
 * Benchmark operation function type.
 */
export type BenchmarkOperation = () => Promise<void> | void;

/**
 * Run a single operation benchmark.
 */
export async function runOperationBenchmark(
  operation: string,
  datasetSize: number,
  fn: BenchmarkOperation,
  config: Partial<BenchmarkConfig> = {}
): Promise<OperationBenchmark> {
  const cfg = { ...DEFAULT_BENCHMARK_CONFIG, ...config };
  const sampler = new LatencySampler();
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  let peakMemory = startMemory;

  // Warmup
  logger.debug('Running warmup', { operation, iterations: cfg.warmupIterations });
  for (let i = 0; i < cfg.warmupIterations; i++) {
    await fn();
  }

  // Measurement
  logger.debug('Running measurements', { operation, iterations: cfg.measurementIterations });
  for (let i = 0; i < cfg.measurementIterations; i++) {
    const id = `op-${String(i)}`;
    sampler.start(id);
    await fn();
    sampler.end(id);

    // Track peak memory
    const currentMemory = process.memoryUsage().heapUsed;
    if (currentMemory > peakMemory) {
      peakMemory = currentMemory;
    }
  }

  const endTime = Date.now();
  const durationMs = endTime - startTime;
  const latency = sampler.getMetrics();

  const throughput: ThroughputMetrics = {
    opsPerSecond: (cfg.measurementIterations / durationMs) * 1000,
    totalOps: cfg.measurementIterations,
    durationMs,
  };

  const resources: ResourceMetrics = {
    peakMemoryBytes: peakMemory,
    avgMemoryBytes: (startMemory + peakMemory) / 2,
    cpuTimeMs: durationMs, // Approximation
  };

  return {
    operation,
    datasetSize,
    latency,
    throughput,
    resources,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get benchmark environment information.
 */
export function getBenchmarkEnvironment(): BenchmarkEnvironment {
  const cpuInfo = cpus();
  return {
    nodeVersion: process.version,
    platform: platform(),
    arch: arch(),
    cpuModel: cpuInfo[0]?.model ?? 'Unknown',
    cpuCores: cpuInfo.length,
    totalMemory: totalmem(),
  };
}

/**
 * Create benchmark summary from operations.
 */
export function createBenchmarkSummary(
  operations: readonly OperationBenchmark[],
  config: Partial<BenchmarkConfig> = {}
): BenchmarkSummary {
  const cfg = { ...DEFAULT_BENCHMARK_CONFIG, ...config };
  const failures: string[] = [];

  // Calculate aggregates
  const totalDurationMs = operations.reduce((sum, op) => sum + op.throughput.durationMs, 0);
  const totalOps = operations.reduce((sum, op) => sum + op.throughput.totalOps, 0);
  const overallThroughput = totalOps / (totalDurationMs / 1000);

  const p95Values = operations.map((op) => op.latency.p95);
  const avgP95Latency = p95Values.reduce((a, b) => a + b, 0) / p95Values.length;

  // Check thresholds
  for (const op of operations) {
    if (op.latency.p95 > cfg.thresholds.maxP95LatencyMs) {
      failures.push(
        `${op.operation}: p95 latency ${op.latency.p95.toFixed(2)}ms exceeds threshold`
      );
    }
    if (op.throughput.opsPerSecond < cfg.thresholds.minThroughput) {
      failures.push(
        `${op.operation}: throughput ${op.throughput.opsPerSecond.toFixed(2)} below threshold`
      );
    }
    if (op.resources.peakMemoryBytes > cfg.thresholds.maxMemoryBytes) {
      failures.push(
        `${op.operation}: memory ${String(op.resources.peakMemoryBytes)} exceeds threshold`
      );
    }
  }

  return {
    totalDurationMs,
    totalOperations: totalOps,
    overallThroughput,
    avgP95Latency,
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Format benchmark results for console output.
 */
export function formatBenchmarkResults(result: BenchmarkSuiteResult): string {
  const lines: string[] = [];

  lines.push(`\n${'='.repeat(60)}`);
  lines.push(`Benchmark Suite: ${result.name}`);
  lines.push(`Component: ${result.component} v${result.version}`);
  lines.push(`${'='.repeat(60)}\n`);

  // Environment
  lines.push('Environment:');
  lines.push(`  Node.js: ${result.environment.nodeVersion}`);
  lines.push(`  Platform: ${result.environment.platform} ${result.environment.arch}`);
  lines.push(
    `  CPU: ${result.environment.cpuModel} (${String(result.environment.cpuCores)} cores)`
  );
  lines.push(`  Memory: ${(result.environment.totalMemory / 1024 / 1024 / 1024).toFixed(1)} GB\n`);

  // Operations
  lines.push('Operations:');
  for (const op of result.operations) {
    lines.push(`\n  ${op.operation} (n=${String(op.datasetSize)})`);
    lines.push(
      `    Latency: p50=${op.latency.p50.toFixed(2)}ms, p95=${op.latency.p95.toFixed(2)}ms, p99=${op.latency.p99.toFixed(2)}ms`
    );
    lines.push(`    Throughput: ${op.throughput.opsPerSecond.toFixed(2)} ops/sec`);
    lines.push(`    Memory: ${(op.resources.peakMemoryBytes / 1024 / 1024).toFixed(2)} MB peak`);
  }

  // Summary
  lines.push(`\n${'='.repeat(60)}`);
  lines.push('Summary:');
  lines.push(`  Total Duration: ${result.summary.totalDurationMs.toFixed(2)}ms`);
  lines.push(`  Total Operations: ${String(result.summary.totalOperations)}`);
  lines.push(`  Overall Throughput: ${result.summary.overallThroughput.toFixed(2)} ops/sec`);
  lines.push(`  Average p95 Latency: ${result.summary.avgP95Latency.toFixed(2)}ms`);
  lines.push(`  Status: ${result.summary.passed ? 'PASSED' : 'FAILED'}`);

  if (result.summary.failures.length > 0) {
    lines.push('\nFailures:');
    for (const failure of result.summary.failures) {
      lines.push(`  - ${failure}`);
    }
  }

  lines.push(`${'='.repeat(60)}\n`);

  return lines.join('\n');
}
