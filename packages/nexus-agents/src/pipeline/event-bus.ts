/**
 * EventBus — V2 Pipeline Event Bus (Issue #912, Phase 4-2)
 *
 * In-memory event bus with bounded circular buffer.
 * Fire-and-forget emission — handler errors are caught and logged.
 *
 * @see docs/v2/08-observability-eventing.md
 * @module pipeline/event-bus
 */
import { getErrorMessage, createLogger, CircularBuffer } from '../core/index.js';

import type {
  PipelineEvent,
  EventFilter,
  EventHandler,
  Unsubscribe,
  IEventBus,
} from './event-types.js';

const logger = createLogger({ component: 'EventBus' });

const DEFAULT_MAX_BUFFER = 10_000;

// ============================================================================
// Configuration
// ============================================================================

/** Options for EventBus behavior. */
export interface EventBusOptions {
  readonly maxBufferSize?: number;
}

// ============================================================================
// Subscription
// ============================================================================

interface Subscription {
  readonly filter: EventFilter;
  readonly handler: EventHandler;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * In-memory event bus with bounded circular buffer.
 *
 * Events are stored in a circular buffer. When the buffer is full,
 * the oldest events are evicted. Subscribers receive events that
 * match their filter. Handler errors are caught and logged.
 */
export class EventBus implements IEventBus {
  private readonly buffer: CircularBuffer<PipelineEvent>;
  private readonly subs: Subscription[] = [];
  private emitCount = 0;

  constructor(options?: EventBusOptions) {
    // Capacity must be >= 1; the bounded buffer evicts oldest on overflow (O(1)).
    const maxBuffer = Math.max(1, options?.maxBufferSize ?? DEFAULT_MAX_BUFFER);
    this.buffer = new CircularBuffer<PipelineEvent>(maxBuffer);
  }

  get totalEmitted(): number {
    return this.emitCount;
  }

  get bufferSize(): number {
    return this.buffer.size;
  }

  /** Number of active subscriptions (for observability/testing). */
  get subscriptionCount(): number {
    return this.subs.length;
  }

  emit(event: PipelineEvent): void {
    this.emitCount++;
    this.addToBuffer(event);
    this.notifySubscribers(event);
  }

  subscribe(filter: EventFilter, handler: EventHandler): Unsubscribe {
    const sub: Subscription = { filter, handler };
    this.subs.push(sub);
    return () => {
      const idx = this.subs.indexOf(sub);
      if (idx >= 0) this.subs.splice(idx, 1);
    };
  }

  query(filter: EventFilter, limit?: number): readonly PipelineEvent[] {
    let results = this.buffer.toArray().filter((e) => matchesFilter(e, filter));
    if (limit !== undefined) {
      results = results.slice(0, limit);
    }
    return results;
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private addToBuffer(event: PipelineEvent): void {
    // CircularBuffer evicts the oldest event automatically when at capacity.
    this.buffer.push(event);
  }

  private notifySubscribers(event: PipelineEvent): void {
    // Snapshot to prevent issues from subscribe/unsubscribe during iteration
    const snapshot = [...this.subs];
    for (const sub of snapshot) {
      if (!matchesFilter(event, sub.filter)) continue;
      try {
        sub.handler(event);
      } catch (error: unknown) {
        const msg = getErrorMessage(error);
        logger.warn('Event handler error', { eventType: event.type, error: msg });
      }
    }
  }
}

// ============================================================================
// Filter Matching
// ============================================================================

/** Check if an event matches a filter. */
function matchesFilter(event: PipelineEvent, filter: EventFilter): boolean {
  if (!matchesType(event, filter)) return false;
  if (filter.taskId !== undefined && !matchesTaskId(event, filter.taskId)) return false;
  if (filter.executionId !== undefined && !matchesExecutionId(event, filter.executionId)) {
    return false;
  }
  if (filter.since !== undefined && event.timestamp < filter.since) return false;
  return true;
}

function matchesType(event: PipelineEvent, filter: EventFilter): boolean {
  if (filter.type === undefined) return true;
  if (typeof filter.type === 'string') {
    return event.type === filter.type;
  }
  if (!Array.isArray(filter.type)) return false;
  return (filter.type as readonly string[]).includes(event.type);
}

/**
 * Checks if a PipelineEvent has a taskId matching the expected value.
 *
 * Uses the `in` operator to narrow the discriminated union to variants
 * that carry a taskId field, avoiding `as unknown as` casts.
 */
function matchesTaskId(event: PipelineEvent, taskId: string): boolean {
  return 'taskId' in event && event.taskId === taskId;
}

/**
 * Checks if a PipelineEvent has an executionId matching the expected value.
 */
function matchesExecutionId(event: PipelineEvent, executionId: string): boolean {
  return 'executionId' in event && event.executionId === executionId;
}

// ============================================================================
// Global Pipeline EventBus Singleton (#1173)
// ============================================================================

let globalPipelineEventBus: IEventBus | undefined;

/** Returns the global pipeline EventBus (created lazily on first call). */
export function getPipelineEventBus(): IEventBus {
  globalPipelineEventBus ??= new EventBus();
  return globalPipelineEventBus;
}

/** Resets the global pipeline EventBus (for testing). */
export function resetPipelineEventBus(): void {
  globalPipelineEventBus = undefined;
}
