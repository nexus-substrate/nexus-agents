/**
 * @nexus-agents/workflows - Parallel Executor
 *
 * Executes workflow steps in parallel with concurrency limiting,
 * fail-fast behavior, and cancellation support.
 */

import type { Result } from '../core/index.js';
import { ok, err, WorkflowError } from '../core/index.js';
import type { WorkflowStep, StepResult } from '../core/index.js';
import { TaskQueue } from './task-queue.js';

/**
 * Options for parallel execution.
 */
export interface ParallelOptions {
  /** Maximum concurrent steps (default: 5) */
  maxConcurrency?: number;
  /** Stop on first error (default: true) */
  failFast?: boolean;
  /** Overall timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Context passed to step executor.
 */
export interface ExecutionContext {
  /** Workflow execution ID */
  executionId: string;
  /** Results from previous steps */
  stepResults: Map<string, StepResult>;
  /** Workflow inputs */
  inputs: Record<string, unknown>;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Function signature for step execution.
 */
export type StepExecutor = (step: WorkflowStep, context: ExecutionContext) => Promise<StepResult>;

/**
 * Default parallel execution options.
 */
const DEFAULT_OPTIONS: Required<ParallelOptions> = {
  maxConcurrency: 5,
  failFast: true,
  timeoutMs: 0, // 0 means no timeout
};

/**
 * Creates a cancelled step result.
 */
function createCancelledResult(stepId: string): StepResult {
  return { stepId, output: null, durationMs: 0, status: 'skipped', error: 'Execution cancelled' };
}

/**
 * Creates a timeout step result.
 */
function createTimeoutResult(stepId: string, durationMs: number, timeoutMs: number): StepResult {
  return {
    stepId,
    output: null,
    durationMs,
    status: 'failed',
    error: `Step timed out after ${String(timeoutMs)}ms`,
  };
}

/**
 * Creates a failed step result from an error.
 */
function createErrorResult(stepId: string, durationMs: number, error: unknown): StepResult {
  return {
    stepId,
    output: null,
    durationMs,
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Executes a single step with timeout and abort support.
 */
async function executeStepWithTimeout(
  step: WorkflowStep,
  context: ExecutionContext,
  stepExecutor: StepExecutor,
  signal: AbortSignal
): Promise<StepResult> {
  if (signal.aborted) {
    return createCancelledResult(step.id);
  }

  const stepTimeout = step.timeout ?? 0;
  const startTime = Date.now();
  const stepContext: ExecutionContext = { ...context, signal };

  if (stepTimeout === 0) {
    return stepExecutor(step, stepContext);
  }

  return executeWithTimeout(step, stepContext, stepExecutor, stepTimeout, startTime);
}

/**
 * Executes step with a timeout wrapper.
 */
function executeWithTimeout(
  step: WorkflowStep,
  context: ExecutionContext,
  executor: StepExecutor,
  timeout: number,
  startTime: number
): Promise<StepResult> {
  return new Promise<StepResult>((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve(createTimeoutResult(step.id, Date.now() - startTime, timeout));
    }, timeout);

    executor(step, context)
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutId);
        resolve(createErrorResult(step.id, Date.now() - startTime, error));
      });
  });
}

/** Internal state for parallel execution */
interface ParallelState {
  results: StepResult[];
  firstError: WorkflowError | null;
  completed: boolean;
  timeoutId: ReturnType<typeof setTimeout> | undefined;
  queue: TaskQueue<StepResult>;
  abortController: AbortController;
}

/** Creates WorkflowError for step failure */
function createStepError(stepId: string, errorMsg: string | undefined): WorkflowError {
  const message = errorMsg ?? 'Unknown error';
  return new WorkflowError(`Step '${stepId}' failed: ${message}`, {
    context: { stepId, error: message },
  });
}

/** Creates WorkflowError for timeout */
function createTimeoutError(timeoutMs: number): WorkflowError {
  return new WorkflowError(`Parallel execution timed out after ${String(timeoutMs)}ms`, {
    context: { timeoutMs, isTimeout: true },
  });
}

/** Sets up overall timeout for execution */
function setupOverallTimeout(state: ParallelState, opts: Required<ParallelOptions>): void {
  if (opts.timeoutMs <= 0) return;

  state.timeoutId = setTimeout(() => {
    if (!state.completed) {
      state.firstError = createTimeoutError(opts.timeoutMs);
      state.abortController.abort();
      state.queue.cancel();
    }
  }, opts.timeoutMs);
}

/** Cleans up execution state */
function cleanupExecution(state: ParallelState): void {
  if (state.timeoutId !== undefined) {
    clearTimeout(state.timeoutId);
  }
  state.queue.cancel();
}

/** Sorts results by original step order */
function sortResultsByStepOrder(results: StepResult[], steps: WorkflowStep[]): void {
  const stepOrder = new Map(steps.map((s, i) => [s.id, i]));
  results.sort((a, b) => (stepOrder.get(a.stepId) ?? 0) - (stepOrder.get(b.stepId) ?? 0));
}

/**
 * Executes steps in parallel with concurrency limiting.
 */
export async function executeParallel(
  steps: WorkflowStep[],
  context: ExecutionContext,
  stepExecutor: StepExecutor,
  options?: ParallelOptions
): Promise<Result<StepResult[], WorkflowError>> {
  if (steps.length === 0) {
    return ok([]);
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const state: ParallelState = {
    results: [],
    firstError: null,
    completed: false,
    timeoutId: undefined,
    queue: new TaskQueue<StepResult>(opts.maxConcurrency),
    abortController: new AbortController(),
  };

  if (context.signal !== undefined) {
    context.signal.addEventListener('abort', () => {
      state.abortController.abort();
    });
  }

  try {
    setupOverallTimeout(state, opts);
    await runAllSteps(steps, context, stepExecutor, opts, state);
    state.completed = true;
    cleanupExecution(state);

    if (state.firstError !== null) {
      return err(state.firstError);
    }

    sortResultsByStepOrder(state.results, steps);
    return ok(state.results);
  } catch (error) {
    cleanupExecution(state);
    return err(
      new WorkflowError('Parallel execution failed unexpectedly', {
        cause: error instanceof Error ? error : new Error(String(error)),
      })
    );
  }
}

/** Runs all steps through the queue */
async function runAllSteps(
  steps: WorkflowStep[],
  context: ExecutionContext,
  stepExecutor: StepExecutor,
  opts: Required<ParallelOptions>,
  state: ParallelState
): Promise<void> {
  const promises = steps.map((step) =>
    executeStepInQueue(step, context, stepExecutor, opts, state)
  );
  await Promise.allSettled(promises);
}

/** Executes a single step in the queue */
async function executeStepInQueue(
  step: WorkflowStep,
  context: ExecutionContext,
  stepExecutor: StepExecutor,
  opts: Required<ParallelOptions>,
  state: ParallelState
): Promise<StepResult> {
  try {
    const result = await state.queue.add((signal) => {
      const combined = new AbortController();
      signal.addEventListener('abort', () => {
        combined.abort();
      });
      state.abortController.signal.addEventListener('abort', () => {
        combined.abort();
      });
      return executeStepWithTimeout(step, context, stepExecutor, combined.signal);
    });

    state.results.push(result);
    if (opts.failFast && result.status === 'failed' && state.firstError === null) {
      state.firstError = createStepError(result.stepId, result.error);
      state.abortController.abort();
      state.queue.cancel();
    }
    return result;
  } catch (error: unknown) {
    const stepResult = createErrorResult(step.id, 0, error);
    state.results.push(stepResult);
    if (opts.failFast && state.firstError === null) {
      state.firstError = createStepError(step.id, stepResult.error);
      state.abortController.abort();
      state.queue.cancel();
    }
    return stepResult;
  }
}

/**
 * Creates a step executor that wraps a base executor with retry logic.
 *
 * @param baseExecutor - Base step executor
 * @param defaultRetries - Default retry count for steps without explicit retries
 * @returns Step executor with retry support
 */
export function withRetries(baseExecutor: StepExecutor, defaultRetries = 0): StepExecutor {
  return async (step, context): Promise<StepResult> => {
    const maxRetries = step.retries ?? defaultRetries;
    let lastResult: StepResult | null = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
      // Check for cancellation - use explicit boolean check
      const isAborted = context.signal?.aborted === true;
      if (isAborted) {
        return createCancelledResult(step.id);
      }

      lastResult = await baseExecutor(step, context);

      if (lastResult.status === 'success') {
        return lastResult;
      }

      attempt++;

      if (attempt <= maxRetries) {
        // Exponential backoff: 100ms, 200ms, 400ms, etc.
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (lastResult !== null) {
      return lastResult;
    }

    return {
      stepId: step.id,
      output: null,
      durationMs: 0,
      status: 'failed',
      error: 'Max retries exceeded',
    };
  };
}

/**
 * Checks if all step results are successful.
 *
 * @param results - Array of step results
 * @returns True if all steps succeeded
 */
export function allSucceeded(results: StepResult[]): boolean {
  return results.every((r) => r.status === 'success');
}

/**
 * Gets failed step results.
 *
 * @param results - Array of step results
 * @returns Array of failed step results
 */
export function getFailedSteps(results: StepResult[]): StepResult[] {
  return results.filter((r) => r.status === 'failed');
}
