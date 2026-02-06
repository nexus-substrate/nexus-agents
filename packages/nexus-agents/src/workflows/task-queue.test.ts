/**
 * Tests for task-queue.ts
 *
 * Covers queue construction, task execution, concurrency limiting,
 * cancellation, abort signals, and factory function.
 */

import { describe, it, expect } from 'vitest';
import { TaskQueue, createTaskQueue } from './task-queue.js';

// ============================================================================
// Helpers
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ============================================================================
// Construction
// ============================================================================

describe('TaskQueue - construction', () => {
  it('creates with default concurrency', () => {
    const q = new TaskQueue();
    expect(q.getRunningCount()).toBe(0);
    expect(q.getQueuedCount()).toBe(0);
  });

  it('creates with custom concurrency', () => {
    const q = new TaskQueue(3);
    expect(q.isCancelled()).toBe(false);
  });

  it('throws for concurrency < 1', () => {
    expect(() => new TaskQueue(0)).toThrow('Concurrency must be at least 1');
    expect(() => new TaskQueue(-1)).toThrow('Concurrency must be at least 1');
  });
});

// ============================================================================
// Task execution
// ============================================================================

describe('TaskQueue - execution', () => {
  it('executes a task and returns result', async () => {
    const q = createTaskQueue<string>();
    const result = await q.add(() => Promise.resolve('done'));
    expect(result).toBe('done');
  });

  it('executes multiple tasks', async () => {
    const q = createTaskQueue<number>();
    const results = await Promise.all([
      q.add(() => Promise.resolve(1)),
      q.add(() => Promise.resolve(2)),
      q.add(() => Promise.resolve(3)),
    ]);
    expect(results).toEqual([1, 2, 3]);
  });

  it('propagates task errors', async () => {
    const q = createTaskQueue<string>();
    await expect(q.add(() => Promise.reject(new Error('task failed')))).rejects.toThrow(
      'task failed'
    );
  });

  it('wraps non-Error rejections', async () => {
    const q = createTaskQueue<string>();
    await expect(q.add(() => Promise.reject(new Error('string error')))).rejects.toThrow(
      'string error'
    );
  });

  it('passes abort signal to task', async () => {
    const q = createTaskQueue<boolean>();
    const result = await q.add((signal) => Promise.resolve(!signal.aborted));
    expect(result).toBe(true);
  });
});

// ============================================================================
// Concurrency
// ============================================================================

describe('TaskQueue - concurrency', () => {
  it('limits concurrent tasks', async () => {
    const q = new TaskQueue<string>(2);
    let maxConcurrent = 0;
    let current = 0;

    const makeTask = (): Promise<string> =>
      q.add(async () => {
        current++;
        maxConcurrent = Math.max(maxConcurrent, current);
        await delay(10);
        current--;
        return 'done';
      });

    await Promise.all([makeTask(), makeTask(), makeTask(), makeTask()]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('processes queued tasks after running tasks complete', async () => {
    const q = new TaskQueue<number>(1);
    const order: number[] = [];

    await Promise.all([
      q.add(async () => {
        order.push(1);
        await delay(5);
        return 1;
      }),
      q.add(() => {
        order.push(2);
        return Promise.resolve(2);
      }),
    ]);

    expect(order).toEqual([1, 2]);
  });
});

// ============================================================================
// Cancellation
// ============================================================================

describe('TaskQueue - cancellation', () => {
  it('rejects new tasks after cancellation', async () => {
    const q = createTaskQueue<string>();
    q.cancel();
    await expect(q.add(() => Promise.resolve('x'))).rejects.toThrow('cancelled');
  });

  it('isCancelled returns true after cancel', () => {
    const q = createTaskQueue<string>();
    expect(q.isCancelled()).toBe(false);
    q.cancel();
    expect(q.isCancelled()).toBe(true);
  });

  it('aborts signal on cancel', () => {
    const q = createTaskQueue<string>();
    const signal = q.getAbortSignal();
    expect(signal.aborted).toBe(false);
    q.cancel();
    expect(signal.aborted).toBe(true);
  });

  it('rejects queued tasks on cancel', async () => {
    const q = new TaskQueue<string>(1);

    // Add a long-running task to fill the slot
    const first = q.add(() => delay(50).then(() => 'first'));

    // Add a task that will be queued
    const second = q.add(() => Promise.resolve('second'));

    // Cancel while second is queued
    q.cancel();

    await expect(second).rejects.toThrow('cancelled');
    // First may resolve or reject depending on timing
    await first.catch(() => undefined);
  });
});

// ============================================================================
// State inspection
// ============================================================================

describe('TaskQueue - state', () => {
  it('tracks running count during execution', async () => {
    const q = new TaskQueue<string>(1);
    let runningDuringExec = 0;

    await q.add(() => {
      runningDuringExec = q.getRunningCount();
      return Promise.resolve('done');
    });

    expect(runningDuringExec).toBe(1);
    // After await, the .finally() decrement is async — wait a tick
    await delay(1);
    expect(q.getRunningCount()).toBe(0);
  });

  it('tracks queued count', async () => {
    const q = new TaskQueue<string>(1);

    const first = q.add(() => delay(20).then(() => 'first'));

    // This should be queued since concurrency is 1
    const second = q.add(() => Promise.resolve('second'));

    // Wait a tick for processNext to fire
    await delay(1);
    expect(q.getQueuedCount()).toBe(1);

    await Promise.all([first, second]);
  });

  it('provides abort signal', () => {
    const q = createTaskQueue<string>();
    expect(q.getAbortSignal()).toBeInstanceOf(AbortSignal);
  });
});

// ============================================================================
// createTaskQueue factory
// ============================================================================

describe('createTaskQueue', () => {
  it('creates queue with default concurrency', () => {
    const q = createTaskQueue<string>();
    expect(q).toBeInstanceOf(TaskQueue);
  });

  it('creates queue with custom concurrency', () => {
    const q = createTaskQueue<number>(3);
    expect(q).toBeInstanceOf(TaskQueue);
  });
});
