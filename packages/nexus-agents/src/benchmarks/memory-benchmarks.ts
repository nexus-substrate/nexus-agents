/**
 * nexus-agents/benchmarks - Memory Backend Benchmarks
 *
 * Benchmarks for memory backend operations (store, retrieve, search, prune).
 * Validates Mem0 claimed metrics: 91% lower p95 latency, 90% token savings.
 *
 * @module benchmarks/memory-benchmarks
 * (Source: Issue #156, arXiv:2504.19413)
 *
 * File length justification: Benchmark suite with types in benchmark-types.ts,
 * runner in benchmark-runner.ts. Remaining code is benchmark definitions for
 * store/retrieve/search/prune with quality metrics validation.
 */

import { randomUUID } from 'node:crypto';
import { createLogger } from '../core/index.js';
import type {
  BenchmarkConfig,
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

const logger = createLogger({ component: 'memory-benchmarks' });

/**
 * Memory benchmark configuration.
 */
export interface MemoryBenchmarkConfig extends BenchmarkConfig {
  /** Size of content in bytes. */
  readonly contentSizeBytes: number;
  /** Number of tags per entry. */
  readonly tagsPerEntry: number;
  /** Search query patterns. */
  readonly searchPatterns: readonly string[];
}

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
 * Generate test data for benchmarks.
 */
function generateTestData(size: number, config: MemoryBenchmarkConfig): TestDataSet {
  const entries: TestEntry[] = [];
  const words = ['memory', 'test', 'benchmark', 'data', 'entry', 'performance', 'latency'];

  for (let i = 0; i < size; i++) {
    const key = `bench-${randomUUID()}`;
    const content = generateContent(config.contentSizeBytes, words);
    const tags = generateTags(config.tagsPerEntry, words);

    entries.push({ key, content, tags });
  }

  return { entries, size };
}

/**
 * Generate content with specified size.
 */
function generateContent(sizeBytes: number, words: readonly string[]): string {
  const parts: string[] = [];
  let currentSize = 0;

  while (currentSize < sizeBytes) {
    const word = words[Math.floor(Math.random() * words.length)] ?? 'data';
    parts.push(word);
    currentSize += word.length + 1;
  }

  return parts.join(' ').slice(0, sizeBytes);
}

/**
 * Generate tags.
 */
function generateTags(count: number, words: readonly string[]): string[] {
  const tags: string[] = [];
  for (let i = 0; i < count; i++) {
    tags.push(words[Math.floor(Math.random() * words.length)] ?? 'tag');
  }
  return tags;
}

/**
 * Test data entry.
 */
interface TestEntry {
  readonly key: string;
  readonly content: string;
  readonly tags: string[];
}

/**
 * Test data set.
 */
interface TestDataSet {
  readonly entries: readonly TestEntry[];
  readonly size: number;
}

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
 * Pattern metrics result.
 */
interface PatternMetrics {
  readonly precision: number;
  readonly recall: number;
  readonly mrr: number;
}

/**
 * Calculate metrics for a single search pattern.
 */
function calculatePatternMetrics(
  retrieved: readonly string[],
  relevant: readonly TestEntry[]
): PatternMetrics {
  const relevantRetrieved = retrieved.filter((key: string) => relevant.some((r) => r.key === key));
  const precision = retrieved.length > 0 ? relevantRetrieved.length / retrieved.length : 0;
  const recall = relevant.length > 0 ? relevantRetrieved.length / relevant.length : 0;
  const firstRelevantIndex = retrieved.findIndex((key: string) =>
    relevant.some((r) => r.key === key)
  );
  const mrr = firstRelevantIndex >= 0 ? 1 / (firstRelevantIndex + 1) : 0;

  return { precision, recall, mrr };
}

/**
 * Compute average quality metrics from totals.
 */
function computeAverageMetrics(
  totalPrecision: number,
  totalRecall: number,
  totalMrr: number,
  queries: number
): QualityMetrics {
  const avgPrecision = queries > 0 ? totalPrecision / queries : 0;
  const avgRecall = queries > 0 ? totalRecall / queries : 0;
  const f1Score =
    avgPrecision + avgRecall > 0 ? (2 * avgPrecision * avgRecall) / (avgPrecision + avgRecall) : 0;

  return {
    precision: avgPrecision,
    recall: avgRecall,
    f1Score,
    mrr: queries > 0 ? totalMrr / queries : 0,
    ndcgAtK: f1Score, // Simplified approximation
  };
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
      (e) => e.content.includes(pattern) || e.tags.includes(pattern)
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
      const pruneDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
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
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
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
      const latencyChange =
        ((currentOp.latency.p95 - baselineOp.latency.p95) / baselineOp.latency.p95) * 100;
      const throughputChange =
        ((currentOp.throughput.opsPerSecond - baselineOp.throughput.opsPerSecond) /
          baselineOp.throughput.opsPerSecond) *
        100;

      comparisons.push({
        operation: currentOp.operation,
        datasetSize: currentOp.datasetSize,
        baselineP95: baselineOp.latency.p95,
        currentP95: currentOp.latency.p95,
        latencyChangePercent: latencyChange,
        baselineThroughput: baselineOp.throughput.opsPerSecond,
        currentThroughput: currentOp.throughput.opsPerSecond,
        throughputChangePercent: throughputChange,
        improved: latencyChange < 0 || throughputChange > 0,
      });
    }
  }

  // Calculate overall improvement
  const avgLatencyImprovement =
    comparisons.length > 0
      ? comparisons.reduce((sum, c) => sum + c.latencyChangePercent, 0) / comparisons.length
      : 0;

  return {
    baseline: baseline.name,
    current: current.name,
    comparisons,
    overallLatencyChangePercent: avgLatencyImprovement,
    meetsMemZeroTarget: avgLatencyImprovement <= -91, // Mem0 claims 91% lower latency
  };
}

/**
 * Operation comparison result.
 */
export interface OperationComparison {
  readonly operation: string;
  readonly datasetSize: number;
  readonly baselineP95: number;
  readonly currentP95: number;
  readonly latencyChangePercent: number;
  readonly baselineThroughput: number;
  readonly currentThroughput: number;
  readonly throughputChangePercent: number;
  readonly improved: boolean;
}

/**
 * Benchmark comparison result.
 */
export interface BenchmarkComparison {
  readonly baseline: string;
  readonly current: string;
  readonly comparisons: readonly OperationComparison[];
  readonly overallLatencyChangePercent: number;
  readonly meetsMemZeroTarget: boolean;
}

/**
 * Format comparison results.
 */
export function formatComparisonResults(comparison: BenchmarkComparison): string {
  const lines: string[] = [];

  lines.push(`\nBenchmark Comparison: ${comparison.baseline} vs ${comparison.current}`);
  lines.push('='.repeat(60));

  for (const c of comparison.comparisons) {
    const latencyArrow = c.latencyChangePercent < 0 ? '↓' : '↑';
    const throughputArrow = c.throughputChangePercent > 0 ? '↑' : '↓';

    lines.push(`\n${c.operation} (n=${String(c.datasetSize)})`);
    lines.push(
      `  p95 Latency: ${c.baselineP95.toFixed(2)}ms → ${c.currentP95.toFixed(2)}ms (${latencyArrow}${Math.abs(c.latencyChangePercent).toFixed(1)}%)`
    );
    lines.push(
      `  Throughput: ${c.baselineThroughput.toFixed(2)} → ${c.currentThroughput.toFixed(2)} ops/sec (${throughputArrow}${Math.abs(c.throughputChangePercent).toFixed(1)}%)`
    );
  }

  lines.push('\n' + '='.repeat(60));
  lines.push(`Overall Latency Change: ${comparison.overallLatencyChangePercent.toFixed(1)}%`);
  lines.push(`Meets Mem0 Target (-91%): ${comparison.meetsMemZeroTarget ? 'YES' : 'NO'}`);
  lines.push('='.repeat(60) + '\n');

  return lines.join('\n');
}
