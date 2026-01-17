/**
 * EventBus Bridge Helper Functions
 *
 * Helper functions for EventBus to MCP Server bridge.
 * Extracted to keep main module under 50 lines per function.
 *
 * @module mcp/eventbus-bridge-helpers
 * (Source: Issue #307 - EventBus MCP integration)
 */

import type { EventPayload } from '../observability/index.js';
import type { DomainEvent } from '../agents/collaboration/index.js';

/** Event type returned from topic mapping. */
type SwarmEventType = 'task_started' | 'task_completed' | 'message_sent' | 'state_change' | 'error';

/** Topic keywords for event type detection. */
const TASK_STARTED_KEYWORDS = ['started', 'created'];
const TASK_COMPLETED_KEYWORDS = ['completed', 'finalized', 'reached'];
const MESSAGE_KEYWORDS = ['message', 'sent', 'broadcast'];
const ERROR_KEYWORDS = ['error', 'flagged', 'detected'];

/**
 * Extracts agent ID from event payload.
 */
export function extractAgentId(payload: Record<string, unknown>): string | undefined {
  const fields = ['agentId', 'fromAgentId', 'voterId', 'leaderId', 'participantId'];
  for (const field of fields) {
    const value = payload[field];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

/**
 * Extracts target agent ID from event payload.
 */
export function extractTargetAgentId(payload: Record<string, unknown>): string | undefined {
  const fields = ['toAgentId', 'targetAgentId', 'recipientId'];
  for (const field of fields) {
    const value = payload[field];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

/**
 * Truncates payload to a short preview string.
 */
export function truncatePayload(payload: Record<string, unknown>): string {
  const str = JSON.stringify(payload);
  return str.length > 100 ? str.slice(0, 97) + '...' : str;
}

/**
 * Checks if topic matches any keyword in the list.
 */
function topicMatchesAny(topic: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => topic.includes(keyword));
}

/**
 * Maps EventBus topic to SwarmObserver event type.
 */
export function mapEventType(topic: string): SwarmEventType {
  if (topicMatchesAny(topic, TASK_STARTED_KEYWORDS)) return 'task_started';
  if (topicMatchesAny(topic, TASK_COMPLETED_KEYWORDS)) return 'task_completed';
  if (topicMatchesAny(topic, MESSAGE_KEYWORDS)) return 'message_sent';
  if (topicMatchesAny(topic, ERROR_KEYWORDS)) return 'error';
  return 'state_change';
}

/**
 * Maps EventBus topic to interaction type.
 */
export function mapInteractionType(topic: string): string {
  if (topic.includes('message')) return 'message';
  if (topic.includes('vote')) return 'vote';
  if (topic.includes('delegate')) return 'delegation';
  if (topic.includes('broadcast')) return 'broadcast';
  return 'communication';
}

/**
 * Creates message payload for sent messages.
 */
function createSentMessagePayload(payload: Record<string, unknown>): EventPayload {
  const targetAgentId = extractTargetAgentId(payload);
  const result: EventPayload = {
    type: 'message',
    direction: 'sent',
    messageType: 'event_bus_message',
    contentPreview: truncatePayload(payload),
  };
  if (targetAgentId !== undefined) {
    (result as { targetAgentId?: string }).targetAgentId = targetAgentId;
  }
  return result;
}

/**
 * Creates message payload for received messages.
 */
function createReceivedMessagePayload(payload: Record<string, unknown>): EventPayload {
  const sourceAgentId = extractAgentId(payload);
  const result: EventPayload = {
    type: 'message',
    direction: 'received',
    messageType: 'event_bus_message',
    contentPreview: truncatePayload(payload),
  };
  if (sourceAgentId !== undefined) {
    (result as { sourceAgentId?: string }).sourceAgentId = sourceAgentId;
  }
  return result;
}

/**
 * Creates task started payload.
 */
function createStartedTaskPayload(
  event: DomainEvent,
  payload: Record<string, unknown>
): EventPayload {
  const taskId = typeof payload['taskId'] === 'string' ? payload['taskId'] : event.eventId;
  return {
    type: 'task',
    phase: 'started',
    taskId,
    taskDescription: `EventBus: ${event.topic}`,
  };
}

/**
 * Creates task completed payload.
 */
function createCompletedTaskPayload(
  event: DomainEvent,
  payload: Record<string, unknown>
): EventPayload {
  const taskId = typeof payload['taskId'] === 'string' ? payload['taskId'] : event.eventId;
  const success = payload['success'] !== false;
  return {
    type: 'task',
    phase: 'completed',
    taskId,
    taskDescription: `EventBus: ${event.topic}`,
    success,
  };
}

/**
 * Creates error payload for byzantine/error events.
 */
function createErrorPayload(topic: string, payload: Record<string, unknown>): EventPayload {
  const errorMessage = typeof payload['reason'] === 'string' ? payload['reason'] : topic;
  return {
    type: 'error',
    errorCode: 'EVENT_BUS_ERROR',
    errorMessage,
    recoverable: true,
  };
}

/**
 * Creates default state change payload.
 */
function createDefaultPayload(topic: string): EventPayload {
  return {
    type: 'state_change',
    previousState: 'idle',
    newState: 'executing',
    reason: `EventBus: ${topic}`,
  };
}

/**
 * Creates message payload based on topic type.
 */
function createMessagePayload(
  topic: string,
  payload: Record<string, unknown>
): EventPayload | null {
  if (topic.includes('message.sent')) return createSentMessagePayload(payload);
  if (topic.includes('message.received')) return createReceivedMessagePayload(payload);
  return null;
}

/**
 * Creates task payload based on topic type.
 */
function createTaskPayload(
  topic: string,
  event: DomainEvent,
  payload: Record<string, unknown>
): EventPayload | null {
  if (topicMatchesAny(topic, TASK_STARTED_KEYWORDS)) {
    return createStartedTaskPayload(event, payload);
  }
  if (topicMatchesAny(topic, TASK_COMPLETED_KEYWORDS)) {
    return createCompletedTaskPayload(event, payload);
  }
  return null;
}

/**
 * Creates a valid EventPayload from EventBus event.
 * Maps EventBus topics to SwarmObserver payload types.
 */
export function createObserverPayload(
  event: DomainEvent,
  payload: Record<string, unknown>
): EventPayload {
  const topic = event.topic;

  // Try message payload first
  const messagePayload = createMessagePayload(topic, payload);
  if (messagePayload !== null) return messagePayload;

  // Try task payload
  const taskPayload = createTaskPayload(topic, event, payload);
  if (taskPayload !== null) return taskPayload;

  // Check for error/byzantine events
  if (topicMatchesAny(topic, ERROR_KEYWORDS)) {
    return createErrorPayload(topic, payload);
  }

  // Default to state change
  return createDefaultPayload(topic);
}
