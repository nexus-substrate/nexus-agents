/**
 * nexus-agents/agents - BaseAgent Message Handlers
 *
 * Helper functions for handling different message types in BaseAgent.
 * Extracted for file size compliance (CODING_STANDARDS.md Section 3).
 */

import type {
  Result,
  Task,
  AgentMessage,
  AgentResponse,
  AgentState,
  AgentRole,
  AgentCapability,
} from '../core/index.js';
import type { ILogger } from '../core/index.js';
import { ok } from '../core/index.js';

/**
 * Context needed by message handlers.
 */
export interface MessageHandlerContext {
  readonly id: string;
  readonly role: AgentRole;
  readonly state: AgentState;
  readonly capabilities: readonly AgentCapability[];
  readonly initialized: boolean;
  readonly historyLength: number;
  readonly logger: ILogger;
}

/**
 * Executor function type for task execution.
 */
export type TaskExecutor = (task: Task) => Promise<Result<unknown, Error>>;

/**
 * Handles 'task' type messages by executing the embedded task.
 */
export async function handleTaskMessage(
  msg: AgentMessage,
  executor: TaskExecutor
): Promise<Result<AgentResponse, Error>> {
  const taskPayload = msg.payload as Partial<Task>;
  if (taskPayload.id === undefined || taskPayload.description === undefined) {
    return ok({
      messageId: msg.id,
      status: 'rejected',
      error: 'Invalid task payload: missing id or description',
    });
  }

  const task: Task = {
    id: taskPayload.id,
    description: taskPayload.description,
    context: taskPayload.context ?? {},
  };
  if (taskPayload.constraints !== undefined) {
    task.constraints = taskPayload.constraints;
  }
  if (taskPayload.priority !== undefined) {
    task.priority = taskPayload.priority;
  }

  const result = await executor(task);
  if (!result.ok) {
    return ok({ messageId: msg.id, status: 'failed', error: result.error.message });
  }

  return ok({ messageId: msg.id, status: 'completed', data: result.value });
}

/**
 * Handles 'query' type messages by returning agent info.
 */
export function handleQueryMessage(
  msg: AgentMessage,
  ctx: MessageHandlerContext
): Promise<Result<AgentResponse, Error>> {
  return Promise.resolve(
    ok({
      messageId: msg.id,
      status: 'completed',
      data: {
        agentId: ctx.id,
        role: ctx.role,
        state: ctx.state,
        capabilities: ctx.capabilities,
      },
    })
  );
}

/**
 * Handles 'feedback' type messages by logging and acknowledging.
 */
export function handleFeedbackMessage(
  msg: AgentMessage,
  ctx: MessageHandlerContext
): Promise<Result<AgentResponse, Error>> {
  ctx.logger.info('Received feedback', { from: msg.from, payload: msg.payload });
  return Promise.resolve(ok({ messageId: msg.id, status: 'accepted' }));
}

/**
 * Handles 'status' type messages by returning agent status.
 */
export function handleStatusMessage(
  msg: AgentMessage,
  ctx: MessageHandlerContext
): Promise<Result<AgentResponse, Error>> {
  return Promise.resolve(
    ok({
      messageId: msg.id,
      status: 'completed',
      data: {
        agentId: ctx.id,
        state: ctx.state,
        initialized: ctx.initialized,
        historyLength: ctx.historyLength,
      },
    })
  );
}

/**
 * Handles 'result' type messages by logging and acknowledging.
 */
export function handleResultMessage(
  msg: AgentMessage,
  ctx: MessageHandlerContext
): Promise<Result<AgentResponse, Error>> {
  ctx.logger.debug('Received result', { from: msg.from });
  return Promise.resolve(ok({ messageId: msg.id, status: 'accepted' }));
}
