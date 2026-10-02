/**
 * EventBus Bridge — V2 Pipeline → V1 Agent EventBus (Issue #922, Phase C)
 *
 * Subscribes to V2 pipeline events and forwards them as V1 DomainEvents
 * to the global agent EventBus when explicitly created. Server startup no
 * longer installs this bridge (#5120); no production consumer read the
 * forwarded payloads.
 *
 * @module pipeline/event-bus-bridge
 */
import { getErrorMessage, createLogger } from '../core/index.js';
import { getGlobalEventBus, createEvent, type DomainEvent } from '../agents/collaboration/index.js';

import type { IEventBus, PipelineEvent, Unsubscribe } from './event-types.js';

const logger = createLogger({ component: 'EventBusBridge' });

// ============================================================================
// Configuration
// ============================================================================

/**
 * Options for the EventBus bridge.
 * @deprecated Subscribe to the pipeline EventBus directly (#5120).
 * Removal belongs to the 9.0 batch (#6291).
 */
export interface EventBusBridgeOptions {
  /** V2 pipeline EventBus to subscribe to. */
  readonly source: IEventBus;
  /** Optional topic prefix for forwarded events. Defaults to 'pipeline'. */
  readonly topicPrefix?: string;
}

// ============================================================================
// Bridge Result
// ============================================================================

/**
 * Result of bridge initialization.
 * @deprecated Subscribe to the pipeline EventBus directly (#5120).
 * Removal belongs to the 9.0 batch (#6291).
 */
export interface PipelineBridgeResult {
  /** Number of events forwarded so far. */
  readonly forwarded: () => number;
  /** Unsubscribe from the V2 bus (cleanup). */
  readonly dispose: Unsubscribe;
}

// ============================================================================
// Conversion
// ============================================================================

/** Maps a V2 PipelineEvent to a V1 DomainEvent topic. */
function toV1Topic(prefix: string, event: PipelineEvent): string {
  return `${prefix}.${event.type}`;
}

/** Extracts the forwarding payload from a V2 event (strips type + timestamp). */
function toV1Payload(event: PipelineEvent): Record<string, unknown> {
  const record = { ...event } as Record<string, unknown>;
  delete record['type'];
  delete record['timestamp'];
  return record;
}

/**
 * Extracts correlationId from a V2 event if present.
 *
 * Uses `in` narrowing on the discriminated union to safely access
 * executionId/taskId without `as unknown as` casts.
 */
function extractCorrelationId(event: PipelineEvent): string | undefined {
  if ('executionId' in event) return event.executionId;
  if ('taskId' in event) return event.taskId;
  return undefined;
}

// ============================================================================
// Bridge
// ============================================================================

/**
 * Creates a bridge that forwards V2 pipeline events to the V1 agent EventBus.
 *
 * Each V2 event is converted to a V1 DomainEvent with:
 * - topic: `{prefix}.{v2EventType}` (e.g. `pipeline.task.created`)
 * - payload: all V2 event fields except type/timestamp
 * - correlationId: executionId or taskId from V2 event
 *
 * The bridge is fire-and-forget: forwarding errors are logged, not thrown.
 *
 * @deprecated Subscribe to the pipeline EventBus directly (#5120).
 * Removal belongs to the 9.0 batch (#6291).
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- the retained factory uses its deprecated types until 9.0 (#6291)
export function createEventBusBridge(options: EventBusBridgeOptions): PipelineBridgeResult {
  const { source } = options;
  const prefix = options.topicPrefix ?? 'pipeline';
  const v1Bus = getGlobalEventBus();
  let forwardCount = 0;

  const unsub = source.subscribe({}, (event: PipelineEvent) => {
    try {
      const topic = toV1Topic(prefix, event);
      const payload = toV1Payload(event);
      const correlationId = extractCorrelationId(event);
      const domainEvent: DomainEvent = createEvent(topic, payload, {
        ...(correlationId !== undefined ? { correlationId } : {}),
      });
      v1Bus.emit(domainEvent);
      forwardCount++;
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      logger.warn('Failed to forward pipeline event', { type: event.type, error: msg });
    }
  });

  logger.info('EventBus bridge initialized', { prefix });
  return {
    forwarded: () => forwardCount,
    dispose: unsub,
  };
}
