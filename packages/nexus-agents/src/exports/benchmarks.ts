/**
 * Benchmarks barrel exports
 *
 * Exposes the BenchmarkAdapter contract (#1960, #1961) and the existing
 * memory/token/adapter-latency benchmark utilities to external consumers.
 *
 * @module exports/benchmarks
 */

// Disambiguate `estimateTokens` — benchmarks and agents/ictm each define
// one. The benchmarks version is a 4-char/token heuristic tied to Mem0
// memory metrics; ictm's is the context-curator variant. External
// consumers should use `estimateBenchmarkTokens` for the memory-metric
// flavor.
export {
  calculateTokenMetrics,
  runTokenBenchmark,
  estimateTokens as estimateBenchmarkTokens,
} from '../benchmarks/token-benchmark.js';

// Memory benchmarks
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
} from '../benchmarks/benchmark-types.js';
export { DEFAULT_BENCHMARK_CONFIG } from '../benchmarks/benchmark-types.js';
export {
  LatencySampler,
  runOperationBenchmark,
  getBenchmarkEnvironment,
  createBenchmarkSummary,
  formatBenchmarkResults,
} from '../benchmarks/benchmark-runner.js';
export type { BenchmarkOperation } from '../benchmarks/benchmark-runner.js';
export type {
  MemoryBenchmarkConfig,
  OperationComparison,
  BenchmarkComparison,
} from '../benchmarks/memory-benchmarks.js';
// Re-export IMemoryBackend and its transitive surface because they're the
// parameter types of `runMemoryBenchmarks` in the public surface; without
// these, TypeDoc warns that the referenced types are not included.
export type {
  IMemoryBackend,
  MemoryEntry,
  MemoryMetadata,
  MemoryImportance,
} from '../context/memory-backend-types.js';
export { MemoryError } from '../context/memory-backend-types.js';
export {
  DEFAULT_MEMORY_BENCHMARK_CONFIG,
  runMemoryBenchmarks,
  compareBenchmarks,
  formatComparisonResults,
} from '../benchmarks/memory-benchmarks.js';
export type { TokenBenchmarkResult } from '../benchmarks/token-benchmark.js';

// Consolidation benchmarks
export type {
  ConsolidationOperation,
  ConsolidationBenchmarkResult,
} from '../benchmarks/consolidation-benchmark.js';
export {
  runConsolidationBenchmark,
  createPromotionOp,
  createDecayOp,
} from '../benchmarks/consolidation-benchmark.js';

// Benchmark report
export type {
  ClaimValidation,
  BenchmarkReport,
  ReportOptions,
} from '../benchmarks/benchmark-report.js';
export {
  MEM0_TARGETS,
  generateBenchmarkReport,
  formatBenchmarkReport,
} from '../benchmarks/benchmark-report.js';

// Adapter latency benchmarks
export type {
  AdapterLatencyConfig,
  LatencyScenario,
  AdapterScenarioResult,
  AdapterLatencyResult,
} from '../benchmarks/adapter-latency-benchmark.js';
export {
  DEFAULT_ADAPTER_LATENCY_CONFIG,
  DEFAULT_SCENARIOS,
  runAdapterLatencyBenchmark,
  formatAdapterLatencyReport,
  toSuiteResult,
} from '../benchmarks/adapter-latency-benchmark.js';

// BenchmarkAdapter public contract (#1960) — external benchmark repos
// (nexus-eval-swebench, nexus-eval-safety, etc.) implement this.
export type {
  BenchmarkAdapter,
  BenchmarkRunContext,
  BenchmarkRunSummary,
} from '../benchmarks/adapter.js';
export { NOOP_PROGRESS } from '../benchmarks/adapter.js';
export type { BenchmarkOrchestratorOptions } from '../benchmarks/orchestrator.js';
export { runBenchmark } from '../benchmarks/orchestrator.js';
