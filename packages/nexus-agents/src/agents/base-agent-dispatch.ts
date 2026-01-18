/**
 * nexus-agents/agents - BaseAgent Message Dispatch Helper (Issue #352)
 *
 * Helper functions for message dispatching and validation in BaseAgent.
 * Extracted to reduce file size in base-agent.ts.
 *
 * @module agents/base-agent-dispatch
 */

import type { Result, AgentMessage, AgentResponse, Task, TaskResult } from '../core/index.js';
import { err, AgentError } from '../core/index.js';
import { AgentMessageSchema } from './agent-schemas.js';
import {
  handleTaskMessage,
  handleQueryMessage,
  handleFeedbackMessage,
  handleStatusMessage,
  handleResultMessage,
  type MessageHandlerContext,
} from './base-agent-message-handlers.js';

/**
 * Parameters for validating an agent message.
 */
export interface ValidateMessageParams {
  msg: AgentMessage;
}

/**
 * Result of message validation.
 */
export interface ValidateMessageResult {
  valid: boolean;
  error?: AgentError;
}

/**
 * Validates an agent message using Zod schema.
 * Returns validation result with optional error.
 */
export function validateMessage(params: ValidateMessageParams): ValidateMessageResult {
  const { msg } = params;
  const validation = AgentMessageSchema.safeParse(msg);

  if (!validation.success) {
    const issues = validation.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return {
      valid: false,
      error: new AgentError(`Invalid message: ${issues}`, {
        context: { messageId: msg.id, validationErrors: validation.error.issues },
      }),
    };
  }

  return { valid: true };
}

/**
 * Parameters for dispatching a message to the appropriate handler.
 */
export interface DispatchMessageParams {
  msg: AgentMessage;
  ctx: MessageHandlerContext;
  executeTask: (task: Task) => Promise<Result<TaskResult, AgentError>>;
}

/**
 * Dispatches a message to the appropriate handler based on type.
 * Returns the result from the handler or an error for unknown types.
 */
export function dispatchMessage(
  params: DispatchMessageParams
): Promise<Result<AgentResponse, AgentError>> {
  const { msg, ctx, executeTask } = params;

  switch (msg.type) {
    case 'task':
      return handleTaskMessage(msg, executeTask) as Promise<Result<AgentResponse, AgentError>>;
    case 'query':
      return handleQueryMessage(msg, ctx) as Promise<Result<AgentResponse, AgentError>>;
    case 'feedback':
      return handleFeedbackMessage(msg, ctx) as Promise<Result<AgentResponse, AgentError>>;
    case 'status':
      return handleStatusMessage(msg, ctx) as Promise<Result<AgentResponse, AgentError>>;
    case 'result':
      return handleResultMessage(msg, ctx) as Promise<Result<AgentResponse, AgentError>>;
    default:
      return Promise.resolve(
        err(
          new AgentError(`Unknown message type: ${String(msg.type)}`, {
            context: { messageId: msg.id, type: msg.type },
          })
        )
      );
  }
}
