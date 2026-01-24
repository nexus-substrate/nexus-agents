/**
 * nexus-agents/observability - SwarmObserver Event Payloads
 *
 * Event payload type definitions for swarm observer events.
 * Extracted from swarm-observer-types.ts for file size compliance.
 *
 * @module observability/swarm-observer-payloads
 * (Source: Alignment Roadmap Phase 1, Issue #158)
 */

import type { AgentId, AgentState, TaskId } from './swarm-observer-core-types.js';

/**
 * Discriminated union of event payloads.
 */
export type EventPayload =
  | StateChangePayload
  | MessagePayload
  | ToolPayload
  | MemoryPayload
  | TaskPayload
  | ErrorPayload;

/**
 * Payload for state change events.
 */
export interface StateChangePayload {
  readonly type: 'state_change';
  readonly previousState: AgentState;
  readonly newState: AgentState;
  readonly reason?: string;
}

/**
 * Payload for message events.
 */
export interface MessagePayload {
  readonly type: 'message';
  readonly direction: 'sent' | 'received';
  readonly targetAgentId?: AgentId;
  readonly sourceAgentId?: AgentId;
  readonly messageType: string;
  /** Truncated preview of message content */
  readonly contentPreview?: string;
}

/**
 * Payload for tool invocation events.
 */
export interface ToolPayload {
  readonly type: 'tool';
  readonly phase: 'invoked' | 'completed';
  readonly toolName: string;
  readonly success?: boolean;
  readonly errorMessage?: string;
}

/**
 * Payload for memory operation events.
 */
export interface MemoryPayload {
  readonly type: 'memory';
  readonly operation: 'read' | 'write';
  readonly memoryType: string;
  readonly key?: string;
  readonly sizeBytes?: number;
}

/**
 * Payload for task lifecycle events.
 */
export interface TaskPayload {
  readonly type: 'task';
  readonly phase: 'started' | 'completed';
  readonly taskId: TaskId;
  readonly taskDescription?: string;
  readonly success?: boolean;
}

/**
 * Payload for error events.
 */
export interface ErrorPayload {
  readonly type: 'error';
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly stack?: string;
  readonly recoverable: boolean;
}
