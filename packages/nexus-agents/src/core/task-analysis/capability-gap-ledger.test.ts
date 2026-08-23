/**
 * Tests for the Capability Gap Ledger (#3555).
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  createCapabilityGapLedger,
  getGapLedger,
  setGapLedger,
  resetGapLedger,
  recordRoutingGaps,
} from './capability-gap-ledger.js';
import type { CapabilityGapReport } from './capability-gap-detector.js';

function report(
  ...gaps: Array<{ type: 'tool' | 'expert'; name: string; suggestion?: string }>
): CapabilityGapReport {
  return {
    available: { tools: [], experts: [] },
    gaps: gaps.map((g) => ({
      type: g.type,
      name: g.name,
      suggestion: g.suggestion ?? 'use orchestrate',
    })),
    allSatisfied: gaps.length === 0,
  };
}

describe('CapabilityGapLedger', () => {
  it('starts empty', () => {
    const ledger = createCapabilityGapLedger();
    expect(ledger.size()).toBe(0);
    expect(ledger.summarize()).toEqual([]);
  });

  it('records each gap in a report', () => {
    const ledger = createCapabilityGapLedger();
    ledger.record(report({ type: 'tool', name: 'deploy' }, { type: 'expert', name: 'ml_expert' }));
    expect(ledger.size()).toBe(2);
  });

  it('ignores reports with no gaps', () => {
    const ledger = createCapabilityGapLedger();
    ledger.record(report());
    expect(ledger.size()).toBe(0);
  });

  it('aggregates and ranks distinct gaps by observation count', () => {
    const ledger = createCapabilityGapLedger();
    ledger.record(report({ type: 'tool', name: 'deploy' }));
    ledger.record(report({ type: 'tool', name: 'deploy' }));
    ledger.record(report({ type: 'expert', name: 'ml_expert' }));
    const summary = ledger.summarize();
    expect(summary).toHaveLength(2);
    expect(summary[0]).toMatchObject({ name: 'deploy', count: 2 });
    expect(summary[1]).toMatchObject({ name: 'ml_expert', count: 1 });
  });

  it('dedups by type+name (same name, different type is distinct)', () => {
    const ledger = createCapabilityGapLedger();
    ledger.record(report({ type: 'tool', name: 'review' }));
    ledger.record(report({ type: 'expert', name: 'review' }));
    const summary = ledger.summarize();
    expect(summary).toHaveLength(2);
    expect(summary.every((s) => s.count === 1)).toBe(true);
  });

  it('collects a bounded sample of example goals', () => {
    const ledger = createCapabilityGapLedger();
    for (const goal of ['g1', 'g2', 'g3', 'g4']) {
      ledger.record(report({ type: 'tool', name: 'deploy' }), { goal });
    }
    const top = ledger.summarize()[0];
    expect(top?.count).toBe(4);
    expect(top?.exampleGoals).toHaveLength(3); // capped
    expect(top?.exampleGoals.every((g) => ['g1', 'g2', 'g3', 'g4'].includes(g))).toBe(true);
  });

  it('dedups example goals (same goal recorded twice counts once in examples)', () => {
    const ledger = createCapabilityGapLedger();
    ledger.record(report({ type: 'tool', name: 'deploy' }), { goal: 'same' });
    ledger.record(report({ type: 'tool', name: 'deploy' }), { goal: 'same' });
    const top = ledger.summarize()[0];
    expect(top?.count).toBe(2);
    expect(top?.exampleGoals).toEqual(['same']);
  });

  it('breaks count ties by name ascending for deterministic ordering', () => {
    const ledger = createCapabilityGapLedger();
    ledger.record(report({ type: 'tool', name: 'zebra' }, { type: 'tool', name: 'alpha' }));
    const names = ledger.summarize().map((s) => s.name);
    expect(names).toEqual(['alpha', 'zebra']);
  });

  it('bounds retained occurrences, evicting oldest', () => {
    const ledger = createCapabilityGapLedger(3);
    for (let i = 0; i < 5; i++) ledger.record(report({ type: 'tool', name: `gap${String(i)}` }));
    expect(ledger.size()).toBe(3);
    const names = ledger.summarize().map((s) => s.name);
    expect(names).toContain('gap4'); // newest retained
    expect(names).not.toContain('gap0'); // oldest evicted
  });
});

describe('gap ledger singleton', () => {
  afterEach(() => {
    resetGapLedger();
  });

  it('returns the same instance across calls', () => {
    expect(getGapLedger()).toBe(getGapLedger());
  });

  it('setGapLedger overrides and resetGapLedger clears', () => {
    const custom = createCapabilityGapLedger();
    setGapLedger(custom);
    expect(getGapLedger()).toBe(custom);
    resetGapLedger();
    expect(getGapLedger()).not.toBe(custom);
  });
});

describe('recordRoutingGaps', () => {
  it('records gaps from a decision to the given ledger', () => {
    const ledger = createCapabilityGapLedger();
    recordRoutingGaps(
      { capabilityGaps: report({ type: 'tool', name: 'deploy' }) },
      { goal: 'ship it' },
      ledger
    );
    expect(ledger.summarize()[0]).toMatchObject({ name: 'deploy', count: 1 });
    expect(ledger.summarize()[0]?.exampleGoals).toContain('ship it');
  });

  it('is a no-op when all capabilities are satisfied', () => {
    const ledger = createCapabilityGapLedger();
    recordRoutingGaps({ capabilityGaps: report() }, { goal: 'g' }, ledger);
    expect(ledger.size()).toBe(0);
  });

  it('is a no-op when no capability gap report is present', () => {
    const ledger = createCapabilityGapLedger();
    recordRoutingGaps({}, { goal: 'g' }, ledger);
    expect(ledger.size()).toBe(0);
  });

  it('defaults to the shared singleton ledger', () => {
    // Assert DELEGATION, not an absolute count. Since #4645 the default
    // singleton is durable, so it loads prior occurrences from disk and its
    // size is a property of the machine's history rather than of this test.
    // Injecting a known in-memory ledger tests the actual contract — "with no
    // ledger argument, recordRoutingGaps writes to getGapLedger()" — and stays
    // hermetic.
    const shared = createCapabilityGapLedger();
    setGapLedger(shared);
    recordRoutingGaps(
      { capabilityGaps: report({ type: 'expert', name: 'ml_expert' }) },
      { goal: 'g' }
    );
    expect(shared.size()).toBe(1);
    expect(getGapLedger()).toBe(shared);
    resetGapLedger();
  });

  it('the default singleton is durable, so resetGapLedger does not empty it', () => {
    // Recording the consequence of #4645 explicitly: a process-wide ledger
    // backed by a file cannot be reset by dropping the in-process reference.
    // Tests needing a clean ledger must inject one via setGapLedger.
    resetGapLedger();
    const first = getGapLedger();
    resetGapLedger();
    expect(getGapLedger()).not.toBe(first);
    expect(getGapLedger().size()).toBe(first.size());
  });
});
