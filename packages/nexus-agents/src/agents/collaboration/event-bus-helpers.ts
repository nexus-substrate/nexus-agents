/**
 * Event Bus Helper Functions
 *
 * Pure utility functions for event bus operations.
 * Extracted from event-bus.ts to maintain file size limits.
 *
 * @module agents/collaboration/event-bus-helpers
 * (Source: Issue #182, ARCHITECTURE.md Hybrid Architecture)
 */

import { randomUUID } from 'node:crypto';
import type { SubscriptionId, TopicPattern, DomainEvent, EventFilter } from './event-bus-types.js';

/** Default maximum history size */
export const DEFAULT_MAX_HISTORY_SIZE = 1000;

/** Maximum number of subscriptions per bus */
export const MAX_SUBSCRIPTIONS = 500;

/**
 * Internal subscription record.
 */
export interface SubscriptionRecord {
  readonly id: SubscriptionId;
  readonly pattern: TopicPattern;
  readonly regex: RegExp;
  readonly listener: (event: DomainEvent) => void | Promise<void>;
}

/** Maximum allowed topic pattern length */
const MAX_TOPIC_PATTERN_LENGTH = 200;

/**
 * Convert a topic pattern to a regex for matching.
 * Supports wildcard patterns:
 * - 'session.created' -> exact match
 * - 'session.*' -> matches session.anything
 * - '*' -> matches everything
 *
 * Security Note (Issue #341): This function is safe from ReDoS because:
 * 1. The input is fully escaped before regex construction
 * 2. Only `*` wildcards are converted to `[^.]+` (bounded, non-greedy)
 * 3. Pattern length is bounded to prevent memory issues
 *
 * @throws Error if pattern exceeds MAX_TOPIC_PATTERN_LENGTH
 */
export function patternToRegex(pattern: TopicPattern): RegExp {
  // Validate length to prevent memory issues (Issue #341)
  if (pattern.length > MAX_TOPIC_PATTERN_LENGTH) {
    throw new Error(`Topic pattern exceeds maximum length of ${String(MAX_TOPIC_PATTERN_LENGTH)}`);
  }

  if (pattern === '*') {
    return /^.+$/;
  }
  // Use placeholder for * before escaping, then restore as regex wildcard
  // WILDCARD_PLACEHOLDER is a static constant, safe for RegExp (Issue #341)
  const WILDCARD_PLACEHOLDER = '\x00WILDCARD\x00';
  const withPlaceholder = pattern.replace(/\*/g, WILDCARD_PLACEHOLDER);
  // Escape all regex special characters - this makes the pattern safe
  const escaped = withPlaceholder.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // Replace placeholder with bounded wildcard - safe since input was escaped
  const withWildcards = escaped.replace(new RegExp(WILDCARD_PLACEHOLDER, 'g'), '[^.]+');
  return new RegExp(`^${withWildcards}$`);
}

/**
 * Check if a topic matches a pattern.
 */
export function topicMatchesPattern(topic: string, regex: RegExp): boolean {
  return regex.test(topic);
}

/**
 * Generate a unique event ID.
 */
export function generateEventId(): string {
  return `evt-${String(Date.now())}-${randomUUID().slice(0, 8)}`;
}

/**
 * Generate a unique subscription ID.
 */
export function generateSubscriptionId(): SubscriptionId {
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
 * Apply topic, session, correlation, and timestamp filters to events.
 */
export function applyHistoryFilters(history: DomainEvent[], filter: EventFilter): DomainEvent[] {
  let result: DomainEvent[] = history;

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

  return applyTimestampFilters(result, filter);
}

/**
 * Apply timestamp-based filters to events.
 */
export function applyTimestampFilters(result: DomainEvent[], filter: EventFilter): DomainEvent[] {
  let filtered = result;

  if (filter.after !== undefined && filter.after !== '') {
    const afterTimestamp = filter.after;
    filtered = filtered.filter((e) => e.timestamp > afterTimestamp);
  }

  if (filter.before !== undefined && filter.before !== '') {
    const beforeTimestamp = filter.before;
    filtered = filtered.filter((e) => e.timestamp < beforeTimestamp);
  }

  return filtered;
}

/**
 * Apply limit to history results.
 */
export function applyHistoryLimit(result: DomainEvent[], filter: EventFilter): DomainEvent[] {
  if (filter.limit !== undefined && filter.limit > 0) {
    return result.slice(-filter.limit);
  }
  return result;
}

/**
 * Enrich event with generated fields if missing.
 */
export function enrichEvent(event: DomainEvent): DomainEvent {
  return {
    ...event,
    eventId: event.eventId || generateEventId(),
    timestamp: event.timestamp || new Date().toISOString(),
  };
}

/**
 * Count subscribers matching a topic from a subscription map.
 */
export function countMatchingSubscribers(
  topic: string,
  subscriptions: Map<SubscriptionId, SubscriptionRecord>
): number {
  let count = 0;
  for (const record of subscriptions.values()) {
    if (topicMatchesPattern(topic, record.regex)) {
      count++;
    }
  }
  return count;
}
