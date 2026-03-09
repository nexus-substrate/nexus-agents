/**
 * Tests for task outcome tracking (Issue #861).
 *
 * Covers: Zod schema validation, store operations, bounded capacity,
 * query filtering, aggregation summaries, and singleton behavior.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { TaskOutcomeSchema, OutcomeQuerySchema } from './outcome-types.js';
import type { TaskOutcome } from './outcome-types.js';
import { OutcomeStore, getOutcomeStore, resetOutcomeStore } from './outcome-store.js';

// Force in-memory mode to avoid loading persistent data from disk
const originalPersist = process.env['NEXUS_PERSIST_LEARNING'];
beforeAll(() => {
  process.env['NEXUS_PERSIST_LEARNING'] = 'false';
  resetOutcomeStore();
});
afterAll(() => {
  if (originalPersist !== undefined) {
    process.env['NEXUS_PERSIST_LEARNING'] = originalPersist;
  } else {
    delete process.env['NEXUS_PERSIST_LEARNING'];
  }
  resetOutcomeStore();
});

// ============================================================================
// Helpers
// ============================================================================

function makeOutcome(overrides?: Partial<TaskOutcome>): TaskOutcome {
  return {
    id: 'out-1',
    cli: 'claude',
    category: 'code_generation',
    model: 'claude-sonnet-4-6',
    success: true,
    durationMs: 1200,
    timestamp: '2026-02-07T10:00:00Z',
    source: 'delegate',
    ...overrides,
  };
}

// ============================================================================
// Zod Schema Validation
// ============================================================================

describe('TaskOutcomeSchema', () => {
  it('accepts a valid outcome', () => {
    const result = TaskOutcomeSchema.safeParse(makeOutcome());
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = TaskOutcomeSchema.safeParse({ id: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid cli name', () => {
    const result = TaskOutcomeSchema.safeParse(makeOutcome({ cli: 'invalid' as 'claude' }));
    expect(result.success).toBe(false);
  });

  it('rejects invalid category', () => {
    const result = TaskOutcomeSchema.safeParse(makeOutcome({ category: 'nope' as 'testing' }));
    expect(result.success).toBe(false);
  });

  it('rejects negative durationMs', () => {
    const result = TaskOutcomeSchema.safeParse(makeOutcome({ durationMs: -1 }));
    expect(result.success).toBe(false);
  });

  it('accepts optional qualitySignals', () => {
    const result = TaskOutcomeSchema.safeParse(
      makeOutcome({ qualitySignals: ['fast', 'accurate'] })
    );
    expect(result.success).toBe(true);
  });
});

describe('OutcomeQuerySchema', () => {
  it('accepts empty query', () => {
    const result = OutcomeQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts query with all fields', () => {
    const result = OutcomeQuerySchema.safeParse({
      cli: 'gemini',
      category: 'research',
      source: 'consensus',
      since: '2026-01-01T00:00:00Z',
      limit: 10,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// OutcomeStore
// ============================================================================

describe('OutcomeStore', () => {
  let store: OutcomeStore;

  beforeEach(() => {
    store = new OutcomeStore();
  });

  it('starts empty', () => {
    expect(store.size).toBe(0);
    expect(store.query()).toEqual([]);
  });

  it('appends and retrieves outcomes', () => {
    const outcome = makeOutcome();
    store.append(outcome);
    expect(store.size).toBe(1);
    expect(store.query()).toEqual([outcome]);
  });

  it('preserves insertion order', () => {
    const a = makeOutcome({ id: 'a', timestamp: '2026-02-07T10:00:00Z' });
    const b = makeOutcome({ id: 'b', timestamp: '2026-02-07T11:00:00Z' });
    store.append(a);
    store.append(b);
    const results = store.query();
    expect(results).toHaveLength(2);
    const first = results[0];
    const second = results[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first?.id).toBe('a');
    expect(second?.id).toBe('b');
  });

  // ---------- Bounded capacity ----------

  it('evicts oldest when capacity exceeded', () => {
    const small = new OutcomeStore({ maxEntries: 3 });
    small.append(makeOutcome({ id: '1' }));
    small.append(makeOutcome({ id: '2' }));
    small.append(makeOutcome({ id: '3' }));
    small.append(makeOutcome({ id: '4' }));
    expect(small.size).toBe(3);
    const ids = small.query().map((o) => o.id);
    expect(ids).toEqual(['2', '3', '4']);
  });

  // ---------- Query filtering ----------

  it('filters by cli', () => {
    store.append(makeOutcome({ id: '1', cli: 'claude' }));
    store.append(makeOutcome({ id: '2', cli: 'gemini' }));
    const results = store.query({ cli: 'gemini' });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('2');
  });

  it('filters by category', () => {
    store.append(makeOutcome({ id: '1', category: 'testing' }));
    store.append(makeOutcome({ id: '2', category: 'research' }));
    const results = store.query({ category: 'research' });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('2');
  });

  it('filters by source', () => {
    store.append(makeOutcome({ id: '1', source: 'delegate' }));
    store.append(makeOutcome({ id: '2', source: 'consensus' }));
    const results = store.query({ source: 'consensus' });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('2');
  });

  it('filters by since timestamp', () => {
    store.append(makeOutcome({ id: '1', timestamp: '2026-01-01T00:00:00Z' }));
    store.append(makeOutcome({ id: '2', timestamp: '2026-02-01T00:00:00Z' }));
    const results = store.query({ since: '2026-01-15T00:00:00Z' });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('2');
  });

  it('applies limit to results', () => {
    store.append(makeOutcome({ id: '1' }));
    store.append(makeOutcome({ id: '2' }));
    store.append(makeOutcome({ id: '3' }));
    const results = store.query({ limit: 2 });
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe('2');
    expect(results[1]?.id).toBe('3');
  });

  it('combines multiple filters', () => {
    store.append(makeOutcome({ id: '1', cli: 'claude', category: 'testing' }));
    store.append(makeOutcome({ id: '2', cli: 'gemini', category: 'testing' }));
    store.append(makeOutcome({ id: '3', cli: 'claude', category: 'research' }));
    const results = store.query({ cli: 'claude', category: 'testing' });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('1');
  });

  // ---------- Summarize ----------

  it('returns zero summary for empty store', () => {
    const summary = store.summarize();
    expect(summary.totalTasks).toBe(0);
    expect(summary.successRate).toBe(0);
    expect(summary.avgDurationMs).toBe(0);
    expect(summary.byCli.size).toBe(0);
    expect(summary.byCategory.size).toBe(0);
  });

  it('computes correct aggregate stats', () => {
    store.append(makeOutcome({ id: '1', success: true, durationMs: 100 }));
    store.append(makeOutcome({ id: '2', success: false, durationMs: 300 }));
    const summary = store.summarize();
    expect(summary.totalTasks).toBe(2);
    expect(summary.successRate).toBe(0.5);
    expect(summary.avgDurationMs).toBe(200);
  });

  it('groups stats by cli', () => {
    store.append(makeOutcome({ id: '1', cli: 'claude', success: true, durationMs: 100 }));
    store.append(makeOutcome({ id: '2', cli: 'gemini', success: false, durationMs: 200 }));
    const summary = store.summarize();
    expect(summary.byCli.get('claude')).toEqual({ count: 1, successRate: 1, avgDurationMs: 100 });
    expect(summary.byCli.get('gemini')).toEqual({ count: 1, successRate: 0, avgDurationMs: 200 });
  });

  it('groups stats by category', () => {
    store.append(makeOutcome({ id: '1', category: 'testing', success: true }));
    store.append(makeOutcome({ id: '2', category: 'testing', success: false }));
    store.append(makeOutcome({ id: '3', category: 'research', success: true }));
    const summary = store.summarize();
    const testingStats = summary.byCategory.get('testing');
    const researchStats = summary.byCategory.get('research');
    expect(testingStats).toBeDefined();
    expect(researchStats).toBeDefined();
    expect(testingStats?.count).toBe(2);
    expect(testingStats?.successRate).toBe(0.5);
    expect(researchStats?.count).toBe(1);
    expect(researchStats?.successRate).toBe(1);
  });

  it('summarize respects query filter', () => {
    store.append(makeOutcome({ id: '1', cli: 'claude' }));
    store.append(makeOutcome({ id: '2', cli: 'gemini' }));
    const summary = store.summarize({ cli: 'claude' });
    expect(summary.totalTasks).toBe(1);
  });

  // ---------- Clear ----------

  it('clears all entries', () => {
    store.append(makeOutcome({ id: '1' }));
    store.append(makeOutcome({ id: '2' }));
    store.clear();
    expect(store.size).toBe(0);
    expect(store.query()).toEqual([]);
  });
});

// ============================================================================
// Singleton
// ============================================================================

describe('getOutcomeStore / resetOutcomeStore', () => {
  beforeEach(() => {
    resetOutcomeStore();
  });

  it('returns the same instance on repeated calls', () => {
    const a = getOutcomeStore();
    const b = getOutcomeStore();
    expect(a).toBe(b);
  });

  it('returns a new instance after reset', () => {
    const a = getOutcomeStore();
    resetOutcomeStore();
    const b = getOutcomeStore();
    expect(a).not.toBe(b);
  });

  it('reset clears previously stored data', () => {
    resetOutcomeStore();
    const store = getOutcomeStore();
    store.append(makeOutcome());
    expect(store.size).toBe(1);
    resetOutcomeStore();
    expect(getOutcomeStore().size).toBe(0);
  });
});

// ============================================================================
// Auto-classification on append (#1441)
// ============================================================================

describe('OutcomeStore auto-classification (#1441)', () => {
  let store: OutcomeStore;

  beforeEach(() => {
    store = new OutcomeStore();
  });

  it('auto-classifies failed outcome with errorMessage', () => {
    store.append(
      makeOutcome({
        success: false,
        errorMessage: 'Request timed out after 30s',
      })
    );
    const [outcome] = store.query();
    expect(outcome?.failureCategory).toBe('timeout');
  });

  it('defaults to execution for failed outcome without errorMessage', () => {
    store.append(makeOutcome({ success: false }));
    const [outcome] = store.query();
    expect(outcome?.failureCategory).toBe('execution');
  });

  it('preserves existing failureCategory', () => {
    store.append(
      makeOutcome({
        success: false,
        failureCategory: 'rate_limit',
        errorMessage: 'Something that looks like a timeout',
      })
    );
    const [outcome] = store.query();
    expect(outcome?.failureCategory).toBe('rate_limit');
  });

  it('does not classify successful outcomes', () => {
    store.append(makeOutcome({ success: true }));
    const [outcome] = store.query();
    expect(outcome?.failureCategory).toBeUndefined();
  });
});

// ============================================================================
// Backfill reclassification (#1444)
// ============================================================================

describe('OutcomeStore.reclassifyAll (#1444)', () => {
  let store: OutcomeStore;

  beforeEach(() => {
    store = new OutcomeStore();
  });

  it('reclassifies failed entries missing failureCategory', () => {
    // Simulate pre-#1441 data by directly pushing to internal entries
    const raw = makeOutcome({
      id: 'old-1',
      success: false,
      errorMessage: 'Connection timed out',
    });
    // Use append but strip failureCategory to simulate legacy data
    store.append(raw);
    // The append auto-classifies, so let's test reclassifyAll on already-loaded data
    // by creating a store that has unclassified entries injected
    const store2 = new OutcomeStore();

    (store2 as unknown as { entries: TaskOutcome[] }).entries.push({
      ...makeOutcome({ id: 'legacy-1', success: false, errorMessage: 'Request timed out' }),
    });
    (store2 as unknown as { entries: TaskOutcome[] }).entries.push({
      ...makeOutcome({ id: 'legacy-2', success: false }),
    });
    (store2 as unknown as { entries: TaskOutcome[] }).entries.push({
      ...makeOutcome({ id: 'legacy-3', success: true }),
    });

    const count = store2.reclassifyAll();

    expect(count).toBe(2);
    const results = store2.query();
    expect(results[0]?.failureCategory).toBe('timeout');
    expect(results[1]?.failureCategory).toBe('execution');
    expect(results[2]?.failureCategory).toBeUndefined();
  });

  it('skips entries that already have failureCategory', () => {
    const store2 = new OutcomeStore();
    (store2 as unknown as { entries: TaskOutcome[] }).entries.push({
      ...makeOutcome({ id: 'classified', success: false, failureCategory: 'rate_limit' }),
    });

    const count = store2.reclassifyAll();

    expect(count).toBe(0);
    expect(store2.query()[0]?.failureCategory).toBe('rate_limit');
  });

  it('returns 0 for empty store', () => {
    expect(store.reclassifyAll()).toBe(0);
  });

  it('is idempotent — second call returns 0', () => {
    const store2 = new OutcomeStore();
    (store2 as unknown as { entries: TaskOutcome[] }).entries.push({
      ...makeOutcome({ id: 'legacy', success: false, errorMessage: 'rate limit exceeded' }),
    });

    expect(store2.reclassifyAll()).toBe(1);
    expect(store2.reclassifyAll()).toBe(0);
  });
});
