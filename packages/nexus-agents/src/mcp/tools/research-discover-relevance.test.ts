/**
 * Tests for research-discover relevance scoring and filtering.
 * Verifies that discovered items are scored and filtered by topic relevance.
 * (Source: Research System Enhancement - Phase 1C)
 */

import { describe, it, expect } from 'vitest';
import {
  computeRelevanceScore,
  filterByRelevance,
  type DiscoveredItem,
} from './research-discover.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Creates a minimal DiscoveredItem for testing. */
function makeItem(
  title: string,
  description: string,
  overrides?: Partial<DiscoveredItem>
): DiscoveredItem {
  return {
    source: 'arxiv',
    title,
    url: 'https://example.com/paper',
    description,
    alreadyInRegistry: false,
    discoveredAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// computeRelevanceScore Tests
// ============================================================================

describe('computeRelevanceScore', () => {
  it('should return 1.0 when topic has no meaningful keywords', () => {
    const item = makeItem('Any Title', 'Any description');

    // Topic with only short words (< 3 chars) that get filtered out
    const score = computeRelevanceScore(item, 'a b');
    expect(score).toBe(1.0);
  });

  it('should return 1.0 for empty topic', () => {
    const item = makeItem('Any Title', 'Any description');
    const score = computeRelevanceScore(item, '');
    expect(score).toBe(1.0);
  });

  it('should return high score when title contains all keywords', () => {
    const item = makeItem('Multi-Agent Orchestration Framework', 'A generic tool for systems');

    const score = computeRelevanceScore(item, 'multi-agent orchestration');
    // "multi" and "agent" and "orchestration" should match in title
    expect(score).toBeGreaterThan(0.5);
  });

  it('should return 0 when no keywords match title or description', () => {
    const item = makeItem('Quantum Computing Algorithms', 'Novel approaches to qubit entanglement');

    const score = computeRelevanceScore(item, 'multi-agent orchestration');
    expect(score).toBe(0);
  });

  it('should weight title matches higher than description matches', () => {
    const titleMatch = makeItem('Multi-Agent Systems', 'A generic paper about computing');
    const descMatch = makeItem(
      'A Generic Computing Paper',
      'Discusses multi-agent systems in detail'
    );

    const titleScore = computeRelevanceScore(titleMatch, 'multi-agent systems');
    const descScore = computeRelevanceScore(descMatch, 'multi-agent systems');

    expect(titleScore).toBeGreaterThan(descScore);
  });

  it('should handle keywords with special separators', () => {
    const item = makeItem('Consensus Voting Protocol', 'Higher order voting methods');

    // Topic with various separators: space, comma, semicolon, plus, slash
    const score = computeRelevanceScore(item, 'consensus,voting;protocol');
    expect(score).toBeGreaterThan(0);
  });

  it('should be case-insensitive', () => {
    const item = makeItem('MULTI-AGENT Orchestration', 'Lower case description');

    const score = computeRelevanceScore(item, 'Multi-Agent orchestration');
    expect(score).toBeGreaterThan(0.5);
  });

  it('should filter out short keywords (< 3 chars)', () => {
    const item = makeItem('Test Item', 'Description here');

    // "of" and "an" are < 3 chars and should be filtered
    const scoreWithShort = computeRelevanceScore(item, 'of an test');
    const scoreWithout = computeRelevanceScore(item, 'test');

    // Both should find "test" but the denominator differs
    // The one with short words filtered still finds "test"
    expect(scoreWithShort).toBeGreaterThan(0);
    expect(scoreWithout).toBeGreaterThan(0);
  });

  it('should score partial keyword matches proportionally', () => {
    const item = makeItem('Agent Framework', 'A tool for building agents');

    // Only "agent" matches from a longer topic
    const partialScore = computeRelevanceScore(item, 'agent orchestration consensus');
    const fullScore = computeRelevanceScore(item, 'agent framework');

    expect(fullScore).toBeGreaterThan(partialScore);
  });

  it('should cap score at 1.0', () => {
    const item = makeItem('Agent Agent Agent', 'Agent agent agent');

    const score = computeRelevanceScore(item, 'agent');
    expect(score).toBeLessThanOrEqual(1.0);
  });
});

// ============================================================================
// filterByRelevance Tests
// ============================================================================

describe('filterByRelevance', () => {
  it('should remove items below threshold', () => {
    const items = [
      makeItem('Multi-Agent Orchestration', 'Agent systems research'),
      makeItem('Quantum Computing', 'Qubit entanglement methods'),
      makeItem('Agent-Based Modeling', 'Simulation with agents'),
    ];

    const filtered = filterByRelevance(items, 'multi-agent orchestration', 0.3);

    // Quantum computing should be filtered out
    const titles = filtered.map((i) => i.title);
    expect(titles).not.toContain('Quantum Computing');
    expect(filtered.length).toBeLessThan(items.length);
  });

  it('should sort results by relevance descending', () => {
    const items = [
      makeItem('Generic Paper', 'About agents'),
      makeItem('Multi-Agent Orchestration Framework', 'Agent orchestration systems'),
      makeItem('Agent Systems', 'Multi-agent research'),
    ];

    const filtered = filterByRelevance(items, 'multi-agent orchestration', 0);

    // All items pass threshold=0, verify sort order
    for (let i = 0; i < filtered.length - 1; i++) {
      const current = filtered[i]?.relevanceScore ?? 0;
      const next = filtered[i + 1]?.relevanceScore ?? 0;
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });

  it('should attach relevanceScore to each item', () => {
    const items = [makeItem('Test Paper', 'About testing')];

    const filtered = filterByRelevance(items, 'test', 0);

    expect(filtered[0]?.relevanceScore).toBeDefined();
    expect(typeof filtered[0]?.relevanceScore).toBe('number');
  });

  it('should return empty array when all items below threshold', () => {
    const items = [
      makeItem('Quantum Physics', 'String theory applications'),
      makeItem('Dark Matter Research', 'Galaxy formation models'),
    ];

    const filtered = filterByRelevance(items, 'multi-agent orchestration', 0.5);

    expect(filtered).toHaveLength(0);
  });

  it('should return all items when threshold is 0', () => {
    const items = [
      makeItem('Anything', 'Unrelated content'),
      makeItem('Something', 'Also unrelated'),
    ];

    const filtered = filterByRelevance(items, 'multi-agent', 0);

    expect(filtered).toHaveLength(items.length);
  });

  it('should handle empty items array', () => {
    const filtered = filterByRelevance([], 'some topic', 0.5);
    expect(filtered).toHaveLength(0);
  });

  it('should handle empty topic (all items score 1.0)', () => {
    const items = [makeItem('Paper A', 'Description A'), makeItem('Paper B', 'Description B')];

    const filtered = filterByRelevance(items, '', 0.5);

    // Empty topic => all items score 1.0 => all pass
    expect(filtered).toHaveLength(2);
    expect(filtered[0]?.relevanceScore).toBe(1.0);
  });
});
