/**
 * Telemetry tests — aggregated counters + opt-in audit mode (Phase 2 vote).
 *
 * @module nexus-memory/telemetry.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { InMemoryBackend, MemoryValidationError } from './backends/memory.js';
import {
  getMemoryEventCounters,
  resetMemoryTelemetry,
  subscribeToMemoryEvents,
} from './telemetry.js';
import type { MemoryEvent, MemoryEventCounters } from './types.js';

describe('memory telemetry', () => {
  let originalAuditMode: string | undefined;

  beforeEach(() => {
    resetMemoryTelemetry();
    originalAuditMode = process.env['NEXUS_MEMORY_AUDIT_MODE'];
    delete process.env['NEXUS_MEMORY_AUDIT_MODE'];
  });

  afterEach(() => {
    if (originalAuditMode !== undefined) {
      process.env['NEXUS_MEMORY_AUDIT_MODE'] = originalAuditMode;
    } else {
      delete process.env['NEXUS_MEMORY_AUDIT_MODE'];
    }
  });

  it('write increments counters per (domain, op)', async () => {
    const backend = new InMemoryBackend<string, { v: number }>({ domain: 'tel_a' });
    await backend.write('k1', { v: 1 });
    await backend.write('k2', { v: 2 });
    await backend.read('k1');
    const counters = getMemoryEventCounters();
    const writeCounter = counters.find((c) => c.domain === 'tel_a' && c.op === 'write');
    const readCounter = counters.find((c) => c.domain === 'tel_a' && c.op === 'read');
    expect(writeCounter?.count).toBe(2);
    expect(readCounter?.count).toBe(1);
    expect(readCounter?.hitCount).toBe(1);
  });

  it('read miss increments count but not hitCount', async () => {
    const backend = new InMemoryBackend<string, { v: number }>({ domain: 'tel_miss' });
    await backend.read('missing');
    const counter = getMemoryEventCounters().find(
      (c) => c.domain === 'tel_miss' && c.op === 'read'
    );
    expect(counter?.count).toBe(1);
    expect(counter?.hitCount).toBe(0);
  });

  it('subscribers receive events for every op', async () => {
    const received: MemoryEvent[] = [];
    const unsubscribe = subscribeToMemoryEvents((e) => {
      received.push(e);
    });
    const backend = new InMemoryBackend<string, { v: number }>({ domain: 'tel_sub' });
    await backend.write('k', { v: 1 });
    await backend.read('k');
    unsubscribe();
    await backend.write('k2', { v: 2 });
    expect(received.length).toBe(2);
    expect(received[0]?.op).toBe('write');
    expect(received[1]?.op).toBe('read');
  });

  it('subscriber error does not break the operation', async () => {
    subscribeToMemoryEvents(() => {
      throw new Error('listener exploded');
    });
    const backend = new InMemoryBackend<string, { v: number }>({ domain: 'tel_err' });
    await expect(backend.write('k', { v: 1 })).resolves.toBeUndefined();
    expect(await backend.read('k')).toEqual({ v: 1 });
  });

  // Phase 2 vote mitigation #2 — catfish concern about losing context.
  it('audit mode populates keySummary + payloadSummary', async () => {
    process.env['NEXUS_MEMORY_AUDIT_MODE'] = 'audit';
    const received: MemoryEvent[] = [];
    subscribeToMemoryEvents((e) => {
      received.push(e);
    });
    const backend = new InMemoryBackend<string, { text: string }>({ domain: 'tel_audit' });
    await backend.write('hello', { text: 'world' });
    const event = received[0];
    expect(event?.keySummary).toBe('hello');
    expect(event?.payloadSummary).toContain('world');
  });

  it('default mode does NOT populate summaries', async () => {
    // Audit mode left unset → counter-only.
    const received: MemoryEvent[] = [];
    subscribeToMemoryEvents((e) => {
      received.push(e);
    });
    const backend = new InMemoryBackend<string, { text: string }>({ domain: 'tel_noaudit' });
    await backend.write('hello', { text: 'world' });
    const event = received[0];
    expect(event?.keySummary).toBeUndefined();
    expect(event?.payloadSummary).toBeUndefined();
  });

  it('audit mode summaries are truncated', async () => {
    process.env['NEXUS_MEMORY_AUDIT_MODE'] = 'audit';
    const received: MemoryEvent[] = [];
    subscribeToMemoryEvents((e) => {
      received.push(e);
    });
    const backend = new InMemoryBackend<string, { blob: string }>({ domain: 'tel_trunc' });
    const longString = 'x'.repeat(500);
    await backend.write('k', { blob: longString });
    const event = received[0];
    // Truncation limit is ~240 chars + ellipsis.
    expect(event?.payloadSummary?.length).toBeLessThanOrEqual(241);
    expect(event?.payloadSummary?.endsWith('…')).toBe(true);
  });

  it('resetMemoryTelemetry clears counters and subscribers', async () => {
    const backend = new InMemoryBackend<string, { v: number }>({ domain: 'tel_reset' });
    await backend.write('k', { v: 1 });
    expect(getMemoryEventCounters().length).toBeGreaterThan(0);
    resetMemoryTelemetry();
    expect(getMemoryEventCounters()).toHaveLength(0);
  });
});

// ============================================================================
// Failed operations are recorded too (#5965)
// ============================================================================

describe('failed operations reach the counters (#5965)', () => {
  // `recordMemoryEvent` used to be called only after the work succeeded, so a
  // thrown validation error, constraint violation or closed-backend call
  // produced no event and no counter row: a domain rejecting 100% of its
  // writes was indistinguishable from an idle one — while `types.ts` said
  // "emitted on every backend operation" and `telemetry.ts` said "Updates
  // counters always".

  beforeEach(() => {
    resetMemoryTelemetry();
  });

  function counter(domain: string, op: MemoryEvent['op']): MemoryEventCounters | undefined {
    return getMemoryEventCounters().find((c) => c.domain === domain && c.op === op);
  }

  function backend(domain: string): InMemoryBackend<string, { n: number }> {
    return new InMemoryBackend<string, { n: number }>({
      domain,
      schema: z.object({ n: z.number() }),
    });
  }

  it('counts a write rejected by the schema', async () => {
    const b = backend('fail_write');
    await expect(b.write('k', { n: 'no' } as unknown as { n: number })).rejects.toThrow(
      MemoryValidationError
    );
    expect(counter('fail_write', 'write')).toMatchObject({ count: 1, errorCount: 1 });
  });

  it('counts a read on a closed backend', async () => {
    const b = backend('fail_read');
    await b.close();
    await expect(b.read('k')).rejects.toThrow();
    expect(counter('fail_read', 'read')).toMatchObject({ count: 1, errorCount: 1 });
  });

  it.each(['query', 'delete', 'stats'] as const)('counts a failed %s', async (op) => {
    const b = backend(`fail_${op}`);
    await b.close();
    await expect(op === 'delete' ? b.delete('k') : op === 'query' ? b.query() : b.stats()).rejects.toThrow();
    expect(counter(`fail_${op}`, op)).toMatchObject({ count: 1, errorCount: 1 });
  });

  it('separates the failures from the successes in one domain', async () => {
    const b = backend('mixed');
    await b.write('a', { n: 1 });
    await b.write('b', { n: 2 });
    await expect(b.write('c', undefined as unknown as { n: number })).rejects.toThrow();
    // count is ATTEMPTS; the successes are count - errorCount.
    expect(counter('mixed', 'write')).toMatchObject({ count: 3, errorCount: 1 });
  });

  it('leaves errorCount at zero when nothing failed', async () => {
    const b = backend('clean');
    await b.write('a', { n: 1 });
    await b.read('a');
    expect(counter('clean', 'write')?.errorCount).toBe(0);
    expect(counter('clean', 'read')?.errorCount).toBe(0);
  });

  it('carries the error message, and no payload, to subscribers', async () => {
    const seen: MemoryEvent[] = [];
    const unsubscribe = subscribeToMemoryEvents((e) => seen.push(e));
    try {
      const b = backend('sub');
      await expect(b.write('k', { n: 'secret-payload-value' } as unknown as { n: number })).rejects.toThrow();
      expect(seen).toHaveLength(1);
      expect(seen[0]?.error).toBeDefined();
      // The failing value is caller payload and must not ride along outside
      // audit mode — the message is the only thing recorded.
      expect(JSON.stringify(seen[0])).not.toContain('secret-payload-value');
    } finally {
      unsubscribe();
    }
  });
});
