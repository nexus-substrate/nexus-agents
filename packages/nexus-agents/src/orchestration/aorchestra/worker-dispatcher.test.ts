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
});
