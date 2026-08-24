/**
 * nexus-agents/agents - BaseAgent Execute Flow Helpers
 *
 * Helper functions for task execution flow in BaseAgent.
 * Extracted to reduce file size in base-agent.ts (Issue #340).
 *
 * @module agents/base-agent-execute-flow
 */

import type { Result, Task, TaskResult, ILogger, Message } from '../core/index.js';
import { AgentError, getTimeProvider } from '../core/index.js';
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
import { HEARTBEAT_TIMEOUTS } from '../config/timeouts.js';
import { getHeartbeatMonitor, runInHeartbeatSession } from './heartbeat-monitor.js';
import { createLogger } from '../core/index.js';

const MAX_HISTORY_ITEMS = 100;
const heartbeatLogger = createLogger({ component: 'heartbeat' });

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

  return { valid: true, startTime: getTimeProvider().now() };
}

/**
 * Wires an external AbortSignal into the internal controller so a single
 * abort path covers both heartbeat expiry and caller-initiated cancellation
 * (#3016/#3040). Returns the listener so it can be removed in `finally`.
 */
function wireExternalAbort(
  externalSignal: AbortSignal | undefined,
  controller: AbortController
): (() => void) | undefined {
  if (externalSignal === undefined) return undefined;
  if (externalSignal.aborted) {
    controller.abort();
    return undefined;
  }
  const listener = (): void => {
    controller.abort();
  };
  externalSignal.addEventListener('abort', listener, { once: true });
  return listener;
}

/**
 * Runs task with configured timeout and heartbeat-aware cancellation.
 *
 * Phase 2 (Issue #1088): Integrates HeartbeatMonitor for session tracking
 * and AbortController for cooperative cancellation when session expires.
 * The safety-cap timeout in executeWithTimeout remains as a fallback.
 *
 * #3016/#3040: Optional `externalSignal` lets a caller (e.g., the workflow
 * step-executor) cancel the task when its own deadline wins a race. The
 * caller's signal is forwarded to executeWithTimeout in addition to the
 * internal heartbeat signal — either firing settles the task.
 */
export async function runTaskWithTimeout(
  task: Task,
  agentId: string,
  executeTask: (task: Task) => Promise<Result<TaskResult, AgentError>>,
  options?: { externalSignal?: AbortSignal | undefined }
): Promise<Result<TaskResult, AgentError>> {
  const maxDuration = task.constraints?.maxDuration ?? HEARTBEAT_TIMEOUTS.absoluteMaxMs;

  // Phase 2: Heartbeat session + AbortController (Issue #1088)
  const controller = new AbortController();
  const monitor = getHeartbeatMonitor();
  const sessionId = monitor.startSession(agentId);

  // Forward caller's external abort into the internal controller so the
  // single signal threaded into executeWithTimeout fires for either reason.
  const externalSignal = options?.externalSignal;
  const externalAbortListener = wireExternalAbort(externalSignal, controller);

  // Periodic health check — log transitions, abort on expiry (Phase 4)
  const healthCheckTimer = setInterval(() => {
    const transition = monitor.getSessionHealth(sessionId);
    if (transition?.changed === true) {
      const msg = `Agent health: ${transition.previousHealth} → ${transition.health}`;
      if (transition.health === 'stalled') {
        heartbeatLogger.warn(msg, { agentId, sessionId, elapsedMs: transition.elapsedMs });
      } else if (transition.health === 'slow') {
        heartbeatLogger.info(msg, { agentId, sessionId, elapsedMs: transition.elapsedMs });
      }
    }
    // #4665: the timer OBSERVES only. It used to pet the session here, one
    // line after reading its health, so `timeSince` could never exceed the
    // 15s tick and the 60s/120s thresholds were unreachable.
    if (monitor.isExpired(sessionId)) {
      heartbeatLogger.warn('Agent session expired — aborting', { agentId, sessionId });
      controller.abort();
    }
  }, HEARTBEAT_TIMEOUTS.heartbeatIntervalMs);

  try {
    // Step activity inside this scope is what keeps the session alive.
    return await runInHeartbeatSession(sessionId, () =>
      executeWithTimeout({
        task,
        maxDurationMs: maxDuration,
        executeTask,
        transformError: (error, taskId) => transformTaskError(error, agentId, taskId),
        signal: controller.signal,
      })
    );
  } finally {
    clearInterval(healthCheckTimer);
    monitor.endSession(sessionId);
    if (externalSignal !== undefined && externalAbortListener !== undefined) {
      externalSignal.removeEventListener('abort', externalAbortListener);
    }
  }
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
