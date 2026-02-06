/**
 * Tests for task-queue.ts
 *
 * Covers queue construction, task execution, concurrency limiting,
 * cancellation, abort signals, backpressure, ordering, and factory function.
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

/** Creates a deferred promise for manual resolution control. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ============================================================================
// Construction
// ============================================================================

describe('TaskQueue - construction', () => {
  it('creates with default concurrency of 5', () => {
    const q = new TaskQueue();
    expect(q.getRunningCount()).toBe(0);
    expect(q.getQueuedCount()).toBe(0);
  });

  it('creates with custom concurrency', () => {
    const q = new TaskQueue(3);
    expect(q.isCancelled()).toBe(false);
  });

  it('creates with concurrency of 1', () => {
    const q = new TaskQueue(1);
    expect(q.isCancelled()).toBe(false);
    expect(q.getRunningCount()).toBe(0);
  });

  it('throws for concurrency of 0', () => {
    expect(() => new TaskQueue(0)).toThrow('Concurrency must be at least 1');
  });

  it('throws for negative concurrency', () => {
    expect(() => new TaskQueue(-1)).toThrow('Concurrency must be at least 1');
    expect(() => new TaskQueue(-100)).toThrow('Concurrency must be at least 1');
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

  it('executes multiple tasks concurrently', async () => {
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

  it('wraps non-Error rejections as Error', async () => {
    const q = createTaskQueue<string>();
    await expect(
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      q.add(() => Promise.reject('string error'))
    ).rejects.toThrow('string error');
  });

  it('wraps numeric rejection as Error', async () => {
    const q = createTaskQueue<string>();
    await expect(
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      q.add(() => Promise.reject(42))
    ).rejects.toThrow('42');
  });

  it('passes abort signal to task', async () => {
    const q = createTaskQueue<boolean>();
    const result = await q.add((signal) => Promise.resolve(!signal.aborted));
    expect(result).toBe(true);
  });

  it('continues processing after a task error', async () => {
    const q = createTaskQueue<string>(1);
    const failing = q.add(() => Promise.reject(new Error('fail')));
    const succeeding = q.add(() => Promise.resolve('ok'));

    await expect(failing).rejects.toThrow('fail');
    await expect(succeeding).resolves.toBe('ok');
  });
});

// ============================================================================
// Concurrency control
// ============================================================================

describe('TaskQueue - concurrency control', () => {
  it('limits concurrent tasks to specified concurrency', async () => {
    const q = new TaskQueue<string>(2);
    let maxConcurrent = 0;
    let current = 0;

    const makeTask = (): Promise<string> =>
      q.add(() => {
        current++;
        maxConcurrent = Math.max(maxConcurrent, current);
        return delay(10).then(() => {
          current--;
          return 'done';
        });
      });

    await Promise.all([makeTask(), makeTask(), makeTask(), makeTask()]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('respects concurrency of 1 (serial execution)', async () => {
    const q = new TaskQueue<number>(1);
    let maxConcurrent = 0;
    let current = 0;

    const makeTask = (id: number): Promise<number> =>
      q.add(() => {
        current++;
        maxConcurrent = Math.max(maxConcurrent, current);
        return delay(5).then(() => {
          current--;
          return id;
        });
      });

    const results = await Promise.all([makeTask(1), makeTask(2), makeTask(3)]);
    expect(maxConcurrent).toBe(1);
    expect(results).toEqual([1, 2, 3]);
  });

  it('runs tasks up to concurrency limit immediately', async () => {
    const q = new TaskQueue<string>(3);
    const deferreds = [
      createDeferred<string>(),
      createDeferred<string>(),
      createDeferred<string>(),
    ];

    for (const d of deferreds) {
      void q.add(() => d.promise);
      d.promise.catch(() => undefined);
    }

    // Allow microtask queue to flush
    await delay(1);
    expect(q.getRunningCount()).toBe(3);
    expect(q.getQueuedCount()).toBe(0);

    // Cleanup
    for (const d of deferreds) {
      d.resolve('done');
    }
  });

  it('queues tasks beyond concurrency limit', async () => {
    const q = new TaskQueue<string>(1);
    const d = createDeferred<string>();

    // First task fills the slot
    const first = q.add(() => d.promise);
    // Second should be queued
    const second = q.add(() => Promise.resolve('second'));

    await delay(1);
    expect(q.getRunningCount()).toBe(1);
    expect(q.getQueuedCount()).toBe(1);

    d.resolve('first');
    expect(await first).toBe('first');
    expect(await second).toBe('second');
  });
});

// ============================================================================
// Queue ordering (FIFO)
// ============================================================================

describe('TaskQueue - FIFO ordering', () => {
  it('processes queued tasks in FIFO order', async () => {
    const q = new TaskQueue<number>(1);
    const order: number[] = [];
    const gate = createDeferred<undefined>();

    // First task blocks the queue
    const first = q.add(() =>
      gate.promise.then(() => {
        order.push(1);
        return 1;
      })
    );

    // These will be queued in order
    const second = q.add(() => {
      order.push(2);
      return Promise.resolve(2);
    });
    const third = q.add(() => {
      order.push(3);
      return Promise.resolve(3);
    });

    // Release the gate
    gate.resolve(undefined);

    await Promise.all([first, second, third]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('maintains order across many tasks', async () => {
    const q = new TaskQueue<number>(1);
    const order: number[] = [];

    const promises = Array.from({ length: 10 }, (_, i) =>
      q.add(() => {
        order.push(i);
        return Promise.resolve(i);
      })
    );

    await Promise.all(promises);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
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

  it('rejects queued (pending) tasks on cancel', async () => {
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

  it('clears the queue on cancel', async () => {
    const q = new TaskQueue<string>(1);
    const gate = createDeferred<string>();

    // Fill slot
    const first = q.add(() => gate.promise);
    // Queue several
    const p2 = q.add(() => Promise.resolve('2'));
    const p3 = q.add(() => Promise.resolve('3'));

    await delay(1);
    expect(q.getQueuedCount()).toBe(2);

    q.cancel();
    expect(q.getQueuedCount()).toBe(0);

    // Cleanup
    gate.resolve('done');
    await first.catch(() => undefined);
    await p2.catch(() => undefined);
    await p3.catch(() => undefined);
  });

  it('calling cancel multiple times is safe', () => {
    const q = createTaskQueue<string>();
    q.cancel();
    q.cancel();
    q.cancel();
    expect(q.isCancelled()).toBe(true);
  });

  it('abort signal is shared across tasks', async () => {
    const q = createTaskQueue<boolean>(2);
    const signals: AbortSignal[] = [];

    await Promise.all([
      q.add((signal) => {
        signals.push(signal);
        return Promise.resolve(true);
      }),
      q.add((signal) => {
        signals.push(signal);
        return Promise.resolve(true);
      }),
    ]);

    expect(signals[0]).toBe(signals[1]);
    expect(signals[0]).toBe(q.getAbortSignal());
  });
});

// ============================================================================
// Backpressure
// ============================================================================

describe('TaskQueue - backpressure', () => {
  it('accumulates queued tasks under backpressure', async () => {
    const q = new TaskQueue<string>(1);
    const gate = createDeferred<string>();

    // Fill the single slot
    const first = q.add(() => gate.promise);

    // Add multiple tasks that should all queue
    const pending = Array.from({ length: 5 }, (_, idx) =>
      q.add(() => Promise.resolve('task-' + String(idx)))
    );

    await delay(1);
    expect(q.getQueuedCount()).toBe(5);
    expect(q.getRunningCount()).toBe(1);

    // Release
    gate.resolve('first');
    const results = await Promise.all(pending);
    expect(results).toEqual(['task-0', 'task-1', 'task-2', 'task-3', 'task-4']);
    await first;
  });

  it('drains queue progressively as tasks complete', async () => {
    const q = new TaskQueue<number>(2);
    const gates = Array.from({ length: 4 }, () => createDeferred<number>());
    const promises = gates.map((g) => q.add(() => g.promise));

    await delay(1);
    // 2 running, 2 queued
    expect(q.getRunningCount()).toBe(2);
    expect(q.getQueuedCount()).toBe(2);

    // Complete first task
    gates[0]!.resolve(0);
    await promises[0];
    await delay(1);
    // Now 2 running (slot freed and filled), 1 queued
    expect(q.getRunningCount()).toBe(2);
    expect(q.getQueuedCount()).toBe(1);

    // Complete remaining
    gates[1]!.resolve(1);
    gates[2]!.resolve(2);
    gates[3]!.resolve(3);
    await Promise.all(promises);
  });
});

// ============================================================================
// State inspection
// ============================================================================

describe('TaskQueue - state inspection', () => {
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

  it('running and queued counts are 0 after all tasks complete', async () => {
    const q = new TaskQueue<number>(2);
    await Promise.all([
      q.add(() => Promise.resolve(1)),
      q.add(() => Promise.resolve(2)),
      q.add(() => Promise.resolve(3)),
    ]);
    await delay(1);
    expect(q.getRunningCount()).toBe(0);
    expect(q.getQueuedCount()).toBe(0);
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

  it('propagates concurrency validation error', () => {
    expect(() => createTaskQueue<string>(0)).toThrow('Concurrency must be at least 1');
  });
});
