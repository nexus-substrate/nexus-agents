/**
 * nexus-agents/testing/framework - Parallel Executor
 *
 * Parallel task execution utilities for the test runner.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 */

import type { ICliAdapter, CliName } from '../../cli-adapters/types.js';
import type { ILogger } from '../../core/logger.js';
import type { EvaluationTask, TaskTestResult, ProgressCallback } from './types.js';
import { selectCli, createErrorResult } from './task-executor.js';

/**
 * Progress tracking state.
 */
interface ProgressState {
  count: number;
  successCount: number;
}

/**
 * Options for the parallel executor.
 */
export interface ParallelExecutorOptions {
  /** Maximum parallel tasks */
  readonly parallelism: number;
  /** Whether to stop on first failure */
  readonly stopOnFailure: boolean;
  /** Logger instance */
  readonly logger: ILogger;
  /** CLI adapters */
  readonly adapters: Map<CliName, ICliAdapter>;
}

/**
 * Task executor function type.
 */
export type TaskExecutor = (task: EvaluationTask, cli?: CliName) => Promise<TaskTestResult>;

/**
 * Creates a progress reporter function.
 */
export function createProgressReporter(
  onProgress: ProgressCallback | undefined,
  tasks: readonly EvaluationTask[],
  taskQueue: EvaluationTask[],
  completed: ProgressState,
  startMs: number
): () => void {
  return (): void => {
    if (onProgress === undefined) return;

    const elapsedMs = Date.now() - startMs;
    const avgTimePerTask = completed.count > 0 ? elapsedMs / completed.count : 0;
    const remaining = tasks.length - completed.count;
    const estimatedRemainingMs = avgTimePerTask * remaining;

    onProgress({
      completed: completed.count,
      total: tasks.length,
      currentTask: taskQueue[0]?.name ?? 'Complete',
      elapsedMs,
      estimatedRemainingMs,
      currentSuccessRate: completed.count > 0 ? completed.successCount / completed.count : 0,
    });
  };
}

/**
 * Options for creating a single task executor.
 */
export interface SingleTaskExecutorOptions {
  /** Task queue to pull from */
  readonly taskQueue: EvaluationTask[];
  /** Optional CLIs to filter by */
  readonly clis: readonly CliName[] | undefined;
  /** Executor options */
  readonly options: ParallelExecutorOptions;
  /** Executor function with retry logic */
  readonly executeWithRetry: TaskExecutor;
  /** Progress state */
  readonly completed: ProgressState;
  /** Progress reporter function */
  readonly reportProgress: () => void;
  /** Abort function */
  readonly abortFn: () => void;
  /** Check if aborted */
  readonly isAborted: () => boolean;
}

/**
 * Handles successful task execution.
 */
function handleTaskSuccess(
  result: TaskTestResult,
  opts: SingleTaskExecutorOptions
): TaskTestResult {
  opts.completed.count++;
  if (result.success) {
    opts.completed.successCount++;
  }
  opts.reportProgress();

  if (opts.options.stopOnFailure && !result.success) {
    opts.abortFn();
  }

  return result;
}

/**
 * Handles task execution error.
 */
function handleTaskError(
  task: EvaluationTask,
  cli: CliName | undefined,
  caughtError: unknown,
  opts: SingleTaskExecutorOptions
): TaskTestResult {
  opts.completed.count++;
  opts.reportProgress();

  const errorInstance = caughtError instanceof Error ? caughtError : new Error(String(caughtError));
  opts.options.logger.error('Task execution error', errorInstance, {
    taskId: task.id,
  });

  const errorCli = cli ?? selectCli(task, opts.options.adapters);
  return createErrorResult(task, errorCli, caughtError);
}

/**
 * Creates a single task executor with error handling.
 */
export function createSingleTaskExecutor(
  opts: SingleTaskExecutorOptions
): () => Promise<TaskTestResult | null> {
  return async (): Promise<TaskTestResult | null> => {
    if (opts.isAborted() || opts.taskQueue.length === 0) {
      return null;
    }

    const task = opts.taskQueue.shift();
    if (task === undefined) {
      return null;
    }

    // Only pre-select CLI if specific CLIs are provided
    const cli =
      opts.clis !== undefined && opts.clis.length > 0
        ? selectCli(task, opts.options.adapters, opts.clis)
        : undefined;

    try {
      const result = await opts.executeWithRetry(task, cli);
      return handleTaskSuccess(result, opts);
    } catch (caughtError) {
      return handleTaskError(task, cli, caughtError, opts);
    }
  };
}

/**
 * Initializes the promise batch.
 */
function initializeBatch(
  executeNext: () => Promise<TaskTestResult | null>,
  taskQueue: EvaluationTask[],
  parallelism: number
): {
  activePromises: Array<{ promise: Promise<TaskTestResult | null>; index: number }>;
  promiseIndex: number;
} {
  const activePromises: Array<{
    promise: Promise<TaskTestResult | null>;
    index: number;
  }> = [];
  let promiseIndex = 0;

  for (let i = 0; i < parallelism && taskQueue.length > 0; i++) {
    const promise = executeNext();
    activePromises.push({ promise, index: promiseIndex++ });
  }

  return { activePromises, promiseIndex };
}

/**
 * Collects remaining results from active promises.
 */
async function collectRemainingResults(
  activePromises: Array<{ promise: Promise<TaskTestResult | null>; index: number }>
): Promise<TaskTestResult[]> {
  const results: TaskTestResult[] = [];
  const remaining = await Promise.all(activePromises.map((p) => p.promise));
  for (const result of remaining) {
    if (result !== null) {
      results.push(result);
    }
  }
  return results;
}

/**
 * Runs the parallel execution loop.
 */
export async function runParallelLoop(
  executeNext: () => Promise<TaskTestResult | null>,
  taskQueue: EvaluationTask[],
  parallelism: number,
  isAborted: () => boolean
): Promise<TaskTestResult[]> {
  const results: TaskTestResult[] = [];
  const { activePromises, promiseIndex: initialIndex } = initializeBatch(
    executeNext,
    taskQueue,
    parallelism
  );
  let promiseIndex = initialIndex;

  // Process remaining tasks as slots become available
  while (activePromises.length > 0 && !isAborted()) {
    const racingPromises = activePromises.map(({ promise, index }) =>
      promise.then((result) => ({ result, index }))
    );

    const { result, index: completedIndex } = await Promise.race(racingPromises);

    // Remove the completed promise
    const activeIndex = activePromises.findIndex((p) => p.index === completedIndex);
    if (activeIndex !== -1) {
      activePromises.splice(activeIndex, 1);
    }

    if (result !== null) {
      results.push(result);
    }

    if (taskQueue.length > 0 && !isAborted()) {
      const nextPromise = executeNext();
      activePromises.push({ promise: nextPromise, index: promiseIndex++ });
    }
  }

  // Collect remaining results
  const remainingResults = await collectRemainingResults(activePromises);
  results.push(...remainingResults);

  return results;
}
