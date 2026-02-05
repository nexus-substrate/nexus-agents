/**
 * Tests for Belief Memory Helpers
 * @module context/belief-memory-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { Belief, BeliefQuery, BeliefMemoryStats } from './belief-types.js';
import {
  compareConfidence,
  strengthenConfidence,
  weakenConfidence,
  sortBeliefs,
  matchesQueryFilters,
  intersectSets,
  initializeStatsCounters,
  buildStatsResult,
} from './belief-memory-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeBelief(overrides: Partial<Belief> = {}): Belief {
  return {
    id: 'belief-1',
    content: 'Test belief',
    confidence: 'medium',
    sourceType: 'observation',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    superseded: false,
    tags: [],
    ...overrides,
  } as Belief;
}

// ============================================================================
// compareConfidence
// ============================================================================

describe('compareConfidence', () => {
  it('returns positive when first is higher', () => {
    expect(compareConfidence('high', 'low')).toBeGreaterThan(0);
  });

  it('returns negative when first is lower', () => {
    expect(compareConfidence('low', 'high')).toBeLessThan(0);
  });

  it('returns 0 for equal levels', () => {
    expect(compareConfidence('medium', 'medium')).toBe(0);
  });

  it('orders speculative < low < medium < high', () => {
    expect(compareConfidence('speculative', 'low')).toBeLessThan(0);
    expect(compareConfidence('low', 'medium')).toBeLessThan(0);
    expect(compareConfidence('medium', 'high')).toBeLessThan(0);
  });
});

// ============================================================================
// strengthenConfidence
// ============================================================================

describe('strengthenConfidence', () => {
  it('promotes speculative to low', () => {
    expect(strengthenConfidence('speculative')).toBe('low');
  });

  it('promotes low to medium', () => {
    expect(strengthenConfidence('low')).toBe('medium');
  });

  it('promotes medium to high', () => {
    expect(strengthenConfidence('medium')).toBe('high');
  });

  it('keeps high as high', () => {
    expect(strengthenConfidence('high')).toBe('high');
  });
});

// ============================================================================
// weakenConfidence
// ============================================================================

describe('weakenConfidence', () => {
  it('demotes high to medium', () => {
    expect(weakenConfidence('high')).toBe('medium');
  });

  it('demotes medium to low', () => {
    expect(weakenConfidence('medium')).toBe('low');
  });

  it('demotes low to speculative', () => {
    expect(weakenConfidence('low')).toBe('speculative');
  });

  it('keeps speculative as speculative', () => {
    expect(weakenConfidence('speculative')).toBe('speculative');
  });
});

// ============================================================================
// sortBeliefs
// ============================================================================

describe('sortBeliefs', () => {
  it('sorts by createdAt ascending', () => {
    const beliefs = [
      makeBelief({ createdAt: new Date('2024-03-01') }),
      makeBelief({ createdAt: new Date('2024-01-01') }),
    ];
    const sorted = sortBeliefs(beliefs, 'createdAt', 'asc');
    expect(sorted[0]?.createdAt.getTime()).toBeLessThan(sorted[1]!.createdAt.getTime());
  });

  it('sorts by createdAt descending', () => {
    const beliefs = [
      makeBelief({ createdAt: new Date('2024-01-01') }),
      makeBelief({ createdAt: new Date('2024-03-01') }),
    ];
    const sorted = sortBeliefs(beliefs, 'createdAt', 'desc');
    expect(sorted[0]?.createdAt.getTime()).toBeGreaterThan(sorted[1]!.createdAt.getTime());
  });

  it('sorts by confidence', () => {
    const beliefs = [makeBelief({ confidence: 'low' }), makeBelief({ confidence: 'high' })];
    const sorted = sortBeliefs(beliefs, 'confidence', 'desc');
    expect(sorted[0]?.confidence).toBe('high');
  });

  it('uses updatedAt default sort with asc direction (b-a * 1 = descending)', () => {
    const beliefs = [
      makeBelief({ updatedAt: new Date('2024-01-01') }),
      makeBelief({ updatedAt: new Date('2024-03-01') }),
    ];
    // Default orderBy: (b.updatedAt - a.updatedAt) * multiplier
    // With 'asc' direction: multiplier=1, so b-a is natural descending
    const sorted = sortBeliefs(beliefs, undefined, 'asc');
    expect(sorted[0]?.updatedAt.getTime()).toBeGreaterThan(sorted[1]!.updatedAt.getTime());
  });
});

// ============================================================================
// matchesQueryFilters
// ============================================================================

describe('matchesQueryFilters', () => {
  it('filters out superseded beliefs by default', () => {
    const belief = makeBelief({ superseded: true });
    expect(matchesQueryFilters(belief, {} as BeliefQuery)).toBe(false);
  });

  it('includes superseded when requested', () => {
    const belief = makeBelief({ superseded: true });
    expect(matchesQueryFilters(belief, { includeSuperseded: true } as BeliefQuery)).toBe(true);
  });

  it('filters by minimum confidence', () => {
    const belief = makeBelief({ confidence: 'low' });
    expect(matchesQueryFilters(belief, { minConfidence: 'medium' } as BeliefQuery)).toBe(false);
    expect(matchesQueryFilters(belief, { minConfidence: 'low' } as BeliefQuery)).toBe(true);
  });

  it('filters by source type', () => {
    const belief = makeBelief({ sourceType: 'observation' });
    expect(matchesQueryFilters(belief, { sourceType: 'observation' } as BeliefQuery)).toBe(true);
    expect(matchesQueryFilters(belief, { sourceType: 'inference' } as BeliefQuery)).toBe(false);
  });

  it('passes with no filters', () => {
    const belief = makeBelief();
    expect(matchesQueryFilters(belief, {} as BeliefQuery)).toBe(true);
  });
});

// ============================================================================
// intersectSets
// ============================================================================

describe('intersectSets', () => {
  it('returns common elements', () => {
    const a = new Set([1, 2, 3]);
    const b = new Set([2, 3, 4]);
    expect(intersectSets(a, b)).toEqual(new Set([2, 3]));
  });

  it('returns empty for disjoint sets', () => {
    expect(intersectSets(new Set([1, 2]), new Set([3, 4]))).toEqual(new Set());
  });

  it('handles empty sets', () => {
    expect(intersectSets(new Set(), new Set([1]))).toEqual(new Set());
  });
});

// ============================================================================
// initializeStatsCounters
// ============================================================================

describe('initializeStatsCounters', () => {
  it('initializes all confidence levels to 0', () => {
    const counters = initializeStatsCounters();
    expect(counters.beliefsByConfidence.high).toBe(0);
    expect(counters.beliefsByConfidence.medium).toBe(0);
    expect(counters.beliefsByConfidence.low).toBe(0);
    expect(counters.beliefsByConfidence.speculative).toBe(0);
  });

  it('initializes all source types to 0', () => {
    const counters = initializeStatsCounters();
    expect(counters.beliefsBySource.observation).toBe(0);
    expect(counters.beliefsBySource.inference).toBe(0);
    expect(counters.beliefsBySource.external).toBe(0);
    expect(counters.beliefsBySource.user_input).toBe(0);
    expect(counters.beliefsBySource.hindsight).toBe(0);
    expect(counters.beliefsBySource.prior).toBe(0);
  });
});

// ============================================================================
// buildStatsResult
// ============================================================================

describe('buildStatsResult', () => {
  const baseStats = {
    totalBeliefs: 10,
    activeBeliefs: 8,
    supersededBeliefs: 2,
    beliefsByConfidence: { high: 3, medium: 4, low: 2, speculative: 1 },
    beliefsBySource: {
      observation: 5,
      inference: 2,
      external: 1,
      user_input: 1,
      hindsight: 1,
      prior: 0,
    },
    totalUpdates: 15,
    totalCounterfactuals: 0,
    totalHindsightRecords: 0,
  } as Omit<BeliefMemoryStats, 'oldestBelief' | 'newestBelief'>;

  it('includes both dates when provided', () => {
    const oldest = new Date('2024-01-01');
    const newest = new Date('2024-06-01');
    const result = buildStatsResult(baseStats, oldest, newest);
    expect(result.oldestBelief).toEqual(oldest);
    expect(result.newestBelief).toEqual(newest);
  });

  it('includes only oldest when newest is undefined', () => {
    const oldest = new Date('2024-01-01');
    const result = buildStatsResult(baseStats, oldest, undefined);
    expect(result.oldestBelief).toEqual(oldest);
    expect((result as unknown as Record<string, unknown>).newestBelief).toBeUndefined();
  });

  it('includes only newest when oldest is undefined', () => {
    const newest = new Date('2024-06-01');
    const result = buildStatsResult(baseStats, undefined, newest);
    expect(result.newestBelief).toEqual(newest);
    expect((result as unknown as Record<string, unknown>).oldestBelief).toBeUndefined();
  });

  it('includes neither date when both undefined', () => {
    const result = buildStatsResult(baseStats, undefined, undefined);
    expect((result as unknown as Record<string, unknown>).oldestBelief).toBeUndefined();
    expect((result as unknown as Record<string, unknown>).newestBelief).toBeUndefined();
  });
});
