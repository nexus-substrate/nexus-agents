/**
 * Tests for task outcome tracking (Issue #861).
 *
 * Covers: Zod schema validation, store operations, bounded capacity,
 * query filtering, aggregation summaries, and singleton behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskOutcomeSchema, OutcomeQuerySchema } from './outcome-types.js';
import type { TaskOutcome } from './outcome-types.js';
import { OutcomeStore, getOutcomeStore, resetOutcomeStore } from './outcome-store.js';

// ============================================================================
// Helpers
// ============================================================================

function makeOutcome(overrides?: Partial<TaskOutcome>): TaskOutcome {
  return {
    id: 'out-1',
    cli: 'claude',
    category: 'code_generation',
    model: 'claude-sonnet-4-5',
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
    const store = getOutcomeStore();
    store.append(makeOutcome());
    expect(store.size).toBe(1);
    resetOutcomeStore();
    expect(getOutcomeStore().size).toBe(0);
  });
});
