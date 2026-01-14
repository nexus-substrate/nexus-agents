/**
 * Event Bus Implementation
 *
 * Async message passing for agent-to-agent communication.
 * Supports topic-based routing, wildcard patterns, and event history.
 *
 * @module agents/collaboration/event-bus
 * (Source: Issue #182, ARCHITECTURE.md Hybrid Architecture)
 *
 * File length justification: Core EventBus class with types in event-bus-types.ts,
 * core types in event-bus-core-types.ts, events in event-bus-events.ts, topics in
 * event-bus-topics.ts. Remaining code is cohesive pub/sub implementation.
 */

import { randomUUID } from 'node:crypto';
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

/** Default maximum history size */
const DEFAULT_MAX_HISTORY_SIZE = 1000;

/** Maximum number of subscriptions per bus */
const MAX_SUBSCRIPTIONS = 500;

/**
 * Internal subscription record.
 */
interface SubscriptionRecord {
  readonly id: SubscriptionId;
  readonly pattern: TopicPattern;
  readonly regex: RegExp;
  readonly listener: EventListener;
}

/**
 * Convert a topic pattern to a regex for matching.
 * Supports wildcard patterns:
 * - 'session.created' -> exact match
 * - 'session.*' -> matches session.anything
 * - '*' -> matches everything
 */
function patternToRegex(pattern: TopicPattern): RegExp {
  if (pattern === '*') {
    return /^.+$/;
  }
  // Use placeholder for * before escaping, then restore as regex wildcard
  const WILDCARD_PLACEHOLDER = '\x00WILDCARD\x00';
  const withPlaceholder = pattern.replace(/\*/g, WILDCARD_PLACEHOLDER);
  const escaped = withPlaceholder.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const withWildcards = escaped.replace(new RegExp(WILDCARD_PLACEHOLDER, 'g'), '[^.]+');
  return new RegExp(`^${withWildcards}$`);
}

/**
 * Check if a topic matches a pattern.
 */
function topicMatchesPattern(topic: string, regex: RegExp): boolean {
  return regex.test(topic);
}

/**
 * Generate a unique event ID.
 */
function generateEventId(): string {
  return `evt-${String(Date.now())}-${randomUUID().slice(0, 8)}`;
}

/**
 * Generate a unique subscription ID.
 */
function generateSubscriptionId(): SubscriptionId {
  return `sub-${String(Date.now())}-${randomUUID().slice(0, 8)}`;
}

/**
 * Generate a unique correlation ID for request tracing.
 * (Source: Issue #224, Sprint #228)
 *
 * @example
 * ```typescript
 * const correlationId = generateCorrelationId();
 * // -> 'cor_a1b2c3d4'
 * ```
 */
export function generateCorrelationId(): string {
  return `cor_${randomUUID().slice(0, 8)}`;
}

/**
 * Create a child correlation ID that chains to a parent.
 * Enables hierarchical tracing of subtasks.
 * (Source: Issue #224, Sprint #228)
 *
 * @param parentCorrelationId - The parent correlation ID to chain from
 * @returns A new correlation ID in format 'parentId.child_xxxxxxxx'
 *
 * @example
 * ```typescript
 * const parentId = generateCorrelationId();
 * // -> 'cor_a1b2c3d4'
 *
 * const childId = createChildCorrelationId(parentId);
 * // -> 'cor_a1b2c3d4.child_e5f6g7h8'
 * ```
 */
export function createChildCorrelationId(parentCorrelationId: string): string {
  return `${parentCorrelationId}.child_${randomUUID().slice(0, 8)}`;
}

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
  private readonly history: DomainEvent[] = [];
  private readonly maxHistorySize: number;
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
    this.maxHistorySize = options.maxHistorySize ?? DEFAULT_MAX_HISTORY_SIZE;
    this.asyncHandling = options.asyncHandling ?? false;
    this.logger = options.logger;
  }

  /**
   * Emit an event synchronously to all matching subscribers.
   */
  emit(event: DomainEvent): void {
    const enrichedEvent = this.enrichEvent(event);
    this.addToHistory(enrichedEvent);
    this.stats.eventsEmitted++;

    this.logger?.debug('Event emitted', {
      topic: enrichedEvent.topic,
      eventId: enrichedEvent.eventId,
      subscriberCount: this.countMatchingSubscribers(enrichedEvent.topic),
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
    const enrichedEvent = this.enrichEvent(event);
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
    if (filter === undefined) {
      return [...this.history];
    }

    const result = this.applyHistoryFilters(filter);
    return this.applyHistoryLimit(result, filter);
  }

  /**
   * Apply topic, session, correlation, and timestamp filters.
   */
  private applyHistoryFilters(filter: EventFilter): DomainEvent[] {
    let result: DomainEvent[] = this.history;

    if (filter.topic !== undefined && filter.topic !== '') {
      const regex = patternToRegex(filter.topic);
      result = result.filter((e) => topicMatchesPattern(e.topic, regex));
    }

    if (filter.sessionId !== undefined && filter.sessionId !== '') {
      result = result.filter((e) => e.sessionId === filter.sessionId);
    }

    if (filter.correlationId !== undefined && filter.correlationId !== '') {
      result = result.filter((e) => e.correlationId === filter.correlationId);
    }

    return this.applyTimestampFilters(result, filter);
  }

  /**
   * Apply timestamp-based filters.
   */
  private applyTimestampFilters(result: DomainEvent[], filter: EventFilter): DomainEvent[] {
    if (filter.after !== undefined && filter.after !== '') {
      const afterTimestamp = filter.after;
      result = result.filter((e) => e.timestamp > afterTimestamp);
    }

    if (filter.before !== undefined && filter.before !== '') {
      const beforeTimestamp = filter.before;
      result = result.filter((e) => e.timestamp < beforeTimestamp);
    }

    return result;
  }

  /**
   * Apply limit to history results.
   */
  private applyHistoryLimit(result: DomainEvent[], filter: EventFilter): DomainEvent[] {
    if (filter.limit !== undefined && filter.limit > 0) {
      return result.slice(-filter.limit);
    }
    return result;
  }

  /**
   * Clear event history.
   */
  clearHistory(): void {
    this.history.length = 0;
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
   * Enrich event with generated fields if missing.
   */
  private enrichEvent(event: DomainEvent): DomainEvent {
    return {
      ...event,
      eventId: event.eventId || generateEventId(),
      timestamp: event.timestamp || new Date().toISOString(),
    };
  }

  /**
   * Add event to history, maintaining size limit.
   */
  private addToHistory(event: DomainEvent): void {
    this.history.push(event);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
    this.stats.historySize = this.history.length;
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

  /**
   * Count subscribers matching a topic.
   */
  private countMatchingSubscribers(topic: string): number {
    let count = 0;
    for (const record of this.subscriptions.values()) {
      if (topicMatchesPattern(topic, record.regex)) {
        count++;
      }
    }
    return count;
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
    timestamp: new Date().toISOString(),
    topic,
    payload,
    sessionId: options?.sessionId,
    correlationId: options?.correlationId,
  } as T;
}
