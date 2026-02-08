/**
 * nexus-agents/benchmarks - Consolidation Benchmark Tests
 *
 * @module benchmarks/consolidation-benchmark.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runConsolidationBenchmark,
  createPromotionOp,
  createDecayOp,
  type ConsolidationOperation,
} from './consolidation-benchmark.js';

describe('runConsolidationBenchmark', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should benchmark all provided operations', async () => {
    const ops: ConsolidationOperation[] = [
      { name: 'promote', run: () => Promise.resolve() },
      { name: 'decay', run: () => Promise.resolve() },
    ];

    const config = { warmupIterations: 1, measurementIterations: 3 };
    const promise = runConsolidationBenchmark(ops, config);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.operations).toHaveLength(2);
    expect(result.operations[0]?.operation).toBe('promote');
    expect(result.operations[1]?.operation).toBe('decay');
  });

  it('should include latency metrics for each operation', async () => {
    const ops: ConsolidationOperation[] = [{ name: 'test-op', run: () => Promise.resolve() }];

    const config = { warmupIterations: 1, measurementIterations: 5 };
    const promise = runConsolidationBenchmark(ops, config);
    await vi.runAllTimersAsync();
    const result = await promise;

    const op = result.operations[0];
    expect(op).toBeDefined();
    expect(op?.latency.sampleCount).toBe(5);
    expect(op?.latency.p95).toBeGreaterThanOrEqual(0);
  });

  it('should include throughput metrics', async () => {
    const ops: ConsolidationOperation[] = [{ name: 'fast-op', run: () => Promise.resolve() }];

    const config = { warmupIterations: 1, measurementIterations: 3 };
    const promise = runConsolidationBenchmark(ops, config);
    await vi.runAllTimersAsync();
    const result = await promise;

    const op = result.operations[0];
    expect(op?.throughput.totalOps).toBe(3);
  });

  it('should include timestamp', async () => {
    const ops: ConsolidationOperation[] = [{ name: 'op', run: () => Promise.resolve() }];

    const config = { warmupIterations: 1, measurementIterations: 1 };
    const promise = runConsolidationBenchmark(ops, config);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.timestamp).toBeDefined();
    expect(typeof result.timestamp).toBe('string');
  });

  it('should handle empty operations list', async () => {
    const config = { warmupIterations: 1, measurementIterations: 1 };
    const promise = runConsolidationBenchmark([], config);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.operations).toHaveLength(0);
  });

  it('should run warmup iterations', async () => {
    let callCount = 0;
    const ops: ConsolidationOperation[] = [
      {
        name: 'counted',
        run: () => {
          callCount++;
          return Promise.resolve();
        },
      },
    ];

    const config = { warmupIterations: 3, measurementIterations: 5 };
    const promise = runConsolidationBenchmark(ops, config);
    await vi.runAllTimersAsync();
    await promise;

    // warmup (3) + measurement (5) = 8
    expect(callCount).toBe(8);
  });
});

describe('createPromotionOp', () => {
  it('should create operation with promotion: prefix', () => {
    const fn = vi.fn(() => Promise.resolve());
    const op = createPromotionOp('session-to-belief', fn);

    expect(op.name).toBe('promotion:session-to-belief');
    expect(op.run).toBe(fn);
  });
});

describe('createDecayOp', () => {
  it('should create operation with decay: prefix', () => {
    const fn = vi.fn(() => Promise.resolve());
    const op = createDecayOp('belief-prune', fn);

    expect(op.name).toBe('decay:belief-prune');
    expect(op.run).toBe(fn);
  });
});
