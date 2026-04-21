/**
 * Tests for Belief Memory Recall Operations
 *
 * @module context/belief-memory-recall.test
 */

import { describe, it, expect } from 'vitest';
import {
  recallInternal,
  queryInternal,
  recallBySubjectInternal,
  recallCurrentInternal,
  recallHistoryInternal,
} from './belief-memory-recall.js';
import type { RecallDataStores } from './belief-memory-recall.js';
import type { Belief } from './belief-types.js';

// ============================================================================
// Helpers
// ============================================================================

const NOW = new Date('2026-02-06T12:00:00Z');
const EARLIER = new Date('2026-02-05T12:00:00Z');

function makeBelief(overrides: Partial<Belief> = {}): Belief {
  return {
    beliefId: 'belief-1',
    subject: 'WaveScheduler',
    predicate: 'handles',
    object: 'parallel execution',
    confidence: 'high',
    sourceType: 'observation',
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    superseded: false,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeStores(beliefs: Belief[]) {
  const beliefsMap = new Map<string, Belief>();
  const subjectIndex = new Map<string, Set<string>>();
  const predicateIndex = new Map<string, Set<string>>();
  const domainIndex = new Map<string, Set<string>>();

  for (const b of beliefs) {
    beliefsMap.set(b.beliefId, b);

    const subSet = subjectIndex.get(b.subject) ?? new Set();
    subSet.add(b.beliefId);
    subjectIndex.set(b.subject, subSet);

    const predSet = predicateIndex.get(b.predicate) ?? new Set();
    predSet.add(b.beliefId);
    predicateIndex.set(b.predicate, predSet);

    if (b.domain !== undefined) {
      const domSet = domainIndex.get(b.domain) ?? new Set();
      domSet.add(b.beliefId);
      domainIndex.set(b.domain, domSet);
    }
  }

  return { beliefs: beliefsMap, subjectIndex, predicateIndex, domainIndex } as RecallDataStores;
}

// ============================================================================
// recallInternal
// ============================================================================

describe('recallInternal', () => {
  it('returns belief by ID', async () => {
    const belief = makeBelief();
    const stores = makeStores([belief]);

    const result = await recallInternal(stores, 'belief-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBeNull();
      expect(result.value!.beliefId).toBe('belief-1');
    }
  });

  it('returns null for missing belief', async () => {
    const stores = makeStores([]);

    const result = await recallInternal(stores, 'nonexistent');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });
});

// ============================================================================
// queryInternal
// ============================================================================

describe('queryInternal', () => {
  it('queries by subject', async () => {
    const b1 = makeBelief({ beliefId: 'b1', subject: 'Alpha' });
    const b2 = makeBelief({ beliefId: 'b2', subject: 'Beta' });
    const stores = makeStores([b1, b2]);

    const result = await queryInternal(stores, { subject: 'Alpha' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]!.beliefId).toBe('b1');
    }
  });

  it('queries by predicate', async () => {
    const b1 = makeBelief({ beliefId: 'b1', predicate: 'handles' });
    const b2 = makeBelief({ beliefId: 'b2', predicate: 'uses' });
    const stores = makeStores([b1, b2]);

    const result = await queryInternal(stores, { predicate: 'handles' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
    }
  });

  it('queries by domain', async () => {
    const b1 = makeBelief({ beliefId: 'b1', domain: 'agents' });
    const b2 = makeBelief({ beliefId: 'b2', domain: 'context' });
    const stores = makeStores([b1, b2]);

    const result = await queryInternal(stores, { domain: 'agents' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]!.domain).toBe('agents');
    }
  });

  it('intersects subject and predicate filters', async () => {
    const b1 = makeBelief({ beliefId: 'b1', subject: 'A', predicate: 'X' });
    const b2 = makeBelief({ beliefId: 'b2', subject: 'A', predicate: 'Y' });
    const b3 = makeBelief({ beliefId: 'b3', subject: 'B', predicate: 'X' });
    const stores = makeStores([b1, b2, b3]);

    const result = await queryInternal(stores, { subject: 'A', predicate: 'X' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]!.beliefId).toBe('b1');
    }
  });

  it('excludes superseded beliefs by default', async () => {
    const b1 = makeBelief({ beliefId: 'b1', superseded: false });
    const b2 = makeBelief({ beliefId: 'b2', superseded: true });
    const stores = makeStores([b1, b2]);

    const result = await queryInternal(stores, { includeSuperseded: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]!.beliefId).toBe('b1');
    }
  });

  it('includes superseded beliefs when requested', async () => {
    const b1 = makeBelief({ beliefId: 'b1', superseded: false });
    const b2 = makeBelief({ beliefId: 'b2', superseded: true });
    const stores = makeStores([b1, b2]);

    const result = await queryInternal(stores, { includeSuperseded: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });

  it('respects limit parameter', async () => {
    const beliefs = Array.from({ length: 5 }, (_, i) =>
      makeBelief({ beliefId: `b${String(i)}`, subject: 'Same' })
    );
    const stores = makeStores(beliefs);

    const result = await queryInternal(stores, { subject: 'Same', limit: 2 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });

  it('returns all when no filters specified', async () => {
    const b1 = makeBelief({ beliefId: 'b1' });
    const b2 = makeBelief({ beliefId: 'b2' });
    const stores = makeStores([b1, b2]);

    const result = await queryInternal(stores, {});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });

  it('returns empty for unmatched subject', async () => {
    const stores = makeStores([makeBelief()]);

    const result = await queryInternal(stores, { subject: 'Nonexistent' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});

// ============================================================================
// recallBySubjectInternal
// ============================================================================

describe('recallBySubjectInternal', () => {
  it('returns beliefs for subject', async () => {
    const b1 = makeBelief({ beliefId: 'b1', subject: 'Alpha' });
    const b2 = makeBelief({ beliefId: 'b2', subject: 'Beta' });
    const stores = makeStores([b1, b2]);

    const result = await recallBySubjectInternal(stores, 'Alpha');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
    }
  });

  it('respects limit', async () => {
    const beliefs = Array.from({ length: 5 }, (_, i) =>
      makeBelief({ beliefId: `b${String(i)}`, subject: 'Same' })
    );
    const stores = makeStores(beliefs);

    const result = await recallBySubjectInternal(stores, 'Same', 2);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });
});

// ============================================================================
// recallCurrentInternal
// ============================================================================

describe('recallCurrentInternal', () => {
  it('returns most recent non-superseded belief', async () => {
    const b1 = makeBelief({
      beliefId: 'b1',
      subject: 'A',
      predicate: 'X',
      updatedAt: EARLIER,
    });
    const b2 = makeBelief({
      beliefId: 'b2',
      subject: 'A',
      predicate: 'X',
      updatedAt: NOW,
    });
    const stores = makeStores([b1, b2]);

    const result = await recallCurrentInternal(stores, 'A', 'X');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBeNull();
      expect(result.value!.beliefId).toBe('b2');
    }
  });

  it('returns null when no matching belief', async () => {
    const stores = makeStores([]);

    const result = await recallCurrentInternal(stores, 'Unknown', 'missing');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });
});

// ============================================================================
// recallHistoryInternal
// ============================================================================

describe('recallHistoryInternal', () => {
  it('includes superseded beliefs in history', async () => {
    const b1 = makeBelief({
      beliefId: 'b1',
      subject: 'A',
      predicate: 'X',
      superseded: true,
      updatedAt: EARLIER,
    });
    const b2 = makeBelief({
      beliefId: 'b2',
      subject: 'A',
      predicate: 'X',
      superseded: false,
      updatedAt: NOW,
    });
    const stores = makeStores([b1, b2]);

    const result = await recallHistoryInternal(stores, 'A', 'X');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      // Most recent first
      expect(result.value[0]!.beliefId).toBe('b2');
    }
  });

  it('respects limit', async () => {
    const beliefs = Array.from({ length: 5 }, (_, i) =>
      makeBelief({ beliefId: `b${String(i)}`, subject: 'A', predicate: 'X' })
    );
    const stores = makeStores(beliefs);

    const result = await recallHistoryInternal(stores, 'A', 'X', 2);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });
});
