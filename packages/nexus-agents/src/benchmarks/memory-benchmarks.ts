/**
 * nexus-agents/benchmarks - Memory Backend Benchmarks
 *
 * Benchmarks for memory backend operations (store, retrieve, search, prune).
 * Validates Mem0 claimed metrics: 91% lower p95 latency, 90% token savings.
 *
 * @module benchmarks/memory-benchmarks
 * (Source: Issue #156, arXiv:2504.19413)
 */

import { createLogger, getTimeProvider } from '../core/index.js';
import type {
  BenchmarkSuiteResult,
  OperationBenchmark,
  QualityMetrics,
} from './benchmark-types.js';
import { DEFAULT_BENCHMARK_CONFIG } from './benchmark-types.js';
import {
  runOperationBenchmark,
  getBenchmarkEnvironment,
  createBenchmarkSummary,
} from './benchmark-runner.js';
import type { IMemoryBackend } from '../context/memory-backend-types.js';
import {
  generateTestData,
  calculatePatternMetrics,
  computeAverageMetrics,
  createOperationComparison,
  calculateAverageLatencyImprovement,
  type TestDataSet,
  type TestEntry,
  type MemoryBenchmarkConfig,
  type BenchmarkComparison,
  type OperationComparison,
} from './memory-benchmarks-helpers.js';

// Re-export types and helpers for external consumers
export type { MemoryBenchmarkConfig, BenchmarkComparison, OperationComparison };
export { formatComparisonResults } from './memory-benchmarks-helpers.js';

const logger = createLogger({ component: 'memory-benchmarks' });

/**
 * Default memory benchmark configuration.
 */
export const DEFAULT_MEMORY_BENCHMARK_CONFIG: MemoryBenchmarkConfig = {
  ...DEFAULT_BENCHMARK_CONFIG,
  contentSizeBytes: 1024,
  tagsPerEntry: 5,
  searchPatterns: ['test', 'memory', 'benchmark', 'data', 'entry'],
};

/**
 * Run store operation benchmark.
 */
async function benchmarkStore(
  backend: IMemoryBackend,
  data: TestDataSet,
  config: MemoryBenchmarkConfig
): Promise<OperationBenchmark> {
  let dataIndex = 0;

  return runOperationBenchmark(
    'store',
    data.size,
    async () => {
      const entry = data.entries[dataIndex % data.entries.length];
      if (entry === undefined) return;

      await backend.store(entry.key, entry.content, {
        tags: entry.tags,
        importance: 'medium',
      });

      dataIndex++;
    },
    config
  );
}

/**
 * Run retrieve operation benchmark.
 */
async function benchmarkRetrieve(
  backend: IMemoryBackend,
  data: TestDataSet,
  config: MemoryBenchmarkConfig
): Promise<OperationBenchmark> {
  // First, store all data
  for (const entry of data.entries) {
    await backend.store(entry.key, entry.content, {
      tags: entry.tags,
      importance: 'medium',
    });
  }

  let dataIndex = 0;

  return runOperationBenchmark(
    'retrieve',
    data.size,
    async () => {
      const entry = data.entries[dataIndex % data.entries.length];
      if (entry === undefined) return;

      await backend.retrieve(entry.key);
      dataIndex++;
    },
    config
  );
}

/**
 * Measure search quality metrics.
 */
async function measureSearchQuality(
  backend: IMemoryBackend,
  data: TestDataSet,
  config: MemoryBenchmarkConfig
): Promise<QualityMetrics> {
  let totalPrecision = 0;
  let totalRecall = 0;
  let totalMrr = 0;
  let queries = 0;

  for (const pattern of config.searchPatterns) {
    const relevant = data.entries.filter(
      (e: TestEntry) => e.content.includes(pattern) || e.tags.includes(pattern)
    );

    if (relevant.length === 0) continue;

    const searchResult = await backend.search(pattern, 10);
    if (!searchResult.ok) continue;

    const retrieved = searchResult.value.map((r) => r.key);
    const metrics = calculatePatternMetrics(retrieved, relevant);

    totalPrecision += metrics.precision;
    totalRecall += metrics.recall;
    totalMrr += metrics.mrr;
    queries++;
  }

  return computeAverageMetrics(totalPrecision, totalRecall, totalMrr, queries);
}

/**
 * Run search operation benchmark.
 */
async function benchmarkSearch(
  backend: IMemoryBackend,
  data: TestDataSet,
  config: MemoryBenchmarkConfig
): Promise<OperationBenchmark> {
  // First, store all data
  for (const entry of data.entries) {
    await backend.store(entry.key, entry.content, {
      tags: entry.tags,
      importance: 'medium',
    });
  }

  let patternIndex = 0;

  const benchmark = await runOperationBenchmark(
    'search',
    data.size,
    async () => {
      const pattern = config.searchPatterns[patternIndex % config.searchPatterns.length];
      if (pattern === undefined) return;

      await backend.search(pattern, 10);
      patternIndex++;
    },
    config
  );

  // Add quality metrics for search
  const quality = await measureSearchQuality(backend, data, config);

  return { ...benchmark, quality };
}

/**
 * Run prune operation benchmark.
 */
async function benchmarkPrune(
  backend: IMemoryBackend,
  data: TestDataSet,
  config: MemoryBenchmarkConfig
): Promise<OperationBenchmark> {
  // Store data for pruning test
  for (const entry of data.entries) {
    await backend.store(entry.key, entry.content, {
      tags: entry.tags,
      importance: 'low',
    });
  }

  return runOperationBenchmark(
    'prune',
    data.size,
    async () => {
      // Prune entries older than 1 day
      const pruneDate = new Date(getTimeProvider().now() - 24 * 60 * 60 * 1000);
      await backend.prune(pruneDate);
    },
    { ...config, measurementIterations: 10 } // Fewer iterations for destructive operation
  );
}

/**
 * Run all memory backend benchmarks.
 */
export async function runMemoryBenchmarks(
  backend: IMemoryBackend,
  name: string,
  config: Partial<MemoryBenchmarkConfig> = {}
): Promise<BenchmarkSuiteResult> {
  const cfg: MemoryBenchmarkConfig = { ...DEFAULT_MEMORY_BENCHMARK_CONFIG, ...config };
  const operations: OperationBenchmark[] = [];

  logger.info('Starting memory benchmarks', { name, sizes: cfg.datasetSizes });

  for (const size of cfg.datasetSizes) {
    logger.info('Running benchmarks for dataset size', { size });

    // Generate test data
    const data = generateTestData(size, cfg);

    // Clear backend before each size using prune with future date
    // This removes all entries regardless of age
    try {
      const futureDate = new Date(getTimeProvider().now() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
      await backend.prune(futureDate);
    } catch {
      // Ignore if prune fails
    }

    // Run benchmarks
    operations.push(await benchmarkStore(backend, data, cfg));
    operations.push(await benchmarkRetrieve(backend, data, cfg));
    operations.push(await benchmarkSearch(backend, data, cfg));
    operations.push(await benchmarkPrune(backend, data, cfg));
  }

  const environment = getBenchmarkEnvironment();
  const summary = createBenchmarkSummary(operations, cfg);

  logger.info('Benchmarks complete', {
    name,
    passed: summary.passed,
    avgP95: summary.avgP95Latency,
    throughput: summary.overallThroughput,
  });

  return {
    name: `Memory Backend: ${name}`,
    component: 'memory-backend',
    version: '2.0.0',
    operations,
    environment,
    summary,
  };
}

/**
 * Compare benchmarks between two backends.
 */
export function compareBenchmarks(
  baseline: BenchmarkSuiteResult,
  current: BenchmarkSuiteResult
): BenchmarkComparison {
  const comparisons: OperationComparison[] = [];

  for (const currentOp of current.operations) {
    const baselineOp = baseline.operations.find(
      (op) => op.operation === currentOp.operation && op.datasetSize === currentOp.datasetSize
    );

    if (baselineOp !== undefined) {
      comparisons.push(
        createOperationComparison({
          operation: currentOp.operation,
          datasetSize: currentOp.datasetSize,
          baselineP95: baselineOp.latency.p95,
          currentP95: currentOp.latency.p95,
          baselineThroughput: baselineOp.throughput.opsPerSecond,
          currentThroughput: currentOp.throughput.opsPerSecond,
        })
      );
    }
  }

  // Calculate overall improvement
  const avgLatencyImprovement = calculateAverageLatencyImprovement(comparisons);

  return {
    baseline: baseline.name,
    current: current.name,
    comparisons,
    overallLatencyChangePercent: avgLatencyImprovement,
    meetsMemZeroTarget: avgLatencyImprovement <= -91, // Mem0 claims 91% lower latency
  };
}
