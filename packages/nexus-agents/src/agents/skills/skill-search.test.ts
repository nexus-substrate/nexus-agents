/**
 * Tests for skill-search.ts
 *
 * Covers keyword extraction, relevance scoring, category/complexity/search/
 * tag/success rate matching, and combined criteria matching.
 */

import { describe, it, expect } from 'vitest';
import {
  extractKeywords,
  calculateRelevanceScore,
  matchesCategory,
  matchesComplexity,
  matchesSearch,
  matchesTags,
  matchesSuccessRate,
  matchesAllCriteria,
} from './skill-search.js';
import type { Skill, SkillQuery, SkillMetrics } from './skill-types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-1',
    name: 'Code Review',
    description: 'Reviews code for quality and security',
    category: 'analysis',
    complexity: 'medium',
    code: '',
    parameters: [],
    outputType: 'string',
    dependencies: [],
    tags: ['review', 'quality', 'security'],
    ...overrides,
  } as Skill;
}

function makeMetrics(overrides: Partial<SkillMetrics> = {}): SkillMetrics {
  return {
    executionCount: 10,
    successCount: 8,
    avgExecutionTimeMs: 500,
    successRate: 0.8,
    ...overrides,
  };
}

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'this']);

// ============================================================================
// extractKeywords
// ============================================================================

describe('extractKeywords', () => {
  it('extracts words from text', () => {
    const keywords = extractKeywords('hello world testing', STOP_WORDS);
    expect(keywords).toContain('hello');
    expect(keywords).toContain('world');
    expect(keywords).toContain('testing');
  });

  it('converts to lowercase', () => {
    const keywords = extractKeywords('Hello World', STOP_WORDS);
    expect(keywords).toContain('hello');
    expect(keywords).toContain('world');
  });

  it('filters stop words', () => {
    const keywords = extractKeywords('the code and review', STOP_WORDS);
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('and');
    expect(keywords).toContain('code');
    expect(keywords).toContain('review');
  });

  it('filters short words (<= 2 chars)', () => {
    const keywords = extractKeywords('go to the big house', STOP_WORDS);
    expect(keywords).not.toContain('go');
    expect(keywords).not.toContain('to');
    expect(keywords).toContain('big');
    expect(keywords).toContain('house');
  });

  it('returns empty for empty text', () => {
    expect(extractKeywords('', STOP_WORDS)).toEqual([]);
  });

  it('handles multiple spaces', () => {
    const keywords = extractKeywords('hello   world', STOP_WORDS);
    expect(keywords).toContain('hello');
    expect(keywords).toContain('world');
  });
});

// ============================================================================
// calculateRelevanceScore
// ============================================================================

describe('calculateRelevanceScore', () => {
  it('scores name matches highest (+3)', () => {
    const skill = makeSkill({ name: 'Code Review', description: '', tags: [] });
    const score = calculateRelevanceScore(skill, ['code'], undefined);
    expect(score).toBe(3);
  });

  it('scores description matches (+1)', () => {
    const skill = makeSkill({ name: 'MySkill', description: 'reviews code', tags: [] });
    const score = calculateRelevanceScore(skill, ['code'], undefined);
    expect(score).toBe(1);
  });

  it('scores tag matches (+2)', () => {
    const skill = makeSkill({ name: 'MySkill', description: '', tags: ['code'] });
    const score = calculateRelevanceScore(skill, ['code'], undefined);
    expect(score).toBe(2);
  });

  it('accumulates scores across match locations', () => {
    const skill = makeSkill({
      name: 'Code Skill',
      description: 'Handles code reviews',
      tags: ['code'],
    });
    // 'code': name(+3) + desc(+1) + tag(+2) = 6
    const score = calculateRelevanceScore(skill, ['code'], undefined);
    expect(score).toBe(6);
  });

  it('accumulates scores across multiple keywords', () => {
    const skill = makeSkill({
      name: 'Code Review',
      description: '',
      tags: [],
    });
    // 'code': name(+3), 'review': name(+3) = 6
    const score = calculateRelevanceScore(skill, ['code', 'review'], undefined);
    expect(score).toBe(6);
  });

  it('returns 0 for no matches', () => {
    const skill = makeSkill({ name: 'MySkill', description: '', tags: [] });
    expect(calculateRelevanceScore(skill, ['nonexistent'], undefined)).toBe(0);
  });

  it('boosts score for high success rate metrics', () => {
    const skill = makeSkill({ name: 'Code', description: '', tags: [] });
    const metrics = makeMetrics({ successRate: 0.9 });
    const withMetrics = calculateRelevanceScore(skill, ['code'], metrics);
    const withoutMetrics = calculateRelevanceScore(skill, ['code'], undefined);
    expect(withMetrics).toBeGreaterThan(withoutMetrics);
  });

  it('does not boost for low success rate', () => {
    const skill = makeSkill({ name: 'Code', description: '', tags: [] });
    const metrics = makeMetrics({ successRate: 0.3 });
    const withMetrics = calculateRelevanceScore(skill, ['code'], metrics);
    const withoutMetrics = calculateRelevanceScore(skill, ['code'], undefined);
    expect(withMetrics).toBe(withoutMetrics);
  });
});

// ============================================================================
// matchesCategory
// ============================================================================

describe('matchesCategory', () => {
  it('matches when no category filter', () => {
    expect(matchesCategory(makeSkill(), {})).toBe(true);
  });

  it('matches when category equals', () => {
    expect(matchesCategory(makeSkill({ category: 'analysis' }), { category: 'analysis' })).toBe(
      true
    );
  });

  it('rejects when category differs', () => {
    expect(matchesCategory(makeSkill({ category: 'analysis' }), { category: 'generation' })).toBe(
      false
    );
  });
});

// ============================================================================
// matchesComplexity
// ============================================================================

describe('matchesComplexity', () => {
  it('matches when no complexity filter', () => {
    expect(matchesComplexity(makeSkill(), {})).toBe(true);
  });

  it('matches when complexity equals', () => {
    expect(matchesComplexity(makeSkill({ complexity: 'medium' }), { complexity: 'medium' })).toBe(
      true
    );
  });

  it('rejects when complexity differs', () => {
    expect(matchesComplexity(makeSkill({ complexity: 'medium' }), { complexity: 'high' })).toBe(
      false
    );
  });
});

// ============================================================================
// matchesSearch
// ============================================================================

describe('matchesSearch', () => {
  it('matches when no search filter', () => {
    expect(matchesSearch(makeSkill(), {})).toBe(true);
  });

  it('matches on name', () => {
    expect(matchesSearch(makeSkill({ name: 'Code Review' }), { search: 'code' })).toBe(true);
  });

  it('matches on description', () => {
    expect(
      matchesSearch(makeSkill({ description: 'Reviews code quality' }), { search: 'quality' })
    ).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchesSearch(makeSkill({ name: 'Code Review' }), { search: 'CODE' })).toBe(true);
  });

  it('rejects when no match', () => {
    expect(
      matchesSearch(makeSkill({ name: 'MySkill', description: 'desc' }), { search: 'xyz' })
    ).toBe(false);
  });
});

// ============================================================================
// matchesTags
// ============================================================================

describe('matchesTags', () => {
  it('matches when no tag filter', () => {
    expect(matchesTags(makeSkill(), {})).toBe(true);
  });

  it('matches when empty tag filter', () => {
    expect(matchesTags(makeSkill(), { tags: [] })).toBe(true);
  });

  it('matches when any tag matches', () => {
    expect(matchesTags(makeSkill({ tags: ['review', 'quality'] }), { tags: ['quality'] })).toBe(
      true
    );
  });

  it('rejects when no tags match', () => {
    expect(matchesTags(makeSkill({ tags: ['review'] }), { tags: ['security'] })).toBe(false);
  });
});

// ============================================================================
// matchesSuccessRate
// ============================================================================

describe('matchesSuccessRate', () => {
  it('matches when no minSuccessRate filter', () => {
    const getMetrics = (): SkillMetrics | undefined => undefined;
    expect(matchesSuccessRate('skill-1', {}, getMetrics)).toBe(true);
  });

  it('matches when success rate meets threshold', () => {
    const getMetrics = (): SkillMetrics | undefined => makeMetrics({ successRate: 0.9 });
    expect(matchesSuccessRate('skill-1', { minSuccessRate: 0.8 }, getMetrics)).toBe(true);
  });

  it('rejects when success rate below threshold', () => {
    const getMetrics = (): SkillMetrics | undefined => makeMetrics({ successRate: 0.5 });
    expect(matchesSuccessRate('skill-1', { minSuccessRate: 0.8 }, getMetrics)).toBe(false);
  });

  it('rejects when no metrics available', () => {
    const getMetrics = (): SkillMetrics | undefined => undefined;
    expect(matchesSuccessRate('skill-1', { minSuccessRate: 0.5 }, getMetrics)).toBe(false);
  });
});

// ============================================================================
// matchesAllCriteria
// ============================================================================

describe('matchesAllCriteria', () => {
  const noMetrics = (): SkillMetrics | undefined => undefined;

  it('matches when all criteria pass', () => {
    const skill = makeSkill({ category: 'analysis', complexity: 'medium', tags: ['review'] });
    const query: SkillQuery = { category: 'analysis', complexity: 'medium', tags: ['review'] };
    expect(matchesAllCriteria(skill, query, noMetrics)).toBe(true);
  });

  it('rejects when category fails', () => {
    const skill = makeSkill({ category: 'generation' });
    const query: SkillQuery = { category: 'analysis' };
    expect(matchesAllCriteria(skill, query, noMetrics)).toBe(false);
  });

  it('rejects when complexity fails', () => {
    const skill = makeSkill({ complexity: 'low' });
    const query: SkillQuery = { complexity: 'high' };
    expect(matchesAllCriteria(skill, query, noMetrics)).toBe(false);
  });

  it('rejects when search fails', () => {
    const skill = makeSkill({ name: 'Foo', description: 'bar' });
    const query: SkillQuery = { search: 'nonexistent' };
    expect(matchesAllCriteria(skill, query, noMetrics)).toBe(false);
  });

  it('rejects when tags fail', () => {
    const skill = makeSkill({ tags: ['review'] });
    const query: SkillQuery = { tags: ['nonexistent'] };
    expect(matchesAllCriteria(skill, query, noMetrics)).toBe(false);
  });

  it('matches with empty query (no filters)', () => {
    expect(matchesAllCriteria(makeSkill(), {}, noMetrics)).toBe(true);
  });
});
