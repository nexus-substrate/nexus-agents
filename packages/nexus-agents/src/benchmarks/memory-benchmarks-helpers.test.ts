/**
 * nexus-agents/benchmarks - Memory Benchmark Helpers Tests
 *
 * Unit tests for the memory benchmark helper functions.
 *
 * @module benchmarks/memory-benchmarks-helpers.test
 */

import { describe, it, expect } from 'vitest';
import {
  generateContent,
  generateTags,
  generateTestData,
  calculatePatternMetrics,
  computeAverageMetrics,
  createOperationComparison,
  calculateAverageLatencyImprovement,
  formatComparisonResults,
  type MemoryBenchmarkConfig,
  type TestEntry,
  type OperationComparison,
  type BenchmarkComparison,
} from './memory-benchmarks-helpers.js';
import { DEFAULT_BENCHMARK_CONFIG } from './benchmark-types.js';

describe('generateContent', () => {
  it('should generate content of approximately requested size', () => {
    const content = generateContent(100);

    // Content should be within a small margin of requested size
    expect(content.length).toBeLessThanOrEqual(100);
    expect(content.length).toBeGreaterThan(90);
  });

  it('should generate content using default word list', () => {
    const content = generateContent(500);

    // Should contain at least some of the default words
    const defaultWords = ['memory', 'test', 'benchmark', 'data', 'entry', 'performance', 'latency'];
    const containsDefaultWord = defaultWords.some((word) => content.includes(word));
    expect(containsDefaultWord).toBe(true);
  });

  it('should generate content using custom word list', () => {
    const customWords = ['alpha', 'beta', 'gamma'];
    const content = generateContent(200, customWords);

    // Should contain only custom words
    const containsCustomWord = customWords.some((word) => content.includes(word));
    expect(containsCustomWord).toBe(true);
  });

  it('should handle small size requests', () => {
    const content = generateContent(10);

    expect(content.length).toBeLessThanOrEqual(10);
    expect(content.length).toBeGreaterThan(0);
  });

  it('should handle large size requests', () => {
    const content = generateContent(10000);

    expect(content.length).toBeLessThanOrEqual(10000);
    expect(content.length).toBeGreaterThan(9900);
  });

  it('should produce space-separated words', () => {
    const content = generateContent(100);

    expect(content).toContain(' ');
    const words = content.split(' ');
    expect(words.length).toBeGreaterThan(1);
  });
});

describe('generateTags', () => {
  it('should generate requested number of tags', () => {
    const tags = generateTags(5);

    expect(tags).toHaveLength(5);
  });

  it('should generate tags using default word list', () => {
    const tags = generateTags(10);
    const defaultWords = ['memory', 'test', 'benchmark', 'data', 'entry', 'performance', 'latency'];

    tags.forEach((tag) => {
      expect(defaultWords).toContain(tag);
    });
  });

  it('should generate tags using custom word list', () => {
    const customWords = ['red', 'green', 'blue'];
    const tags = generateTags(5, customWords);

    tags.forEach((tag) => {
      expect(customWords).toContain(tag);
    });
  });

  it('should handle zero tags request', () => {
    const tags = generateTags(0);

    expect(tags).toHaveLength(0);
  });

  it('should return array of strings', () => {
    const tags = generateTags(3);

    tags.forEach((tag) => {
      expect(typeof tag).toBe('string');
    });
  });
});

describe('generateTestData', () => {
  const config: MemoryBenchmarkConfig = {
    ...DEFAULT_BENCHMARK_CONFIG,
    contentSizeBytes: 256,
    tagsPerEntry: 3,
    searchPatterns: ['test'],
  };

  it('should generate requested number of entries', () => {
    const data = generateTestData(10, config);

    expect(data.entries).toHaveLength(10);
    expect(data.size).toBe(10);
  });

  it('should generate entries with unique keys', () => {
    const data = generateTestData(100, config);
    const keys = data.entries.map((e) => e.key);
    const uniqueKeys = new Set(keys);

    expect(uniqueKeys.size).toBe(100);
  });

  it('should generate keys with bench- prefix', () => {
    const data = generateTestData(5, config);

    data.entries.forEach((entry) => {
      expect(entry.key).toMatch(/^bench-/);
    });
  });

  it('should generate content of configured size', () => {
    const data = generateTestData(5, config);

    data.entries.forEach((entry) => {
      expect(entry.content.length).toBeLessThanOrEqual(config.contentSizeBytes);
      expect(entry.content.length).toBeGreaterThan(config.contentSizeBytes * 0.9);
    });
  });

  it('should generate configured number of tags per entry', () => {
    const data = generateTestData(5, config);

    data.entries.forEach((entry) => {
      expect(entry.tags).toHaveLength(config.tagsPerEntry);
    });
  });

  it('should handle zero entries', () => {
    const data = generateTestData(0, config);

    expect(data.entries).toHaveLength(0);
    expect(data.size).toBe(0);
  });

  it('should handle large dataset sizes', () => {
    const data = generateTestData(1000, config);

    expect(data.entries).toHaveLength(1000);
    expect(data.size).toBe(1000);
  });
});

describe('calculatePatternMetrics', () => {
  const createTestEntries = (keys: string[]): TestEntry[] =>
    keys.map((key) => ({ key, content: 'test content', tags: [] }));

  it('should calculate precision correctly', () => {
    // Retrieved 5 items, 3 are relevant
    const retrieved = ['a', 'b', 'c', 'd', 'e'];
    const relevant = createTestEntries(['a', 'b', 'c']);

    const metrics = calculatePatternMetrics(retrieved, relevant);

    // Precision: 3/5 = 0.6
    expect(metrics.precision).toBe(0.6);
  });

  it('should calculate recall correctly', () => {
    // Retrieved 3 of 5 relevant items
    const retrieved = ['a', 'b', 'c'];
    const relevant = createTestEntries(['a', 'b', 'c', 'd', 'e']);

    const metrics = calculatePatternMetrics(retrieved, relevant);

    // Recall: 3/5 = 0.6
    expect(metrics.recall).toBe(0.6);
  });

  it('should calculate MRR correctly when first result is relevant', () => {
    const retrieved = ['a', 'b', 'c'];
    const relevant = createTestEntries(['a']);

    const metrics = calculatePatternMetrics(retrieved, relevant);

    // First relevant at position 1: MRR = 1/1 = 1
    expect(metrics.mrr).toBe(1);
  });

  it('should calculate MRR correctly when first relevant is not first', () => {
    const retrieved = ['x', 'y', 'a', 'b'];
    const relevant = createTestEntries(['a', 'b']);

    const metrics = calculatePatternMetrics(retrieved, relevant);

    // First relevant at position 3: MRR = 1/3
    expect(metrics.mrr).toBeCloseTo(1 / 3, 5);
  });

  it('should return zero MRR when no relevant items retrieved', () => {
    const retrieved = ['x', 'y', 'z'];
    const relevant = createTestEntries(['a', 'b']);

    const metrics = calculatePatternMetrics(retrieved, relevant);

    expect(metrics.mrr).toBe(0);
  });

  it('should return zero precision when nothing retrieved', () => {
    const retrieved: string[] = [];
    const relevant = createTestEntries(['a', 'b']);

    const metrics = calculatePatternMetrics(retrieved, relevant);

    expect(metrics.precision).toBe(0);
  });

  it('should return zero recall when no relevant items exist', () => {
    const retrieved = ['a', 'b', 'c'];
    const relevant: TestEntry[] = [];

    const metrics = calculatePatternMetrics(retrieved, relevant);

    expect(metrics.recall).toBe(0);
  });

  it('should return perfect metrics when all retrieved are relevant', () => {
    const retrieved = ['a', 'b', 'c'];
    const relevant = createTestEntries(['a', 'b', 'c']);

    const metrics = calculatePatternMetrics(retrieved, relevant);

    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.mrr).toBe(1);
  });
});

describe('computeAverageMetrics', () => {
  it('should compute average precision', () => {
    // Total precision 1.5 over 3 queries
    const metrics = computeAverageMetrics(1.5, 1.2, 2.0, 3);

    expect(metrics.precision).toBe(0.5);
  });

  it('should compute average recall', () => {
    const metrics = computeAverageMetrics(1.5, 1.2, 2.0, 3);

    expect(metrics.recall).toBeCloseTo(0.4, 5);
  });

  it('should compute F1 score as harmonic mean', () => {
    // Precision: 0.5, Recall: 0.4
    // F1 = 2 * (0.5 * 0.4) / (0.5 + 0.4) = 0.4 / 0.9 = 0.444...
    const metrics = computeAverageMetrics(1.5, 1.2, 2.0, 3);

    expect(metrics.f1Score).toBeCloseTo(0.4444, 3);
  });

  it('should compute average MRR', () => {
    const metrics = computeAverageMetrics(1.5, 1.2, 2.0, 3);

    expect(metrics.mrr).toBeCloseTo(0.6667, 3);
  });

  it('should return zero metrics when no queries', () => {
    const metrics = computeAverageMetrics(0, 0, 0, 0);

    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1Score).toBe(0);
    expect(metrics.mrr).toBe(0);
  });

  it('should return zero F1 when precision and recall are both zero', () => {
    const metrics = computeAverageMetrics(0, 0, 1.0, 5);

    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1Score).toBe(0);
  });

  it('should use F1 as ndcgAtK approximation', () => {
    const metrics = computeAverageMetrics(1.5, 1.2, 2.0, 3);

    expect(metrics.ndcgAtK).toBe(metrics.f1Score);
  });
});

describe('createOperationComparison', () => {
  it('should calculate latency change percentage', () => {
    const comparison = createOperationComparison({
      operation: 'test',
      datasetSize: 100,
      baselineP95: 100,
      currentP95: 80,
      baselineThroughput: 1000,
      currentThroughput: 1000,
    });

    // (80 - 100) / 100 * 100 = -20%
    expect(comparison.latencyChangePercent).toBe(-20);
  });

  it('should calculate throughput change percentage', () => {
    const comparison = createOperationComparison({
      operation: 'test',
      datasetSize: 100,
      baselineP95: 100,
      currentP95: 100,
      baselineThroughput: 1000,
      currentThroughput: 1500,
    });

    // (1500 - 1000) / 1000 * 100 = 50%
    expect(comparison.throughputChangePercent).toBe(50);
  });

  it('should mark as improved when latency decreased', () => {
    const comparison = createOperationComparison({
      operation: 'test',
      datasetSize: 100,
      baselineP95: 100,
      currentP95: 80, // Latency decreased
      baselineThroughput: 1000,
      currentThroughput: 1000, // Throughput unchanged
    });

    expect(comparison.improved).toBe(true);
  });

  it('should mark as improved when throughput increased', () => {
    const comparison = createOperationComparison({
      operation: 'test',
      datasetSize: 100,
      baselineP95: 100,
      currentP95: 100, // Latency unchanged
      baselineThroughput: 1000,
      currentThroughput: 1500, // Throughput increased
    });

    expect(comparison.improved).toBe(true);
  });

  it('should mark as not improved when both metrics got worse', () => {
    const comparison = createOperationComparison({
      operation: 'test',
      datasetSize: 100,
      baselineP95: 100,
      currentP95: 150, // Latency increased
      baselineThroughput: 1000,
      currentThroughput: 800, // Throughput decreased
    });

    expect(comparison.improved).toBe(false);
  });

  it('should preserve operation name and dataset size', () => {
    const comparison = createOperationComparison({
      operation: 'store',
      datasetSize: 500,
      baselineP95: 100,
      currentP95: 100,
      baselineThroughput: 1000,
      currentThroughput: 1000,
    });

    expect(comparison.operation).toBe('store');
    expect(comparison.datasetSize).toBe(500);
  });

  it('should preserve baseline and current values', () => {
    const comparison = createOperationComparison({
      operation: 'test',
      datasetSize: 100,
      baselineP95: 50,
      currentP95: 25,
      baselineThroughput: 200,
      currentThroughput: 400,
    });

    expect(comparison.baselineP95).toBe(50);
    expect(comparison.currentP95).toBe(25);
    expect(comparison.baselineThroughput).toBe(200);
    expect(comparison.currentThroughput).toBe(400);
  });
});

describe('calculateAverageLatencyImprovement', () => {
  it('should calculate average latency change', () => {
    const comparisons: OperationComparison[] = [
      {
        operation: 'op1',
        datasetSize: 100,
        baselineP95: 100,
        currentP95: 80,
        latencyChangePercent: -20,
        baselineThroughput: 1000,
        currentThroughput: 1000,
        throughputChangePercent: 0,
        improved: true,
      },
      {
        operation: 'op2',
        datasetSize: 100,
        baselineP95: 100,
        currentP95: 60,
        latencyChangePercent: -40,
        baselineThroughput: 1000,
        currentThroughput: 1000,
        throughputChangePercent: 0,
        improved: true,
      },
    ];

    const avg = calculateAverageLatencyImprovement(comparisons);

    // (-20 + -40) / 2 = -30
    expect(avg).toBe(-30);
  });

  it('should return zero for empty comparisons', () => {
    const avg = calculateAverageLatencyImprovement([]);

    expect(avg).toBe(0);
  });

  it('should handle mixed improvements and regressions', () => {
    const comparisons: OperationComparison[] = [
      {
        operation: 'op1',
        datasetSize: 100,
        baselineP95: 100,
        currentP95: 50,
        latencyChangePercent: -50, // 50% improvement
        baselineThroughput: 1000,
        currentThroughput: 1000,
        throughputChangePercent: 0,
        improved: true,
      },
      {
        operation: 'op2',
        datasetSize: 100,
        baselineP95: 100,
        currentP95: 120,
        latencyChangePercent: 20, // 20% regression
        baselineThroughput: 1000,
        currentThroughput: 1000,
        throughputChangePercent: 0,
        improved: false,
      },
    ];

    const avg = calculateAverageLatencyImprovement(comparisons);

    // (-50 + 20) / 2 = -15
    expect(avg).toBe(-15);
  });
});

describe('formatComparisonResults', () => {
  const createMockComparison = (): BenchmarkComparison => ({
    baseline: 'Baseline Backend',
    current: 'New Backend',
    comparisons: [
      {
        operation: 'store',
        datasetSize: 100,
        baselineP95: 100,
        currentP95: 50,
        latencyChangePercent: -50,
        baselineThroughput: 500,
        currentThroughput: 1000,
        throughputChangePercent: 100,
        improved: true,
      },
      {
        operation: 'retrieve',
        datasetSize: 100,
        baselineP95: 80,
        currentP95: 100,
        latencyChangePercent: 25,
        baselineThroughput: 600,
        currentThroughput: 500,
        throughputChangePercent: -16.67,
        improved: false,
      },
    ],
    overallLatencyChangePercent: -12.5,
    meetsMemZeroTarget: false,
  });

  it('should include header with baseline and current names', () => {
    const formatted = formatComparisonResults(createMockComparison());

    expect(formatted).toContain('Benchmark Comparison: Baseline Backend vs New Backend');
  });

  it('should format operation comparisons', () => {
    const formatted = formatComparisonResults(createMockComparison());

    expect(formatted).toContain('store (n=100)');
    expect(formatted).toContain('retrieve (n=100)');
  });

  it('should show latency changes with direction arrows', () => {
    const formatted = formatComparisonResults(createMockComparison());

    // Decreased latency should show down arrow
    expect(formatted).toMatch(/p95 Latency:.*100\.00ms.*50\.00ms.*\u2193.*50\.0%/);
    // Increased latency should show up arrow
    expect(formatted).toMatch(/p95 Latency:.*80\.00ms.*100\.00ms.*\u2191.*25\.0%/);
  });

  it('should show throughput changes with direction arrows', () => {
    const formatted = formatComparisonResults(createMockComparison());

    // Increased throughput should show up arrow
    expect(formatted).toMatch(/Throughput:.*500\.00.*1000\.00.*\u2191.*100\.0%/);
    // Decreased throughput should show down arrow
    expect(formatted).toMatch(/Throughput:.*600\.00.*500\.00.*\u2193.*16\.7%/);
  });

  it('should include overall latency change', () => {
    const formatted = formatComparisonResults(createMockComparison());

    expect(formatted).toContain('Overall Latency Change: -12.5%');
  });

  it('should indicate Mem0 target status', () => {
    const base = createMockComparison();

    // Test with meetsMemZeroTarget = false
    const failingComparison: BenchmarkComparison = {
      ...base,
      meetsMemZeroTarget: false,
    };
    let formatted = formatComparisonResults(failingComparison);
    expect(formatted).toContain('Meets Mem0 Target (-91%): NO');

    // Test with meetsMemZeroTarget = true
    const passingComparison: BenchmarkComparison = {
      ...base,
      meetsMemZeroTarget: true,
    };
    formatted = formatComparisonResults(passingComparison);
    expect(formatted).toContain('Meets Mem0 Target (-91%): YES');
  });

  it('should include visual separators', () => {
    const formatted = formatComparisonResults(createMockComparison());

    expect(formatted).toContain('='.repeat(60));
  });

  it('should handle empty comparisons', () => {
    const emptyComparison: BenchmarkComparison = {
      baseline: 'Base',
      current: 'Current',
      comparisons: [],
      overallLatencyChangePercent: 0,
      meetsMemZeroTarget: false,
    };

    const formatted = formatComparisonResults(emptyComparison);

    expect(formatted).toContain('Benchmark Comparison: Base vs Current');
    expect(formatted).toContain('Overall Latency Change: 0.0%');
  });
});
