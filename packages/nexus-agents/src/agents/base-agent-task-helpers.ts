/**
 * nexus-agents/agents - BaseAgent Task Execution Helpers
 *
 * Helper functions for task validation and execution in BaseAgent.
 * Extracted to reduce file size in base-agent.ts.
 */

import type { Result, Task, TaskResult, ILogger } from '../core/index.js';
import {
  getErrorMessage,
  ok,
  err,
  AgentError,
  getTimeProvider,
  formatZodError,
} from '../core/index.js';

import { TaskSchema } from './agent-schemas.js';
import type { AgentStateMachine } from './state-machine.js';
import type { ITokenBudgetTracker } from '../context/token-budget-tracker.js';

/**
 * Validates a task against the TaskSchema.
 * Returns the validated task or an error with detailed validation issues.
 */
export function validateTask(task: Task): Result<Task, AgentError> {
  const result = TaskSchema.safeParse(task);
  if (!result.success) {
    return err(
      new AgentError(`Invalid task: ${formatZodError(result.error)}`, {
        context: { taskId: task.id, validationErrors: result.error.issues },
      })
    );
  }
  return ok(result.data as Task);
}

/** Parameters for checking agent availability. */
export interface CheckAvailabilityParams {
  agentId: string;
  taskId: string;
  stateMachine: AgentStateMachine;
}

/** Checks if an agent is available to execute a task. Auto-recovers from error state. */
export function checkAgentAvailability(params: CheckAvailabilityParams): Result<void, AgentError> {
  const { agentId, taskId, stateMachine } = params;

  // Auto-recover from error state so agents don't get permanently stuck (#1060)
  if (stateMachine.hasError()) {
    stateMachine.reset();
  }

  if (!stateMachine.isAvailable()) {
    return err(
      new AgentError(`Agent is not idle (current state: ${stateMachine.state})`, {
        context: { agentId, currentState: stateMachine.state, taskId },
      })
    );
  }
  return ok(undefined);
}

/** Parameters for executeWithTimeout helper. */
export interface ExecuteWithTimeoutParams {
  task: Task;
  maxDurationMs: number;
  executeTask: (task: Task) => Promise<Result<TaskResult, AgentError>>;
  transformError: (error: unknown, taskId: string) => AgentError;
  /** Optional AbortSignal for cooperative cancellation (Issue #1088 Phase 2). */
  signal?: AbortSignal;
}

/** Creates a cancellation error for aborted tasks (Issue #1088 Phase 2). */
function makeCancelError(taskId: string): Result<TaskResult, AgentError> {
  return err(
    new AgentError('Task cancelled: agent session expired', {
      context: { taskId, reason: 'abort_signal' },
    })
  );
}

/**
 * Executes a task with a timeout and optional abort signal.
 * Returns a timeout error if the task exceeds the maximum duration,
 * or a cancellation error if the abort signal fires.
 * (Issue #1088 Phase 2: AbortController support for heartbeat-aware cancellation)
 */
export function executeWithTimeout(
  params: ExecuteWithTimeoutParams
): Promise<Result<TaskResult, AgentError>> {
  const { task, maxDurationMs, executeTask, transformError, signal } = params;

  return new Promise((resolve) => {
    let settled = false;

    const settle = (result: Result<TaskResult, AgentError>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      settle(
        err(
          new AgentError(`Task execution timed out after ${String(maxDurationMs)}ms`, {
            context: { taskId: task.id, maxDurationMs },
          })
        )
      );
    }, maxDurationMs);

    // AbortSignal cancellation (Issue #1088 Phase 2)
    if (signal !== undefined) {
      if (signal.aborted) {
        settle(makeCancelError(task.id));
        return;
      }
      signal.addEventListener(
        'abort',
        () => {
          settle(makeCancelError(task.id));
        },
        { once: true }
      );
    }

    executeTask(task)
      .then((result) => {
        settle(result);
      })
      .catch((error: unknown) => {
        settle(err(transformError(error, task.id)));
      });
  });
}

/**
 * Transforms an unknown error into an AgentError with context.
 */
export function transformTaskError(error: unknown, agentId: string, taskId: string): AgentError {
  if (error instanceof AgentError) return error;
  const message = getErrorMessage(error);
  const cause = error instanceof Error ? error : undefined;
  const opts: { context: Record<string, unknown>; cause?: Error } = {
    context: { agentId, taskId },
  };
  if (cause !== undefined) opts.cause = cause;
  return new AgentError(`Task execution failed: ${message}`, opts);
}

/** Parameters for finalizing task success. */
export interface FinalizeTaskParams {
  task: Task;
  result: TaskResult;
  startTime: number;
  stateMachine: AgentStateMachine;
  budgetTracker: ITokenBudgetTracker;
  logger: ILogger;
}

/** Handles successful task completion: state transitions, budget tracking, and logging. */
export function finalizeTaskSuccess(params: FinalizeTaskParams): void {
  const { task, result, startTime, stateMachine, budgetTracker, logger } = params;
  const durationMs = getTimeProvider().now() - startTime;

  // Complete task - if still in thinking, transition through acting first
  if (stateMachine.state === 'thinking') {
    stateMachine.transition('plan_completed', { taskId: task.id });
  }
  stateMachine.transition('task_completed', { taskId: task.id, durationMs });

  const budgetStats = budgetTracker.endTask();
  logger.info('Task completed', {
    taskId: task.id,
    durationMs,
    tokensUsed: result.metadata.tokensUsed,
    taskTokensUsed: budgetStats.taskTokensUsed,
    sessionTokensUsed: budgetStats.sessionTokensUsed,
  });
}

/** Parameters for handling task execution failure. */
export interface HandleTaskFailureParams {
  task: Task;
  error: unknown;
  agentId: string;
  stateMachine: AgentStateMachine;
  budgetTracker: ITokenBudgetTracker;
}

/** Handles task execution failure: state transitions and budget tracking. */
export function handleTaskFailure(params: HandleTaskFailureParams): AgentError {
  const { task, error, agentId, stateMachine, budgetTracker } = params;

  stateMachine.forceError({ taskId: task.id, error: String(error) });
  budgetTracker.endTask();

  return transformTaskError(error, agentId, task.id);
}
