/**
 * nexus-agents/benchmarks - Module Exports
 *
 * Performance benchmarking for memory backends and other components.
 *
 * @module benchmarks
 * (Source: Issue #156, Mem0 metrics validation)
 */

// Types
export type {
  LatencyMetrics,
  ThroughputMetrics,
  TokenMetrics,
  QualityMetrics,
  ResourceMetrics,
  OperationBenchmark,
  BenchmarkSuiteResult,
  BenchmarkEnvironment,
  BenchmarkSummary,
  BenchmarkConfig,
  BenchmarkThresholds,
} from './benchmark-types.js';
export { DEFAULT_BENCHMARK_CONFIG } from './benchmark-types.js';

// Benchmark runner utilities
export {
  LatencySampler,
  runOperationBenchmark,
  getBenchmarkEnvironment,
  createBenchmarkSummary,
  formatBenchmarkResults,
} from './benchmark-runner.js';
export type { BenchmarkOperation } from './benchmark-runner.js';

// Memory benchmarks
export type {
  MemoryBenchmarkConfig,
  OperationComparison,
  BenchmarkComparison,
} from './memory-benchmarks.js';
export {
  DEFAULT_MEMORY_BENCHMARK_CONFIG,
  runMemoryBenchmarks,
  compareBenchmarks,
  formatComparisonResults,
} from './memory-benchmarks.js';
