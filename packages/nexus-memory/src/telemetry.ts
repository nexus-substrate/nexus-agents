/**
 * Memory telemetry — aggregated counters (default) + opt-in full-audit mode.
 *
 * Phase 2 vote (#2768) settled on **C**: per-`{domain, op}` counters in
 * steady state, full per-event payloads when `NEXUS_MEMORY_AUDIT_MODE=audit`.
 *
 * The catfish-mitigation requirement is honored: audit mode emits
 * `{ op, keySummary, payloadSummary, resultSummary, cli, durationMs, hit }`
 * — not just counters — so an incident replay can reconstruct individual
 * ops. Summaries are truncated to keep emission cheap.
 *
 * @module nexus-memory/telemetry
 */

import type { MemoryEvent, MemoryEventCounters, MemoryEventListener } from './types.js';

const KEY_SUMMARY_LIMIT = 120;
const PAYLOAD_SUMMARY_LIMIT = 240;

/** Per-`{domain, op}` rolling counters. */
const counters = new Map<string, MemoryEventCounters>();
const listeners = new Set<MemoryEventListener>();

/** Audit mode is opt-in via env. Checked once per emission so the env
 * can be toggled at runtime by tests via `process.env`. */
function isAuditMode(): boolean {
  return process.env['NEXUS_MEMORY_AUDIT_MODE'] === 'audit';
}

function counterKey(domain: string, op: MemoryEvent['op']): string {
  return `${domain}::${op}`;
}

function truncate(value: unknown, limit: number): string {
  let s: string;
  if (typeof value === 'string') {
    s = value;
  } else if (value === undefined) {
    s = '<undefined>';
  } else if (value === null) {
    s = '<null>';
  } else {
    try {
      s = JSON.stringify(value);
    } catch {
      s = '<unserializable>';
    }
  }
  return s.length > limit ? `${s.slice(0, limit - 1)}…` : s;
}

interface RecordedEvent extends Omit<
  MemoryEvent,
  'keySummary' | 'payloadSummary' | 'resultSummary'
> {
  readonly key?: unknown;
  readonly payload?: unknown;
  readonly result?: unknown;
}

function updateCounter(event: RecordedEvent): void {
  const ck = counterKey(event.domain, event.op);
  const existing = counters.get(ck);
  const hitDelta = event.hit === true ? 1 : 0;
  counters.set(ck, {
    domain: event.domain,
    op: event.op,
    count: (existing?.count ?? 0) + 1,
    hitCount: (existing?.hitCount ?? 0) + hitDelta,
    totalDurationMs: (existing?.totalDurationMs ?? 0) + event.durationMs,
    maxDurationMs: Math.max(existing?.maxDurationMs ?? 0, event.durationMs),
  });
}

function buildPublicEvent(event: RecordedEvent, audit: boolean): MemoryEvent {
  return {
    domain: event.domain,
    op: event.op,
    durationMs: event.durationMs,
    ...(event.cli !== undefined && { cli: event.cli }),
    ...(event.hit !== undefined && { hit: event.hit }),
    ...(audit &&
      event.key !== undefined && {
        keySummary: truncate(event.key, KEY_SUMMARY_LIMIT),
      }),
    ...(audit &&
      event.payload !== undefined && {
        payloadSummary: truncate(event.payload, PAYLOAD_SUMMARY_LIMIT),
      }),
    ...(audit &&
      event.result !== undefined && {
        resultSummary: truncate(event.result, PAYLOAD_SUMMARY_LIMIT),
      }),
  };
}

/**
 * Record a memory operation. Updates counters always; emits the event
 * to subscribers always (subscribers get the full event in audit mode,
 * the aggregate-only event otherwise).
 *
 * Implementation note: the `op` argument is the typed `MemoryEvent['op']`
 * literal — backends never pass an unknown string here.
 */
export function recordMemoryEvent(event: RecordedEvent): void {
  updateCounter(event);
  const publicEvent = buildPublicEvent(event, isAuditMode());
  for (const listener of listeners) {
    try {
      listener(publicEvent);
    } catch {
      // Subscriber failures must never affect memory operations.
    }
  }
}

/** Snapshot of current counters. Returned array is a copy. */
export function getMemoryEventCounters(): readonly MemoryEventCounters[] {
  return [...counters.values()];
}

/** Subscribe to the per-event stream. Returns an unsubscribe function. */
export function subscribeToMemoryEvents(listener: MemoryEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reset counters + drop all subscribers. Tests should call this in
 * `beforeEach` to keep state from leaking.
 */
export function resetMemoryTelemetry(): void {
  counters.clear();
  listeners.clear();
}
