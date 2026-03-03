/**
 * nexus-agents/workflows - Task Queue
 *
 * Simple task queue for limiting concurrent task execution.
 * Provides cancellation support via AbortController.
 */

/**
 * Task function type.
 */
type Task<T> = (signal: AbortSignal) => Promise<T>;

/**
 * Queued task with its resolve/reject handlers.
 */
interface QueuedTask<T> {
  task: Task<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * A task queue that limits concurrent execution.
 *
 * @template T - The return type of tasks in this queue
 */
export class TaskQueue<T> {
  private readonly concurrency: number;
  private readonly queue: QueuedTask<T>[] = [];
  private running = 0;
  private readonly abortController: AbortController;
  private cancelled = false;

  /**
   * Creates a new TaskQueue.
   *
   * @param concurrency - Maximum number of concurrent tasks (default: 5)
   */
  constructor(concurrency = 5) {
    if (concurrency < 1) {
      throw new Error(`Concurrency must be at least 1, got ${String(concurrency)}`);
    }
    this.concurrency = concurrency;
    this.abortController = new AbortController();
  }

  /**
   * Adds a task to the queue for execution.
   *
   * @param task - The async task to execute
   * @returns Promise that resolves with the task result
   * @throws Error if the queue has been cancelled
   */
  add(task: Task<T>): Promise<T> {
    if (this.cancelled) {
      return Promise.reject(new Error('Queue has been cancelled'));
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNext();
    });
  }

  /**
   * Cancels all pending and running tasks.
   * Running tasks receive an abort signal.
   */
  cancel(): void {
    this.cancelled = true;
    this.abortController.abort();

    // Reject all queued tasks
    const error = new Error('Queue cancelled');
    for (const item of this.queue) {
      item.reject(error);
    }
    this.queue.length = 0;
  }

  /**
   * Returns whether the queue has been cancelled.
   */
  isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Returns the number of currently running tasks.
   */
  getRunningCount(): number {
    return this.running;
  }

  /**
   * Returns the number of tasks waiting in the queue.
   */
  getQueuedCount(): number {
    return this.queue.length;
  }

  /**
   * Returns the abort signal for external use.
   */
  getAbortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Processes the next task in the queue if capacity allows.
   */
  private processNext(): void {
    if (this.cancelled || this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.running++;

    item
      .task(this.abortController.signal)
      .then((result) => {
        item.resolve(result);
      })
      .catch((error: unknown) => {
        if (error instanceof Error) {
          item.reject(error);
        } else {
          item.reject(new Error(String(error)));
        }
      })
      .finally(() => {
        this.running--;
        this.processNext();
      });
  }
}

/**
 * Creates a task queue with the specified concurrency.
 *
 * @param concurrency - Maximum number of concurrent tasks
 * @returns A new TaskQueue instance
 */
export function createTaskQueue<T>(concurrency = 5): TaskQueue<T> {
  return new TaskQueue<T>(concurrency);
}
