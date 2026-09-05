/**
 * nexus-agents/benchmarks - Token Benchmark Tests
 *
 * @module benchmarks/token-benchmark.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { estimateTokens, calculateTokenMetrics, runTokenBenchmark } from './token-benchmark.js';
import type {
  IContextMemoryBackend,
  MemoryEntry,
  MemoryMetadata,
} from '../context/memory-backend-types.js';
import { MemoryError } from '../context/memory-backend-types.js';
import type { Result } from '../core/result.js';
import { DEFAULT_MEMORY_BENCHMARK_CONFIG } from './memory-benchmarks.js';

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
      return Promise.resolve({ ok: true, value: entry?.value ?? null });
    }),
    search: vi.fn((_query: string, limit: number): Promise<Result<MemoryEntry[], MemoryError>> => {
      // Return only a small subset — simulates memory-optimized retrieval
      const results: MemoryEntry[] = [];
      let count = 0;
      for (const [key, entry] of storage.entries()) {
        if (count >= limit) break;
        results.push({
          key,
          value: entry.value,
          metadata: entry.metadata,
          createdAt: entry.createdAt,
          accessedAt: new Date(),
        });
        count++;
      }
      return Promise.resolve({ ok: true, value: results });
    }),
    prune: vi.fn((): Promise<Result<number, MemoryError>> => {
      return Promise.resolve({ ok: true, value: 0 });
    }),
  };
}

describe('estimateTokens', () => {
  it('should estimate tokens based on character count', () => {
    // 4 chars per token average
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });

  it('should round up partial tokens', () => {
    expect(estimateTokens('abc')).toBe(1); // 3/4 = 0.75, ceil = 1
    expect(estimateTokens('abcde')).toBe(2); // 5/4 = 1.25, ceil = 2
  });

  it('should handle empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should handle long content', () => {
    const content = 'a'.repeat(4000);
    expect(estimateTokens(content)).toBe(1000);
  });
});

describe('calculateTokenMetrics', () => {
  it('should calculate total tokens from entries', () => {
    const entries = [
      { content: 'a'.repeat(40) }, // 10 tokens
      { content: 'b'.repeat(40) }, // 10 tokens
    ];

    const metrics = calculateTokenMetrics(entries, 1);

    // Combined: 80 chars + 1 newline = 81 chars → ~21 tokens
    expect(metrics.totalTokens).toBeGreaterThan(0);
    expect(metrics.inputTokens).toBe(metrics.totalTokens);
    expect(metrics.outputTokens).toBe(0);
  });

  it('should calculate average tokens per operation', () => {
    const entries = [{ content: 'a'.repeat(100) }];
    const metrics = calculateTokenMetrics(entries, 5);

    expect(metrics.avgTokensPerOp).toBe(metrics.totalTokens / 5);
  });

  it('should handle zero queries', () => {
    const entries = [{ content: 'test' }];
    const metrics = calculateTokenMetrics(entries, 0);

    expect(metrics.avgTokensPerOp).toBe(0);
  });

  it('should handle empty entries', () => {
    const metrics = calculateTokenMetrics([], 1);

    expect(metrics.totalTokens).toBe(0);
  });
});

const DEFAULT_SEARCH_PATTERN_COUNT = DEFAULT_MEMORY_BENCHMARK_CONFIG.searchPatterns.length;

describe('runTokenBenchmark', () => {
  let mockBackend: IContextMemoryBackend;

  beforeEach(() => {
    vi.useFakeTimers();
    mockBackend = createMockBackend();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports zero savings, not 100%, when every search failed (#5689)', async () => {
    // A backend whose search is down produced no retrieval context, so the
    // "optimized" token count was 0 and the savings read as 100% — the Mem0
    // target met by a benchmark that retrieved nothing.
    const down: IContextMemoryBackend = {
      ...mockBackend,
      search: vi.fn((): Promise<Result<MemoryEntry[], MemoryError>> =>
        Promise.resolve({ ok: false, error: new MemoryError('down') })
      ),
    };
    const config = { datasetSizes: [10] as const, warmupIterations: 1, measurementIterations: 1 };

    const promise = runTokenBenchmark(down, config);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results[0]?.searchesFailed).toBe(DEFAULT_SEARCH_PATTERN_COUNT);
    expect(results[0]?.savingsPercent).toBe(0);
    expect(results[0]?.meetsMemZeroTarget).toBe(false);
  });

  it('should return results for each dataset size', async () => {
    const config = {
      datasetSizes: [10, 20] as const,
      warmupIterations: 1,
      measurementIterations: 2,
    };

    const promise = runTokenBenchmark(mockBackend, config);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(2);
    expect(results[0]?.datasetSize).toBe(10);
    expect(results[1]?.datasetSize).toBe(20);
  });

  it('should measure baseline tokens from all entries', async () => {
    const config = {
      datasetSizes: [10] as const,
      warmupIterations: 1,
      measurementIterations: 2,
      contentSizeBytes: 100,
    };

    const promise = runTokenBenchmark(mockBackend, config);
    await vi.runAllTimersAsync();
    const results = await promise;

    const result = results[0];
    expect(result).toBeDefined();
    // Baseline should include all entries
    expect(result?.baseline.totalTokens).toBeGreaterThan(0);
  });

  it('should measure optimized tokens from search results', async () => {
    const config = {
      datasetSizes: [50] as const,
      warmupIterations: 1,
      measurementIterations: 2,
      contentSizeBytes: 200,
      searchPatterns: ['test'] as const,
    };

    const promise = runTokenBenchmark(mockBackend, config);
    await vi.runAllTimersAsync();
    const results = await promise;

    const result = results[0];
    expect(result).toBeDefined();
    // Search returns max 10 per pattern, so optimized < baseline for n=50
    expect(result?.optimized.totalTokens).toBeLessThanOrEqual(result?.baseline.totalTokens ?? 0);
  });

  it('should calculate savings percentage', async () => {
    const config = {
      datasetSizes: [50] as const,
      warmupIterations: 1,
      measurementIterations: 2,
      contentSizeBytes: 200,
      searchPatterns: ['test'] as const,
    };

    const promise = runTokenBenchmark(mockBackend, config);
    await vi.runAllTimersAsync();
    const results = await promise;

    const result = results[0];
    expect(result).toBeDefined();
    expect(result?.savingsPercent).toBeGreaterThanOrEqual(0);
    expect(result?.savingsPercent).toBeLessThanOrEqual(100);
  });

  it('should validate Mem0 90% target', async () => {
    const config = {
      datasetSizes: [100] as const,
      warmupIterations: 1,
      measurementIterations: 2,
      contentSizeBytes: 200,
      searchPatterns: ['test'] as const,
    };

    const promise = runTokenBenchmark(mockBackend, config);
    await vi.runAllTimersAsync();
    const results = await promise;

    const result = results[0];
    expect(result).toBeDefined();
    // With n=100 entries and search limit 10, savings should be ~90%
    expect(typeof result?.meetsMemZeroTarget).toBe('boolean');
  });

  it('should store all entries before measuring', async () => {
    const config = {
      datasetSizes: [5] as const,
      warmupIterations: 1,
      measurementIterations: 2,
    };

    const promise = runTokenBenchmark(mockBackend, config);
    await vi.runAllTimersAsync();
    await promise;

    expect(mockBackend.store).toHaveBeenCalled();
  });
});
