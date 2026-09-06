/**
 * Tests for Adaptive Memory Helpers
 * @module context/adaptive-memory-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import { MemoryImportance } from './memory-backend-types.js';
import type { MemoryEntry, MemoryRow } from './memory-backend-types.js';
import type { ScoredMemoryEntry } from './adaptive-memory-types.js';
import { DEFAULT_SCORING_CONFIG } from './adaptive-memory-types.js';
import {
  calculateRecencyScore,
  calculateImportanceScore,
  calculateRelevanceScore,
  calculatePriorityScore,
  filterScoredEntries,
  mergeScoringConfig,
  scoreAndSortEntries,
} from './adaptive-memory-helpers.js';

vi.mock('../core/index.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getTimeProvider: () => ({ now: () => 1700000000000 }),
  };
});

// ============================================================================
// Test Helpers
// ============================================================================

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    key: 'test-key',
    value: 'test value',
    metadata: {
      importance: MemoryImportance.MEDIUM,
      tags: ['test'],
    },
    accessedAt: new Date(1700000000000 - 3600000),
    createdAt: new Date(1700000000000 - 7200000),
    ...overrides,
  };
}

function makeScoredEntry(entry: Partial<MemoryEntry> = {}, score = 0.5): ScoredMemoryEntry {
  return {
    entry: makeEntry(entry),
    priority: {
      score,
      components: { recency: 0.5, importance: 0.5, relevance: 0.5 },
    },
  };
}

// ============================================================================
// calculateRecencyScore
// ============================================================================

describe('calculateRecencyScore', () => {
  it('returns 1.0 for items accessed now', () => {
    const now = new Date(1700000000000);
    expect(calculateRecencyScore(now, now, 3600000, 0.1)).toBe(1.0);
  });

  it('returns ~0.5 at half-life', () => {
    const now = new Date(1700000000000);
    const accessedAt = new Date(1700000000000 - 3600000); // 1 hour ago
    const score = calculateRecencyScore(accessedAt, now, 3600000, 0.01);
    expect(score).toBeCloseTo(0.5, 1);
  });

  it('decays exponentially', () => {
    const now = new Date(1700000000000);
    const recent = calculateRecencyScore(new Date(1700000000000 - 1000), now, 3600000, 0.01);
    const old = calculateRecencyScore(new Date(1700000000000 - 86400000), now, 3600000, 0.01);
    expect(recent).toBeGreaterThan(old);
  });

  it('respects minimum score', () => {
    const now = new Date(1700000000000);
    const veryOld = new Date(1700000000000 - 999999999);
    const score = calculateRecencyScore(veryOld, now, 3600000, 0.1);
    expect(score).toBeGreaterThanOrEqual(0.1);
  });

  it('returns 1.0 for future access times', () => {
    const now = new Date(1700000000000);
    const future = new Date(1700000000000 + 10000);
    expect(calculateRecencyScore(future, now, 3600000, 0.1)).toBe(1.0);
  });
});

// ============================================================================
// calculateImportanceScore
// ============================================================================

describe('calculateImportanceScore', () => {
  it('returns high weight for HIGH importance', () => {
    const score = calculateImportanceScore(MemoryImportance.HIGH, DEFAULT_SCORING_CONFIG);
    expect(score).toBe(DEFAULT_SCORING_CONFIG.importanceWeights.high);
  });

  it('returns medium weight for MEDIUM importance', () => {
    const score = calculateImportanceScore(MemoryImportance.MEDIUM, DEFAULT_SCORING_CONFIG);
    expect(score).toBe(DEFAULT_SCORING_CONFIG.importanceWeights.medium);
  });

  it('returns low weight for LOW importance', () => {
    const score = calculateImportanceScore(MemoryImportance.LOW, DEFAULT_SCORING_CONFIG);
    expect(score).toBe(DEFAULT_SCORING_CONFIG.importanceWeights.low);
  });

  it('returns medium weight for unknown importance', () => {
    const score = calculateImportanceScore('unknown', DEFAULT_SCORING_CONFIG);
    expect(score).toBe(DEFAULT_SCORING_CONFIG.importanceWeights.medium);
  });
});

// ============================================================================
// calculateRelevanceScore
// ============================================================================

describe('calculateRelevanceScore', () => {
  it('returns 1.0 for undefined query', () => {
    expect(calculateRelevanceScore(undefined, 'some value')).toBe(1.0);
  });

  it('returns 1.0 for empty query', () => {
    expect(calculateRelevanceScore('  ', 'some value')).toBe(1.0);
  });

  it('returns higher score for matching text', () => {
    const score = calculateRelevanceScore('test value', 'this is a test value example');
    expect(score).toBeGreaterThan(0);
  });

  it('returns lower score for non-matching text', () => {
    const matching = calculateRelevanceScore('test', 'test value');
    const nonMatching = calculateRelevanceScore('xyz', 'test value');
    expect(matching).toBeGreaterThan(nonMatching);
  });
});

// ============================================================================
// calculatePriorityScore
// ============================================================================

describe('calculatePriorityScore', () => {
  it('returns combined score with components', () => {
    const entry = makeEntry();
    const now = new Date(1700000000000);
    const result = calculatePriorityScore({
      entry,
      now,
      config: DEFAULT_SCORING_CONFIG,
    });
    expect(result.score).toBeGreaterThan(0);
    expect(result.components.recency).toBeGreaterThan(0);
    expect(result.components.importance).toBeGreaterThan(0);
    expect(result.components.relevance).toBeGreaterThan(0);
  });

  it('includes relevance when query provided', () => {
    const entry = makeEntry({ value: 'important data about testing' });
    const now = new Date(1700000000000);
    const withQuery = calculatePriorityScore({
      entry,
      query: 'testing',
      now,
      config: DEFAULT_SCORING_CONFIG,
    });
    expect(withQuery.components.relevance).toBeGreaterThan(0);
  });
});

// ============================================================================
// filterScoredEntries
// ============================================================================

describe('filterScoredEntries', () => {
  it('filters by minimum score', () => {
    const entries = [makeScoredEntry({}, 0.8), makeScoredEntry({}, 0.3)];
    const filtered = filterScoredEntries(entries, { minScore: 0.5 });
    expect(filtered).toHaveLength(1);
  });

  it('filters by importance', () => {
    const entries = [
      makeScoredEntry({
        metadata: { importance: MemoryImportance.HIGH, tags: [] },
      }),
      makeScoredEntry({
        metadata: { importance: MemoryImportance.LOW, tags: [] },
      }),
    ];
    const filtered = filterScoredEntries(entries, { importanceFilter: [MemoryImportance.HIGH] });
    expect(filtered).toHaveLength(1);
  });

  it('filters by tags', () => {
    const entries = [
      makeScoredEntry({
        metadata: { importance: MemoryImportance.MEDIUM, tags: ['api'] },
      }),
      makeScoredEntry({
        metadata: { importance: MemoryImportance.MEDIUM, tags: ['ui'] },
      }),
    ];
    const filtered = filterScoredEntries(entries, { tagFilter: ['api'] });
    expect(filtered).toHaveLength(1);
  });

  it('returns all when no filters', () => {
    const entries = [makeScoredEntry(), makeScoredEntry()];
    expect(filterScoredEntries(entries, {})).toHaveLength(2);
  });
});

// ============================================================================
// mergeScoringConfig
// ============================================================================

describe('mergeScoringConfig', () => {
  it('returns defaults for undefined', () => {
    expect(mergeScoringConfig()).toEqual(DEFAULT_SCORING_CONFIG);
  });

  it('overrides weights', () => {
    const config = mergeScoringConfig({
      weights: { recency: 0.5, importance: 0.3, relevance: 0.2 },
    });
    expect(config.weights.recency).toBe(0.5);
    expect(config.importanceWeights).toEqual(DEFAULT_SCORING_CONFIG.importanceWeights);
  });

  it('preserves unset fields', () => {
    const config = mergeScoringConfig({ decay: { halfLifeMs: 7200000, minScore: 0.05 } });
    expect(config.weights).toEqual(DEFAULT_SCORING_CONFIG.weights);
    expect(config.decay.halfLifeMs).toBe(7200000);
  });
});

// ============================================================================
// scoreAndSortEntries
// ============================================================================

describe('scoreAndSortEntries', () => {
  function makeRow(key: string, metadata: string): MemoryRow {
    return {
      key,
      value: JSON.stringify(`value for ${key}`),
      metadata,
      created_at: 1700000000000 - 7200000,
      accessed_at: 1700000000000 - 3600000,
      expires_at: null,
    };
  }

  const readable = JSON.stringify({ importance: MemoryImportance.HIGH });

  it('reports rows skipped for unreadable metadata (#5835)', () => {
    // Was: a corrupt row was scored under a fabricated MEDIUM importance, so
    // it competed for a slot against memories whose importance was real.
    const report = scoreAndSortEntries(
      [makeRow('good', readable), makeRow('bad', 'NOT_JSON'), makeRow('shape', 'null')],
      undefined,
      DEFAULT_SCORING_CONFIG
    );

    expect(report.entries.map((e) => e.entry.key)).toEqual(['good']);
    expect(report.unreadable.map((u) => u.key).sort()).toEqual(['bad', 'shape']);
    expect(report.unreadable.map((u) => u.reason)).toContain('metadata_not_json');
    expect(report.unreadable.map((u) => u.reason)).toContain('metadata_wrong_shape');
  });

  it('reports no skips when every row is readable', () => {
    // Pair test: the skip path must not fire on well-formed rows.
    const report = scoreAndSortEntries(
      [makeRow('a', readable), makeRow('b', readable)],
      undefined,
      DEFAULT_SCORING_CONFIG
    );

    expect(report.entries).toHaveLength(2);
    expect(report.unreadable).toEqual([]);
  });

  it('reports every row when none can be read', () => {
    // The empty case: an all-corrupt store must not read as an empty store.
    const report = scoreAndSortEntries(
      [makeRow('a', 'NOT_JSON'), makeRow('b', 'NOT_JSON')],
      undefined,
      DEFAULT_SCORING_CONFIG
    );

    expect(report.entries).toEqual([]);
    expect(report.unreadable).toHaveLength(2);
  });
});
