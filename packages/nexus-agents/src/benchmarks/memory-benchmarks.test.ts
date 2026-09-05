/**
 * nexus-agents/benchmarks - Memory Benchmarks Tests
 *
 * Unit tests for the memory backend benchmark suite.
 *
 * @module benchmarks/memory-benchmarks.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  runMemoryBenchmarks,
  compareBenchmarks,
  DEFAULT_MEMORY_BENCHMARK_CONFIG,
  formatComparisonResults,
} from './memory-benchmarks.js';
import type {
  IContextMemoryBackend,
  MemoryEntry,
  MemoryMetadata,
} from '../context/memory-backend-types.js';
import { MemoryError } from '../context/memory-backend-types.js';
import type { Result } from '../core/result.js';
import type { BenchmarkSuiteResult, OperationBenchmark } from './benchmark-types.js';

/**
 * Create a mock memory backend for testing.
 */
function createMockBackend(): IContextMemoryBackend {
  const storage = new Map<string, { value: unknown; metadata: MemoryMetadata; createdAt: Date }>();

  return {
    store: vi.fn(
      (
        key: string,
        value: unknown,
        metadata: MemoryMetadata
      ): Promise<Result<void, MemoryError>> => {
        storage.set(key, { value, metadata, createdAt: new Date() });
        return Promise.resolve({ ok: true, value: undefined });
      }
    ),

    retrieve: vi.fn((key: string): Promise<Result<unknown, MemoryError>> => {
      const entry = storage.get(key);
      if (entry === undefined) {
        return Promise.resolve({ ok: true, value: null });
      }
      return Promise.resolve({ ok: true, value: entry.value });
    }),

    search: vi.fn((query: string, limit: number): Promise<Result<MemoryEntry[], MemoryError>> => {
      const results: MemoryEntry[] = [];
      for (const [key, entry] of storage.entries()) {
        if (String(entry.value).includes(query) || (entry.metadata.tags ?? []).includes(query)) {
          results.push({
            key,
            value: entry.value,
            metadata: entry.metadata,
            createdAt: entry.createdAt,
            accessedAt: new Date(),
          });
          if (results.length >= limit) break;
        }
      }
      return Promise.resolve({ ok: true, value: results });
    }),

    prune: vi.fn((olderThan: Date): Promise<Result<number, MemoryError>> => {
      let pruned = 0;
      for (const [key, entry] of storage.entries()) {
        if (entry.createdAt < olderThan) {
          storage.delete(key);
          pruned++;
        }
      }
      return Promise.resolve({ ok: true, value: pruned });
    }),
  };
}

describe('DEFAULT_MEMORY_BENCHMARK_CONFIG', () => {
  it('should have reasonable default content size', () => {
    expect(DEFAULT_MEMORY_BENCHMARK_CONFIG.contentSizeBytes).toBe(1024);
  });

  it('should have reasonable default tags per entry', () => {
    expect(DEFAULT_MEMORY_BENCHMARK_CONFIG.tagsPerEntry).toBe(5);
  });

  it('should have default search patterns', () => {
    expect(DEFAULT_MEMORY_BENCHMARK_CONFIG.searchPatterns).toContain('test');
    expect(DEFAULT_MEMORY_BENCHMARK_CONFIG.searchPatterns).toContain('memory');
    expect(DEFAULT_MEMORY_BENCHMARK_CONFIG.searchPatterns).toContain('benchmark');
  });

  it('should inherit base benchmark config', () => {
    expect(DEFAULT_MEMORY_BENCHMARK_CONFIG.warmupIterations).toBeDefined();
    expect(DEFAULT_MEMORY_BENCHMARK_CONFIG.measurementIterations).toBeDefined();
    expect(DEFAULT_MEMORY_BENCHMARK_CONFIG.datasetSizes).toBeDefined();
    expect(DEFAULT_MEMORY_BENCHMARK_CONFIG.thresholds).toBeDefined();
  });
});

describe('runMemoryBenchmarks', () => {
  let mockBackend: IContextMemoryBackend;

  beforeEach(() => {
    vi.useFakeTimers();
    mockBackend = createMockBackend();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should run benchmarks for all configured dataset sizes', async () => {
    const config = {
      datasetSizes: [5, 10] as const,
      warmupIterations: 1,
      measurementIterations: 2,
    };

    const promise = runMemoryBenchmarks(mockBackend, 'Test Backend', config);
    await vi.runAllTimersAsync();
    const result = await promise;

    // 4 operations (store, retrieve, search, prune) x 2 dataset sizes = 8
    expect(result.operations.length).toBe(8);
  });

  it('should include store operation benchmarks', async () => {
    const config = {
      datasetSizes: [5] as const,
      warmupIterations: 1,
      measurementIterations: 2,
    };

    const promise = runMemoryBenchmarks(mockBackend, 'Test Backend', config);
    await vi.runAllTimersAsync();
    const result = await promise;

    const storeOp = result.operations.find((op) => op.operation === 'store');
    expect(storeOp).toBeDefined();
    expect(storeOp?.datasetSize).toBe(5);
    expect(storeOp?.latency).toBeDefined();
    expect(storeOp?.throughput).toBeDefined();
  });

  it('should include retrieve operation benchmarks', async () => {
    const config = {
      datasetSizes: [5] as const,
      warmupIterations: 1,
      measurementIterations: 2,
    };

    const promise = runMemoryBenchmarks(mockBackend, 'Test Backend', config);
    await vi.runAllTimersAsync();
    const result = await promise;

    const retrieveOp = result.operations.find((op) => op.operation === 'retrieve');
    expect(retrieveOp).toBeDefined();
    expect(mockBackend.retrieve).toHaveBeenCalled();
  });

  it('should include search operation benchmarks with quality metrics', async () => {
    const config = {
      datasetSizes: [5] as const,
      warmupIterations: 1,
      measurementIterations: 2,
      searchPatterns: ['test'] as const,
    };

    const promise = runMemoryBenchmarks(mockBackend, 'Test Backend', config);
    await vi.runAllTimersAsync();
    const result = await promise;

    const searchOp = result.operations.find((op) => op.operation === 'search');
    expect(searchOp).toBeDefined();
    expect(searchOp?.quality).toBeDefined();
    expect(mockBackend.search).toHaveBeenCalled();
  });

  it('scores a failed search query as zero and counts it, instead of dropping it (#5689)', async () => {
    // A backend that errors on one pattern and answers another perfectly used
    // to report f1 = 1: the failed query never entered the denominator.
    const realSearch = mockBackend.search;
    const errsOnMemory: IContextMemoryBackend = {
      ...mockBackend,
      search: vi.fn((query: string, limit: number): Promise<Result<MemoryEntry[], MemoryError>> =>
        query === 'memory'
          ? Promise.resolve({
              ok: false,
              error: new MemoryError('down'),
            })
          : realSearch(query, limit)
      ),
    };
    const config = {
      datasetSizes: [5] as const,
      warmupIterations: 1,
      measurementIterations: 1,
      searchPatterns: ['test', 'memory'] as const,
    };

    const promise = runMemoryBenchmarks(errsOnMemory, 'Test Backend', config);
    await vi.runAllTimersAsync();
    const result = await promise;

    const quality = result.operations.find((op) => op.operation === 'search')?.quality;
    expect(quality?.failedQueries).toBe(1);
    expect(quality?.precision).toBeLessThan(1);
  });

  it('should include prune operation benchmarks', async () => {
    const config = {
      datasetSizes: [5] as const,
      warmupIterations: 1,
      measurementIterations: 2,
    };

    const promise = runMemoryBenchmarks(mockBackend, 'Test Backend', config);
    await vi.runAllTimersAsync();
    const result = await promise;

    const pruneOp = result.operations.find((op) => op.operation === 'prune');
    expect(pruneOp).toBeDefined();
    expect(mockBackend.prune).toHaveBeenCalled();
  });

  it('should return suite result with name and component', async () => {
    const config = {
      datasetSizes: [5] as const,
      warmupIterations: 1,
      measurementIterations: 2,
    };

    const promise = runMemoryBenchmarks(mockBackend, 'My Custom Backend', config);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.name).toBe('Memory Backend: My Custom Backend');
    expect(result.component).toBe('memory-backend');
    expect(result.version).toBe('2.0.0');
  });

  it('should include environment information', async () => {
    const config = {
      datasetSizes: [5] as const,
      warmupIterations: 1,
      measurementIterations: 2,
    };

    const promise = runMemoryBenchmarks(mockBackend, 'Test Backend', config);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.environment).toBeDefined();
    expect(result.environment.nodeVersion).toBeDefined();
    expect(result.environment.platform).toBeDefined();
    expect(result.environment.cpuCores).toBeGreaterThan(0);
  });

  it('should include benchmark summary', async () => {
    const config = {
      datasetSizes: [5] as const,
      warmupIterations: 1,
      measurementIterations: 2,
    };

    const promise = runMemoryBenchmarks(mockBackend, 'Test Backend', config);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.summary).toBeDefined();
    expect(typeof result.summary.passed).toBe('boolean');
    expect(result.summary.totalOperations).toBeGreaterThan(0);
    // totalDurationMs may be 0 with fake timers since Date.now() isn't advancing
    expect(result.summary.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should clear backend between dataset sizes', async () => {
    const config = {
      datasetSizes: [5, 10] as const,
      warmupIterations: 1,
      measurementIterations: 2,
    };

    const promise = runMemoryBenchmarks(mockBackend, 'Test Backend', config);
    await vi.runAllTimersAsync();
    await promise;

    // Prune should be called multiple times (once per size for clearing + benchmark prunes)
    expect(mockBackend.prune).toHaveBeenCalled();
  });

  it('should handle prune errors gracefully during backend clearing', async () => {
    // Test that prune errors during the "clear between sizes" step are caught
    // Create a backend where prune throws only on the first call (clearing)
    // but works on subsequent calls (actual benchmark)
    let pruneCallCount = 0;
    const errorBackend = createMockBackend();
    const originalPrune = errorBackend.prune;
    errorBackend.prune = vi.fn(async (date: Date) => {
      pruneCallCount++;
      // First call is the clearing attempt, throw an error
      if (pruneCallCount === 1) {
        throw new Error('Prune failed during clear');
      }
      // Subsequent calls work normally (actual prune benchmark)
      return originalPrune(date);
    });

    const config = {
      datasetSizes: [5] as const,
      warmupIterations: 1,
      measurementIterations: 2,
    };

    // Should complete even if clearing prune fails
    const promise = runMemoryBenchmarks(errorBackend, 'Error Backend', config);
    await vi.runAllTimersAsync();

    // The benchmark should complete (error during clear is caught)
    const result = await promise;
    expect(result).toBeDefined();
    expect(result.operations.length).toBeGreaterThan(0);
  });
});

describe('compareBenchmarks', () => {
  const createMockOperation = (
    operation: string,
    datasetSize: number,
    p95: number,
    throughput: number
  ): OperationBenchmark => ({
    operation,
    datasetSize,
    latency: {
      min: p95 * 0.5,
      max: p95 * 1.5,
      mean: p95 * 0.8,
      p50: p95 * 0.6,
      p75: p95 * 0.8,
      p90: p95 * 0.95,
      p95,
      p99: p95 * 1.1,
      stdDev: p95 * 0.1,
      sampleCount: 100,
    },
    throughput: {
      opsPerSecond: throughput,
      totalOps: 100,
      durationMs: (100 / throughput) * 1000,
    },
    resources: {
      peakMemoryBytes: 50 * 1024 * 1024,
      avgMemoryBytes: 40 * 1024 * 1024,
      cpuTimeMs: 100,
    },
    timestamp: new Date().toISOString(),
  });

  const createMockSuiteResult = (
    name: string,
    operations: OperationBenchmark[]
  ): BenchmarkSuiteResult => ({
    name,
    component: 'memory-backend',
    version: '2.0.0',
    operations,
    environment: {
      nodeVersion: 'v22.0.0',
      platform: 'linux',
      arch: 'x64',
      cpuModel: 'Test CPU',
      cpuCores: 8,
      totalMemory: 16 * 1024 * 1024 * 1024,
    },
    summary: {
      totalDurationMs: 1000,
      totalOperations: operations.length * 100,
      overallThroughput: 1000,
      avgP95Latency: operations.reduce((sum, op) => sum + op.latency.p95, 0) / operations.length,
      passed: true,
      failures: [],
    },
  });

  it('should compare matching operations between baseline and current', () => {
    const baseline = createMockSuiteResult('Baseline', [
      createMockOperation('store', 100, 100, 500),
      createMockOperation('retrieve', 100, 80, 600),
    ]);

    const current = createMockSuiteResult('Current', [
      createMockOperation('store', 100, 50, 1000),
      createMockOperation('retrieve', 100, 40, 1200),
    ]);

    const comparison = compareBenchmarks(baseline, current);

    expect(comparison.comparisons).toHaveLength(2);
  });

  it('should include baseline and current names', () => {
    const baseline = createMockSuiteResult('Old Backend', [
      createMockOperation('store', 100, 100, 500),
    ]);

    const current = createMockSuiteResult('New Backend', [
      createMockOperation('store', 100, 50, 1000),
    ]);

    const comparison = compareBenchmarks(baseline, current);

    expect(comparison.baseline).toBe('Old Backend');
    expect(comparison.current).toBe('New Backend');
  });

  it('should calculate latency change percentage', () => {
    const baseline = createMockSuiteResult('Baseline', [
      createMockOperation('store', 100, 100, 500),
    ]);

    const current = createMockSuiteResult('Current', [
      createMockOperation('store', 100, 50, 500), // 50% reduction in latency
    ]);

    const comparison = compareBenchmarks(baseline, current);

    expect(comparison.comparisons[0]?.latencyChangePercent).toBe(-50);
  });

  it('should calculate throughput change percentage', () => {
    const baseline = createMockSuiteResult('Baseline', [
      createMockOperation('store', 100, 100, 500),
    ]);

    const current = createMockSuiteResult('Current', [
      createMockOperation('store', 100, 100, 1000), // 100% increase in throughput
    ]);

    const comparison = compareBenchmarks(baseline, current);

    expect(comparison.comparisons[0]?.throughputChangePercent).toBe(100);
  });

  it('should calculate overall latency change', () => {
    const baseline = createMockSuiteResult('Baseline', [
      createMockOperation('store', 100, 100, 500),
      createMockOperation('retrieve', 100, 100, 500),
    ]);

    const current = createMockSuiteResult('Current', [
      createMockOperation('store', 100, 50, 500), // -50%
      createMockOperation('retrieve', 100, 30, 500), // -70%
    ]);

    const comparison = compareBenchmarks(baseline, current);

    // Average: (-50 + -70) / 2 = -60
    expect(comparison.overallLatencyChangePercent).toBe(-60);
  });

  it('should detect when Mem0 target is met', () => {
    const baseline = createMockSuiteResult('Baseline', [
      createMockOperation('store', 100, 100, 500),
    ]);

    const current = createMockSuiteResult('Current', [
      createMockOperation('store', 100, 9, 500), // 91% reduction
    ]);

    const comparison = compareBenchmarks(baseline, current);

    expect(comparison.meetsMemZeroTarget).toBe(true);
  });

  it('should detect when Mem0 target is not met', () => {
    const baseline = createMockSuiteResult('Baseline', [
      createMockOperation('store', 100, 100, 500),
    ]);

    const current = createMockSuiteResult('Current', [
      createMockOperation('store', 100, 20, 500), // Only 80% reduction
    ]);

    const comparison = compareBenchmarks(baseline, current);

    expect(comparison.meetsMemZeroTarget).toBe(false);
  });

  it('should skip operations without matching baseline', () => {
    const baseline = createMockSuiteResult('Baseline', [
      createMockOperation('store', 100, 100, 500),
    ]);

    const current = createMockSuiteResult('Current', [
      createMockOperation('store', 100, 50, 500),
      createMockOperation('new-op', 100, 30, 1000), // No baseline match
    ]);

    const comparison = compareBenchmarks(baseline, current);

    // Only 'store' should be compared
    expect(comparison.comparisons).toHaveLength(1);
    expect(comparison.comparisons[0]?.operation).toBe('store');
  });

  it('should match operations by both name and dataset size', () => {
    const baseline = createMockSuiteResult('Baseline', [
      createMockOperation('store', 100, 100, 500),
      createMockOperation('store', 1000, 200, 300),
    ]);

    const current = createMockSuiteResult('Current', [
      createMockOperation('store', 100, 50, 1000),
      createMockOperation('store', 1000, 100, 600),
    ]);

    const comparison = compareBenchmarks(baseline, current);

    expect(comparison.comparisons).toHaveLength(2);

    const size100 = comparison.comparisons.find((c) => c.datasetSize === 100);
    const size1000 = comparison.comparisons.find((c) => c.datasetSize === 1000);

    expect(size100?.baselineP95).toBe(100);
    expect(size100?.currentP95).toBe(50);
    expect(size1000?.baselineP95).toBe(200);
    expect(size1000?.currentP95).toBe(100);
  });

  it('should handle empty operations', () => {
    const baseline = createMockSuiteResult('Baseline', []);
    const current = createMockSuiteResult('Current', []);

    const comparison = compareBenchmarks(baseline, current);

    expect(comparison.comparisons).toHaveLength(0);
    expect(comparison.overallLatencyChangePercent).toBe(0);
    expect(comparison.meetsMemZeroTarget).toBe(false);
  });
});

describe('formatComparisonResults re-export', () => {
  it('should be available from memory-benchmarks module', () => {
    // Verify the re-export works
    expect(typeof formatComparisonResults).toBe('function');
  });
});

describe('Memory benchmark integration', () => {
  let mockBackend: IContextMemoryBackend;

  beforeEach(() => {
    vi.useFakeTimers();
    mockBackend = createMockBackend();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should produce valid benchmark results that can be compared', async () => {
    const config = {
      datasetSizes: [5] as const,
      warmupIterations: 1,
      measurementIterations: 2,
    };

    // Run two benchmarks
    const promise1 = runMemoryBenchmarks(mockBackend, 'Backend v1', config);
    await vi.runAllTimersAsync();
    const baseline = await promise1;

    const promise2 = runMemoryBenchmarks(mockBackend, 'Backend v2', config);
    await vi.runAllTimersAsync();
    const current = await promise2;

    // Compare them
    const comparison = compareBenchmarks(baseline, current);

    // Should have comparisons for all 4 operations
    expect(comparison.comparisons.length).toBe(4);
    expect(comparison.baseline).toBe('Memory Backend: Backend v1');
    expect(comparison.current).toBe('Memory Backend: Backend v2');
  });

  it('should run complete benchmark cycle with realistic config', async () => {
    const config = {
      datasetSizes: [10] as const,
      warmupIterations: 2,
      measurementIterations: 5,
      contentSizeBytes: 512,
      tagsPerEntry: 3,
      searchPatterns: ['test', 'memory'] as const,
    };

    const promise = runMemoryBenchmarks(mockBackend, 'Full Test', config);
    await vi.runAllTimersAsync();
    const result = await promise;

    // Verify all operations are present
    const operations = result.operations.map((op) => op.operation);
    expect(operations).toContain('store');
    expect(operations).toContain('retrieve');
    expect(operations).toContain('search');
    expect(operations).toContain('prune');

    // Verify metrics are reasonable
    result.operations.forEach((op) => {
      // Note: prune uses hardcoded 10 iterations, others use config.measurementIterations
      const expectedIterations = op.operation === 'prune' ? 10 : config.measurementIterations;
      expect(op.latency.sampleCount).toBe(expectedIterations);
      expect(op.throughput.totalOps).toBe(expectedIterations);
      expect(op.resources.peakMemoryBytes).toBeGreaterThan(0);
    });
  });
});
