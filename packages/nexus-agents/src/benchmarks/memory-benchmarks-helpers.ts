/**
 * nexus-agents/benchmarks - Memory Benchmark Helper Functions
 *
 * Pure helper functions for memory benchmarks: test data generation,
 * metrics calculation, and comparison utilities.
 *
 * @module benchmarks/memory-benchmarks-helpers
 */

import { randomUUID } from 'node:crypto';
import { getRandomProvider } from '../core/index.js';
import type { QualityMetrics, BenchmarkConfig } from './benchmark-types.js';

/**
 * Test data entry.
 */
export interface TestEntry {
  readonly key: string;
  readonly content: string;
  readonly tags: string[];
}

/**
 * Test data set.
 */
export interface TestDataSet {
  readonly entries: readonly TestEntry[];
  readonly size: number;
}

/**
 * Pattern metrics result.
 */
export interface PatternMetrics {
  readonly precision: number;
  readonly recall: number;
  readonly mrr: number;
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
 * Memory benchmark configuration extending base benchmark config.
 */
export interface MemoryBenchmarkConfig extends BenchmarkConfig {
  /** Size of content in bytes. */
  readonly contentSizeBytes: number;
  /** Number of tags per entry. */
  readonly tagsPerEntry: number;
  /** Search query patterns. */
  readonly searchPatterns: readonly string[];
}

// Default word list for test data generation
const BENCHMARK_WORDS = ['memory', 'test', 'benchmark', 'data', 'entry', 'performance', 'latency'];

/**
 * Generate content with specified size.
 */
export function generateContent(
  sizeBytes: number,
  words: readonly string[] = BENCHMARK_WORDS
): string {
  const parts: string[] = [];
  let currentSize = 0;

  while (currentSize < sizeBytes) {
    const word = words[Math.floor(getRandomProvider().random() * words.length)] ?? 'data';
    parts.push(word);
    currentSize += word.length + 1;
  }

  return parts.join(' ').slice(0, sizeBytes);
}

/**
 * Generate tags.
 */
export function generateTags(count: number, words: readonly string[] = BENCHMARK_WORDS): string[] {
  const tags: string[] = [];
  for (let i = 0; i < count; i++) {
    tags.push(words[Math.floor(getRandomProvider().random() * words.length)] ?? 'tag');
  }
  return tags;
}

/**
 * Generate test data for benchmarks.
 */
export function generateTestData(size: number, config: MemoryBenchmarkConfig): TestDataSet {
  const entries: TestEntry[] = [];

  for (let i = 0; i < size; i++) {
    const key = `bench-${randomUUID()}`;
    const content = generateContent(config.contentSizeBytes, BENCHMARK_WORDS);
    const tags = generateTags(config.tagsPerEntry, BENCHMARK_WORDS);

    entries.push({ key, content, tags });
  }

  return { entries, size };
}

/**
 * Calculate metrics for a single search pattern.
 */
export function calculatePatternMetrics(
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
export function computeAverageMetrics(
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

/** Options for creating an operation comparison. */
export interface OperationComparisonOptions {
  readonly operation: string;
  readonly datasetSize: number;
  readonly baselineP95: number;
  readonly currentP95: number;
  readonly baselineThroughput: number;
  readonly currentThroughput: number;
}

/**
 * Create operation comparison from baseline and current benchmarks.
 */
export function createOperationComparison(
  options: OperationComparisonOptions
): OperationComparison {
  const { operation, datasetSize, baselineP95, currentP95, baselineThroughput, currentThroughput } =
    options;
  const latencyChangePercent = ((currentP95 - baselineP95) / baselineP95) * 100;
  const throughputChangePercent =
    ((currentThroughput - baselineThroughput) / baselineThroughput) * 100;

  return {
    operation,
    datasetSize,
    baselineP95,
    currentP95,
    latencyChangePercent,
    baselineThroughput,
    currentThroughput,
    throughputChangePercent,
    improved: latencyChangePercent < 0 || throughputChangePercent > 0,
  };
}

/**
 * Calculate average latency improvement from comparisons.
 */
export function calculateAverageLatencyImprovement(
  comparisons: readonly OperationComparison[]
): number {
  if (comparisons.length === 0) return 0;
  return comparisons.reduce((sum, c) => sum + c.latencyChangePercent, 0) / comparisons.length;
}

/**
 * Format comparison results as a human-readable string.
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
