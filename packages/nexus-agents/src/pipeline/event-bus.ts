/**
 * EventBus — V2 Pipeline Event Bus (Issue #912, Phase 4-2)
 *
 * In-memory event bus with bounded circular buffer.
 * Fire-and-forget emission — handler errors are caught and logged.
 *
 * @see docs/v2/08-observability-eventing.md
 * @module pipeline/event-bus
 */
import { getErrorMessage, createLogger } from '../core/index.js';

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
  private readonly buffer: PipelineEvent[] = [];
  private readonly maxBuffer: number;
  private readonly subs: Subscription[] = [];
  private emitCount = 0;

  constructor(options?: EventBusOptions) {
    this.maxBuffer = options?.maxBufferSize ?? DEFAULT_MAX_BUFFER;
  }

  get totalEmitted(): number {
    return this.emitCount;
  }

  get bufferSize(): number {
    return this.buffer.length;
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
    let results = this.buffer.filter((e) => matchesFilter(e, filter));
    if (limit !== undefined) {
      results = results.slice(0, limit);
    }
    return results;
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private addToBuffer(event: PipelineEvent): void {
    if (this.buffer.length >= this.maxBuffer) {
      this.buffer.shift();
    }
    this.buffer.push(event);
  }

  private notifySubscribers(event: PipelineEvent): void {
    for (const sub of this.subs) {
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
  if (!matchesField(event, 'taskId', filter.taskId)) return false;
  if (!matchesField(event, 'executionId', filter.executionId)) return false;
  if (filter.since !== undefined && event.timestamp < filter.since) return false;
  return true;
}

function matchesType(event: PipelineEvent, filter: EventFilter): boolean {
  if (filter.type === undefined) return true;
  if (typeof filter.type === 'string') {
    return event.type === filter.type;
  }
  const types = filter.type as readonly string[];
  return types.includes(event.type);
}

function matchesField(event: PipelineEvent, field: string, value: string | undefined): boolean {
  if (value === undefined) return true;
  const record = event as unknown as Record<string, unknown>;
  return record[field] === value;
}
