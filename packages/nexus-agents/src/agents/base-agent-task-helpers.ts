/**
 * nexus-agents/agents - BaseAgent Task Execution Helpers
 *
 * Helper functions for task validation and execution in BaseAgent.
 * Extracted to reduce file size in base-agent.ts.
 */

import type { Result, Task, TaskResult, ILogger } from '../core/index.js';
import { ok, err, AgentError, getTimeProvider, formatZodError } from '../core/index.js';
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

/** Checks if an agent is available to execute a task. */
export function checkAgentAvailability(params: CheckAvailabilityParams): Result<void, AgentError> {
  const { agentId, taskId, stateMachine } = params;
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
}

/**
 * Executes a task with a timeout.
 * Returns a timeout error if the task exceeds the maximum duration.
 */
export function executeWithTimeout(
  params: ExecuteWithTimeoutParams
): Promise<Result<TaskResult, AgentError>> {
  const { task, maxDurationMs, executeTask, transformError } = params;

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve(
        err(
          new AgentError(`Task execution timed out after ${String(maxDurationMs)}ms`, {
            context: { taskId: task.id, maxDurationMs },
          })
        )
      );
    }, maxDurationMs);

    executeTask(task)
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutId);
        resolve(err(transformError(error, task.id)));
      });
  });
}

/**
 * Transforms an unknown error into an AgentError with context.
 */
export function transformTaskError(error: unknown, agentId: string, taskId: string): AgentError {
  if (error instanceof AgentError) return error;
  const message = error instanceof Error ? error.message : String(error);
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
