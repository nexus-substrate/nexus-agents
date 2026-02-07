/**
 * Parallel Executor Tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createProgressReporter,
  createSingleTaskExecutor,
  runParallelLoop,
  type SingleTaskExecutorOptions,
  type ParallelExecutorOptions,
} from './parallel-executor.js';
import type { CliName } from '../../cli-adapters/types.js';
import type { ILogger } from '../../core/logger.js';
import type { EvaluationTask, TaskTestResult } from './types.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function mkTask(id: string) {
  return {
    id,
    name: `t-${id}`,
    description: 'd',
    category: 'code_generation' as const,
    difficulty: 'easy' as const,
    expectedTaskType: 'code_generation' as const,
  } as EvaluationTask;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function mkResult(id: string, success = true) {
  return {
    task: mkTask(id),
    taskId: id,
    taskName: `t-${id}`,
    success,
    cli: 'claude' as const,
    response: '',
    rubricScore: { overallScore: 0, criterionScores: [], rubricId: 'd', timestamp: '' },
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
    costUsd: 0,
    durationMs: 0,
    timestamp: '',
  } as unknown as TaskTestResult;
}

describe('createProgressReporter', () => {
  it('should not throw with undefined callback', () => {
    const fn = createProgressReporter(
      undefined,
      [mkTask('1')],
      [mkTask('1')],
      { count: 0, successCount: 0 },
      0
    );
    expect(() => {
      fn();
    }).not.toThrow();
  });

  it('should report progress with correct fields', () => {
    const cb = vi.fn();
    createProgressReporter(cb, [mkTask('1')], [], { count: 1, successCount: 1 }, 0)();
    expect(cb).toHaveBeenCalledTimes(1);
    const arg = cb.mock.calls[0][0] as Record<string, unknown>;
    expect(arg['completed']).toBe(1);
    expect(arg['currentTask']).toBe('Complete');
  });
});

describe('createSingleTaskExecutor', () => {
  it('should return null when aborted', async () => {
    const opts: SingleTaskExecutorOptions = {
      taskQueue: [mkTask('1')],
      clis: undefined,
      options: {
        parallelism: 1,
        stopOnFailure: false,
        logger: {
          error: vi.fn(),
          warn: vi.fn(),
          info: vi.fn(),
          debug: vi.fn(),
        } as unknown as ILogger,
        adapters: new Map<CliName, never>(),
      } as ParallelExecutorOptions,
      executeWithRetry: vi.fn(() => Promise.resolve(mkResult('1'))),
      completed: { count: 0, successCount: 0 },
      reportProgress: vi.fn(),
      abortFn: vi.fn(),
      isAborted: () => true,
    };
    expect(await createSingleTaskExecutor(opts)()).toBeNull();
  });

  it('should return null when queue empty', async () => {
    const opts: SingleTaskExecutorOptions = {
      taskQueue: [],
      clis: undefined,
      options: {
        parallelism: 1,
        stopOnFailure: false,
        logger: {
          error: vi.fn(),
          warn: vi.fn(),
          info: vi.fn(),
          debug: vi.fn(),
        } as unknown as ILogger,
        adapters: new Map<CliName, never>(),
      } as ParallelExecutorOptions,
      executeWithRetry: vi.fn(() => Promise.resolve(mkResult('1'))),
      completed: { count: 0, successCount: 0 },
      reportProgress: vi.fn(),
      abortFn: vi.fn(),
      isAborted: () => false,
    };
    expect(await createSingleTaskExecutor(opts)()).toBeNull();
  });

  it('should execute and increment counts', async () => {
    const completed = { count: 0, successCount: 0 };
    const opts: SingleTaskExecutorOptions = {
      taskQueue: [mkTask('1')],
      clis: undefined,
      options: {
        parallelism: 1,
        stopOnFailure: false,
        logger: {
          error: vi.fn(),
          warn: vi.fn(),
          info: vi.fn(),
          debug: vi.fn(),
        } as unknown as ILogger,
        adapters: new Map<CliName, never>(),
      } as ParallelExecutorOptions,
      executeWithRetry: vi.fn(() => Promise.resolve(mkResult('1', true))),
      completed,
      reportProgress: vi.fn(),
      abortFn: vi.fn(),
      isAborted: () => false,
    };
    await createSingleTaskExecutor(opts)();
    expect(completed.count).toBe(1);
    expect(completed.successCount).toBe(1);
  });
});

// NOTE: runParallelLoop is tested indirectly through test-runner.test.ts (34 tests).
// Direct unit tests OOM due to Promise.race in a loop creating accumulated promise chains
// in the vitest worker. This is a known vitest memory issue with synchronous promise resolution.
describe('runParallelLoop', () => {
  it('should be exported', () => {
    expect(typeof runParallelLoop).toBe('function');
  });

  it('should handle empty queue', async () => {
    const out = await runParallelLoop(
      vi.fn(() => Promise.resolve(null)),
      [],
      1,
      () => false
    );
    expect(out).toHaveLength(0);
  });
});
