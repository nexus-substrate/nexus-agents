/**
 * nexus-agents/agents - BaseAgent Execute Flow Helpers
 *
 * Helper functions for task execution flow in BaseAgent.
 * Extracted to reduce file size in base-agent.ts (Issue #340).
 *
 * @module agents/base-agent-execute-flow
 */

import type { Result, Task, TaskResult, ILogger, Message } from '../core/index.js';
import { AgentError } from '../core/index.js';
import type { ITokenBudgetTracker } from '../context/token-budget-tracker.js';
import type { IMemoryBackend } from '../context/memory-backend-types.js';
import type { AgentStateMachine } from './state-machine.js';
import type { AgentMemoryState, MemoryPersistenceMode } from './base-agent-memory-init.js';
import {
  validateTask,
  checkAgentAvailability,
  executeWithTimeout,
  transformTaskError,
  finalizeTaskSuccess,
  handleTaskFailure,
} from './base-agent-task-helpers.js';
import { recordFailedTaskError, persistMemoryAfterTask } from './base-agent-execution-helpers.js';

const MAX_HISTORY_ITEMS = 100;
const DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000;

/**
 * Context for execute flow operations.
 */
export interface ExecuteFlowContext {
  agentId: string;
  stateMachine: AgentStateMachine;
  budgetTracker: ITokenBudgetTracker;
  logger: ILogger;
  memoryEnabled: boolean;
  memoryState: AgentMemoryState | null;
}

/**
 * Memory context for task execution.
 */
export interface TaskMemoryContext {
  memoryEnabled: boolean;
  memoryBackend: IMemoryBackend | undefined;
  memoryState: AgentMemoryState | null;
  persistenceMode: MemoryPersistenceMode;
}

/**
 * Result of initial execute validation and setup.
 */
export interface ExecuteSetupResult {
  valid: boolean;
  error?: AgentError;
  startTime: number;
}

/**
 * Validates task and checks agent availability.
 * Returns setup result with validation status.
 */
export function setupExecute(ctx: ExecuteFlowContext, task: Task): ExecuteSetupResult {
  const validationResult = validateTask(task);
  if (!validationResult.ok) {
    return { valid: false, error: validationResult.error, startTime: 0 };
  }

  const availabilityCheck = checkAgentAvailability({
    agentId: ctx.agentId,
    taskId: task.id,
    stateMachine: ctx.stateMachine,
  });
  if (!availabilityCheck.ok) {
    return { valid: false, error: availabilityCheck.error, startTime: 0 };
  }

  return { valid: true, startTime: Date.now() };
}

/**
 * Runs task with configured timeout.
 */
export async function runTaskWithTimeout(
  task: Task,
  agentId: string,
  executeTask: (task: Task) => Promise<Result<TaskResult, AgentError>>
): Promise<Result<TaskResult, AgentError>> {
  const maxDuration = task.constraints?.maxDuration ?? DEFAULT_MAX_DURATION_MS;
  return executeWithTimeout({
    task,
    maxDurationMs: maxDuration,
    executeTask,
    transformError: (error, taskId) => transformTaskError(error, agentId, taskId),
  });
}

/**
 * Handles execution failure by updating state machine and budget tracker.
 */
export function handleExecutionFailure(
  task: Task,
  result: Result<TaskResult, AgentError>,
  ctx: ExecuteFlowContext
): Result<TaskResult, AgentError> {
  if (!result.ok) {
    ctx.stateMachine.forceError({ taskId: task.id, error: result.error.message });
    ctx.budgetTracker.endTask();
  }
  return result;
}

/**
 * Finalizes successful task execution.
 */
export async function finalizeSuccessfulExecution(
  task: Task,
  result: TaskResult,
  startTime: number,
  ctx: ExecuteFlowContext,
  memoryCtx: TaskMemoryContext
): Promise<AgentMemoryState | null> {
  finalizeTaskSuccess({
    task,
    result,
    startTime,
    stateMachine: ctx.stateMachine,
    budgetTracker: ctx.budgetTracker,
    logger: ctx.logger,
  });

  if (memoryCtx.memoryEnabled && memoryCtx.persistenceMode === 'on_task_complete') {
    return persistMemoryAfterTask({
      memoryEnabled: memoryCtx.memoryEnabled,
      memoryBackend: memoryCtx.memoryBackend,
      memoryState: memoryCtx.memoryState,
      persistenceMode: memoryCtx.persistenceMode,
      task,
      startTime,
      logger: ctx.logger,
    });
  }

  return memoryCtx.memoryState;
}

/**
 * Handles execution error by recording to memory and returning error result.
 */
export function handleExecutionError(
  task: Task,
  error: unknown,
  ctx: ExecuteFlowContext,
  memoryCtx: TaskMemoryContext
): { error: AgentError; updatedMemoryState: AgentMemoryState | null } {
  const updatedMemoryState = recordFailedTaskError({
    memoryEnabled: memoryCtx.memoryEnabled,
    memoryState: memoryCtx.memoryState,
    error,
  });

  const agentError = handleTaskFailure({
    task,
    error,
    agentId: ctx.agentId,
    stateMachine: ctx.stateMachine,
    budgetTracker: ctx.budgetTracker,
  });

  return { error: agentError, updatedMemoryState };
}

/**
 * Manages message history with bounded size.
 */
export function addToHistory(history: Message[], message: Message): Message[] {
  const updated = [...history, message];
  if (updated.length > MAX_HISTORY_ITEMS) {
    return updated.slice(-MAX_HISTORY_ITEMS);
  }
  return updated;
}

/**
 * Returns a copy of the history array.
 */
export function getHistoryCopy(history: Message[]): Message[] {
  return [...history];
}
