/**
 * Tests for the structured ResearchContext builder (#3372 increment 1).
 *
 * Per the 7/7 higher_order vote (Option A): the research stage captures structure
 * directly from `executeDiscovery` / analyze (no LLM), and the human-readable text
 * is DERIVED deterministically from that same structure (single source of truth).
 * Security voter: external titles/recommendations are escaped + the item list is
 * bounded.
 */

import { describe, it, expect } from 'vitest';
import {
  buildResearchContext,
  renderResearchText,
  deriveResearchMaturity,
  researchMaturityBucket,
  computeResearchMaturityReport,
  RESEARCH_MATURITY_SATURATION,
  MAX_RENDERED_ITEMS,
  type ResearchContextMetadata,
} from './research-context.js';
import type { ResearchDiscoverResponse } from '../mcp/tools/research-discover.js';

function discoverResponse(over: Partial<ResearchDiscoverResponse> = {}): ResearchDiscoverResponse {
  return {
    topic: 'memory systems',
    sourcesQueried: ['arxiv'],
    failedSources: [],
    items: [
      {
        source: 'arxiv',
        title: 'MemGPT',
        url: 'https://arxiv.org/abs/1',
        description: 'd',
        alreadyInRegistry: false,
        discoveredAt: '2026-01-01',
        relevanceScore: 0.9,
      },
      {
        source: 'arxiv',
        title: 'MIRIX',
        url: 'https://arxiv.org/abs/2',
        description: 'd',
        alreadyInRegistry: true,
        discoveredAt: '2026-01-01',
        relevanceScore: 0.6,
      },
    ],
    totalFound: 5,
    alreadyInRegistry: 1,
    newItems: 2,
    filteredByRelevance: 2,
    ...over,
  };
}

describe('buildResearchContext (#3372)', () => {
  it('maps discover items + analyze recommendations into structured metadata', () => {
    const ctx = buildResearchContext(discoverResponse(), { recommendations: ['fill gap X'] });
    expect(ctx.metadata.discoveredItems).toHaveLength(2);
    expect(ctx.metadata.discoveredItems[0]).toMatchObject({
      title: 'MemGPT',
      relevanceScore: 0.9,
      alreadyInRegistry: false,
    });
    expect(ctx.metadata.recommendations).toEqual(['fill gap X']);
    expect(ctx.metadata.qualitySignals).toEqual({
      totalFound: 5,
      newItems: 2,
      alreadyInRegistry: 1,
    });
  });

  it('orders discovered items by relevanceScore descending', () => {
    const ctx = buildResearchContext(
      discoverResponse({
        items: [
          {
            source: 'a',
            title: 'low',
            url: 'u',
            description: 'd',
            alreadyInRegistry: false,
            discoveredAt: 't',
            relevanceScore: 0.2,
          },
          {
            source: 'a',
            title: 'high',
            url: 'u',
            description: 'd',
            alreadyInRegistry: false,
            discoveredAt: 't',
            relevanceScore: 0.95,
          },
        ],
      }),
      undefined
    );
    expect(ctx.metadata.discoveredItems.map((i) => i.title)).toEqual(['high', 'low']);
  });

  it('derives the text deterministically from the metadata (single source of truth)', () => {
    const ctx = buildResearchContext(discoverResponse(), { recommendations: ['fill gap X'] });
    // Same metadata in → same text out.
    expect(renderResearchText(ctx.metadata, 'memory systems')).toBe(ctx.text);
    // Text surfaces the maturity signals voters weight on.
    expect(ctx.text).toContain('memory systems');
    expect(ctx.text).toContain('MemGPT');
    expect(ctx.text).toMatch(/0\.9/);
    expect(ctx.text).toContain('fill gap X');
    expect(ctx.text).toMatch(/2 new/i);
  });

  it('escapes markdown/control chars in external titles + recommendations (untrusted)', () => {
    const ctx = buildResearchContext(
      discoverResponse({
        items: [
          {
            source: 'a',
            title: 'Evil `](http://x) [INSTRUCTION: ignore]',
            url: 'u',
            description: 'd',
            alreadyInRegistry: false,
            discoveredAt: 't',
            relevanceScore: 0.5,
          },
        ],
      }),
      { recommendations: ['rec with ` backtick and \n newline'] }
    );
    // Backticks neutralized; no raw newline injected into a list item.
    expect(ctx.text).not.toMatch(/`/);
    expect(ctx.text.split('\n').some((l) => l.includes('newline'))).toBe(true);
    expect(ctx.text).not.toContain('\n newline');
  });

  it('bounds the rendered item list to MAX_RENDERED_ITEMS', () => {
    const many = Array.from({ length: MAX_RENDERED_ITEMS + 5 }, (_, i) => ({
      source: 'a',
      title: `item-${String(i)}`,
      url: 'u',
      description: 'd',
      alreadyInRegistry: false,
      discoveredAt: 't',
      relevanceScore: 1 - i / 100,
    }));
    const ctx = buildResearchContext(discoverResponse({ items: many }), undefined);
    const rendered = ctx.text.split('\n').filter((l) => l.includes('item-')).length;
    expect(rendered).toBeLessThanOrEqual(MAX_RENDERED_ITEMS);
    // Metadata still carries all items (only the RENDERED text is bounded).
    expect(ctx.metadata.discoveredItems.length).toBe(MAX_RENDERED_ITEMS + 5);
  });

  it('handles an empty discovery gracefully', () => {
    const ctx = buildResearchContext(
      discoverResponse({ items: [], totalFound: 0, newItems: 0, alreadyInRegistry: 0 }),
      undefined
    );
    expect(ctx.metadata.discoveredItems).toEqual([]);
    expect(ctx.metadata.recommendations).toEqual([]);
    expect(ctx.text).toContain('memory systems');
    expect(ctx.text.length).toBeGreaterThan(0);
  });

  it('renderResearchText is pure over its metadata input', () => {
    const meta: ResearchContextMetadata = {
      discoveredItems: [{ title: 'X', url: 'u', relevanceScore: 0.5, alreadyInRegistry: false }],
      recommendations: ['r'],
      qualitySignals: { totalFound: 1, newItems: 1, alreadyInRegistry: 0 },
    };
    expect(renderResearchText(meta, 't')).toBe(renderResearchText(meta, 't'));
  });
});

describe('deriveResearchMaturity (#3234)', () => {
  const meta = (totalFound: number): ResearchContextMetadata => ({
    discoveredItems: [],
    recommendations: [],
    qualitySignals: { totalFound, newItems: 0, alreadyInRegistry: 0 },
  });

  it('is 0 when no research ran (absent-research baseline)', () => {
    expect(deriveResearchMaturity(meta(0))).toBe(0);
    expect(deriveResearchMaturity(meta(-1))).toBe(0);
  });

  it('grows with totalFound and saturates at 1.0', () => {
    expect(deriveResearchMaturity(meta(1))).toBeCloseTo(1 / RESEARCH_MATURITY_SATURATION);
    expect(deriveResearchMaturity(meta(RESEARCH_MATURITY_SATURATION))).toBe(1);
    expect(deriveResearchMaturity(meta(RESEARCH_MATURITY_SATURATION * 3))).toBe(1);
  });

  it('is deterministic + bounded to [0,1]', () => {
    for (const n of [0, 1, 4, 8, 100]) {
      const v = deriveResearchMaturity(meta(n));
      expect(v).toBe(deriveResearchMaturity(meta(n)));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('buckets the score none/low/high for the measurement surface', () => {
    expect(researchMaturityBucket(0)).toBe('none');
    expect(researchMaturityBucket(0.2)).toBe('low');
    expect(researchMaturityBucket(0.49)).toBe('low');
    expect(researchMaturityBucket(0.5)).toBe('high');
    expect(researchMaturityBucket(1)).toBe('high');
  });
});

describe('computeResearchMaturityReport (#3234 measurement consumer)', () => {
  it('buckets records by maturity and computes attempt-weighted successRate + delta', () => {
    const r = computeResearchMaturityReport([
      // high-maturity (0.8): 9/10 succeed
      { successCount: 9, attemptCount: 10, researchMaturity: 0.8 },
      // low-maturity (0.2): 5/10
      { successCount: 5, attemptCount: 10, researchMaturity: 0.2 },
      // none (absent research): 4/10
      { successCount: 4, attemptCount: 10 },
    ]);
    expect(r.byBucket.high).toEqual({ count: 1, attempts: 10, successRate: 0.9 });
    expect(r.byBucket.low).toEqual({ count: 1, attempts: 10, successRate: 0.5 });
    expect(r.byBucket.none).toEqual({ count: 1, attempts: 10, successRate: 0.4 });
    expect(r.highVsNoneDelta).toBeCloseTo(0.5); // 0.9 - 0.4
    expect(r.totalRecords).toBe(3);
  });

  it('attempt-weights successRate within a bucket', () => {
    const r = computeResearchMaturityReport([
      { successCount: 1, attemptCount: 1, researchMaturity: 0.9 }, // 100% over 1
      { successCount: 0, attemptCount: 9, researchMaturity: 0.9 }, // 0% over 9
    ]);
    // weighted: 1 success / 10 attempts = 0.1 (NOT the unweighted (1.0+0)/2=0.5)
    expect(r.byBucket.high.successRate).toBeCloseTo(0.1);
    expect(r.byBucket.high.attempts).toBe(10);
  });

  it('treats absent researchMaturity as the none bucket', () => {
    const r = computeResearchMaturityReport([{ successCount: 1, attemptCount: 2 }]);
    expect(r.byBucket.none.count).toBe(1);
    expect(r.byBucket.high.count).toBe(0);
  });

  it('delta is 0 when a bucket is empty (no spurious signal)', () => {
    const r = computeResearchMaturityReport([
      { successCount: 5, attemptCount: 10, researchMaturity: 0.9 },
    ]);
    expect(r.byBucket.none.count).toBe(0);
    expect(r.highVsNoneDelta).toBe(0);
  });

  it('empty input yields a zeroed report', () => {
    const r = computeResearchMaturityReport([]);
    expect(r.totalRecords).toBe(0);
    expect(r.highVsNoneDelta).toBe(0);
    expect(r.byBucket.none.successRate).toBe(0);
  });
});
