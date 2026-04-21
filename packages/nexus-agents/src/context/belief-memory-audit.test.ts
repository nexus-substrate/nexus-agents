/**
 * Tests for Belief Memory Audit Operations
 *
 * @module context/belief-memory-audit.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createCounterfactualInternal,
  validateCounterfactualInternal,
  getCounterfactualsInternal,
  getUpdateHistoryInternal,
  getHindsightRecordsInternal,
  computeStatsInternal,
} from './belief-memory-audit.js';
import type { AuditDataStores } from './belief-memory-audit.js';
import type { Belief, BeliefUpdate, Counterfactual, HindsightRecord } from './belief-types.js';

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
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeStores(beliefs: Belief[] = []) {
  const beliefsMap = new Map<string, Belief>();
  for (const b of beliefs) beliefsMap.set(b.beliefId, b);

  return {
    beliefs: beliefsMap,
    updates: new Map<string, BeliefUpdate[]>(),
    counterfactuals: new Map<string, Counterfactual>(),
    hindsightRecords: new Map<string, HindsightRecord[]>(),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  } as unknown as AuditDataStores;
}

// ============================================================================
// createCounterfactualInternal
// ============================================================================

describe('createCounterfactualInternal', () => {
  it('creates a counterfactual from hypothesis', async () => {
    const stores = makeStores([makeBelief()]);

    const result = await createCounterfactualInternal(stores, 'WaveScheduler removed');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hypothesis).toBe('WaveScheduler removed');
      expect(result.value.validated).toBe(false);
      expect(result.value.counterfactualId).toMatch(/^cf[_-]/);
    }
  });

  it('finds affected beliefs matching hypothesis keywords', async () => {
    const b1 = makeBelief({ beliefId: 'b1', subject: 'WaveScheduler' });
    const b2 = makeBelief({ beliefId: 'b2', subject: 'ContextManager' });
    const stores = makeStores([b1, b2]);

    const result = await createCounterfactualInternal(stores, 'WaveScheduler is deprecated');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.affectedBeliefs).toContain('b1');
    }
  });

  it('includes taskContext when provided', async () => {
    const stores = makeStores([]);

    const result = await createCounterfactualInternal(stores, 'hypothesis', 'task-42');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.taskContext).toBe('task-42');
    }
  });

  it('skips superseded beliefs', async () => {
    const b = makeBelief({ superseded: true, subject: 'test' });
    const stores = makeStores([b]);

    const result = await createCounterfactualInternal(stores, 'test hypothesis');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.affectedBeliefs).toEqual([]);
    }
  });
});

// ============================================================================
// validateCounterfactualInternal
// ============================================================================

describe('validateCounterfactualInternal', () => {
  it('validates an existing counterfactual', async () => {
    const stores = makeStores([]);
    const cf: Counterfactual = {
      counterfactualId: 'cf-1',
      hypothesis: 'test',
      affectedBeliefs: [],
      predictedOutcomes: [],
      validated: false,
      createdAt: NOW,
    };
    stores.counterfactuals.set('cf-1', cf);

    const result = await validateCounterfactualInternal(stores, 'cf-1', ['outcome-1']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.validated).toBe(true);
      expect(result.value.actualOutcomes).toEqual(['outcome-1']);
    }
  });

  it('returns error for missing counterfactual', async () => {
    const stores = makeStores([]);

    const result = await validateCounterfactualInternal(stores, 'nonexistent', []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not found');
    }
  });
});

// ============================================================================
// getCounterfactualsInternal
// ============================================================================

describe('getCounterfactualsInternal', () => {
  it('returns counterfactuals matching task context', async () => {
    const stores = makeStores([]);
    const cf1: Counterfactual = {
      counterfactualId: 'cf-1',
      hypothesis: 'h1',
      affectedBeliefs: [],
      predictedOutcomes: [],
      validated: false,
      createdAt: NOW,
      taskContext: 'task-1',
    };
    const cf2: Counterfactual = {
      ...cf1,
      counterfactualId: 'cf-2',
      taskContext: 'task-2',
    };
    stores.counterfactuals.set('cf-1', cf1);
    stores.counterfactuals.set('cf-2', cf2);

    const result = await getCounterfactualsInternal(stores, 'task-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]!.counterfactualId).toBe('cf-1');
    }
  });

  it('returns empty for unmatched context', async () => {
    const stores = makeStores([]);

    const result = await getCounterfactualsInternal(stores, 'no-match');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});

// ============================================================================
// getUpdateHistoryInternal & getHindsightRecordsInternal
// ============================================================================

describe('getUpdateHistoryInternal', () => {
  it('returns update history for belief', async () => {
    const stores = makeStores([]);
    const update = { updateType: 'revise', reason: 'test' } as unknown as BeliefUpdate;
    stores.updates.set('belief-1', [update]);

    const result = await getUpdateHistoryInternal(stores, 'belief-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
    }
  });

  it('returns empty for belief with no history', async () => {
    const stores = makeStores([]);

    const result = await getUpdateHistoryInternal(stores, 'unknown');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});

describe('getHindsightRecordsInternal', () => {
  it('returns hindsight records for task', async () => {
    const stores = makeStores([]);
    const record = { hindsightId: 'hs-1', taskId: 'task-1' } as unknown as HindsightRecord;
    stores.hindsightRecords.set('task-1', [record]);

    const result = await getHindsightRecordsInternal(stores, 'task-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
    }
  });

  it('returns empty for unknown task', async () => {
    const stores = makeStores([]);

    const result = await getHindsightRecordsInternal(stores, 'unknown');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});

// ============================================================================
// computeStatsInternal
// ============================================================================

describe('computeStatsInternal', () => {
  it('computes stats for empty stores', () => {
    const stores = makeStores([]);
    const stats = computeStatsInternal(stores);

    expect(stats.totalBeliefs).toBe(0);
    expect(stats.activeBeliefs).toBe(0);
    expect(stats.supersededBeliefs).toBe(0);
  });

  it('counts active and superseded beliefs', () => {
    const b1 = makeBelief({ beliefId: 'b1', superseded: false });
    const b2 = makeBelief({ beliefId: 'b2', superseded: true });
    const b3 = makeBelief({ beliefId: 'b3', superseded: false });
    const stores = makeStores([b1, b2, b3]);

    const stats = computeStatsInternal(stores);

    expect(stats.totalBeliefs).toBe(3);
    expect(stats.activeBeliefs).toBe(2);
    expect(stats.supersededBeliefs).toBe(1);
  });

  it('counts beliefs by confidence', () => {
    const b1 = makeBelief({ beliefId: 'b1', confidence: 'high' });
    const b2 = makeBelief({ beliefId: 'b2', confidence: 'high' });
    const b3 = makeBelief({ beliefId: 'b3', confidence: 'low' });
    const stores = makeStores([b1, b2, b3]);

    const stats = computeStatsInternal(stores);

    expect(stats.beliefsByConfidence.high).toBe(2);
    expect(stats.beliefsByConfidence.low).toBe(1);
  });

  it('counts updates and hindsight records', () => {
    const stores = makeStores([makeBelief()]);
    const update = { updateType: 'revise' } as unknown as BeliefUpdate;
    stores.updates.set('belief-1', [update, update]);
    const record = { hindsightId: 'hs-1' } as unknown as HindsightRecord;
    stores.hindsightRecords.set('task-1', [record]);

    const stats = computeStatsInternal(stores);

    expect(stats.totalUpdates).toBe(2);
    expect(stats.totalHindsightRecords).toBe(1);
  });
});
