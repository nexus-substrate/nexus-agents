/**
 * Tests for Belief Memory Reflect Operations
 *
 * @module context/belief-memory-reflect.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  reviseBeliefInternal,
  applyHindsightInternal,
  adjustConfidenceInternal,
  pruneSupersededInternal,
} from './belief-memory-reflect.js';
import type { ReflectDataStores } from './belief-memory-reflect.js';
import type { Belief, HindsightRecord } from './belief-types.js';
import type { BeliefUpdate } from './belief-types.js';

// ============================================================================
// Helpers
// ============================================================================

const NOW = new Date('2026-02-06T12:00:00Z');

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
  } as Belief;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeStores(beliefs: Belief[] = []) {
  const beliefsMap = new Map<string, Belief>();
  for (const b of beliefs) {
    beliefsMap.set(b.beliefId, b);
  }

  return {
    beliefs: beliefsMap,
    updates: new Map<string, BeliefUpdate[]>(),
    hindsightRecords: new Map<string, HindsightRecord[]>(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    recordUpdate: vi.fn(),
  } as unknown as ReflectDataStores;
}

function makeHindsightRecord(overrides: Partial<HindsightRecord> = {}): HindsightRecord {
  return {
    hindsightId: 'hs-1',
    taskId: 'task-1',
    priorBeliefs: ['belief-1'],
    expectedOutcome: 'success',
    actualOutcome: 'failure',
    outcomeMatched: false,
    correctedBeliefs: ['belief-1'],
    newBeliefs: [],
    timestamp: NOW,
    ...overrides,
  } as HindsightRecord;
}

// ============================================================================
// reviseBeliefInternal
// ============================================================================

describe('reviseBeliefInternal', () => {
  it('revises an existing belief', async () => {
    const belief = makeBelief();
    const stores = makeStores([belief]);

    const result = await reviseBeliefInternal(stores, {
      beliefId: 'belief-1',
      updates: { object: 'wave execution' },
      reason: 'Corrected description',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.object).toBe('wave execution');
      expect(result.value.version).toBe(2);
    }
  });

  it('records update via recordUpdate', async () => {
    const stores = makeStores([makeBelief()]);

    await reviseBeliefInternal(stores, {
      beliefId: 'belief-1',
      updates: { confidence: 'medium' },
      reason: 'Lowered confidence',
    });

    expect(stores.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        beliefId: 'belief-1',
        reason: 'Lowered confidence',
      })
    );
  });

  it('returns error for missing belief', async () => {
    const stores = makeStores([]);

    const result = await reviseBeliefInternal(stores, {
      beliefId: 'nonexistent',
      updates: {},
      reason: 'test',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not found');
    }
  });

  it('returns error for superseded belief', async () => {
    const stores = makeStores([makeBelief({ superseded: true })]);

    const result = await reviseBeliefInternal(stores, {
      beliefId: 'belief-1',
      updates: {},
      reason: 'test',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('superseded');
    }
  });
});

// ============================================================================
// applyHindsightInternal
// ============================================================================

describe('applyHindsightInternal', () => {
  it('weakens confidence of corrected beliefs', async () => {
    const belief = makeBelief({ confidence: 'high' });
    const stores = makeStores([belief]);
    const record = makeHindsightRecord({ correctedBeliefs: ['belief-1'] });

    const result = await applyHindsightInternal(stores, record);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      // weakenConfidence('high') → 'medium'
      expect(result.value[0]!.confidence).toBe('medium');
      expect(result.value[0]!.sourceType).toBe('hindsight');
    }
  });

  it('stores hindsight record', async () => {
    const stores = makeStores([makeBelief()]);
    const record = makeHindsightRecord({ taskId: 'task-42' });

    await applyHindsightInternal(stores, record);

    const records = stores.hindsightRecords.get('task-42');
    expect(records).toBeDefined();
    expect(records).toHaveLength(1);
  });

  it('skips superseded beliefs', async () => {
    const belief = makeBelief({ superseded: true });
    const stores = makeStores([belief]);
    const record = makeHindsightRecord();

    const result = await applyHindsightInternal(stores, record);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(0);
    }
  });

  it('skips missing beliefs', async () => {
    const stores = makeStores([]);
    const record = makeHindsightRecord({ correctedBeliefs: ['nonexistent'] });

    const result = await applyHindsightInternal(stores, record);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(0);
    }
  });

  it('corrects multiple beliefs', async () => {
    const b1 = makeBelief({ beliefId: 'b1', confidence: 'high' });
    const b2 = makeBelief({ beliefId: 'b2', confidence: 'medium' });
    const stores = makeStores([b1, b2]);
    const record = makeHindsightRecord({ correctedBeliefs: ['b1', 'b2'] });

    const result = await applyHindsightInternal(stores, record);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });
});

// ============================================================================
// adjustConfidenceInternal
// ============================================================================

describe('adjustConfidenceInternal', () => {
  it('reinforces belief confidence', async () => {
    const belief = makeBelief({ confidence: 'medium' });
    const stores = makeStores([belief]);

    const result = await adjustConfidenceInternal(stores, 'belief-1', 'new evidence', 'reinforce');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // strengthenConfidence('medium') → 'high'
      expect(result.value.confidence).toBe('high');
      expect(result.value.version).toBe(2);
    }
  });

  it('weakens belief confidence', async () => {
    const belief = makeBelief({ confidence: 'high' });
    const stores = makeStores([belief]);

    const result = await adjustConfidenceInternal(stores, 'belief-1', 'contradiction', 'weaken');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // weakenConfidence('high') → 'medium'
      expect(result.value.confidence).toBe('medium');
    }
  });

  it('returns error for missing belief', async () => {
    const stores = makeStores([]);

    const result = await adjustConfidenceInternal(stores, 'missing', 'evidence', 'reinforce');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not found');
    }
  });

  it('returns error for superseded belief', async () => {
    const stores = makeStores([makeBelief({ superseded: true })]);

    const result = await adjustConfidenceInternal(stores, 'belief-1', 'evidence', 'weaken');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('superseded');
    }
  });

  it('records update with correct type', async () => {
    const stores = makeStores([makeBelief()]);

    await adjustConfidenceInternal(stores, 'belief-1', 'evidence', 'reinforce');

    expect(stores.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        updateType: 'reinforce',
        evidence: 'evidence',
      })
    );
  });
});

// ============================================================================
// pruneSupersededInternal
// ============================================================================

describe('pruneSupersededInternal', () => {
  it('removes superseded beliefs older than cutoff', async () => {
    const oldDate = new Date('2025-01-01T00:00:00Z');
    const belief = makeBelief({ superseded: true, updatedAt: oldDate });
    const stores = {
      ...makeStores([belief]),
      subjectIndex: new Map([['WaveScheduler', new Set(['belief-1'])]]),
      predicateIndex: new Map([['handles', new Set(['belief-1'])]]),
      domainIndex: new Map<string, Set<string>>(),
    };

    const result = await pruneSupersededInternal(stores, new Date('2026-01-01'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(1);
    }
    expect(stores.beliefs.size).toBe(0);
  });

  it('does not remove non-superseded beliefs', async () => {
    const belief = makeBelief({ superseded: false });
    const stores = {
      ...makeStores([belief]),
      subjectIndex: new Map<string, Set<string>>(),
      predicateIndex: new Map<string, Set<string>>(),
      domainIndex: new Map<string, Set<string>>(),
    };

    const result = await pruneSupersededInternal(stores, new Date('2030-01-01'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
    expect(stores.beliefs.size).toBe(1);
  });

  it('does not remove superseded beliefs newer than cutoff', async () => {
    const recentDate = new Date('2026-02-01T00:00:00Z');
    const belief = makeBelief({ superseded: true, updatedAt: recentDate });
    const stores = {
      ...makeStores([belief]),
      subjectIndex: new Map<string, Set<string>>(),
      predicateIndex: new Map<string, Set<string>>(),
      domainIndex: new Map<string, Set<string>>(),
    };

    const result = await pruneSupersededInternal(stores, new Date('2026-01-01'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
    expect(stores.beliefs.size).toBe(1);
  });

  it('cleans up indices when pruning', async () => {
    const oldDate = new Date('2025-01-01T00:00:00Z');
    const belief = makeBelief({ superseded: true, updatedAt: oldDate, domain: 'agents' });
    const subjectSet = new Set(['belief-1']);
    const predicateSet = new Set(['belief-1']);
    const domainSet = new Set(['belief-1']);
    const stores = {
      ...makeStores([belief]),
      subjectIndex: new Map([['WaveScheduler', subjectSet]]),
      predicateIndex: new Map([['handles', predicateSet]]),
      domainIndex: new Map([['agents', domainSet]]),
    };

    await pruneSupersededInternal(stores, new Date('2026-01-01'));

    expect(subjectSet.has('belief-1')).toBe(false);
    expect(predicateSet.has('belief-1')).toBe(false);
    expect(domainSet.has('belief-1')).toBe(false);
  });
});
