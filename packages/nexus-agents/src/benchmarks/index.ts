/**
 * nexus-agents/benchmarks - Module Exports
 *
 * Performance benchmarking for memory backends and other components,
 * plus the `BenchmarkAdapter` contract for pluggable benchmark integrations
 * (SWE-bench, ATBench, etc.).
 *
 * @module benchmarks
 * (Source: Issue #156, Mem0 metrics validation; Issue #1960, adapter contract;
 *  Issue #1981, ATBench trajectory safety)
 */

// ATBench was extracted to nexus-eval-atbench per the harness-extraction
// policy (epic #2514). Import from 'nexus-eval-atbench' instead of
// 'nexus-agents/benchmarks/atbench'.

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

// Token benchmarks (Issue #462)
export type { TokenBenchmarkResult } from './token-benchmark.js';
export { estimateTokens, calculateTokenMetrics, runTokenBenchmark } from './token-benchmark.js';

// Consolidation benchmarks (Issue #462)
export type {
  ConsolidationOperation,
  ConsolidationBenchmarkResult,
} from './consolidation-benchmark.js';
export {
  runConsolidationBenchmark,
  createPromotionOp,
  createDecayOp,
} from './consolidation-benchmark.js';

// Benchmark report (Issue #462)
export type { ClaimValidation, BenchmarkReport, ReportOptions } from './benchmark-report.js';
export {
  MEM0_TARGETS,
  generateBenchmarkReport,
  formatBenchmarkReport,
} from './benchmark-report.js';

// Adapter latency benchmarks (Issue #694)
export type {
  AdapterLatencyConfig,
  LatencyScenario,
  AdapterScenarioResult,
  AdapterLatencyResult,
} from './adapter-latency-benchmark.js';
export {
  DEFAULT_ADAPTER_LATENCY_CONFIG,
  DEFAULT_SCENARIOS,
  runAdapterLatencyBenchmark,
  formatAdapterLatencyReport,
  toSuiteResult,
} from './adapter-latency-benchmark.js';

// BenchmarkAdapter public contract (#1960) — external benchmark repos
// (nexus-eval-swebench, nexus-eval-safety, etc.) implement this.
export type { BenchmarkAdapter, BenchmarkRunContext, BenchmarkRunSummary } from './adapter.js';
export { NOOP_PROGRESS } from './adapter.js';
export type { BenchmarkOrchestratorOptions } from './orchestrator.js';
export { runBenchmark } from './orchestrator.js';
