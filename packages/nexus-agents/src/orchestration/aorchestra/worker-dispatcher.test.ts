/**
 * Tests for WorkerDispatcher — wave-based parallel expert execution.
 *
 * @module orchestration/aorchestra/worker-dispatcher.test
 * (Source: Issue #1301, Epic #1299)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatchWorkers,
  groupByWave,
  WORKER_TIMEOUT_MS,
  RATE_LIMIT_WAVE_DELAY_MS,
  type WorkerDispatchOptions,
  type WorkerResult,
} from './worker-dispatcher.js';
import type { AgentPlanEntry } from './agent-planner.js';

// ============================================================================
// groupByWave
// ============================================================================

describe('groupByWave', () => {
  it('groups entries by wave number', () => {
    const entries: AgentPlanEntry[] = [
      { role: 'code', subTask: 'impl', priority: 1, reasoning: 'r', wave: 1 },
      { role: 'testing', subTask: 'test', priority: 2, reasoning: 'r', wave: 1 },
      { role: 'security', subTask: 'sec', priority: 3, reasoning: 'r', wave: 2 },
    ];
    const waves = groupByWave(entries);
    expect(waves).toHaveLength(2);
    expect(waves[0]).toHaveLength(2);
    expect(waves[1]).toHaveLength(1);
  });

  it('returns empty array for empty entries', () => {
    expect(groupByWave([])).toEqual([]);
  });

  it('sorts waves by wave number ascending', () => {
    const entries: AgentPlanEntry[] = [
      { role: 'security', subTask: 'sec', priority: 4, reasoning: 'r', wave: 2 },
      { role: 'code', subTask: 'impl', priority: 1, reasoning: 'r', wave: 1 },
    ];
    const waves = groupByWave(entries);
    expect(waves.at(0)?.at(0)?.role).toBe('code');
    expect(waves.at(1)?.at(0)?.role).toBe('security');
  });
});

// ============================================================================
// dispatchWorkers
// ============================================================================

describe('dispatchWorkers', () => {
  const makeEntry = (
    role: AgentPlanEntry['role'],
    wave: number,
    priority: number
  ): AgentPlanEntry => ({
    role,
    subTask: `task for ${role}`,
    priority,
    reasoning: `Selected for ${role}`,
    wave,
  });

  let mockExecute: WorkerDispatchOptions['executeWorker'];

  beforeEach(() => {
    mockExecute = vi.fn().mockImplementation(
      (entry: AgentPlanEntry): Promise<WorkerResult> =>
        Promise.resolve({
          role: entry.role,
          subTask: entry.subTask,
          output: `result from ${entry.role}`,
          status: 'success' as const,
          durationMs: 100,
        })
    );
  });

  it('executes all entries and returns results', async () => {
    const entries = [makeEntry('code', 1, 1), makeEntry('testing', 1, 2)];
    const results = await dispatchWorkers(entries, { executeWorker: mockExecute });
    expect(results).toHaveLength(2);
    expect(results.at(0)?.role).toBe('code');
    expect(results.at(1)?.role).toBe('testing');
    expect(results.every((r) => r.status === 'success')).toBe(true);
  });

  it('executes waves sequentially', async () => {
    const executionOrder: string[] = [];
    const trackedExecute: WorkerDispatchOptions['executeWorker'] = vi
      .fn()
      .mockImplementation((entry: AgentPlanEntry): Promise<WorkerResult> => {
        executionOrder.push(entry.role);
        return Promise.resolve({
          role: entry.role,
          subTask: entry.subTask,
          output: `result from ${entry.role}`,
          status: 'success' as const,
          durationMs: 50,
        });
      });

    const entries = [
      makeEntry('code', 1, 1),
      makeEntry('testing', 1, 2),
      makeEntry('security', 2, 3),
    ];
    await dispatchWorkers(entries, { executeWorker: trackedExecute });

    // Wave 1 (code, testing) must complete before wave 2 (security) starts
    const securityIdx = executionOrder.indexOf('security');
    const codeIdx = executionOrder.indexOf('code');
    const testingIdx = executionOrder.indexOf('testing');
    expect(codeIdx).toBeLessThan(securityIdx);
    expect(testingIdx).toBeLessThan(securityIdx);
  });

  it('handles worker errors without aborting wave', async () => {
    const errorExecute: WorkerDispatchOptions['executeWorker'] = vi
      .fn()
      .mockImplementation((entry: AgentPlanEntry): Promise<WorkerResult> => {
        if (entry.role === 'code') {
          return Promise.resolve({
            role: entry.role,
            subTask: entry.subTask,
            output: '',
            status: 'error' as const,
            durationMs: 10,
            error: 'Adapter unavailable',
          });
        }
        return Promise.resolve({
          role: entry.role,
          subTask: entry.subTask,
          output: `result from ${entry.role}`,
          status: 'success' as const,
          durationMs: 100,
        });
      });

    const entries = [makeEntry('code', 1, 1), makeEntry('testing', 1, 2)];
    const results = await dispatchWorkers(entries, { executeWorker: errorExecute });
    expect(results).toHaveLength(2);
    const first = results.at(0);
    const second = results.at(1);
    expect(first?.status).toBe('error');
    expect(first?.error).toBe('Adapter unavailable');
    expect(second?.status).toBe('success');
  });

  it('returns empty array for empty entries', async () => {
    const results = await dispatchWorkers([], { executeWorker: mockExecute });
    expect(results).toEqual([]);
  });

  it('respects maxConcurrency option', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const concurrencyExecute: WorkerDispatchOptions['executeWorker'] = vi
      .fn()
      .mockImplementation((entry: AgentPlanEntry): Promise<WorkerResult> => {
        concurrent++;
        if (concurrent > maxConcurrent) {
          maxConcurrent = concurrent;
        }
        return new Promise((resolve) => {
          setTimeout(() => {
            concurrent--;
            resolve({
              role: entry.role,
              subTask: entry.subTask,
              output: `result from ${entry.role}`,
              status: 'success' as const,
              durationMs: 50,
            });
          }, 10);
        });
      });

    // All 3 in wave 1 — but maxConcurrency is 2
    const entries = [
      makeEntry('code', 1, 1),
      makeEntry('testing', 1, 2),
      makeEntry('security', 1, 3),
    ];
    await dispatchWorkers(entries, {
      executeWorker: concurrencyExecute,
      maxConcurrency: 2,
    });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('captures thrown errors as error results', async () => {
    const throwingExecute: WorkerDispatchOptions['executeWorker'] = vi
      .fn()
      .mockRejectedValue(new Error('unexpected crash'));

    const entries = [makeEntry('code', 1, 1)];
    const results = await dispatchWorkers(entries, { executeWorker: throwingExecute });
    expect(results).toHaveLength(1);
    const result = results.at(0);
    expect(result?.status).toBe('error');
    expect(result?.error).toContain('unexpected crash');
  });

  // ---- Phase 1: Timeout guards (Issue #1313) ----

  it('times out workers that exceed WORKER_TIMEOUT_MS', async () => {
    expect(WORKER_TIMEOUT_MS).toBeGreaterThan(0);

    // Use a very short timeout override for testing
    const slowExecute: WorkerDispatchOptions['executeWorker'] = vi.fn().mockImplementation(
      (entry: AgentPlanEntry): Promise<WorkerResult> =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              role: entry.role,
              subTask: entry.subTask,
              output: 'late result',
              status: 'success' as const,
              durationMs: 200,
            });
          }, 200);
        })
    );

    const entries = [makeEntry('code', 1, 1)];
    const results = await dispatchWorkers(entries, {
      executeWorker: slowExecute,
      workerTimeoutMs: 50, // Much shorter than the 200ms worker
    });

    expect(results).toHaveLength(1);
    const result = results.at(0);
    expect(result?.status).toBe('error');
    expect(result?.error).toContain('timeout');
  });

  // ---- Phase 1: errorType taxonomy (Issue #1316) ----

  it('sets errorType to timeout when worker exceeds timeout', async () => {
    const slowExecute: WorkerDispatchOptions['executeWorker'] = vi.fn().mockImplementation(
      (entry: AgentPlanEntry): Promise<WorkerResult> =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              role: entry.role,
              subTask: entry.subTask,
              output: 'late',
              status: 'success' as const,
              durationMs: 200,
            });
          }, 200);
        })
    );

    const entries = [makeEntry('code', 1, 1)];
    const results = await dispatchWorkers(entries, {
      executeWorker: slowExecute,
      workerTimeoutMs: 50,
    });

    const result = results.at(0);
    expect(result?.status).toBe('error');
    expect(result?.errorType).toBe('timeout');
  });

  it('sets errorType to logic_error when worker throws unexpected error', async () => {
    const throwingExecute: WorkerDispatchOptions['executeWorker'] = vi
      .fn()
      .mockRejectedValue(new Error('null reference'));

    const entries = [makeEntry('code', 1, 1)];
    const results = await dispatchWorkers(entries, { executeWorker: throwingExecute });

    const result = results.at(0);
    expect(result?.status).toBe('error');
    expect(result?.errorType).toBe('logic_error');
  });

  it('sets errorType to model_error when worker returns error result with model prefix', async () => {
    const modelErrorExecute: WorkerDispatchOptions['executeWorker'] = vi
      .fn()
      .mockRejectedValue(new Error('Model returned error: rate limited'));

    const entries = [makeEntry('code', 1, 1)];
    const results = await dispatchWorkers(entries, { executeWorker: modelErrorExecute });

    const result = results.at(0);
    expect(result?.status).toBe('error');
    expect(result?.errorType).toBe('model_error');
  });

  // ---- Phase 2: Error duration tracking (Issue #1313) ----

  it('captures actual duration in error results from thrown errors', async () => {
    const slowThrow: WorkerDispatchOptions['executeWorker'] = vi.fn().mockImplementation(
      (): Promise<WorkerResult> =>
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('delayed crash'));
          }, 30);
        })
    );

    const entries = [makeEntry('code', 1, 1)];
    const results = await dispatchWorkers(entries, { executeWorker: slowThrow });
    expect(results).toHaveLength(1);
    const result = results.at(0);
    expect(result?.status).toBe('error');
    // durationMs should reflect actual elapsed time, not hardcoded 0
    expect(result?.durationMs).toBeGreaterThanOrEqual(0);
    // For a 30ms delay, it should be at least a few ms (not exactly 0)
    expect(result?.durationMs).toBeGreaterThan(0);
  });

  // ---- Rate-limit back-pressure (Issue #1328) ----

  it('delays between waves when rate-limit errors are detected', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const rateLimitThenSucceed: WorkerDispatchOptions['executeWorker'] = vi
      .fn()
      .mockImplementation((entry: AgentPlanEntry): Promise<WorkerResult> => {
        callCount++;
        if (entry.wave === 1) {
          return Promise.reject(new Error('Rate limited: too many requests'));
        }
        return Promise.resolve({
          role: entry.role,
          subTask: entry.subTask,
          output: 'done',
          status: 'success' as const,
          durationMs: 50,
        });
      });

    const entries = [makeEntry('code', 1, 1), makeEntry('testing', 2, 2)];

    const dispatchPromise = dispatchWorkers(entries, {
      executeWorker: rateLimitThenSucceed,
    });

    // Advance past the rate-limit delay
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_WAVE_DELAY_MS + 100);
    const results = await dispatchPromise;

    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe('error');
    expect(results[1]?.status).toBe('success');
    expect(callCount).toBe(2);

    vi.useRealTimers();
  });

  it('exports RATE_LIMIT_WAVE_DELAY_MS constant', () => {
    expect(RATE_LIMIT_WAVE_DELAY_MS).toBe(5_000);
  });

  it('uses expert-aware timeout for security tasks (longer than default)', async () => {
    // Security task should get EXPERT_TIMEOUTS.complexMs (600s), not default 60s.
    // We verify by setting a worker that takes 80ms — with a 50ms workerTimeoutMs
    // override it would fail, but WITHOUT the override the expert-aware timeout kicks in.
    const slowExecute: WorkerDispatchOptions['executeWorker'] = vi.fn().mockImplementation(
      (entry: AgentPlanEntry): Promise<WorkerResult> =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              role: entry.role,
              subTask: entry.subTask,
              output: `result from ${entry.role}`,
              status: 'success' as const,
              durationMs: 80,
            });
          }, 80);
        })
    );

    // Security-related subTask text triggers getExpertTaskTimeout → 600s
    const entries: AgentPlanEntry[] = [
      {
        role: 'security',
        subTask: 'perform security review of authentication module',
        priority: 1,
        reasoning: 'security expertise needed',
        wave: 1,
      },
    ];

    // Without workerTimeoutMs override, the expert-aware timeout (600s) is used
    const results = await dispatchWorkers(entries, { executeWorker: slowExecute });
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('success');
  });
});
