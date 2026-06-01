/**
 * Event Bus Implementation
 *
 * Async message passing for agent-to-agent communication.
 * Supports topic-based routing, wildcard patterns, and event history.
 *
 * @module agents/collaboration/event-bus
 * (Source: Issue #182, ARCHITECTURE.md Hybrid Architecture)
 */

import { getTimeProvider } from '../../core/index.js';
import type {
  IEventBus,
  DomainEvent,
  EventListener,
  Subscription,
  SubscriptionId,
  TopicPattern,
  EventFilter,
  EventBusOptions,
  EventBusStats,
} from './event-bus-types.js';

import {
  DEFAULT_MAX_HISTORY_SIZE,
  MAX_SUBSCRIPTIONS,
  type SubscriptionRecord,
  patternToRegex,
  topicMatchesPattern,
  generateEventId,
  generateSubscriptionId,
  applyHistoryFilters,
  applyHistoryLimit,
  enrichEvent,
  countMatchingSubscribers,
} from './event-bus-helpers.js';

import { CircularBuffer } from '../../core/circular-buffer.js';

// Re-export correlation ID helpers for public API
export { generateCorrelationId, createChildCorrelationId } from './event-bus-helpers.js';

/**
 * Event Bus for agent-to-agent communication.
 *
 * Features:
 * - Topic-based pub/sub with wildcard support
 * - Async and sync event emission
 * - Event history with filtering
 * - Error isolation (one listener failure doesn't block others)
 *
 * @example
 * ```typescript
 * const bus = new EventBus();
 *
 * // Subscribe to all session events
 * const sub = bus.subscribe('session.*', (event) => {
 *   console.log('Session event:', event.topic);
 * });
 *
 * // Emit an event
 * bus.emit(createSessionCreatedEvent({ sessionId: '123', ... }));
 *
 * // Cleanup
 * sub.unsubscribe();
 * ```
 */
export class EventBus implements IEventBus {
  private readonly subscriptions: Map<SubscriptionId, SubscriptionRecord> = new Map();
  private readonly history: CircularBuffer<DomainEvent>;
  private readonly asyncHandling: boolean;
  private readonly logger?: EventBusOptions['logger'];

  private stats: EventBusStats = {
    eventsEmitted: 0,
    subscriptionsCreated: 0,
    activeSubscriptions: 0,
    historySize: 0,
    errorCount: 0,
  };

  constructor(options: EventBusOptions = {}) {
    const maxHistorySize = options.maxHistorySize ?? DEFAULT_MAX_HISTORY_SIZE;
    this.history = new CircularBuffer<DomainEvent>(maxHistorySize);
    this.asyncHandling = options.asyncHandling ?? false;
    this.logger = options.logger;
  }

  /**
   * Emit an event synchronously to all matching subscribers.
   */
  emit(event: DomainEvent): void {
    const enrichedEvent = enrichEvent(event);
    this.addToHistory(enrichedEvent);
    this.stats.eventsEmitted++;

    this.logger?.debug('Event emitted', {
      topic: enrichedEvent.topic,
      eventId: enrichedEvent.eventId,
      subscriberCount: countMatchingSubscribers(enrichedEvent.topic, this.subscriptions),
    });

    for (const record of this.subscriptions.values()) {
      if (topicMatchesPattern(enrichedEvent.topic, record.regex)) {
        this.invokeListener(record, enrichedEvent);
      }
    }
  }

  /**
   * Emit an event and wait for all async handlers to complete.
   */
  async emitAsync(event: DomainEvent): Promise<void> {
    const enrichedEvent = enrichEvent(event);
    this.addToHistory(enrichedEvent);
    this.stats.eventsEmitted++;

    this.logger?.debug('Async event emitted', {
      topic: enrichedEvent.topic,
      eventId: enrichedEvent.eventId,
    });

    const promises: Promise<void>[] = [];

    for (const record of this.subscriptions.values()) {
      if (topicMatchesPattern(enrichedEvent.topic, record.regex)) {
        promises.push(this.invokeListenerAsync(record, enrichedEvent));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Subscribe to events matching a topic pattern.
   */
  subscribe<T extends DomainEvent = DomainEvent>(
    pattern: TopicPattern,
    listener: EventListener<T>
  ): Subscription {
    if (this.subscriptions.size >= MAX_SUBSCRIPTIONS) {
      throw new Error(
        `Maximum subscription limit reached (${String(MAX_SUBSCRIPTIONS)}). ` +
          'Unsubscribe from unused patterns before adding new ones.'
      );
    }

    const id = generateSubscriptionId();
    const regex = patternToRegex(pattern);

    const record: SubscriptionRecord = {
      id,
      pattern,
      regex,
      listener: listener as EventListener,
    };

    this.subscriptions.set(id, record);
    this.stats.subscriptionsCreated++;
    this.stats.activeSubscriptions = this.subscriptions.size;

    this.logger?.debug('Subscription created', { id, pattern });

    return {
      id,
      pattern,
      unsubscribe: () => {
        this.unsubscribe(id);
      },
    };
  }

  /**
   * Unsubscribe from events.
   */
  unsubscribe(subscriptionId: SubscriptionId): void {
    const existed = this.subscriptions.delete(subscriptionId);
    if (existed) {
      this.stats.activeSubscriptions = this.subscriptions.size;
      this.logger?.debug('Subscription removed', { subscriptionId });
    }
  }

  /**
   * Get event history matching filter criteria.
   */
  getHistory(filter?: EventFilter): readonly DomainEvent[] {
    const historyArray = this.history.toArray();
    if (filter === undefined) {
      return historyArray;
    }

    const filtered = applyHistoryFilters(historyArray, filter);
    return applyHistoryLimit(filtered, filter);
  }

  /**
   * Clear event history.
   */
  clearHistory(): void {
    this.history.clear();
    this.stats.historySize = 0;
    this.logger?.debug('History cleared');
  }

  /**
   * Get event bus statistics.
   */
  getStats(): EventBusStats {
    return { ...this.stats };
  }

  /**
   * Check if a topic pattern has any subscribers.
   */
  hasSubscribers(pattern: TopicPattern): boolean {
    const regex = patternToRegex(pattern);
    for (const record of this.subscriptions.values()) {
      // Check if the patterns could overlap
      if (
        topicMatchesPattern(pattern, record.regex) ||
        topicMatchesPattern(record.pattern, regex)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Add event to history, maintaining size limit via O(1) circular buffer.
   * @see Issue #407 - Performance optimization
   */
  private addToHistory(event: DomainEvent): void {
    this.history.push(event);
    this.stats.historySize = this.history.size;
  }

  /**
   * Invoke a listener synchronously with error isolation.
   */
  private invokeListener(record: SubscriptionRecord, event: DomainEvent): void {
    try {
      const result = record.listener(event);
      // If async handling is enabled and listener returns a promise, don't wait
      if (this.asyncHandling && result instanceof Promise) {
        result.catch((error: unknown) => {
          this.handleListenerError(record, event, error);
        });
      }
    } catch (error) {
      this.handleListenerError(record, event, error);
    }
  }

  /**
   * Invoke a listener asynchronously.
   */
  private async invokeListenerAsync(record: SubscriptionRecord, event: DomainEvent): Promise<void> {
    try {
      await record.listener(event);
    } catch (error) {
      this.handleListenerError(record, event, error);
    }
  }

  /**
   * Handle listener errors without disrupting other listeners.
   */
  private handleListenerError(
    record: SubscriptionRecord,
    event: DomainEvent,
    error: unknown
  ): void {
    this.stats.errorCount++;
    const errorObj = error instanceof Error ? error : new Error(String(error));
    this.logger?.error('Event listener error', errorObj, {
      subscriptionId: record.id,
      pattern: record.pattern,
      eventTopic: event.topic,
      eventId: event.eventId,
    });
  }
}

/**
 * Create a singleton event bus instance for global coordination.
 * Use with caution - prefer dependency injection for testability.
 */
let globalBus: EventBus | null = null;

export function getGlobalEventBus(options?: EventBusOptions): EventBus {
  globalBus ??= new EventBus(options);
  return globalBus;
}

/**
 * Reset the global event bus (for testing).
 */
export function resetGlobalEventBus(): void {
  globalBus = null;
}

/**
 * Factory functions for creating typed events.
 */
export function createEvent<T extends DomainEvent>(
  topic: T['topic'],
  payload: T['payload'],
  options?: {
    sessionId?: string;
    correlationId?: string;
  }
): T {
  return {
    eventId: generateEventId(),
    timestamp: getTimeProvider().nowIso(),
    topic,
    payload,
    sessionId: options?.sessionId,
    correlationId: options?.correlationId,
  } as T;
}
