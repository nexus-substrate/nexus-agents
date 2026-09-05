/**
 * nexus-agents/benchmarks - Token Usage Benchmark
 *
 * Measures token savings from memory-optimized retrieval vs baseline
 * full-context approach. Validates Mem0 claim of 90% token savings.
 *
 * @module benchmarks/token-benchmark
 * (Source: Issue #462, arXiv:2504.19413)
 */

import { createLogger } from '../core/index.js';
import type { TokenMetrics } from './benchmark-types.js';
import type { IContextMemoryBackend, MemoryEntry } from '../context/memory-backend-types.js';
import { generateTestData, type MemoryBenchmarkConfig } from './memory-benchmarks-helpers.js';
import { DEFAULT_MEMORY_BENCHMARK_CONFIG } from './memory-benchmarks.js';

const logger = createLogger({ component: 'token-benchmark' });

/** Approximate tokens per character (GPT/Claude tokenizer average). */
const CHARS_PER_TOKEN = 4;

/**
 * Token benchmark result comparing baseline vs memory-optimized retrieval.
 */
export interface TokenBenchmarkResult {
  readonly datasetSize: number;
  readonly baseline: TokenMetrics;
  readonly optimized: TokenMetrics;
  readonly savingsPercent: number;
  readonly meetsMemZeroTarget: boolean;
  /**
   * Search calls that returned an error (#5689). When every search failed the
   * "optimized" context is empty for the wrong reason, so `savingsPercent` is
   * reported as 0 and the target as not met — not as a 100% saving.
   */
  readonly searchesFailed: number;
}

/**
 * Estimate token count from text content.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Calculate token metrics for a set of entries.
 */
export function calculateTokenMetrics(
  entries: readonly { content: string }[],
  queryCount: number
): TokenMetrics {
  const totalTokens = estimateTokens(entries.map((e) => e.content).join('\n'));

  return {
    inputTokens: totalTokens,
    outputTokens: 0,
    totalTokens,
    avgTokensPerOp: queryCount > 0 ? totalTokens / queryCount : 0,
  };
}

/**
 * Run token savings benchmark.
 *
 * Compares baseline (all entries in context) vs optimized
 * (only relevant entries from search) token usage.
 */
export async function runTokenBenchmark(
  backend: IContextMemoryBackend,
  config: Partial<MemoryBenchmarkConfig> = {}
): Promise<readonly TokenBenchmarkResult[]> {
  const cfg = { ...DEFAULT_MEMORY_BENCHMARK_CONFIG, ...config };
  const results: TokenBenchmarkResult[] = [];

  for (const size of cfg.datasetSizes) {
    logger.info('Running token benchmark', { size });

    const data = generateTestData(size, cfg);

    // Store all entries
    for (const entry of data.entries) {
      await backend.store(entry.key, entry.content, {
        tags: entry.tags,
        importance: 'medium',
      });
    }

    // Baseline: all entries would be included in context
    const baseline = calculateTokenMetrics(data.entries, cfg.searchPatterns.length);

    // Optimized: only search results included in context
    const searchResults: MemoryEntry[] = [];
    let searchesFailed = 0;
    for (const pattern of cfg.searchPatterns) {
      const result = await backend.search(pattern, 10);
      if (result.ok) {
        searchResults.push(...result.value);
      } else {
        searchesFailed++;
      }
    }
    const searchesSucceeded = cfg.searchPatterns.length - searchesFailed;

    const optimizedEntries = searchResults.map((r) => ({
      content: String(r.value),
    }));
    const optimized = calculateTokenMetrics(optimizedEntries, cfg.searchPatterns.length);

    // No successful search → no retrieval happened, so an empty optimized
    // context is not a saving (#5689).
    const savingsPercent =
      baseline.totalTokens > 0 && searchesSucceeded > 0
        ? ((baseline.totalTokens - optimized.totalTokens) / baseline.totalTokens) * 100
        : 0;

    results.push({
      datasetSize: size,
      baseline,
      optimized,
      savingsPercent,
      meetsMemZeroTarget: searchesSucceeded > 0 && savingsPercent >= 90,
      searchesFailed,
    });
  }

  return results;
}
