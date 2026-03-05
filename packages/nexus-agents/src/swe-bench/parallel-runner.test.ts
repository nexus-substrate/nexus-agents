/**
 * Tests for parallel SWE-bench runner.
 *
 * @module swe-bench/parallel-runner.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LockedWriter } from './parallel-runner.js';
import type { PredictionWriter } from './prediction-writer.js';
import type { SWEBenchRunResult } from './types.js';

describe('LockedWriter', () => {
  let mockWriter: PredictionWriter;

  beforeEach(() => {
    mockWriter = {
      writeResult: vi.fn(function () {
        return Promise.resolve({ ok: true as const, value: true });
      }),
      getPredictionCount: vi.fn(() => 0),
    } as unknown as PredictionWriter;
  });

  it('serializes concurrent writeResult calls', async () => {
    const callOrder: number[] = [];
    let callCount = 0;

    const writer = {
      writeResult: vi.fn(function () {
        const idx = callCount++;
        callOrder.push(idx);
        // Simulate varying async delays
        return new Promise<{ ok: true; value: boolean }>((resolve) => {
          setTimeout(
            () => {
              resolve({ ok: true, value: true });
            },
            10 - idx * 3
          ); // First call takes longer
        });
      }),
      getPredictionCount: vi.fn(() => 0),
    } as unknown as PredictionWriter;

    const locked = new LockedWriter(writer);

    const result1: SWEBenchRunResult = {
      instance_id: 'test-1',
      completed: true,
      duration_ms: 100,
      prediction: { instance_id: 'test-1', model_name_or_path: 'test', model_patch: 'patch-1' },
    };
    const result2: SWEBenchRunResult = {
      instance_id: 'test-2',
      completed: true,
      duration_ms: 200,
      prediction: { instance_id: 'test-2', model_name_or_path: 'test', model_patch: 'patch-2' },
    };

    // Fire both concurrently
    const [r1, r2] = await Promise.all([locked.writeResult(result1), locked.writeResult(result2)]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    // Calls happen sequentially despite concurrent invocation
    expect(callOrder).toEqual([0, 1]);
    expect(writer.writeResult).toHaveBeenCalledTimes(2);
  });

  it('delegates getPredictionCount to underlying writer', () => {
    (mockWriter.getPredictionCount as ReturnType<typeof vi.fn>).mockReturnValue(5);
    const locked = new LockedWriter(mockWriter);
    expect(locked.getPredictionCount()).toBe(5);
  });

  it('propagates write errors without breaking the chain', async () => {
    const writer = {
      writeResult: vi.fn(function () {
        return Promise.resolve({
          ok: false as const,
          error: new Error('disk full'),
        });
      }),
      getPredictionCount: vi.fn(() => 0),
    } as unknown as PredictionWriter;

    const locked = new LockedWriter(writer);
    const result: SWEBenchRunResult = {
      instance_id: 'test-err',
      completed: true,
      duration_ms: 50,
      prediction: { instance_id: 'test-err', model_name_or_path: 'test', model_patch: 'patch' },
    };

    const r1 = await locked.writeResult(result);
    expect(r1.ok).toBe(false);

    // Chain should still work after error
    (writer.writeResult as ReturnType<typeof vi.fn>).mockReturnValue(
      Promise.resolve({ ok: true as const, value: true })
    );
    const r2 = await locked.writeResult(result);
    expect(r2.ok).toBe(true);
  });
});
