/**
 * Event Bus Type Definitions
 *
 * Type-safe event bus for agent-to-agent communication.
 * Enables peer-to-peer messaging without MCP client roundtrips.
 *
 * @module agents/collaboration/event-bus-types
 * (Source: Issue #182, ARCHITECTURE.md Hybrid Architecture)
 */

import type { AgentRole, TaskResult } from '../../core/types/index.js';
import type { SessionStatus, CollaborationMessage, VoteDecision } from './collaboration-types.js';

/**
 * Unique identifier for event subscriptions.
 */
export type SubscriptionId = string;

/**
 * Event topic patterns support wildcards:
 * - 'session.created' - exact match
 * - 'session.*' - matches session.created, session.completed, etc.
 * - '*' - matches all events
 */
export type TopicPattern = string;

/**
 * Base event structure for all domain events.
 */
export interface DomainEvent {
  /** Unique event identifier */
  readonly eventId: string;
  /** ISO 8601 timestamp */
  readonly timestamp: string;
  /** Event topic for routing */
  readonly topic: string;
  /** Optional correlation ID for tracing */
  readonly correlationId?: string;
  /** Optional session ID for scoping */
  readonly sessionId?: string;
  /** Event payload (type-specific) */
  readonly payload: unknown;
}

/**
 * Session lifecycle events.
 */
export interface SessionCreatedEvent extends DomainEvent {
  readonly topic: 'session.created';
  readonly payload: {
    readonly sessionId: string;
    readonly pattern: string;
    readonly experts: readonly string[];
  };
}

export interface SessionStatusChangedEvent extends DomainEvent {
  readonly topic: 'session.status_changed';
  readonly payload: {
    readonly previousStatus: SessionStatus;
    readonly newStatus: SessionStatus;
  };
}

export interface SessionParticipantJoinedEvent extends DomainEvent {
  readonly topic: 'session.participant_joined';
  readonly payload: {
    readonly expertId: string;
    readonly role: AgentRole;
  };
}

export interface SessionResultSubmittedEvent extends DomainEvent {
  readonly topic: 'session.result_submitted';
  readonly payload: {
    readonly expertId: string;
    readonly result: TaskResult;
  };
}

export interface SessionFinalizedEvent extends DomainEvent {
  readonly topic: 'session.finalized';
  readonly payload: {
    readonly success: boolean;
    readonly resultCount: number;
    readonly durationMs: number;
  };
}

/**
 * Message routing events.
 */
export interface MessageSentEvent extends DomainEvent {
  readonly topic: 'message.sent';
  readonly payload: {
    readonly message: CollaborationMessage;
    readonly from: string;
    readonly to?: string;
  };
}

export interface MessageReceivedEvent extends DomainEvent {
  readonly topic: 'message.received';
  readonly payload: {
    readonly message: CollaborationMessage;
    readonly by: string;
  };
}

/**
 * Agent coordination events.
 */
export interface AgentTaskDelegatedEvent extends DomainEvent {
  readonly topic: 'agent.task_delegated';
  readonly payload: {
    readonly fromAgent: string;
    readonly toAgent: string;
    readonly taskDescription: string;
    readonly priority: 'critical' | 'high' | 'medium' | 'low';
  };
}

export interface AgentResultBroadcastEvent extends DomainEvent {
  readonly topic: 'agent.result_broadcast';
  readonly payload: {
    readonly agentId: string;
    readonly result: TaskResult;
    readonly recipients: readonly string[];
  };
}

/**
 * Consensus voting events.
 */
export interface ConsensusVoteRequestedEvent extends DomainEvent {
  readonly topic: 'consensus.vote_requested';
  readonly payload: {
    readonly proposalId: string;
    readonly proposal: string;
    readonly voters: readonly string[];
    readonly deadline?: string;
  };
}

export interface ConsensusVoteCastEvent extends DomainEvent {
  readonly topic: 'consensus.vote_cast';
  readonly payload: {
    readonly proposalId: string;
    readonly voterId: string;
    readonly decision: VoteDecision;
    readonly reasoning: string;
  };
}

export interface ConsensusReachedEvent extends DomainEvent {
  readonly topic: 'consensus.reached';
  readonly payload: {
    readonly proposalId: string;
    readonly decision: VoteDecision;
    readonly voteCount: number;
    readonly unanimity: boolean;
  };
}

/**
 * Protocol lifecycle events.
 */
export interface ProtocolStartedEvent extends DomainEvent {
  readonly topic: 'protocol.started';
  readonly payload: {
    readonly protocolType: string;
    readonly config: Record<string, unknown>;
  };
}

export interface ProtocolIterationEvent extends DomainEvent {
  readonly topic: 'protocol.iteration';
  readonly payload: {
    readonly round: number;
    readonly maxRounds: number;
    readonly status: 'in_progress' | 'converged' | 'max_reached';
  };
}

export interface ProtocolCompletedEvent extends DomainEvent {
  readonly topic: 'protocol.completed';
  readonly payload: {
    readonly success: boolean;
    readonly iterations: number;
    readonly durationMs: number;
  };
}

/**
 * Union type for all typed events.
 */
export type TypedEvent =
  | SessionCreatedEvent
  | SessionStatusChangedEvent
  | SessionParticipantJoinedEvent
  | SessionResultSubmittedEvent
  | SessionFinalizedEvent
  | MessageSentEvent
  | MessageReceivedEvent
  | AgentTaskDelegatedEvent
  | AgentResultBroadcastEvent
  | ConsensusVoteRequestedEvent
  | ConsensusVoteCastEvent
  | ConsensusReachedEvent
  | ProtocolStartedEvent
  | ProtocolIterationEvent
  | ProtocolCompletedEvent;

/**
 * Event listener function type.
 */
export type EventListener<T extends DomainEvent = DomainEvent> = (event: T) => void | Promise<void>;

/**
 * Subscription handle for managing event subscriptions.
 */
export interface Subscription {
  /** Unique subscription identifier */
  readonly id: SubscriptionId;
  /** Topic pattern this subscription matches */
  readonly pattern: TopicPattern;
  /** Unsubscribe from events */
  unsubscribe(): void;
}

/**
 * Event filter for querying event history.
 */
export interface EventFilter {
  /** Filter by topic pattern */
  topic?: TopicPattern;
  /** Filter by session ID */
  sessionId?: string;
  /** Filter by correlation ID */
  correlationId?: string;
  /** Filter events after this timestamp */
  after?: string;
  /** Filter events before this timestamp */
  before?: string;
  /** Maximum number of events to return */
  limit?: number;
}

/**
 * Event bus configuration options.
 */
export interface EventBusOptions {
  /** Maximum number of events to retain in history */
  maxHistorySize?: number;
  /** Enable async event handling (non-blocking) */
  asyncHandling?: boolean;
  /** Logger instance for debugging */
  logger?: {
    debug(message: string, context?: Record<string, unknown>): void;
    error(message: string, error?: Error, context?: Record<string, unknown>): void;
  };
}

/**
 * Event bus statistics.
 */
export interface EventBusStats {
  /** Total events emitted */
  eventsEmitted: number;
  /** Total subscriptions created */
  subscriptionsCreated: number;
  /** Currently active subscriptions */
  activeSubscriptions: number;
  /** Events in history */
  historySize: number;
  /** Errors encountered */
  errorCount: number;
}

/**
 * Event bus interface for agent-to-agent communication.
 */
export interface IEventBus {
  /**
   * Emit an event to all matching subscribers.
   * @param event - The event to emit
   */
  emit(event: DomainEvent): void;

  /**
   * Emit an event and wait for all handlers to complete.
   * @param event - The event to emit
   */
  emitAsync(event: DomainEvent): Promise<void>;

  /**
   * Subscribe to events matching a topic pattern.
   * @param pattern - Topic pattern (supports wildcards)
   * @param listener - Event handler function
   * @returns Subscription handle
   */
  subscribe<T extends DomainEvent = DomainEvent>(
    pattern: TopicPattern,
    listener: EventListener<T>
  ): Subscription;

  /**
   * Unsubscribe from events.
   * @param subscriptionId - Subscription ID to remove
   */
  unsubscribe(subscriptionId: SubscriptionId): void;

  /**
   * Get event history matching filter criteria.
   * @param filter - Optional filter criteria
   * @returns Array of matching events
   */
  getHistory(filter?: EventFilter): readonly DomainEvent[];

  /**
   * Clear event history.
   */
  clearHistory(): void;

  /**
   * Get event bus statistics.
   */
  getStats(): EventBusStats;

  /**
   * Check if a topic pattern has any subscribers.
   * @param pattern - Topic pattern to check
   */
  hasSubscribers(pattern: TopicPattern): boolean;
}

/**
 * Topic constants for type-safe subscription.
 */
export const EventTopics = {
  // Session events
  SESSION_CREATED: 'session.created',
  SESSION_STATUS_CHANGED: 'session.status_changed',
  SESSION_PARTICIPANT_JOINED: 'session.participant_joined',
  SESSION_RESULT_SUBMITTED: 'session.result_submitted',
  SESSION_FINALIZED: 'session.finalized',
  SESSION_ALL: 'session.*',

  // Message events
  MESSAGE_SENT: 'message.sent',
  MESSAGE_RECEIVED: 'message.received',
  MESSAGE_ALL: 'message.*',

  // Agent events
  AGENT_TASK_DELEGATED: 'agent.task_delegated',
  AGENT_RESULT_BROADCAST: 'agent.result_broadcast',
  AGENT_ALL: 'agent.*',

  // Consensus events
  CONSENSUS_VOTE_REQUESTED: 'consensus.vote_requested',
  CONSENSUS_VOTE_CAST: 'consensus.vote_cast',
  CONSENSUS_REACHED: 'consensus.reached',
  CONSENSUS_ALL: 'consensus.*',

  // Protocol events
  PROTOCOL_STARTED: 'protocol.started',
  PROTOCOL_ITERATION: 'protocol.iteration',
  PROTOCOL_COMPLETED: 'protocol.completed',
  PROTOCOL_ALL: 'protocol.*',

  // Wildcard
  ALL: '*',
} as const;
