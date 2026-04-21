/**
 * Tests for Skill Loader Helpers
 * @module agents/skills/skill-loader-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { Skill, SkillCategory } from './skill-types.js';
import type { RoleSkillMapping } from './skill-loader-types.js';
import type { AgentRole } from '../../core/types/agent.js';
import {
  createLoaderError,
  findMappingForRole,
  identifyMissingCategories,
  applySkillLimit,
  sortSkillsById,
  sortSkillIds,
  hasAllRequiredCategories,
  getCategoriesFromSkills,
  countSkillsByCategory,
  getAllCategoriesFromMapping,
  mergeSkillSets,
  getSkillSetDifference,
  getSkillSetIntersection,
} from './skill-loader-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-1',
    name: 'Test Skill',
    description: 'A test skill',
    category: 'general',
    complexity: 'simple',
    code: 'console.log("test")',
    dependencies: [],
    version: '1.0.0',
    ...overrides,
  } as Skill;
}

// ============================================================================
// createLoaderError
// ============================================================================

describe('createLoaderError', () => {
  it('creates error without context', () => {
    const error = createLoaderError('ROLE_NOT_MAPPED', 'Role not found');
    expect(error.code).toBe('ROLE_NOT_MAPPED');
    expect(error.message).toBe('Role not found');
    expect(error.context).toBeUndefined();
  });

  it('creates error with context', () => {
    const error = createLoaderError('RBAC_DENIED', 'Access denied', { role: 'worker' });
    expect(error.code).toBe('RBAC_DENIED');
    expect(error.context).toEqual({ role: 'worker' });
  });
});

// ============================================================================
// findMappingForRole
// ============================================================================

describe('findMappingForRole', () => {
  const mappings: RoleSkillMapping[] = [
    { role: 'code_expert', requiredCategories: ['code-generation'] },
    { role: 'security_expert', requiredCategories: ['code-analysis'] },
  ];

  it('finds mapping from index', () => {
    const index = new Map<AgentRole, RoleSkillMapping>();
    index.set('code_expert', mappings[0]!);
    const result = findMappingForRole('code_expert', index, mappings);
    expect(result).toBe(mappings[0]);
  });

  it('falls back to linear search when not in index', () => {
    const emptyIndex = new Map<AgentRole, RoleSkillMapping>();
    const result = findMappingForRole('security_expert', emptyIndex, mappings);
    expect(result).toBe(mappings[1]);
  });

  it('returns undefined for unmapped role', () => {
    const emptyIndex = new Map<AgentRole, RoleSkillMapping>();
    const result = findMappingForRole('unknown_role' as AgentRole, emptyIndex, mappings);
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// identifyMissingCategories
// ============================================================================

describe('identifyMissingCategories', () => {
  it('returns empty when all present', () => {
    const required: SkillCategory[] = ['testing', 'general'];
    const present = new Set<SkillCategory>(['testing', 'general', 'debugging']);
    expect(identifyMissingCategories(required, present)).toEqual([]);
  });

  it('returns missing categories', () => {
    const required: SkillCategory[] = ['testing', 'security', 'general'];
    const present = new Set<SkillCategory>(['general']);
    const missing = identifyMissingCategories(required, present);
    expect(missing).toContain('testing');
    expect(missing).toContain('security');
    expect(missing).not.toContain('general');
  });
});

// ============================================================================
// applySkillLimit
// ============================================================================

describe('applySkillLimit', () => {
  it('returns all skills when under limit', () => {
    const skills = [makeSkill({ id: 'a' }), makeSkill({ id: 'b' })];
    const result = applySkillLimit(skills, 5);
    expect(result).toHaveLength(2);
  });

  it('truncates to limit', () => {
    const skills = [makeSkill({ id: 'a' }), makeSkill({ id: 'b' }), makeSkill({ id: 'c' })];
    const result = applySkillLimit(skills, 2);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('a');
    expect(result[1]!.id).toBe('b');
  });

  it('returns copy, not original', () => {
    const skills = [makeSkill()];
    const result = applySkillLimit(skills, 10);
    expect(result).not.toBe(skills);
    expect(result).toEqual(skills);
  });
});

// ============================================================================
// sortSkillsById / sortSkillIds
// ============================================================================

describe('sortSkillsById', () => {
  it('sorts skills alphabetically by id', () => {
    const skills = [makeSkill({ id: 'c' }), makeSkill({ id: 'a' }), makeSkill({ id: 'b' })];
    const sorted = sortSkillsById(skills);
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate original', () => {
    const skills = [makeSkill({ id: 'b' }), makeSkill({ id: 'a' })];
    sortSkillsById(skills);
    expect(skills[0]!.id).toBe('b');
  });
});

describe('sortSkillIds', () => {
  it('sorts string IDs', () => {
    expect(sortSkillIds(['z', 'a', 'm'])).toEqual(['a', 'm', 'z']);
  });

  it('does not mutate original', () => {
    const ids = ['b', 'a'];
    sortSkillIds(ids);
    expect(ids[0]).toBe('b');
  });
});

// ============================================================================
// hasAllRequiredCategories / getCategoriesFromSkills
// ============================================================================

describe('hasAllRequiredCategories', () => {
  it('returns true when all required present', () => {
    const skills = [
      makeSkill({ category: 'testing' as SkillCategory }),
      makeSkill({ id: 's2', category: 'general' as SkillCategory }),
    ];
    expect(hasAllRequiredCategories(skills, ['testing', 'general'])).toBe(true);
  });

  it('returns false when some missing', () => {
    const skills = [makeSkill({ category: 'testing' as SkillCategory })];
    expect(hasAllRequiredCategories(skills, ['testing', 'security'])).toBe(false);
  });

  it('returns true for empty required', () => {
    expect(hasAllRequiredCategories([], [])).toBe(true);
  });
});

describe('getCategoriesFromSkills', () => {
  it('extracts unique categories', () => {
    const skills = [
      makeSkill({ category: 'testing' as SkillCategory }),
      makeSkill({ id: 's2', category: 'testing' as SkillCategory }),
      makeSkill({ id: 's3', category: 'general' as SkillCategory }),
    ];
    const cats = getCategoriesFromSkills(skills);
    expect(cats.size).toBe(2);
    expect(cats.has('testing')).toBe(true);
    expect(cats.has('general')).toBe(true);
  });
});

// ============================================================================
// countSkillsByCategory
// ============================================================================

describe('countSkillsByCategory', () => {
  it('counts skills per category', () => {
    const skills = [
      makeSkill({ category: 'testing' as SkillCategory }),
      makeSkill({ id: 's2', category: 'testing' as SkillCategory }),
      makeSkill({ id: 's3', category: 'general' as SkillCategory }),
    ];
    const counts = countSkillsByCategory(skills);
    expect(counts.get('testing')).toBe(2);
    expect(counts.get('general')).toBe(1);
  });

  it('returns empty map for no skills', () => {
    expect(countSkillsByCategory([]).size).toBe(0);
  });
});

// ============================================================================
// getAllCategoriesFromMapping
// ============================================================================

describe('getAllCategoriesFromMapping', () => {
  it('returns required categories only when no optional', () => {
    const mapping: RoleSkillMapping = {
      role: 'code_expert',
      requiredCategories: ['code-generation', 'testing'],
    };
    const cats = getAllCategoriesFromMapping(mapping);
    expect(cats).toHaveLength(2);
    expect(cats).toContain('code-generation');
    expect(cats).toContain('testing');
  });

  it('combines required and optional (deduped)', () => {
    const mapping: RoleSkillMapping = {
      role: 'code_expert',
      requiredCategories: ['code-generation', 'testing'],
      optionalCategories: ['testing', 'debugging'],
    };
    const cats = getAllCategoriesFromMapping(mapping);
    expect(cats).toHaveLength(3);
    expect(cats).toContain('debugging');
  });
});

// ============================================================================
// mergeSkillSets
// ============================================================================

describe('mergeSkillSets', () => {
  it('merges non-overlapping sets', () => {
    const base = [makeSkill({ id: 'a' })];
    const additional = [makeSkill({ id: 'b' })];
    const result = mergeSkillSets(base, additional);
    expect(result).toHaveLength(2);
  });

  it('deduplicates by id', () => {
    const base = [makeSkill({ id: 'a' })];
    const additional = [makeSkill({ id: 'a' }), makeSkill({ id: 'b' })];
    const result = mergeSkillSets(base, additional);
    expect(result).toHaveLength(2);
  });

  it('preserves order from base first', () => {
    const base = [makeSkill({ id: 'z' })];
    const additional = [makeSkill({ id: 'a' })];
    const result = mergeSkillSets(base, additional);
    expect(result[0]!.id).toBe('z');
    expect(result[1]!.id).toBe('a');
  });
});

// ============================================================================
// getSkillSetDifference / getSkillSetIntersection
// ============================================================================

describe('getSkillSetDifference', () => {
  it('returns skills in first but not second', () => {
    const first = [makeSkill({ id: 'a' }), makeSkill({ id: 'b' }), makeSkill({ id: 'c' })];
    const second = [makeSkill({ id: 'b' })];
    const diff = getSkillSetDifference(first, second);
    expect(diff.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('returns all when second is empty', () => {
    const first = [makeSkill({ id: 'a' })];
    expect(getSkillSetDifference(first, [])).toHaveLength(1);
  });
});

describe('getSkillSetIntersection', () => {
  it('returns skills in both sets', () => {
    const first = [makeSkill({ id: 'a' }), makeSkill({ id: 'b' }), makeSkill({ id: 'c' })];
    const second = [makeSkill({ id: 'b' }), makeSkill({ id: 'c' }), makeSkill({ id: 'd' })];
    const inter = getSkillSetIntersection(first, second);
    expect(inter.map((s) => s.id)).toEqual(['b', 'c']);
  });

  it('returns empty when no overlap', () => {
    const first = [makeSkill({ id: 'a' })];
    const second = [makeSkill({ id: 'b' })];
    expect(getSkillSetIntersection(first, second)).toEqual([]);
  });
});
