/**
 * Tests for research-helpers-overlap.ts
 *
 * Covers Jaccard similarity calculation, shared tags detection,
 * relationship determination, and overlap result formatting.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTagOverlap,
  findSharedTags,
  determineRelationship,
  formatOverlapResult,
} from './research-helpers-overlap.js';
import type { TechniqueEntry } from './research-types.js';
import type { ResearchOverlapResult } from './research-types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeTechnique(overrides: Partial<TechniqueEntry> = {}): TechniqueEntry {
  return {
    name: 'Test Technique',
    description: 'A test technique',
    source_papers: [],
    topic: 'consensus',
    tags: ['voting', 'aggregation'],
    metrics: {},
    status: 'implemented',
    priority: 'P2',
    complexity: 'medium',
    integration_files: [],
    ...overrides,
  } as TechniqueEntry;
}

// ============================================================================
// calculateTagOverlap (Jaccard similarity)
// ============================================================================

describe('calculateTagOverlap', () => {
  it('returns 1.0 for identical tag sets', () => {
    expect(calculateTagOverlap(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('returns 0 for disjoint tag sets', () => {
    expect(calculateTagOverlap(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('returns 0 for two empty tag sets', () => {
    expect(calculateTagOverlap([], [])).toBe(0);
  });

  it('returns 0 when one set is empty', () => {
    expect(calculateTagOverlap(['a', 'b'], [])).toBe(0);
  });

  it('calculates partial overlap correctly', () => {
    // Intersection: {a} = 1, Union: {a, b, c, d} = 4
    expect(calculateTagOverlap(['a', 'b'], ['a', 'c', 'd'])).toBeCloseTo(1 / 4);
  });

  it('calculates 50% overlap correctly', () => {
    // Intersection: {a, b} = 2, Union: {a, b, c, d} = 4
    expect(calculateTagOverlap(['a', 'b', 'c'], ['a', 'b', 'd'])).toBeCloseTo(2 / 4);
  });

  it('handles duplicate tags in input', () => {
    // Sets deduplicate: {a, b} and {a, b} → 1.0
    expect(calculateTagOverlap(['a', 'a', 'b'], ['a', 'b', 'b'])).toBe(1);
  });
});

// ============================================================================
// findSharedTags
// ============================================================================

describe('findSharedTags', () => {
  it('returns shared tags', () => {
    expect(findSharedTags(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['b', 'c']);
  });

  it('returns empty for no overlap', () => {
    expect(findSharedTags(['a', 'b'], ['c', 'd'])).toEqual([]);
  });

  it('returns empty for empty inputs', () => {
    expect(findSharedTags([], ['a'])).toEqual([]);
    expect(findSharedTags(['a'], [])).toEqual([]);
  });

  it('preserves order from first array', () => {
    const shared = findSharedTags(['c', 'a', 'b'], ['b', 'a']);
    expect(shared).toEqual(['a', 'b']);
  });
});

// ============================================================================
// determineRelationship
// ============================================================================

describe('determineRelationship', () => {
  it('returns overlapping for same topic with high overlap', () => {
    const source = makeTechnique({ topic: 'consensus' });
    const target = makeTechnique({ topic: 'consensus' });
    expect(determineRelationship(source, target, 0.6)).toBe('overlapping');
  });

  it('returns complementary for same topic with low overlap', () => {
    const source = makeTechnique({ topic: 'consensus' });
    const target = makeTechnique({ topic: 'consensus' });
    expect(determineRelationship(source, target, 0.3)).toBe('complementary');
  });

  it('returns complementary for same topic at 0.5 boundary', () => {
    const source = makeTechnique({ topic: 'consensus' });
    const target = makeTechnique({ topic: 'consensus' });
    expect(determineRelationship(source, target, 0.5)).toBe('complementary');
  });

  it('returns enhances for different topic with moderate overlap', () => {
    const source = makeTechnique({ topic: 'consensus' });
    const target = makeTechnique({ topic: 'routing' });
    expect(determineRelationship(source, target, 0.4)).toBe('enhances');
  });

  it('returns complementary for different topic with low overlap', () => {
    const source = makeTechnique({ topic: 'consensus' });
    const target = makeTechnique({ topic: 'routing' });
    expect(determineRelationship(source, target, 0.2)).toBe('complementary');
  });

  it('returns enhances at 0.31 boundary for different topics', () => {
    const source = makeTechnique({ topic: 'consensus' });
    const target = makeTechnique({ topic: 'routing' });
    expect(determineRelationship(source, target, 0.31)).toBe('enhances');
  });
});

// ============================================================================
// formatOverlapResult
// ============================================================================

describe('formatOverlapResult - JSON format', () => {
  it('returns valid JSON', () => {
    const result: ResearchOverlapResult = {
      success: true,
      sourceId: 'tech-1',
      matches: [],
      suggestedAlignments: [],
    };
    const json = formatOverlapResult(result, 'json');
    expect(json.startsWith('{')).toBe(true);
    expect(JSON.parse(json) as unknown).toBeDefined();
  });

  it('includes all fields in JSON', () => {
    const result: ResearchOverlapResult = {
      success: true,
      sourceId: 'tech-1',
      matches: [
        {
          techniqueId: 'tech-2',
          name: 'Other',
          overlapScore: 0.5,
          sharedTags: ['voting'],
          sharedTopic: true,
          relationship: 'overlapping',
        },
      ],
      suggestedAlignments: ['tech-1 -> tech-2: overlapping'],
    };
    const parsed = JSON.parse(formatOverlapResult(result, 'json'));
    expect(parsed.sourceId).toBe('tech-1');
    expect(parsed.matches).toHaveLength(1);
  });
});

describe('formatOverlapResult - table format', () => {
  it('shows source ID in header', () => {
    const result: ResearchOverlapResult = {
      success: true,
      sourceId: 'tech-1',
      matches: [],
      suggestedAlignments: [],
    };
    const text = formatOverlapResult(result, 'table');
    expect(text).toContain('tech-1');
  });

  it('shows not found for unsuccessful result', () => {
    const result: ResearchOverlapResult = {
      success: false,
      sourceId: 'missing',
      matches: [],
      suggestedAlignments: [],
    };
    const text = formatOverlapResult(result, 'table');
    expect(text).toContain('not found');
  });

  it('shows no overlap message when matches empty', () => {
    const result: ResearchOverlapResult = {
      success: true,
      sourceId: 'tech-1',
      matches: [],
      suggestedAlignments: [],
    };
    const text = formatOverlapResult(result, 'table');
    expect(text).toContain('No overlapping');
  });

  it('shows match details', () => {
    const result: ResearchOverlapResult = {
      success: true,
      sourceId: 'tech-1',
      matches: [
        {
          techniqueId: 'tech-2',
          name: 'Other Technique',
          overlapScore: 0.75,
          sharedTags: ['voting', 'consensus'],
          sharedTopic: true,
          relationship: 'overlapping',
        },
      ],
      suggestedAlignments: [],
    };
    const text = formatOverlapResult(result, 'table');
    expect(text).toContain('tech-2');
    expect(text).toContain('Other Technique');
    expect(text).toContain('75%');
    expect(text).toContain('overlapping');
    expect(text).toContain('voting');
  });

  it('shows suggested alignments', () => {
    const result: ResearchOverlapResult = {
      success: true,
      sourceId: 'tech-1',
      matches: [
        {
          techniqueId: 'tech-2',
          name: 'Other',
          overlapScore: 0.6,
          sharedTags: [],
          sharedTopic: true,
          relationship: 'overlapping',
        },
      ],
      suggestedAlignments: ['tech-1 -> tech-2: overlapping'],
    };
    const text = formatOverlapResult(result, 'table');
    expect(text).toContain('Suggested alignments');
    expect(text).toContain('tech-1 -> tech-2');
  });
});
