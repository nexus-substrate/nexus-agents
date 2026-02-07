/**
 * Tests for research-helpers-overlap.ts
 *
 * Covers Jaccard similarity calculation, shared tags detection,
 * relationship determination, overlap result formatting, and findOverlaps function.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateTagOverlap,
  findSharedTags,
  determineRelationship,
  formatOverlapResult,
  findOverlaps,
} from './research-helpers-overlap.js';
import type { TechniqueEntry, TechniquesRegistry } from './research-types.js';
import type { ResearchOverlapResult } from './research-types.js';
import * as ioHelpers from './research-helpers-io.js';
import { ok, err } from '../core/index.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('./research-helpers-io.js', () => ({
  loadTechniquesRegistry: vi.fn(),
}));

// ============================================================================
// Fixtures
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeTechnique(overrides: Partial<TechniqueEntry> = {}) {
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
    implementation_issue: null,
    related_prs: [],
    notes: '',
    dependencies: [],
    decision_history: [],
    ...overrides,
  } as TechniqueEntry;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeRegistry(techniques: Record<string, TechniqueEntry>) {
  return {
    schema_version: '1.0',
    techniques,
  } as TechniquesRegistry;
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

  it('returns 0 when both sets are empty with first having element', () => {
    expect(calculateTagOverlap([], ['a'])).toBe(0);
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

  it('calculates 75% overlap', () => {
    // Intersection: {a, b, c} = 3, Union: {a, b, c, d} = 4
    expect(calculateTagOverlap(['a', 'b', 'c'], ['a', 'b', 'c', 'd'])).toBeCloseTo(3 / 4);
  });

  it('calculates 33% overlap', () => {
    // Intersection: {a} = 1, Union: {a, b, c} = 3
    expect(calculateTagOverlap(['a', 'b'], ['a', 'c'])).toBeCloseTo(1 / 3);
  });

  it('handles single element sets with overlap', () => {
    expect(calculateTagOverlap(['a'], ['a'])).toBe(1);
  });

  it('handles single element sets without overlap', () => {
    expect(calculateTagOverlap(['a'], ['b'])).toBe(0);
  });

  it('handles subset relationship correctly', () => {
    // Intersection: {a, b} = 2, Union: {a, b, c, d, e} = 5
    expect(calculateTagOverlap(['a', 'b'], ['a', 'b', 'c', 'd', 'e'])).toBeCloseTo(2 / 5);
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

  it('returns empty for both empty', () => {
    expect(findSharedTags([], [])).toEqual([]);
  });

  it('preserves order from first array', () => {
    const shared = findSharedTags(['c', 'a', 'b'], ['b', 'a']);
    expect(shared).toEqual(['a', 'b']);
  });

  it('returns all tags when sets are identical', () => {
    expect(findSharedTags(['x', 'y', 'z'], ['x', 'y', 'z'])).toEqual(['x', 'y', 'z']);
  });

  it('handles single shared tag', () => {
    expect(findSharedTags(['a', 'b', 'c'], ['c', 'd', 'e'])).toEqual(['c']);
  });

  it('handles duplicate tags in first array', () => {
    expect(findSharedTags(['a', 'a', 'b'], ['a'])).toEqual(['a', 'a']);
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

  it('returns overlapping for same topic just above 0.5 boundary', () => {
    const source = makeTechnique({ topic: 'consensus' });
    const target = makeTechnique({ topic: 'consensus' });
    expect(determineRelationship(source, target, 0.51)).toBe('overlapping');
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

  it('returns complementary at 0.3 boundary for different topics', () => {
    const source = makeTechnique({ topic: 'consensus' });
    const target = makeTechnique({ topic: 'routing' });
    expect(determineRelationship(source, target, 0.3)).toBe('complementary');
  });

  it('returns overlapping for same topic with maximum overlap', () => {
    const source = makeTechnique({ topic: 'consensus' });
    const target = makeTechnique({ topic: 'consensus' });
    expect(determineRelationship(source, target, 1.0)).toBe('overlapping');
  });

  it('returns complementary for same topic with zero overlap', () => {
    const source = makeTechnique({ topic: 'consensus' });
    const target = makeTechnique({ topic: 'consensus' });
    expect(determineRelationship(source, target, 0)).toBe('complementary');
  });

  it('returns enhances for different topic with high overlap', () => {
    const source = makeTechnique({ topic: 'consensus' });
    const target = makeTechnique({ topic: 'routing' });
    expect(determineRelationship(source, target, 0.8)).toBe('enhances');
  });

  it('returns complementary for different topic with zero overlap', () => {
    const source = makeTechnique({ topic: 'consensus' });
    const target = makeTechnique({ topic: 'routing' });
    expect(determineRelationship(source, target, 0)).toBe('complementary');
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

  it('formats multiple matches correctly', () => {
    const result: ResearchOverlapResult = {
      success: true,
      sourceId: 'tech-1',
      matches: [
        {
          techniqueId: 'tech-2',
          name: 'Second',
          overlapScore: 0.8,
          sharedTags: ['a'],
          sharedTopic: false,
          relationship: 'enhances',
        },
        {
          techniqueId: 'tech-3',
          name: 'Third',
          overlapScore: 0.5,
          sharedTags: ['b', 'c'],
          sharedTopic: true,
          relationship: 'complementary',
        },
      ],
      suggestedAlignments: ['tech-1 -> tech-2: enhances'],
    };
    const text = formatOverlapResult(result, 'table');
    expect(text).toContain('tech-2');
    expect(text).toContain('tech-3');
    expect(text).toContain('80%');
    expect(text).toContain('50%');
  });

  it('handles match with no shared tags', () => {
    const result: ResearchOverlapResult = {
      success: true,
      sourceId: 'tech-1',
      matches: [
        {
          techniqueId: 'tech-2',
          name: 'Other',
          overlapScore: 0.4,
          sharedTags: [],
          sharedTopic: false,
          relationship: 'enhances',
        },
      ],
      suggestedAlignments: [],
    };
    const text = formatOverlapResult(result, 'table');
    expect(text).toContain('tech-2');
    expect(text).not.toContain('Shared tags:');
  });
});

// ============================================================================
// findOverlaps
// ============================================================================

describe('findOverlaps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns failure when registry load fails', async () => {
    vi.mocked(ioHelpers.loadTechniquesRegistry).mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      err(new Error('Failed to load')) as any
    );

    const result = await findOverlaps({
      techniqueId: 'tech-1',
      threshold: 0.3,
      format: 'table',
    });

    expect(result.success).toBe(false);
    expect(result.sourceId).toBe('tech-1');
    expect(result.matches).toEqual([]);
  });

  it('returns failure when source technique not found', async () => {
    const registry = makeRegistry({});
    vi.mocked(ioHelpers.loadTechniquesRegistry).mockResolvedValue(ok(registry));

    const result = await findOverlaps({
      techniqueId: 'missing',
      threshold: 0.3,
      format: 'table',
    });

    expect(result.success).toBe(false);
    expect(result.sourceId).toBe('missing');
    expect(result.matches).toEqual([]);
  });

  it('finds overlapping techniques above threshold', async () => {
    const source = makeTechnique({ topic: 'consensus', tags: ['a', 'b', 'c'] });
    const target1 = makeTechnique({ topic: 'consensus', name: 'Target 1', tags: ['a', 'b'] });
    const target2 = makeTechnique({ topic: 'routing', name: 'Target 2', tags: ['d', 'e'] });

    const registry = makeRegistry({
      'tech-1': source,
      'tech-2': target1,
      'tech-3': target2,
    });

    vi.mocked(ioHelpers.loadTechniquesRegistry).mockResolvedValue(ok(registry));

    const result = await findOverlaps({
      techniqueId: 'tech-1',
      threshold: 0.3,
      format: 'table',
    });

    expect(result.success).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.techniqueId).toBe('tech-2');
  });

  it('excludes source technique from matches', async () => {
    const source = makeTechnique({ tags: ['a', 'b'] });
    const registry = makeRegistry({ 'tech-1': source });

    vi.mocked(ioHelpers.loadTechniquesRegistry).mockResolvedValue(ok(registry));

    const result = await findOverlaps({
      techniqueId: 'tech-1',
      threshold: 0.0,
      format: 'table',
    });

    expect(result.success).toBe(true);
    expect(result.matches).toEqual([]);
  });

  it('includes techniques with shared topic even below threshold', async () => {
    const source = makeTechnique({ topic: 'consensus', tags: ['a'] });
    const target = makeTechnique({ topic: 'consensus', tags: ['b'] });

    const registry = makeRegistry({
      'tech-1': source,
      'tech-2': target,
    });

    vi.mocked(ioHelpers.loadTechniquesRegistry).mockResolvedValue(ok(registry));

    const result = await findOverlaps({
      techniqueId: 'tech-1',
      threshold: 0.5,
      format: 'table',
    });

    expect(result.success).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.sharedTopic).toBe(true);
  });

  it('sorts matches by overlap score descending', async () => {
    const source = makeTechnique({ tags: ['a', 'b', 'c'] });
    const target1 = makeTechnique({ name: 'Low', tags: ['a'] });
    const target2 = makeTechnique({ name: 'High', tags: ['a', 'b', 'c'] });
    const target3 = makeTechnique({ name: 'Medium', tags: ['a', 'b'] });

    const registry = makeRegistry({
      'tech-1': source,
      'tech-2': target1,
      'tech-3': target2,
      'tech-4': target3,
    });

    vi.mocked(ioHelpers.loadTechniquesRegistry).mockResolvedValue(ok(registry));

    const result = await findOverlaps({
      techniqueId: 'tech-1',
      threshold: 0.2,
      format: 'table',
    });

    expect(result.success).toBe(true);
    expect(result.matches).toHaveLength(3);
    expect(result.matches[0]?.name).toBe('High');
    expect(result.matches[1]?.name).toBe('Medium');
    expect(result.matches[2]?.name).toBe('Low');
  });

  it('generates suggested alignments for overlapping/enhances relationships', async () => {
    const source = makeTechnique({ topic: 'consensus', tags: ['a', 'b', 'c'] });
    const target1 = makeTechnique({
      name: 'Overlapping',
      topic: 'consensus',
      tags: ['a', 'b', 'c'],
    });
    const target2 = makeTechnique({
      name: 'Enhances',
      topic: 'routing',
      tags: ['a', 'b'],
    });
    const target3 = makeTechnique({
      name: 'Complementary',
      topic: 'consensus',
      tags: ['d'],
    });

    const registry = makeRegistry({
      'tech-1': source,
      'tech-2': target1,
      'tech-3': target2,
      'tech-4': target3,
    });

    vi.mocked(ioHelpers.loadTechniquesRegistry).mockResolvedValue(ok(registry));

    const result = await findOverlaps({
      techniqueId: 'tech-1',
      threshold: 0.0,
      format: 'table',
    });

    expect(result.success).toBe(true);
    expect(result.suggestedAlignments).toHaveLength(2);
    expect(result.suggestedAlignments[0]).toContain('tech-2');
    expect(result.suggestedAlignments[1]).toContain('tech-3');
  });

  it('limits suggested alignments to top 3', async () => {
    const source = makeTechnique({ topic: 'consensus', tags: ['a', 'b'] });
    const target1 = makeTechnique({ topic: 'consensus', tags: ['a', 'b'] });
    const target2 = makeTechnique({ topic: 'consensus', tags: ['a', 'b'] });
    const target3 = makeTechnique({ topic: 'consensus', tags: ['a', 'b'] });
    const target4 = makeTechnique({ topic: 'consensus', tags: ['a', 'b'] });

    const registry = makeRegistry({
      'tech-1': source,
      'tech-2': target1,
      'tech-3': target2,
      'tech-4': target3,
      'tech-5': target4,
    });

    vi.mocked(ioHelpers.loadTechniquesRegistry).mockResolvedValue(ok(registry));

    const result = await findOverlaps({
      techniqueId: 'tech-1',
      threshold: 0.0,
      format: 'table',
    });

    expect(result.success).toBe(true);
    expect(result.suggestedAlignments.length).toBeLessThanOrEqual(3);
  });

  it('calculates correct overlap scores', async () => {
    const source = makeTechnique({ tags: ['a', 'b', 'c', 'd'] });
    const target = makeTechnique({ tags: ['a', 'b', 'e', 'f'] });

    const registry = makeRegistry({
      'tech-1': source,
      'tech-2': target,
    });

    vi.mocked(ioHelpers.loadTechniquesRegistry).mockResolvedValue(ok(registry));

    const result = await findOverlaps({
      techniqueId: 'tech-1',
      threshold: 0.0,
      format: 'table',
    });

    expect(result.success).toBe(true);
    expect(result.matches).toHaveLength(1);
    // Intersection: {a, b} = 2, Union: {a, b, c, d, e, f} = 6
    expect(result.matches[0]?.overlapScore).toBeCloseTo(2 / 6);
  });

  it('populates shared tags correctly', async () => {
    const source = makeTechnique({ tags: ['voting', 'consensus', 'aggregation'] });
    const target = makeTechnique({ tags: ['voting', 'aggregation', 'distributed'] });

    const registry = makeRegistry({
      'tech-1': source,
      'tech-2': target,
    });

    vi.mocked(ioHelpers.loadTechniquesRegistry).mockResolvedValue(ok(registry));

    const result = await findOverlaps({
      techniqueId: 'tech-1',
      threshold: 0.0,
      format: 'table',
    });

    expect(result.success).toBe(true);
    expect(result.matches[0]?.sharedTags).toEqual(['voting', 'aggregation']);
  });

  it('handles empty registry', async () => {
    const source = makeTechnique();
    const registry = makeRegistry({ 'tech-1': source });

    vi.mocked(ioHelpers.loadTechniquesRegistry).mockResolvedValue(ok(registry));

    const result = await findOverlaps({
      techniqueId: 'tech-1',
      threshold: 0.3,
      format: 'table',
    });

    expect(result.success).toBe(true);
    expect(result.matches).toEqual([]);
    expect(result.suggestedAlignments).toEqual([]);
  });

  it('respects threshold parameter', async () => {
    const source = makeTechnique({ tags: ['a', 'b', 'c'] });
    const lowOverlap = makeTechnique({ topic: 'routing', tags: ['a'] });
    const highOverlap = makeTechnique({ topic: 'routing', tags: ['a', 'b'] });

    const registry = makeRegistry({
      'tech-1': source,
      'tech-2': lowOverlap,
      'tech-3': highOverlap,
    });

    vi.mocked(ioHelpers.loadTechniquesRegistry).mockResolvedValue(ok(registry));

    const result = await findOverlaps({
      techniqueId: 'tech-1',
      threshold: 0.4,
      format: 'table',
    });

    expect(result.success).toBe(true);
    // Only tech-3 with 2/4 = 0.5 overlap should pass
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.techniqueId).toBe('tech-3');
  });

  it('determines relationships correctly', async () => {
    const source = makeTechnique({ topic: 'consensus', tags: ['a', 'b'] });
    const overlapping = makeTechnique({ topic: 'consensus', tags: ['a', 'b'] });
    const enhances = makeTechnique({ topic: 'routing', tags: ['a', 'b'] });

    const registry = makeRegistry({
      'tech-1': source,
      'tech-2': overlapping,
      'tech-3': enhances,
    });

    vi.mocked(ioHelpers.loadTechniquesRegistry).mockResolvedValue(ok(registry));

    const result = await findOverlaps({
      techniqueId: 'tech-1',
      threshold: 0.0,
      format: 'table',
    });

    expect(result.success).toBe(true);
    const overlappingMatch = result.matches.find((m) => m.techniqueId === 'tech-2');
    const enhancesMatch = result.matches.find((m) => m.techniqueId === 'tech-3');

    expect(overlappingMatch?.relationship).toBe('overlapping');
    expect(enhancesMatch?.relationship).toBe('enhances');
  });
});
