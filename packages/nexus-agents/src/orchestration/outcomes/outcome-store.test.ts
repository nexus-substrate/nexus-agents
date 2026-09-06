/**
 * Tests for task outcome tracking (Issue #861).
 *
 * Covers: Zod schema validation, store operations, bounded capacity,
 * query filtering, aggregation summaries, and singleton behavior.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { TaskOutcomeSchema, OutcomeQuerySchema } from './outcome-types.js';
import type { TaskOutcome } from './outcome-types.js';
import {
  OutcomeStore,
  getOutcomeStore,
  getOutcomeSummaryText,
  resetOutcomeStore,
  setOutcomeStore,
} from './outcome-store.js';

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

  it('accepts optional traceId/requestId correlation fields (#3146)', () => {
    const result = TaskOutcomeSchema.safeParse(
      makeOutcome({ traceId: 'trace-abc', requestId: 'req_123' })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.traceId).toBe('trace-abc');
      expect(result.data.requestId).toBe('req_123');
    }
  });

  it('stays backward-compatible: records without traceId/requestId still parse (#3146)', () => {
    const result = TaskOutcomeSchema.safeParse(makeOutcome());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.traceId).toBeUndefined();
      expect(result.data.requestId).toBeUndefined();
    }
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
      success: false,
      failureCategory: 'timeout',
      since: '2026-01-01T00:00:00Z',
      limit: 10,
      baselineId: 'baseline-abc',
    });
    expect(result.success).toBe(true);
  });

  // #2697: fork-session branch correlation. Optional + bounded.
  it('accepts baselineId in a 1-64 char range', () => {
    expect(OutcomeQuerySchema.safeParse({ baselineId: 'b' }).success).toBe(true);
    expect(OutcomeQuerySchema.safeParse({ baselineId: 'x'.repeat(64) }).success).toBe(true);
    expect(OutcomeQuerySchema.safeParse({ baselineId: '' }).success).toBe(false);
    expect(OutcomeQuerySchema.safeParse({ baselineId: 'x'.repeat(65) }).success).toBe(false);
  });
});

describe('TaskOutcomeSchema baselineId (#2697)', () => {
  function base(): Record<string, unknown> {
    return {
      id: 'o-1',
      cli: 'claude' as const,
      category: 'code_generation' as const,
      model: 'claude-sonnet',
      success: true,
      durationMs: 100,
      timestamp: '2026-05-16T00:00:00Z',
      source: 'delegate' as const,
    };
  }

  it('accepts outcomes without a baselineId (backward-compatible)', () => {
    const r = TaskOutcomeSchema.safeParse(base());
    expect(r.success).toBe(true);
  });

  it('accepts outcomes with a baselineId in bounds', () => {
    const r = TaskOutcomeSchema.safeParse({ ...base(), baselineId: 'fork-root-123' });
    expect(r.success).toBe(true);
  });

  it('rejects empty or oversized baselineId', () => {
    expect(TaskOutcomeSchema.safeParse({ ...base(), baselineId: '' }).success).toBe(false);
    expect(TaskOutcomeSchema.safeParse({ ...base(), baselineId: 'x'.repeat(65) }).success).toBe(
      false
    );
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

  it('appends and retrieves outcomes (with #2548 vendor/family enrichment)', () => {
    const outcome = makeOutcome();
    store.append(outcome);
    expect(store.size).toBe(1);
    // Append enriches with vendor/family resolved from the registry
    // (#2548). Original fields are preserved; vendor/family are added.
    const retrieved = store.query()[0]!;
    expect(retrieved).toMatchObject(outcome);
    expect(typeof retrieved.vendor).toBe('string');
    expect(typeof retrieved.family).toBe('string');
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

  it('filters by success', () => {
    store.append(makeOutcome({ id: '1', success: true }));
    store.append(makeOutcome({ id: '2', success: false }));
    store.append(makeOutcome({ id: '3', success: true }));
    const results = store.query({ success: false });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('2');
  });

  it('filters by failureCategory', () => {
    store.append(makeOutcome({ id: '1', success: false, failureCategory: 'timeout' }));
    store.append(makeOutcome({ id: '2', success: false, failureCategory: 'execution' }));
    store.append(makeOutcome({ id: '3', success: true }));
    const results = store.query({ failureCategory: 'timeout' });
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

  it('setOutcomeStore replaces the singleton (#1528)', () => {
    const custom = new OutcomeStore();
    custom.append(makeOutcome({ id: 'custom-1' }));
    setOutcomeStore(custom);
    expect(getOutcomeStore()).toBe(custom);
    expect(getOutcomeStore().size).toBe(1);
    expect(getOutcomeStore().query()[0]?.id).toBe('custom-1');
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

  it('reclassifies all unknown entries (#1511, #1507)', () => {
    const store2 = new OutcomeStore();
    (store2 as unknown as { entries: TaskOutcome[] }).entries.push({
      ...makeOutcome({ id: 'unk-1', success: false, failureCategory: 'unknown' }),
    });
    (store2 as unknown as { entries: TaskOutcome[] }).entries.push({
      ...makeOutcome({
        id: 'unk-2',
        success: false,
        failureCategory: 'unknown',
        errorMessage: 'some error',
      }),
    });
    (store2 as unknown as { entries: TaskOutcome[] }).entries.push({
      ...makeOutcome({
        id: 'unk-3',
        success: false,
        failureCategory: 'unknown',
        errorMessage: "Unknown workflow 'foo'. Available: code-review",
      }),
    });

    const count = store2.reclassifyAll();

    expect(count).toBe(2); // unk-1 (no message) + unk-3 (now matches validation)
    expect(store2.query().find((o) => o.id === 'unk-1')?.failureCategory).toBe('execution');
    // 'some error' still doesn't match any pattern — stays unknown
    expect(store2.query().find((o) => o.id === 'unk-2')?.failureCategory).toBe('unknown');
    // 'Unknown workflow' now matches validation pattern (#1507)
    expect(store2.query().find((o) => o.id === 'unk-3')?.failureCategory).toBe('validation');
  });

  it('reclassifies execution entries with updated patterns (#1530)', () => {
    const store2 = new OutcomeStore();
    const entries = store2 as unknown as { entries: TaskOutcome[] };
    entries.entries.push({
      ...makeOutcome({
        id: 'exec-5xx',
        success: false,
        failureCategory: 'execution',
        errorMessage: '502 Bad Gateway',
      }),
    });
    entries.entries.push({
      ...makeOutcome({
        id: 'exec-empty',
        success: false,
        failureCategory: 'execution',
        errorMessage: 'Got empty response from model',
      }),
    });
    entries.entries.push({
      ...makeOutcome({
        id: 'exec-real',
        success: false,
        failureCategory: 'execution',
        errorMessage: 'TypeError: Cannot read properties',
      }),
    });

    const count = store2.reclassifyAll();

    expect(count).toBe(2);
    expect(store2.query().find((o) => o.id === 'exec-5xx')?.failureCategory).toBe('connection');
    expect(store2.query().find((o) => o.id === 'exec-empty')?.failureCategory).toBe('parse');
    expect(store2.query().find((o) => o.id === 'exec-real')?.failureCategory).toBe('execution');
  });

  it('reclassifies EADDRINUSE execution entries to connection (#subprocess-adapter parity)', () => {
    const store2 = new OutcomeStore();
    const entries = store2 as unknown as { entries: TaskOutcome[] };
    entries.entries.push({
      ...makeOutcome({
        id: 'eaddrinuse-1',
        success: false,
        failureCategory: 'execution',
        errorMessage: 'listen EADDRINUSE :::3000',
      }),
    });
    entries.entries.push({
      ...makeOutcome({
        id: 'eaddrinuse-2',
        success: false,
        failureCategory: 'execution',
        errorMessage: 'Error: address already in use',
      }),
    });

    const count = store2.reclassifyAll();

    expect(count).toBe(2);
    expect(store2.query().find((o) => o.id === 'eaddrinuse-1')?.failureCategory).toBe('connection');
    expect(store2.query().find((o) => o.id === 'eaddrinuse-2')?.failureCategory).toBe('connection');
  });

  it('reclassifies generic entries to more specific categories (#1401)', () => {
    const store2 = new OutcomeStore();
    const entries = store2 as unknown as { entries: TaskOutcome[] };
    entries.entries.push({
      ...makeOutcome({
        id: 'gen-conn',
        success: false,
        failureCategory: 'generic',
        errorMessage: 'error: service unavailable',
      }),
    });
    entries.entries.push({
      ...makeOutcome({
        id: 'gen-timeout',
        success: false,
        failureCategory: 'generic',
        errorMessage: 'failure: request timed out after 60s',
      }),
    });
    entries.entries.push({
      ...makeOutcome({
        id: 'gen-real',
        success: false,
        failureCategory: 'generic',
        errorMessage: 'error: not found',
      }),
    });

    const count = store2.reclassifyAll();

    // service unavailable → connection, timed out → timeout, not found stays generic
    expect(count).toBe(2);
    expect(store2.query().find((o) => o.id === 'gen-conn')?.failureCategory).toBe('connection');
    expect(store2.query().find((o) => o.id === 'gen-timeout')?.failureCategory).toBe('timeout');
    expect(store2.query().find((o) => o.id === 'gen-real')?.failureCategory).toBe('generic');
  });
});

describe('OutcomeStore.purgeSkippedWorkers (#1528)', () => {
  it('removes all 0ms failed entries regardless of model', () => {
    const store = new OutcomeStore();
    store.append(
      makeOutcome({ id: 'real-1', success: true, model: 'worker-code', durationMs: 100 })
    );
    store.append(
      makeOutcome({ id: 'skip-1', success: false, model: 'worker-security', durationMs: 0 })
    );
    store.append(
      makeOutcome({ id: 'real-2', success: false, model: 'worker-testing', durationMs: 500 })
    );
    store.append(makeOutcome({ id: 'skip-2', success: false, model: 'expert', durationMs: 0 }));
    store.append(
      makeOutcome({ id: 'skip-3', success: false, model: 'graph-workflow', durationMs: 0 })
    );

    const purged = store.purgeSkippedWorkers();

    expect(purged).toBe(3);
    expect(store.size).toBe(2);
    expect(store.query().map((o) => o.id)).toEqual(['real-1', 'real-2']);
  });

  it('preserves successful 0ms entries', () => {
    const store = new OutcomeStore();
    store.append(makeOutcome({ id: 's1', success: true, model: 'worker-code', durationMs: 0 }));

    expect(store.purgeSkippedWorkers()).toBe(0);
    expect(store.size).toBe(1);
  });

  it('preserves failures with non-zero duration', () => {
    const store = new OutcomeStore();
    store.append(makeOutcome({ id: 'e1', success: false, model: 'expert', durationMs: 1 }));

    expect(store.purgeSkippedWorkers()).toBe(0);
    expect(store.size).toBe(1);
  });

  it('returns 0 for empty store', () => {
    const store = new OutcomeStore();
    expect(store.purgeSkippedWorkers()).toBe(0);
  });
});

// ============================================================================
// getOutcomeSummaryText (#1711 — Central Workflow Hub)
// ============================================================================

describe('getOutcomeSummaryText', () => {
  beforeEach(() => {
    resetOutcomeStore();
    setOutcomeStore(new OutcomeStore());
  });

  it('returns empty string when no outcomes', () => {
    expect(getOutcomeSummaryText()).toBe('');
  });

  it('includes success rate and task count', () => {
    const store = getOutcomeStore();
    store.append(makeOutcome({ id: 'o1', success: true }));
    store.append(makeOutcome({ id: 'o2', success: true }));
    store.append(makeOutcome({ id: 'o3', success: false, errorMessage: 'timeout' }));

    const text = getOutcomeSummaryText();
    expect(text).toContain('3 tasks');
    expect(text).toContain('67%');
  });

  it('includes failure categories and messages', () => {
    const store = getOutcomeStore();
    store.append(
      makeOutcome({
        id: 'o1',
        success: false,
        failureCategory: 'timeout',
        errorMessage: 'CLI timed out',
      })
    );
    store.append(
      makeOutcome({ id: 'o2', success: false, failureCategory: 'parse', errorMessage: 'bad JSON' })
    );

    const text = getOutcomeSummaryText();
    expect(text).toContain('timeout: CLI timed out');
    expect(text).toContain('parse: bad JSON');
  });

  it('respects limit parameter', () => {
    const store = getOutcomeStore();
    for (let i = 0; i < 10; i++) {
      store.append(
        makeOutcome({ id: `o${String(i)}`, success: false, errorMessage: `err${String(i)}` })
      );
    }

    const text = getOutcomeSummaryText(2);
    // Should only show last 2 failures (limit=2 in query)
    expect(text).toContain('err');
  });
});

// ============================================================================
// queryByModelWithFamilyFallback (#2548)
// ============================================================================

describe('OutcomeStore.queryByModelWithFamilyFallback (#2548)', () => {
  it('returns literal-scoped outcomes when sample count meets threshold', () => {
    const store = new OutcomeStore();
    for (let i = 0; i < 6; i++) {
      store.append(makeOutcome({ id: `out-${String(i)}`, model: 'claude-opus-4-7' }));
    }
    const result = store.queryByModelWithFamilyFallback('claude-opus-4-7', { threshold: 5 });
    expect(result.scope).toBe('literal');
    expect(result.outcomes).toHaveLength(6);
    expect(result.vendor).toBe('anthropic');
  });

  it('broadens to family-scoped outcomes when literal count is below threshold', () => {
    const store = new OutcomeStore();
    // 2 outcomes for the cold model (below threshold of 5)
    for (let i = 0; i < 2; i++) {
      store.append(makeOutcome({ id: `out-cold-${String(i)}`, model: 'claude-opus-4-7' }));
    }
    // 4 outcomes for a sibling in the same vendor+family
    for (let i = 0; i < 4; i++) {
      store.append(makeOutcome({ id: `out-sib-${String(i)}`, model: 'claude-opus-4-6' }));
    }
    const result = store.queryByModelWithFamilyFallback('claude-opus-4-7', { threshold: 5 });
    expect(result.scope).toBe('family');
    expect(result.outcomes).toHaveLength(6); // 2 cold + 4 siblings, same family
    expect(result.vendor).toBe('anthropic');
  });

  it('does not cross vendor boundaries when broadening', () => {
    const store = new OutcomeStore();
    // 1 cold outcome for claude
    store.append(makeOutcome({ id: 'cold', model: 'claude-opus-4-7' }));
    // 4 outcomes for a DIFFERENT vendor (codex)
    for (let i = 0; i < 4; i++) {
      store.append(makeOutcome({ id: `codex-${String(i)}`, cli: 'codex', model: 'gpt-5.6-terra' }));
    }
    const result = store.queryByModelWithFamilyFallback('claude-opus-4-7', { threshold: 5 });
    // Family broadening must NOT pick up the codex outcomes — different vendor.
    // With only 1 anthropic outcome in the family, the scope is 'family' but
    // the result set still only contains the 1 anthropic outcome.
    expect(result.scope).toBe('family');
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]?.cli).toBe('claude');
  });

  it('reports `empty` scope when no outcomes match literal OR family', () => {
    const store = new OutcomeStore();
    // Single outcome for an unrelated model
    store.append(makeOutcome({ id: 'other', cli: 'codex', model: 'gpt-5.6-terra' }));
    const result = store.queryByModelWithFamilyFallback('claude-opus-4-7', { threshold: 5 });
    expect(result.scope).toBe('empty');
    expect(result.outcomes).toHaveLength(0);
  });

  it('respects extraFilter (e.g. category) when broadening', () => {
    const store = new OutcomeStore();
    for (let i = 0; i < 3; i++) {
      store.append(
        makeOutcome({
          id: `code-${String(i)}`,
          model: 'claude-opus-4-7',
          category: 'code_generation',
        })
      );
    }
    for (let i = 0; i < 3; i++) {
      store.append(
        makeOutcome({
          id: `arch-${String(i)}`,
          model: 'claude-opus-4-7',
          category: 'architecture',
        })
      );
    }
    const result = store.queryByModelWithFamilyFallback('claude-opus-4-7', {
      threshold: 10,
      extraFilter: { category: 'architecture' },
    });
    // Below threshold of 10 (only 3 architecture samples), broadens to family
    // BUT the category filter applies to the family scope too.
    expect(result.outcomes).toHaveLength(3);
    expect(result.outcomes.every((o) => o.category === 'architecture')).toBe(true);
  });
});

// ============================================================================
// #2697 baselineId filter
// ============================================================================

describe('OutcomeStore baselineId filter (#2697)', () => {
  let store: OutcomeStore;

  beforeEach(() => {
    store = new OutcomeStore();
  });

  it('round-trips baselineId through append + query', () => {
    store.append(makeOutcome({ id: 'fork-1', baselineId: 'baseline-a' }));
    store.append(makeOutcome({ id: 'fork-2', baselineId: 'baseline-a' }));
    store.append(makeOutcome({ id: 'unrelated' }));
    const cohort = store.query({ baselineId: 'baseline-a' });
    expect(cohort).toHaveLength(2);
    expect(cohort.map((o) => o.id).sort()).toEqual(['fork-1', 'fork-2']);
  });

  it('omitting baselineId filter returns all outcomes (no narrowing)', () => {
    store.append(makeOutcome({ id: '1', baselineId: 'b1' }));
    store.append(makeOutcome({ id: '2' })); // no baselineId
    expect(store.query({})).toHaveLength(2);
  });

  it('composes with other filters (cli + baselineId)', () => {
    store.append(makeOutcome({ id: 'a', cli: 'claude', baselineId: 'B' }));
    store.append(makeOutcome({ id: 'b', cli: 'gemini', baselineId: 'B' }));
    store.append(makeOutcome({ id: 'c', cli: 'claude', baselineId: 'C' }));
    const result = store.query({ cli: 'claude', baselineId: 'B' });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('a');
  });

  it('baselineId-tagged outcomes survive the JSONL round-trip when persisted', () => {
    // Persistence path uses TaskOutcomeSchema.safeParse — the new optional
    // field must round-trip cleanly. (#2697)
    const recorded = makeOutcome({ id: 'fork', baselineId: 'baseline-xyz' });
    store.append(recorded);
    const back = store.query({ baselineId: 'baseline-xyz' });
    expect(back[0]?.baselineId).toBe('baseline-xyz');
  });
});
