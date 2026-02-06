/**
 * Tests for Audit Storage Query Operations
 *
 * @module audit/audit-storage-queries.test
 */

import { describe, it, expect } from 'vitest';
import {
  matchesTimeRange,
  matchesClassification,
  matchesIdentifiers,
  matchesCriteria,
  InMemoryAuditStorage,
} from './audit-storage-queries.js';
import type { AuditEvent, AuditQueryCriteria } from './audit-types.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeEvent(overrides: Partial<AuditEvent> = {}) {
  return {
    id: 'evt-1',
    version: '1.0' as const,
    timestamp: '2026-01-15T12:00:00Z',
    timestampMs: 1768515600000,
    category: 'tool_invocation' as const,
    severity: 'info' as const,
    outcome: 'success' as const,
    action: 'tool.invoke',
    actor: { type: 'agent' as const, id: 'agent-1' },
    ...overrides,
  } satisfies AuditEvent;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeCriteria(overrides: Partial<AuditQueryCriteria> = {}) {
  return {
    limit: 100,
    offset: 0,
    ...overrides,
  } satisfies AuditQueryCriteria;
}

// ============================================================================
// matchesTimeRange
// ============================================================================

describe('matchesTimeRange', () => {
  it('returns true when no time range specified', () => {
    expect(matchesTimeRange(makeEvent(), makeCriteria())).toBe(true);
  });

  it('returns true when event is within range', () => {
    const criteria = makeCriteria({
      startTime: new Date('2026-01-01'),
      endTime: new Date('2026-02-01'),
    });
    expect(matchesTimeRange(makeEvent(), criteria)).toBe(true);
  });

  it('returns false when event is before startTime', () => {
    const criteria = makeCriteria({
      startTime: new Date('2026-02-01'),
    });
    expect(matchesTimeRange(makeEvent(), criteria)).toBe(false);
  });

  it('returns false when event is after endTime', () => {
    const criteria = makeCriteria({
      endTime: new Date('2026-01-01'),
    });
    expect(matchesTimeRange(makeEvent(), criteria)).toBe(false);
  });

  it('handles startTime-only filter', () => {
    const criteria = makeCriteria({
      startTime: new Date('2026-01-01'),
    });
    expect(matchesTimeRange(makeEvent(), criteria)).toBe(true);
  });

  it('handles endTime-only filter', () => {
    const criteria = makeCriteria({
      endTime: new Date('2026-02-01'),
    });
    expect(matchesTimeRange(makeEvent(), criteria)).toBe(true);
  });
});

// ============================================================================
// matchesClassification
// ============================================================================

describe('matchesClassification', () => {
  it('returns true when no classification filters', () => {
    expect(matchesClassification(makeEvent(), makeCriteria())).toBe(true);
  });

  it('matches event category', () => {
    const criteria = makeCriteria({ categories: ['tool_invocation'] });
    expect(matchesClassification(makeEvent(), criteria)).toBe(true);
  });

  it('rejects non-matching category', () => {
    const criteria = makeCriteria({ categories: ['security'] });
    expect(matchesClassification(makeEvent(), criteria)).toBe(false);
  });

  it('matches severity', () => {
    const criteria = makeCriteria({ severities: ['info', 'warning'] });
    expect(matchesClassification(makeEvent(), criteria)).toBe(true);
  });

  it('rejects non-matching severity', () => {
    const criteria = makeCriteria({ severities: ['critical'] });
    expect(matchesClassification(makeEvent(), criteria)).toBe(false);
  });

  it('matches outcome', () => {
    const criteria = makeCriteria({ outcomes: ['success'] });
    expect(matchesClassification(makeEvent(), criteria)).toBe(true);
  });

  it('rejects non-matching outcome', () => {
    const criteria = makeCriteria({ outcomes: ['failure', 'denied'] });
    expect(matchesClassification(makeEvent(), criteria)).toBe(false);
  });

  it('requires all filters to match', () => {
    const criteria = makeCriteria({
      categories: ['tool_invocation'],
      severities: ['critical'], // doesn't match
    });
    expect(matchesClassification(makeEvent(), criteria)).toBe(false);
  });
});

// ============================================================================
// matchesIdentifiers
// ============================================================================

describe('matchesIdentifiers', () => {
  it('returns true when no identifier filters', () => {
    expect(matchesIdentifiers(makeEvent(), makeCriteria())).toBe(true);
  });

  it('matches actorId', () => {
    const criteria = makeCriteria({ actorId: 'agent-1' });
    expect(matchesIdentifiers(makeEvent(), criteria)).toBe(true);
  });

  it('rejects non-matching actorId', () => {
    const criteria = makeCriteria({ actorId: 'agent-99' });
    expect(matchesIdentifiers(makeEvent(), criteria)).toBe(false);
  });

  it('matches resourceId', () => {
    const event = makeEvent({ resource: { type: 'tool', id: 'res-1' } });
    const criteria = makeCriteria({ resourceId: 'res-1' });
    expect(matchesIdentifiers(event, criteria)).toBe(true);
  });

  it('rejects when resource is missing and resourceId specified', () => {
    const criteria = makeCriteria({ resourceId: 'res-1' });
    expect(matchesIdentifiers(makeEvent(), criteria)).toBe(false);
  });

  it('matches requestId', () => {
    const event = makeEvent({ requestId: 'req-1' });
    const criteria = makeCriteria({ requestId: 'req-1' });
    expect(matchesIdentifiers(event, criteria)).toBe(true);
  });

  it('matches traceId', () => {
    const event = makeEvent({ traceId: 'trace-1' });
    const criteria = makeCriteria({ traceId: 'trace-1' });
    expect(matchesIdentifiers(event, criteria)).toBe(true);
  });

  it('requires all identifier filters to match', () => {
    const event = makeEvent({ requestId: 'req-1' });
    const criteria = makeCriteria({ actorId: 'agent-1', requestId: 'req-99' });
    expect(matchesIdentifiers(event, criteria)).toBe(false);
  });
});

// ============================================================================
// matchesCriteria (integration)
// ============================================================================

describe('matchesCriteria', () => {
  it('returns true for empty criteria', () => {
    expect(matchesCriteria(makeEvent(), makeCriteria())).toBe(true);
  });

  it('combines time, classification, and identifier filters', () => {
    const event = makeEvent({ requestId: 'req-1' });
    const criteria = makeCriteria({
      startTime: new Date('2026-01-01'),
      categories: ['tool_invocation'],
      actorId: 'agent-1',
      requestId: 'req-1',
    });
    expect(matchesCriteria(event, criteria)).toBe(true);
  });

  it('rejects when any filter fails', () => {
    const criteria = makeCriteria({
      categories: ['security'], // doesn't match
      actorId: 'agent-1', // matches
    });
    expect(matchesCriteria(makeEvent(), criteria)).toBe(false);
  });
});

// ============================================================================
// InMemoryAuditStorage
// ============================================================================

describe('InMemoryAuditStorage', () => {
  it('stores and retrieves events', async () => {
    const storage = new InMemoryAuditStorage();
    await storage.write(makeEvent({ id: 'evt-1' }));
    await storage.write(makeEvent({ id: 'evt-2' }));

    const results = await storage.query(makeCriteria());
    expect(results).toHaveLength(2);
  });

  it('filters by criteria on query', async () => {
    const storage = new InMemoryAuditStorage();
    await storage.write(makeEvent({ id: 'evt-1', severity: 'info' }));
    await storage.write(makeEvent({ id: 'evt-2', severity: 'critical' }));

    const results = await storage.query(makeCriteria({ severities: ['critical'] }));
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('evt-2');
  });

  it('respects limit and offset', async () => {
    const storage = new InMemoryAuditStorage();
    for (let i = 0; i < 5; i++) {
      await storage.write(makeEvent({ id: `evt-${String(i)}` }));
    }

    const results = await storage.query(makeCriteria({ limit: 2, offset: 1 }));
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe('evt-1');
    expect(results[1]?.id).toBe('evt-2');
  });

  it('evicts oldest events when maxEvents exceeded', async () => {
    const storage = new InMemoryAuditStorage(3);
    for (let i = 0; i < 5; i++) {
      await storage.write(makeEvent({ id: `evt-${String(i)}` }));
    }

    const all = storage.getAll();
    expect(all).toHaveLength(3);
    expect(all[0]?.id).toBe('evt-2');
  });

  it('clear() empties storage', async () => {
    const storage = new InMemoryAuditStorage();
    await storage.write(makeEvent());
    storage.clear();
    expect(storage.getAll()).toHaveLength(0);
  });

  it('flush() and close() resolve without error', async () => {
    const storage = new InMemoryAuditStorage();
    await expect(storage.flush()).resolves.toBeUndefined();
    await expect(storage.close()).resolves.toBeUndefined();
  });
});
