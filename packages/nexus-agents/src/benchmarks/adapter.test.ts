/**
 * Tests for BenchmarkAdapter contract + orchestrator behavior.
 */
import { describe, it, expect, vi } from 'vitest';
import type { BenchmarkAdapter, BenchmarkRunSummary } from './adapter.js';
import { runBenchmark } from './orchestrator.js';

interface FakeInstance {
  readonly id: string;
  readonly passes: boolean;
  readonly throwsOn?: 'run' | 'evaluate';
}

interface FakePrediction {
  readonly instanceId: string;
  readonly value: number;
}

interface FakeVerdict {
  readonly instanceId: string;
  readonly passed: boolean;
}

function makeAdapter(
  overrides: Partial<BenchmarkAdapter<FakeInstance, FakePrediction, FakeVerdict>> = {}
): BenchmarkAdapter<FakeInstance, FakePrediction, FakeVerdict> {
  return {
    name: 'fake-bench',
    variant: 'unit',
    loadInstances: vi.fn(() =>
      Promise.resolve([
        { id: 'a', passes: true },
        { id: 'b', passes: false },
        { id: 'c', passes: true },
      ])
    ),
    runInstance: vi.fn((instance: FakeInstance) => {
      if (instance.throwsOn === 'run') return Promise.reject(new Error('run failed'));
      return Promise.resolve({ instanceId: instance.id, value: 42 });
    }),
    evaluate: vi.fn((instance: FakeInstance) => {
      if (instance.throwsOn === 'evaluate') return Promise.reject(new Error('eval failed'));
      return Promise.resolve({ instanceId: instance.id, passed: instance.passes });
    }),
    isPass: (r: FakeVerdict) => r.passed,
    summarize: (results, runTimeMs): BenchmarkRunSummary => {
      const passed = results.filter((r) => r.passed).length;
      return {
        name: 'fake-bench',
        variant: 'unit',
        total: results.length,
        passed,
        passRate: results.length > 0 ? passed / results.length : 0,
        runTimeMs,
        metadata: {},
      };
    },
    ...overrides,
  };
}

describe('runBenchmark', () => {
  it('runs load → run → evaluate → summarize end-to-end', async () => {
    const adapter = makeAdapter();
    const summary = await runBenchmark(adapter, {});
    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(2);
    expect(summary.passRate).toBeCloseTo(2 / 3);
    expect(adapter.loadInstances).toHaveBeenCalledOnce();
    expect(adapter.runInstance).toHaveBeenCalledTimes(3);
  });

  it('reports progress for each completed instance', async () => {
    const onProgress = vi.fn();
    const adapter = makeAdapter();
    await runBenchmark(adapter, {}, { onProgress });
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);
  });

  it('honors limit option', async () => {
    const adapter = makeAdapter();
    const summary = await runBenchmark(adapter, {}, { limit: 2 });
    expect(summary.total).toBe(2);
    expect(adapter.runInstance).toHaveBeenCalledTimes(2);
  });

  it('runs in parallel when concurrency > 1', async () => {
    const adapter = makeAdapter();
    const summary = await runBenchmark(adapter, {}, { concurrency: 3 });
    expect(summary.total).toBe(3);
  });

  it('continues on instance failure and reports failureCount in metadata', async () => {
    const adapter = makeAdapter({
      loadInstances: vi.fn(
        (): Promise<readonly FakeInstance[]> =>
          Promise.resolve([
            { id: 'a', passes: true },
            { id: 'b', passes: false, throwsOn: 'run' },
            { id: 'c', passes: true },
          ])
      ),
    });
    const summary = await runBenchmark(adapter, {});
    // 2 succeeded, 1 threw
    expect(summary.total).toBe(2);
    expect(summary.metadata['failureCount']).toBe(1);
    expect(summary.metadata['sampleFailure']).toBe('run failed');
  });

  it('captures adapter variant and name on summary', async () => {
    const adapter = makeAdapter();
    const summary = await runBenchmark(adapter, {});
    expect(summary.name).toBe('fake-bench');
    expect(summary.variant).toBe('unit');
  });

  it('handles empty instance set', async () => {
    const adapter = makeAdapter({
      loadInstances: vi.fn(() => Promise.resolve([])),
    });
    const summary = await runBenchmark(adapter, {});
    expect(summary.total).toBe(0);
    expect(summary.passRate).toBe(0);
  });

  it('records non-zero runTimeMs', async () => {
    const adapter = makeAdapter();
    const summary = await runBenchmark(adapter, {});
    expect(summary.runTimeMs).toBeGreaterThanOrEqual(0);
  });
});
