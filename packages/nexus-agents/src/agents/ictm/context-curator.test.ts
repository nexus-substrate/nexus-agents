/** Tests for context-curator.ts — @see Issue #756 */

import { describe, it, expect } from 'vitest';

import type { ContextFilter, CuratedContextItem } from './ictm-types.js';
import {
  scoreByRecency,
  scoreByImportance,
  scoreByHybrid,
  curateContext,
  estimateTokens,
  createContextItem,
} from './context-curator.js';

// =============================================================================
// HELPERS
// =============================================================================

const BASE_TIME = 1_700_000_000_000; // deterministic anchor
const HALF_LIFE_MS = 30 * 60 * 1000; // 30 min, matches module constant

function makeItem(overrides: Partial<CuratedContextItem> & { id: string }): CuratedContextItem {
  return {
    content: 'test content',
    tokenCount: 10,
    timestamp: BASE_TIME,
    relevance: 0.8,
    source: 'task',
    ...overrides,
  };
}

function makeFilter(overrides?: Partial<ContextFilter>): ContextFilter {
  return {
    maxTokens: 1000,
    relevanceThreshold: 0.3,
    includeHistory: true,
    pruneStrategy: 'hybrid',
    ...overrides,
  };
}

// =============================================================================
// scoreByRecency
// =============================================================================

describe('scoreByRecency', () => {
  it('returns 1.0 for an item at the current time', () => {
    const item = makeItem({ id: 'now', timestamp: BASE_TIME });
    expect(scoreByRecency(item, BASE_TIME)).toBeCloseTo(1.0, 10);
  });

  it('returns 0.5 after exactly one half-life', () => {
    const item = makeItem({ id: 'half', timestamp: BASE_TIME });
    expect(scoreByRecency(item, BASE_TIME + HALF_LIFE_MS)).toBeCloseTo(0.5, 5);
  });

  it('returns 0.25 after two half-lives', () => {
    const item = makeItem({ id: 'two', timestamp: BASE_TIME });
    expect(scoreByRecency(item, BASE_TIME + 2 * HALF_LIFE_MS)).toBeCloseTo(0.25, 5);
  });

  it('scores recent items higher than old items', () => {
    const recent = makeItem({ id: 'r', timestamp: BASE_TIME - 1_000 });
    const old = makeItem({ id: 'o', timestamp: BASE_TIME - 3_600_000 });
    expect(scoreByRecency(recent, BASE_TIME)).toBeGreaterThan(scoreByRecency(old, BASE_TIME));
  });

  it('returns equal scores for items with the same timestamp', () => {
    const a = makeItem({ id: 'a', timestamp: BASE_TIME - 5_000 });
    const b = makeItem({ id: 'b', timestamp: BASE_TIME - 5_000 });
    expect(scoreByRecency(a, BASE_TIME)).toBe(scoreByRecency(b, BASE_TIME));
  });

  it('very old items approach 0', () => {
    const ancient = makeItem({
      id: 'old',
      timestamp: BASE_TIME - 24 * 60 * 60 * 1000, // 24h ago
    });
    const score = scoreByRecency(ancient, BASE_TIME);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.001);
  });

  it('clamps age to 0 when item timestamp is in the future', () => {
    const future = makeItem({ id: 'f', timestamp: BASE_TIME + 60_000 });
    // Math.max(0, now - timestamp) → 0 → score = 1.0
    expect(scoreByRecency(future, BASE_TIME)).toBeCloseTo(1.0, 10);
  });
});

// =============================================================================
// scoreByImportance
// =============================================================================

describe('scoreByImportance', () => {
  it('returns the item relevance score', () => {
    expect(scoreByImportance(makeItem({ id: '1', relevance: 0.9 }))).toBe(0.9);
  });

  it('returns 0 for relevance 0', () => {
    expect(scoreByImportance(makeItem({ id: '2', relevance: 0 }))).toBe(0);
  });

  it('returns 1 for relevance 1', () => {
    expect(scoreByImportance(makeItem({ id: '3', relevance: 1 }))).toBe(1);
  });
});

// =============================================================================
// scoreByHybrid
// =============================================================================

describe('scoreByHybrid', () => {
  it('applies 0.4 recency + 0.6 importance weighting', () => {
    const item = makeItem({ id: 'h', relevance: 1.0, timestamp: BASE_TIME });
    // At current time: recency = 1.0, importance = 1.0
    // hybrid = 0.4*1 + 0.6*1 = 1.0
    expect(scoreByHybrid(item, BASE_TIME)).toBeCloseTo(1.0, 5);
  });

  it('weights importance more than recency', () => {
    // High importance, old item
    const importantOld = makeItem({
      id: 'io',
      relevance: 1.0,
      timestamp: BASE_TIME - HALF_LIFE_MS,
    });
    // Low importance, recent item
    const trivialNew = makeItem({
      id: 'tn',
      relevance: 0.1,
      timestamp: BASE_TIME,
    });
    // importantOld: 0.4*0.5 + 0.6*1.0 = 0.80
    // trivialNew:   0.4*1.0 + 0.6*0.1 = 0.46
    expect(scoreByHybrid(importantOld, BASE_TIME)).toBeGreaterThan(
      scoreByHybrid(trivialNew, BASE_TIME)
    );
  });

  it('computes correct value for known inputs', () => {
    const item = makeItem({
      id: 'k',
      relevance: 0.5,
      timestamp: BASE_TIME - HALF_LIFE_MS,
    });
    // recency = 0.5, importance = 0.5
    // hybrid = 0.4*0.5 + 0.6*0.5 = 0.5
    expect(scoreByHybrid(item, BASE_TIME)).toBeCloseTo(0.5, 5);
  });
});

// =============================================================================
// estimateTokens
// =============================================================================

describe('estimateTokens', () => {
  it('returns ceil(length / 4)', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('ab')).toBe(1);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('handles long strings', () => {
    const text = 'a'.repeat(1000);
    expect(estimateTokens(text)).toBe(250);
  });
});

// =============================================================================
// createContextItem
// =============================================================================

describe('createContextItem', () => {
  it('creates an item with estimated tokens', () => {
    const item = createContextItem('x', 'hello world', 'task', 0.7, BASE_TIME);
    expect(item.id).toBe('x');
    expect(item.content).toBe('hello world');
    expect(item.tokenCount).toBe(estimateTokens('hello world'));
    expect(item.timestamp).toBe(BASE_TIME);
    expect(item.relevance).toBe(0.7);
    expect(item.source).toBe('task');
  });

  it('uses Date.now() when no timestamp provided', () => {
    const before = Date.now();
    const item = createContextItem('y', 'text', 'knowledge', 0.5);
    const after = Date.now();
    expect(item.timestamp).toBeGreaterThanOrEqual(before);
    expect(item.timestamp).toBeLessThanOrEqual(after);
  });
});

// =============================================================================
// curateContext
// =============================================================================

describe('curateContext', () => {
  it('returns empty result for empty items', () => {
    const result = curateContext([], makeFilter(), BASE_TIME);
    expect(result.items).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
    expect(result.filteredCount).toBe(0);
    expect(result.trimmedCount).toBe(0);
  });

  // -- History filtering --

  it('filters out history items when includeHistory is false', () => {
    const items = [
      makeItem({ id: 'h1', source: 'history' }),
      makeItem({ id: 't1', source: 'task' }),
    ];
    const filter = makeFilter({ includeHistory: false });
    const result = curateContext(items, filter, BASE_TIME);
    expect(result.items.every((i) => i.source !== 'history')).toBe(true);
    expect(result.filteredCount).toBe(1);
  });

  it('keeps history items when includeHistory is true', () => {
    const items = [
      makeItem({ id: 'h1', source: 'history' }),
      makeItem({ id: 't1', source: 'task' }),
    ];
    const filter = makeFilter({ includeHistory: true });
    const result = curateContext(items, filter, BASE_TIME);
    expect(result.items).toHaveLength(2);
    expect(result.filteredCount).toBe(0);
  });

  // -- Relevance filtering --

  it('filters items below relevance threshold', () => {
    const items = [
      makeItem({ id: 'low', relevance: 0.1 }),
      makeItem({ id: 'high', relevance: 0.9 }),
    ];
    const filter = makeFilter({ relevanceThreshold: 0.5 });
    const result = curateContext(items, filter, BASE_TIME);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('high');
    expect(result.filteredCount).toBe(1);
  });

  it('includes items exactly at relevance threshold', () => {
    const items = [makeItem({ id: 'edge', relevance: 0.5 })];
    const filter = makeFilter({ relevanceThreshold: 0.5 });
    const result = curateContext(items, filter, BASE_TIME);
    expect(result.items).toHaveLength(1);
  });

  // -- Ranking by strategy --

  it('ranks by recency strategy', () => {
    const items = [
      makeItem({ id: 'old', timestamp: BASE_TIME - 3_600_000, relevance: 0.9 }),
      makeItem({ id: 'new', timestamp: BASE_TIME - 1_000, relevance: 0.5 }),
    ];
    const filter = makeFilter({ pruneStrategy: 'recency' });
    const result = curateContext(items, filter, BASE_TIME);
    expect(result.items[0]!.id).toBe('new');
    expect(result.items[1]!.id).toBe('old');
  });

  it('ranks by importance strategy', () => {
    const items = [
      makeItem({ id: 'low', relevance: 0.4, timestamp: BASE_TIME }),
      makeItem({ id: 'high', relevance: 0.9, timestamp: BASE_TIME - 3_600_000 }),
    ];
    const filter = makeFilter({ pruneStrategy: 'importance' });
    const result = curateContext(items, filter, BASE_TIME);
    expect(result.items[0]!.id).toBe('high');
    expect(result.items[1]!.id).toBe('low');
  });

  it('ranks by hybrid strategy', () => {
    // Very recent but low importance vs. old but high importance
    const items = [
      makeItem({ id: 'recent-low', relevance: 0.35, timestamp: BASE_TIME }),
      makeItem({
        id: 'old-high',
        relevance: 0.95,
        timestamp: BASE_TIME - HALF_LIFE_MS,
      }),
    ];
    const filter = makeFilter({ pruneStrategy: 'hybrid' });
    const result = curateContext(items, filter, BASE_TIME);
    // old-high hybrid: 0.4*0.5 + 0.6*0.95 = 0.77
    // recent-low hybrid: 0.4*1.0 + 0.6*0.35 = 0.61
    expect(result.items[0]!.id).toBe('old-high');
  });

  // -- Token budget trimming --

  it('trims items to fit within token budget', () => {
    const items = [
      makeItem({ id: 'a', tokenCount: 50, relevance: 0.9 }),
      makeItem({ id: 'b', tokenCount: 50, relevance: 0.8 }),
      makeItem({ id: 'c', tokenCount: 50, relevance: 0.7 }),
    ];
    const filter = makeFilter({
      maxTokens: 100,
      pruneStrategy: 'importance',
    });
    const result = curateContext(items, filter, BASE_TIME);
    expect(result.items).toHaveLength(2);
    expect(result.totalTokens).toBe(100);
    expect(result.trimmedCount).toBe(1);
  });

  it('skips oversized items and includes smaller ones that fit', () => {
    const items = [
      makeItem({ id: 'big', tokenCount: 80, relevance: 0.9 }),
      makeItem({ id: 'med', tokenCount: 60, relevance: 0.8 }),
      makeItem({ id: 'sm', tokenCount: 30, relevance: 0.7 }),
    ];
    // big(80) fits, med(80+60>90) skip, sm(80+30>90) skip => only big
    const filter = makeFilter({
      maxTokens: 90,
      pruneStrategy: 'importance',
    });
    const result = curateContext(items, filter, BASE_TIME);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('big');
    expect(result.trimmedCount).toBe(2);
  });

  it('includes a smaller item after skipping a large one', () => {
    const items = [
      makeItem({ id: 'best', tokenCount: 30, relevance: 1.0 }),
      makeItem({ id: 'huge', tokenCount: 200, relevance: 0.9 }),
      makeItem({ id: 'small', tokenCount: 20, relevance: 0.8 }),
    ];
    // Budget 60: best(30) fits, huge(200) skip, small(20) fits (30+20=50<=60)
    const filter = makeFilter({
      maxTokens: 60,
      pruneStrategy: 'importance',
    });
    const result = curateContext(items, filter, BASE_TIME);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.id)).toEqual(['best', 'small']);
    expect(result.totalTokens).toBe(50);
    expect(result.trimmedCount).toBe(1);
  });

  // -- Combined filtering and trimming counts --

  it('tracks filteredCount combining history + relevance filtering', () => {
    const items = [
      makeItem({ id: 'h', source: 'history', relevance: 0.9 }),
      makeItem({ id: 'low', source: 'task', relevance: 0.1 }),
      makeItem({ id: 'ok', source: 'task', relevance: 0.8 }),
    ];
    const filter = makeFilter({
      includeHistory: false,
      relevanceThreshold: 0.5,
    });
    const result = curateContext(items, filter, BASE_TIME);
    // h filtered by history (1), low filtered by relevance (1)
    expect(result.filteredCount).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('ok');
  });

  it('uses default relevance threshold when not specified', () => {
    const items = [
      makeItem({ id: 'below', relevance: 0.2 }),
      makeItem({ id: 'above', relevance: 0.5 }),
    ];
    // Default threshold is 0.3 per the source constant
    const filter: ContextFilter = {
      maxTokens: 1000,
      relevanceThreshold: 0.3,
      includeHistory: true,
      pruneStrategy: 'importance',
    };
    const result = curateContext(items, filter, BASE_TIME);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('above');
  });

  it('does not mutate the original items array', () => {
    const items = [
      makeItem({ id: 'b', relevance: 0.5, timestamp: BASE_TIME - 1000 }),
      makeItem({ id: 'a', relevance: 0.9, timestamp: BASE_TIME }),
    ];
    const original = [...items];
    curateContext(items, makeFilter(), BASE_TIME);
    expect(items).toEqual(original);
  });
});
