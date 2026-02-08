/**
 * nexus-agents/benchmarks - Consolidation Benchmark
 *
 * Benchmarks memory consolidation operations: promotion pipeline
 * (session → belief → agentic) and decay/eviction performance.
 *
 * @module benchmarks/consolidation-benchmark
 * (Source: Issue #462, arXiv:2504.19413)
 */

import { createLogger, getTimeProvider } from '../core/index.js';
import type { OperationBenchmark } from './benchmark-types.js';
import { runOperationBenchmark } from './benchmark-runner.js';
import type { MemoryBenchmarkConfig } from './memory-benchmarks-helpers.js';
import { DEFAULT_MEMORY_BENCHMARK_CONFIG } from './memory-benchmarks.js';

const logger = createLogger({ component: 'consolidation-benchmark' });

/**
 * Consolidation operation that can be benchmarked.
 */
export interface ConsolidationOperation {
  readonly name: string;
  readonly run: () => Promise<void>;
}

/**
 * Consolidation benchmark result.
 */
export interface ConsolidationBenchmarkResult {
  readonly operations: readonly OperationBenchmark[];
  readonly timestamp: string;
}

/**
 * Run consolidation benchmarks on a set of operations.
 *
 * Measures latency and throughput of promotion, decay, and eviction
 * operations that maintain memory health over time.
 */
export async function runConsolidationBenchmark(
  operations: readonly ConsolidationOperation[],
  config: Partial<MemoryBenchmarkConfig> = {}
): Promise<ConsolidationBenchmarkResult> {
  const cfg = { ...DEFAULT_MEMORY_BENCHMARK_CONFIG, ...config };
  const benchmarks: OperationBenchmark[] = [];

  logger.info('Starting consolidation benchmarks', {
    operationCount: operations.length,
  });

  for (const op of operations) {
    logger.info('Benchmarking consolidation operation', { name: op.name });

    const benchmark = await runOperationBenchmark(
      op.name,
      0, // consolidation ops don't have dataset size
      op.run,
      cfg
    );

    benchmarks.push(benchmark);
  }

  return {
    operations: benchmarks,
    timestamp: getTimeProvider().nowIso(),
  };
}

/**
 * Create a promotion operation from a callback.
 */
export function createPromotionOp(
  name: string,
  promoteFn: () => Promise<void>
): ConsolidationOperation {
  return { name: `promotion:${name}`, run: promoteFn };
}

/**
 * Create a decay operation from a callback.
 */
export function createDecayOp(name: string, decayFn: () => Promise<void>): ConsolidationOperation {
  return { name: `decay:${name}`, run: decayFn };
}
