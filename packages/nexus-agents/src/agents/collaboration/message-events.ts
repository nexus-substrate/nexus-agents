/**
 * Message Routing EventBus Integration Helpers
 * (Source: Issue #217, Sprint #219)
 *
 * Provides helper functions for emitting message.sent and message.received events.
 *
 * @module agents/collaboration/message-events
 */

import type {
  IEventBus,
  MessageSentEvent,
  MessageReceivedEvent,
  AgentTaskDelegatedEvent,
  AgentResultBroadcastEvent,
} from './event-bus-types.js';
import { createEvent } from './event-bus.js';
import type { AgentMessage, TaskResult } from '../../core/types/index.js';
import type { CollaborationMessage } from './collaboration-types.js';

// =============================================================================
// Message Conversion
// =============================================================================

/**
 * Converts AgentMessage to CollaborationMessage-like payload for events.
 * This bridges the generic AgentMessage type with the event payload format.
 */
function toCollaborationPayload(message: AgentMessage): Record<string, unknown> {
  return {
    type: message.type,
    from: message.from,
    to: message.to,
    payload: message.payload,
    timestamp: message.timestamp,
  };
}

// =============================================================================
// Message Events
// =============================================================================

/** Parameters for emitting message.sent event. */
export interface MessageSentParams {
  readonly message: AgentMessage;
  readonly from: string;
  readonly to?: string | undefined;
  readonly sessionId?: string | undefined;
  readonly correlationId?: string | undefined;
}

/** Emits message.sent event when a message is sent between agents. */
export function emitMessageSent(eventBus: IEventBus, params: MessageSentParams): void {
  const event = createEvent<MessageSentEvent>(
    'message.sent',
    {
      message: toCollaborationPayload(params.message) as unknown as CollaborationMessage,
      from: params.from,
      ...(params.to !== undefined && { to: params.to }),
    },
    {
      ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
      ...(params.correlationId !== undefined && { correlationId: params.correlationId }),
    }
  );
  eventBus.emit(event);
}

/** Parameters for emitting message.received event. */
export interface MessageReceivedParams {
  readonly message: AgentMessage;
  readonly by: string;
  readonly sessionId?: string | undefined;
  readonly correlationId?: string | undefined;
}

/** Emits message.received event when an agent receives a message. */
export function emitMessageReceived(eventBus: IEventBus, params: MessageReceivedParams): void {
  const event = createEvent<MessageReceivedEvent>(
    'message.received',
    {
      message: toCollaborationPayload(params.message) as unknown as CollaborationMessage,
      by: params.by,
    },
    {
      ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
      ...(params.correlationId !== undefined && { correlationId: params.correlationId }),
    }
  );
  eventBus.emit(event);
}

// =============================================================================
// Agent Coordination Events
// =============================================================================

/** Parameters for emitting agent.task_delegated event. */
export interface TaskDelegatedParams {
  readonly fromAgent: string;
  readonly toAgent: string;
  readonly taskDescription: string;
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly sessionId?: string | undefined;
  readonly correlationId?: string | undefined;
}

/** Emits agent.task_delegated event when an agent delegates a task. */
export function emitTaskDelegated(eventBus: IEventBus, params: TaskDelegatedParams): void {
  const event = createEvent<AgentTaskDelegatedEvent>(
    'agent.task_delegated',
    {
      fromAgent: params.fromAgent,
      toAgent: params.toAgent,
      taskDescription: params.taskDescription,
      priority: params.priority,
    },
    {
      ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
      ...(params.correlationId !== undefined && { correlationId: params.correlationId }),
    }
  );
  eventBus.emit(event);
}

/** Parameters for emitting agent.result_broadcast event. */
export interface ResultBroadcastParams {
  readonly agentId: string;
  readonly result: TaskResult;
  readonly recipients: readonly string[];
  readonly sessionId?: string | undefined;
  readonly correlationId?: string | undefined;
}

/** Emits agent.result_broadcast event when an agent broadcasts a result. */
export function emitResultBroadcast(eventBus: IEventBus, params: ResultBroadcastParams): void {
  const event = createEvent<AgentResultBroadcastEvent>(
    'agent.result_broadcast',
    {
      agentId: params.agentId,
      result: params.result,
      recipients: params.recipients,
    },
    {
      ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
      ...(params.correlationId !== undefined && { correlationId: params.correlationId }),
    }
  );
  eventBus.emit(event);
}
