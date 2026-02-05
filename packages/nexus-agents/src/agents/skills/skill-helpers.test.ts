/**
 * Tests for Skill Helpers
 * @module agents/skills/skill-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type {
  Skill,
  SkillExecution,
  SkillMetrics,
  SkillWithMetrics,
  SkillComplexity,
} from './skill-types.js';
import {
  buildSkillUpdateFields,
  applySkillUpdates,
  createInitialMetrics,
  calculateUpdatedMetrics,
  addMetricsToSkill,
  sortSkillsByCriteria,
  calculateLibraryStatistics,
  findLowestPerformingSkillId,
} from './skill-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-1',
    name: 'Test Skill',
    description: 'A test skill',
    category: 'general',
    complexity: 'medium' as SkillComplexity,
    code: 'console.log("test")',
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    parameters: [],
    dependencies: [],
    tags: [],
    examples: [],
    ...overrides,
  } as Skill;
}

function makeMetrics(overrides: Partial<SkillMetrics> = {}): SkillMetrics {
  return {
    executionCount: 10,
    successCount: 8,
    avgExecutionTimeMs: 200,
    successRate: 0.8,
    ...overrides,
  };
}

function makeExecution(overrides: Partial<SkillExecution> = {}): SkillExecution {
  return {
    skillId: 'skill-1',
    startTime: new Date('2026-01-01T00:00:00Z'),
    endTime: new Date('2026-01-01T00:00:01Z'),
    status: 'success',
    input: {},
    ...overrides,
  } as SkillExecution;
}

function makeSkillWithMetrics(overrides: Partial<SkillWithMetrics> = {}): SkillWithMetrics {
  return {
    ...makeSkill(),
    metrics: makeMetrics(),
    ...overrides,
  } as SkillWithMetrics;
}

// ============================================================================
// buildSkillUpdateFields
// ============================================================================

describe('buildSkillUpdateFields', () => {
  it('returns empty for no updates', () => {
    expect(buildSkillUpdateFields({})).toEqual({});
  });

  it('includes core fields', () => {
    const fields = buildSkillUpdateFields({ name: 'New Name', description: 'New desc' });
    expect(fields.name).toBe('New Name');
    expect(fields.description).toBe('New desc');
  });

  it('includes extended fields', () => {
    const fields = buildSkillUpdateFields({ tags: ['tag1'], dependencies: ['dep1'] });
    expect(fields.tags).toEqual(['tag1']);
    expect(fields.dependencies).toEqual(['dep1']);
  });
});

// ============================================================================
// applySkillUpdates
// ============================================================================

describe('applySkillUpdates', () => {
  it('applies updates and increments version', () => {
    const skill = makeSkill({ version: 1 });
    const updated = applySkillUpdates(skill, { name: 'Updated' });
    expect(updated.name).toBe('Updated');
    expect(updated.version).toBe(2);
  });

  it('preserves unchanged fields', () => {
    const skill = makeSkill({ description: 'original' });
    const updated = applySkillUpdates(skill, { name: 'New' });
    expect(updated.description).toBe('original');
  });
});

// ============================================================================
// createInitialMetrics
// ============================================================================

describe('createInitialMetrics', () => {
  it('returns zero metrics', () => {
    const metrics = createInitialMetrics();
    expect(metrics.executionCount).toBe(0);
    expect(metrics.successCount).toBe(0);
    expect(metrics.avgExecutionTimeMs).toBe(0);
    expect(metrics.successRate).toBe(0);
  });
});

// ============================================================================
// calculateUpdatedMetrics
// ============================================================================

describe('calculateUpdatedMetrics', () => {
  it('updates metrics after success', () => {
    const current = makeMetrics({ executionCount: 10, successCount: 8, avgExecutionTimeMs: 200 });
    const execution = makeExecution({
      startTime: new Date('2026-01-01T00:00:00Z'),
      endTime: new Date('2026-01-01T00:00:01Z'),
      status: 'success',
    });
    const updated = calculateUpdatedMetrics(current, execution);
    expect(updated.executionCount).toBe(11);
    expect(updated.successCount).toBe(9);
    expect(updated.successRate).toBeCloseTo(9 / 11);
  });

  it('updates metrics after failure', () => {
    const current = makeMetrics({ executionCount: 10, successCount: 8 });
    const execution = makeExecution({ status: 'failure' });
    const updated = calculateUpdatedMetrics(current, execution);
    expect(updated.executionCount).toBe(11);
    expect(updated.successCount).toBe(8);
  });
});

// ============================================================================
// addMetricsToSkill
// ============================================================================

describe('addMetricsToSkill', () => {
  it('adds provided metrics', () => {
    const skill = makeSkill();
    const metrics = makeMetrics({ executionCount: 5 });
    const result = addMetricsToSkill(skill, metrics);
    expect(result.metrics.executionCount).toBe(5);
  });

  it('uses defaults when undefined', () => {
    const skill = makeSkill();
    const result = addMetricsToSkill(skill, undefined);
    expect(result.metrics.executionCount).toBe(0);
    expect(result.metrics.successRate).toBe(0);
  });
});

// ============================================================================
// sortSkillsByCriteria
// ============================================================================

describe('sortSkillsByCriteria', () => {
  it('sorts by name ascending', () => {
    const skills = [
      makeSkillWithMetrics({ name: 'Banana' } as Partial<SkillWithMetrics>),
      makeSkillWithMetrics({ name: 'Apple' } as Partial<SkillWithMetrics>),
    ];
    const sorted = sortSkillsByCriteria(skills, 'name', 'asc');
    expect(sorted[0]!.name).toBe('Apple');
  });

  it('sorts by successRate descending', () => {
    const skills = [
      makeSkillWithMetrics({
        metrics: makeMetrics({ successRate: 0.5 }),
      } as Partial<SkillWithMetrics>),
      makeSkillWithMetrics({
        metrics: makeMetrics({ successRate: 0.9 }),
      } as Partial<SkillWithMetrics>),
    ];
    const sorted = sortSkillsByCriteria(skills, 'successRate', 'desc');
    expect(sorted[0]!.metrics.successRate).toBe(0.9);
  });
});

// ============================================================================
// calculateLibraryStatistics
// ============================================================================

describe('calculateLibraryStatistics', () => {
  it('returns zeros for empty', () => {
    const stats = calculateLibraryStatistics([], []);
    expect(stats.totalSkills).toBe(0);
    expect(stats.totalExecutions).toBe(0);
    expect(stats.overallSuccessRate).toBe(0);
  });

  it('computes overall success rate', () => {
    const skills = [makeSkill()];
    const metrics = [makeMetrics({ executionCount: 10, successCount: 8 })];
    const stats = calculateLibraryStatistics(skills, metrics);
    expect(stats.totalSkills).toBe(1);
    expect(stats.totalExecutions).toBe(10);
    expect(stats.overallSuccessRate).toBeCloseTo(0.8);
  });

  it('counts by category', () => {
    const skills = [
      makeSkill({ category: 'general' }),
      makeSkill({ category: 'general' }),
      makeSkill({ category: 'testing' }),
    ];
    const stats = calculateLibraryStatistics(skills, []);
    expect(stats.skillsByCategory['general']).toBe(2);
    expect(stats.skillsByCategory['testing']).toBe(1);
  });
});

// ============================================================================
// findLowestPerformingSkillId
// ============================================================================

describe('findLowestPerformingSkillId', () => {
  it('returns undefined when no skills meet minimum', () => {
    const map = new Map<string, SkillMetrics>();
    map.set('s1', makeMetrics({ executionCount: 2 }));
    expect(findLowestPerformingSkillId(map, 5)).toBeUndefined();
  });

  it('returns lowest performing skill', () => {
    const map = new Map<string, SkillMetrics>();
    map.set('s1', makeMetrics({ executionCount: 10, successRate: 0.9 }));
    map.set('s2', makeMetrics({ executionCount: 10, successRate: 0.3 }));
    expect(findLowestPerformingSkillId(map, 5)).toBe('s2');
  });

  it('returns undefined for empty map', () => {
    expect(findLowestPerformingSkillId(new Map(), 1)).toBeUndefined();
  });
});
