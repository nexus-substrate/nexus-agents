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

import type { CliName, MemoryEvent, MemoryEventCounters, MemoryEventListener } from './types.js';

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

/** The zero row a domain/op starts from — every field named, none defaulted implicitly. */
function emptyCounter(domain: string, op: MemoryEvent['op']): MemoryEventCounters {
  return { domain, op, count: 0, errorCount: 0, hitCount: 0, totalDurationMs: 0, maxDurationMs: 0 };
}

function updateCounter(event: RecordedEvent): void {
  const ck = counterKey(event.domain, event.op);
  const prev = counters.get(ck) ?? emptyCounter(event.domain, event.op);
  counters.set(ck, {
    domain: prev.domain,
    op: prev.op,
    count: prev.count + 1,
    errorCount: prev.errorCount + (event.error !== undefined ? 1 : 0),
    hitCount: prev.hitCount + (event.hit === true ? 1 : 0),
    totalDurationMs: prev.totalDurationMs + event.durationMs,
    maxDurationMs: Math.max(prev.maxDurationMs, event.durationMs),
  });
}

function buildPublicEvent(event: RecordedEvent, audit: boolean): MemoryEvent {
  return {
    domain: event.domain,
    op: event.op,
    durationMs: event.durationMs,
    // #5965: without this the counter records a failure the subscriber never
    // sees — two instruments disagreeing about the same operation.
    ...(event.error !== undefined && { error: event.error }),
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
 * Record a memory operation, successful or not. Updates counters always;
 * emits the event to subscribers always (subscribers get the full event in
 * audit mode, the aggregate-only event otherwise).
 *
 * "Always" is load-bearing and was not true until #5965: every backend called
 * this AFTER the work, so a throw skipped it entirely.
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

/**
 * Runs one backend operation and records it even when it throws (#5965).
 *
 * The record call used to sit after the work, so a `MemoryValidationError`, a
 * SQLite constraint or disk error, or a call on a closed backend produced no
 * event and no counter row at all — a domain rejecting every write looked
 * exactly like a domain nobody was using. The event is emitted BEFORE the
 * error is re-thrown, so the caller's own error handling is unchanged.
 *
 * The success event stays at each call site: only the caller knows the `hit`,
 * `key`, `payload` and `result` a successful op should carry.
 */
export function recordFailedMemoryOp<T>(
  context: { readonly domain: string; readonly op: MemoryEvent['op']; readonly cli?: CliName },
  start: number,
  body: () => T
): T {
  try {
    return body();
  } catch (error) {
    recordMemoryEvent({
      domain: context.domain,
      op: context.op,
      ...(context.cli !== undefined && { cli: context.cli }),
      durationMs: Date.now() - start,
      // Message only — a validation error's detail can quote the value that
      // failed, and that value is caller payload.
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
