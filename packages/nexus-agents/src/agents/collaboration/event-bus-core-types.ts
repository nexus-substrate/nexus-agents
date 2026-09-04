/**
 * Event Bus Core Type Definitions
 *
 * Base types, interfaces, and infrastructure for the event bus.
 *
 * @module agents/collaboration/event-bus-core-types
 * (Source: Issue #182, ARCHITECTURE.md Hybrid Architecture)
 */

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
export interface ICollaborationEventBus {
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
