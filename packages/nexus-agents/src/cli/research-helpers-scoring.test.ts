/**
 * Tests for research quality scoring.
 *
 * @module cli/research-helpers-scoring.test
 * (Source: Research System Enhancement - Phase 4)
 */

import { describe, it, expect } from 'vitest';
import { scoreDiscoveredItem, rankDiscoveredItems } from './research-helpers-scoring.js';
import type { DiscoveredSource } from './research-helpers-sources.js';

/** Create a test discovered source. */
function createItem(overrides: Partial<DiscoveredSource> = {}): DiscoveredSource {
  return {
    source: 'arxiv',
    title: 'Multi-Agent Orchestration Framework',
    url: 'https://arxiv.org/abs/2401.12345',
    description: 'A framework for multi-agent orchestration.',
    relevance: 'medium',
    discoveredAt: new Date().toISOString().split('T')[0] ?? '',
    publishedAt: '2026-08-01',
    ...overrides,
  };
}

describe('scoreDiscoveredItem', () => {
  it('should return scores between 0 and 1', () => {
    const item = createItem();
    const score = scoreDiscoveredItem(item, 'multi agent orchestration');
    expect(score.relevance).toBeGreaterThanOrEqual(0);
    expect(score.relevance).toBeLessThanOrEqual(1);
    expect(score.impact).toBeGreaterThanOrEqual(0);
    expect(score.impact).toBeLessThanOrEqual(1);
    expect(score.recency).toBeGreaterThanOrEqual(0);
    expect(score.recency).toBeLessThanOrEqual(1);
    expect(score.reproducibility).toBeGreaterThanOrEqual(0);
    expect(score.reproducibility).toBeLessThanOrEqual(1);
    expect(score.composite).toBeGreaterThanOrEqual(0);
    expect(score.composite).toBeLessThanOrEqual(1);
  });

  it('should score high relevance for matching title', () => {
    const item = createItem({ title: 'Multi-Agent Orchestration Framework' });
    const score = scoreDiscoveredItem(item, 'multi agent orchestration');
    expect(score.relevance).toBeGreaterThan(0.5);
  });

  it('should score low relevance for unrelated title', () => {
    const item = createItem({ title: 'Quantum Computing Basics' });
    const score = scoreDiscoveredItem(item, 'multi agent orchestration');
    expect(score.relevance).toBeLessThan(0.3);
  });

  it('should score github items high on reproducibility', () => {
    const item = createItem({ source: 'github' });
    const score = scoreDiscoveredItem(item, 'test');
    expect(score.reproducibility).toBe(1.0);
  });

  it('should score papers_with_code items high on reproducibility', () => {
    const item = createItem({ source: 'papers_with_code' });
    const score = scoreDiscoveredItem(item, 'test');
    expect(score.reproducibility).toBe(0.8);
  });

  it('should score arxiv items low on reproducibility', () => {
    const item = createItem({ source: 'arxiv' });
    const score = scoreDiscoveredItem(item, 'test');
    expect(score.reproducibility).toBe(0.3);
  });

  it('should score high impact for high relevance items', () => {
    const item = createItem({ relevance: 'high' });
    const score = scoreDiscoveredItem(item, 'test');
    expect(score.impact).toBe(0.9);
  });

  it('should score low impact for low relevance items', () => {
    const item = createItem({ relevance: 'low' });
    const score = scoreDiscoveredItem(item, 'test');
    expect(score.impact).toBe(0.2);
  });

  it('scores a recently PUBLISHED item higher than an old one (#4841)', () => {
    // This replaces a test whose name promised a comparison and whose body
    // scored a single item stamped today, asserting > 0.9. Every producer
    // stamps `discoveredAt` with today's date, so it passed no matter what —
    // including with the 730-day decay deleted entirely.
    const fresh = scoreDiscoveredItem(createItem({ publishedAt: '2026-08-01' }), 'test');
    const old = scoreDiscoveredItem(createItem({ publishedAt: '2019-03-01' }), 'test');

    expect(fresh.recency).toBeGreaterThan(old.recency);
  });

  it('should handle empty topic gracefully', () => {
    const item = createItem();
    const score = scoreDiscoveredItem(item, '');
    expect(score.relevance).toBe(0.5); // falls back to label
  });

  it('should handle invalid date gracefully', () => {
    const item = createItem({ publishedAt: 'invalid' });
    const score = scoreDiscoveredItem(item, 'test');
    expect(score.recency).toBe(0.5);
    expect(score.recencyMeasured).toBe(false);
  });
});

// =============================================================================
// Recency is scored on publication, not discovery (#4841)
// =============================================================================

describe('recency uses the publication date (#4841)', () => {
  it('does not score recency from discoveredAt', () => {
    // `discoveredAt` records when WE found the source, which every producer
    // stamps as today. Scoring it made the 730-day decay unreachable and put
    // a flat +0.2 on every composite: a 2019 paper and a 2026 preprint
    // scored identically.
    const old = createItem({ publishedAt: '2019-03-01', discoveredAt: '2026-08-25' });

    expect(scoreDiscoveredItem(old, 'test').recency).toBeLessThan(0.5);
  });

  it('reports recency as unmeasured when no publication date is available', () => {
    // Not every producer can supply one. Neutral rather than fresh, and said
    // out loud — 1.0 would keep claiming the source is new.
    const item = createItem();
    delete (item as { publishedAt?: string }).publishedAt;

    const score = scoreDiscoveredItem(item, 'test');

    expect(score.recency).toBe(0.5);
    expect(score.recencyMeasured).toBe(false);
  });

  it('marks recency measured when a publication date is present', () => {
    // The pair: always-false would satisfy the test above.
    expect(
      scoreDiscoveredItem(createItem({ publishedAt: '2026-08-01' }), 'test').recencyMeasured
    ).toBe(true);
  });

  it('still decays a genuinely old publication toward zero', () => {
    // The decay the original code documented and could never reach.
    expect(scoreDiscoveredItem(createItem({ publishedAt: '2015-01-01' }), 'test').recency).toBe(0);
  });
});

describe('rankDiscoveredItems', () => {
  it('should sort items by composite score descending', () => {
    const items: DiscoveredSource[] = [
      createItem({ title: 'Unrelated Topic', relevance: 'low', source: 'arxiv' }),
      createItem({ title: 'Multi-Agent Orchestration', relevance: 'high', source: 'github' }),
      createItem({ title: 'Agent Systems', relevance: 'medium', source: 'arxiv' }),
    ];

    const ranked = rankDiscoveredItems(items, 'multi agent orchestration');
    expect(ranked.length).toBe(3);
    // First item should have highest composite score
    expect(ranked[0]?.score.composite).toBeGreaterThanOrEqual(ranked[1]?.score.composite ?? 0);
    expect(ranked[1]?.score.composite).toBeGreaterThanOrEqual(ranked[2]?.score.composite ?? 0);
  });

  it('should return empty array for empty input', () => {
    const ranked = rankDiscoveredItems([], 'test');
    expect(ranked).toHaveLength(0);
  });

  it('should attach scores to each item', () => {
    const items = [createItem()];
    const ranked = rankDiscoveredItems(items, 'test');
    expect(ranked[0]?.score).toBeDefined();
    expect(ranked[0]?.item).toBeDefined();
    expect(ranked[0]?.score.composite).toBeGreaterThan(0);
  });
});
