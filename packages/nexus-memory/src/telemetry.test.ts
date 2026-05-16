/**
 * Telemetry tests — aggregated counters + opt-in audit mode (Phase 2 vote).
 *
 * @module nexus-memory/telemetry.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryBackend } from './backends/memory.js';
import {
  getMemoryEventCounters,
  resetMemoryTelemetry,
  subscribeToMemoryEvents,
} from './telemetry.js';
import type { MemoryEvent } from './types.js';

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
