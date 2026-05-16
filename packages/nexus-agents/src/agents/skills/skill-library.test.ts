/**
 * nexus-agents/agents - Skill Library Tests
 *
 * @module agents/skills/skill-library.test
 * (Source: Issue #150)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillLibrary, createSkillLibrary } from './skill-library.js';
import type { CreateSkillOptions } from './skill-types.js';

describe('SkillLibrary', () => {
  let library: SkillLibrary;

  const sampleSkill: CreateSkillOptions = {
    name: 'Read File',
    description: 'Reads content from a file',
    category: 'file-operations',
    complexity: 'primitive',
    code: 'fs.readFileSync(path, "utf-8")',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file',
        required: true,
      },
    ],
    outputType: 'string',
    tags: ['file', 'read', 'io'],
  };

  beforeEach(() => {
    library = new SkillLibrary();
  });

  describe('addSkill', () => {
    it('should add a skill and return it with an ID', () => {
      const skill = library.addSkill(sampleSkill);

      expect(skill.id).toBeDefined();
      expect(skill.name).toBe('Read File');
      expect(skill.category).toBe('file-operations');
      expect(skill.version).toBe(1);
    });

    it('should initialize metrics for new skill', () => {
      const skill = library.addSkill(sampleSkill);
      const retrieved = library.getSkill(skill.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.metrics.executionCount).toBe(0);
      expect(retrieved?.metrics.successRate).toBe(0);
    });

    it('should throw when library at capacity without pruning', () => {
      const smallLibrary = new SkillLibrary({ maxSkills: 2, enablePruning: false });
      smallLibrary.addSkill(sampleSkill);
      smallLibrary.addSkill({ ...sampleSkill, name: 'Skill 2' });

      expect(() => smallLibrary.addSkill({ ...sampleSkill, name: 'Skill 3' })).toThrow(/capacity/);
    });
  });

  describe('getSkill', () => {
    it('should retrieve skill by ID', () => {
      const added = library.addSkill(sampleSkill);
      const retrieved = library.getSkill(added.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe(added.name);
    });

    it('should return undefined for unknown ID', () => {
      const result = library.getSkill('unknown-id');
      expect(result).toBeUndefined();
    });
  });

  describe('getSkillByName', () => {
    it('should retrieve skill by name', () => {
      library.addSkill(sampleSkill);
      const retrieved = library.getSkillByName('Read File');

      expect(retrieved).toBeDefined();
      expect(retrieved?.description).toBe(sampleSkill.description);
    });

    it('should return undefined for unknown name', () => {
      const result = library.getSkillByName('Unknown Skill');
      expect(result).toBeUndefined();
    });
  });

  describe('searchSkills', () => {
    beforeEach(() => {
      library.addSkill(sampleSkill);
      library.addSkill({
        ...sampleSkill,
        name: 'Write File',
        description: 'Writes content to a file',
        tags: ['file', 'write', 'io'],
      });
      library.addSkill({
        name: 'Parse JSON',
        description: 'Parses JSON string',
        category: 'code-analysis',
        complexity: 'simple',
        code: 'JSON.parse(input)',
        parameters: [{ name: 'input', type: 'string', description: 'JSON string', required: true }],
        outputType: 'object',
        tags: ['json', 'parse'],
      });
    });

    it('should search by text in name and description', () => {
      const result = library.searchSkills({ search: 'file' });
      expect(result.skills.length).toBe(2);
      expect(result.skills.every((s) => s.name.includes('File'))).toBe(true);
    });

    it('should filter by category', () => {
      const result = library.searchSkills({ category: 'code-analysis' });
      expect(result.skills.length).toBe(1);
      expect(result.skills[0]?.name).toBe('Parse JSON');
    });

    it('should filter by complexity', () => {
      const result = library.searchSkills({ complexity: 'primitive' });
      expect(result.skills.length).toBe(2);
    });

    it('should filter by tags', () => {
      const result = library.searchSkills({ tags: ['json'] });
      expect(result.skills.length).toBe(1);
      expect(result.skills[0]?.name).toBe('Parse JSON');
    });

    it('should limit results', () => {
      const result = library.searchSkills({ limit: 2 });
      expect(result.skills.length).toBe(2);
      expect(result.totalCount).toBe(3);
    });

    it('should sort by name', () => {
      const result = library.searchSkills({ sortBy: 'name', sortOrder: 'asc' });
      expect(result.skills[0]?.name).toBe('Parse JSON');
      expect(result.skills[2]?.name).toBe('Write File');
    });
  });

  describe('recordExecution', () => {
    it('should update metrics on successful execution', () => {
      const skill = library.addSkill(sampleSkill);
      library.recordExecution(skill.id, 'success', { path: '/test.txt' }, 'content');

      const updated = library.getSkill(skill.id);
      expect(updated?.metrics.executionCount).toBe(1);
      expect(updated?.metrics.successCount).toBe(1);
      expect(updated?.metrics.successRate).toBe(1);
    });

    it('should update metrics on failed execution', () => {
      const skill = library.addSkill(sampleSkill);
      library.recordExecution(skill.id, 'failure', { path: '/test.txt' }, undefined, 'Not found');

      const updated = library.getSkill(skill.id);
      expect(updated?.metrics.executionCount).toBe(1);
      expect(updated?.metrics.successCount).toBe(0);
      expect(updated?.metrics.successRate).toBe(0);
    });

    it('should calculate correct success rate over multiple executions', () => {
      const skill = library.addSkill(sampleSkill);
      library.recordExecution(skill.id, 'success', { path: '/a.txt' });
      library.recordExecution(skill.id, 'success', { path: '/b.txt' });
      library.recordExecution(skill.id, 'failure', { path: '/c.txt' });
      library.recordExecution(skill.id, 'success', { path: '/d.txt' });

      const updated = library.getSkill(skill.id);
      expect(updated?.metrics.executionCount).toBe(4);
      expect(updated?.metrics.successCount).toBe(3);
      expect(updated?.metrics.successRate).toBe(0.75);
    });
  });

  // ==========================================================================
  // Phase 6 of #2792 — skill promotion bridge to shared belief store
  // ==========================================================================

  describe('skill promotion (Phase 6 of #2792)', () => {
    it('fires the promoter once the success threshold is crossed', () => {
      const events: Array<{ skillId: string; name: string; category: string }> = [];
      const promotingLibrary = new SkillLibrary({
        minSuccessesForPromotion: 3,
        skillPromoter: (e) => {
          events.push({ skillId: e.skillId, name: e.name, category: e.category });
        },
      });
      const skill = promotingLibrary.addSkill(sampleSkill);

      promotingLibrary.recordExecution(skill.id, 'success', {});
      expect(events).toHaveLength(0); // 1 success, threshold is 3
      promotingLibrary.recordExecution(skill.id, 'success', {});
      expect(events).toHaveLength(0); // 2 successes, still below
      promotingLibrary.recordExecution(skill.id, 'success', {});
      expect(events).toHaveLength(1); // 3 successes — promote
      expect(events[0]?.name).toBe(skill.name);
    });

    it('does not re-promote on subsequent successes past the threshold', () => {
      const events: unknown[] = [];
      const promotingLibrary = new SkillLibrary({
        minSuccessesForPromotion: 2,
        skillPromoter: (e) => {
          events.push(e);
        },
      });
      const skill = promotingLibrary.addSkill(sampleSkill);

      promotingLibrary.recordExecution(skill.id, 'success', {});
      promotingLibrary.recordExecution(skill.id, 'success', {});
      expect(events).toHaveLength(1);
      promotingLibrary.recordExecution(skill.id, 'success', {});
      promotingLibrary.recordExecution(skill.id, 'success', {});
      expect(events).toHaveLength(1);
    });

    it('does not fire on failures', () => {
      const events: unknown[] = [];
      const promotingLibrary = new SkillLibrary({
        minSuccessesForPromotion: 1,
        skillPromoter: (e) => {
          events.push(e);
        },
      });
      const skill = promotingLibrary.addSkill(sampleSkill);

      promotingLibrary.recordExecution(skill.id, 'failure', {}, undefined, 'boom');
      promotingLibrary.recordExecution(skill.id, 'failure', {}, undefined, 'boom');
      expect(events).toHaveLength(0);
    });

    it('catches throws from the promoter without breaking skill bookkeeping', () => {
      const promotingLibrary = new SkillLibrary({
        minSuccessesForPromotion: 1,
        skillPromoter: () => {
          throw new Error('promotion bridge exploded');
        },
      });
      const skill = promotingLibrary.addSkill(sampleSkill);

      expect(() => {
        promotingLibrary.recordExecution(skill.id, 'success', {});
      }).not.toThrow();
      // Metrics still updated.
      expect(promotingLibrary.getSkill(skill.id)?.metrics.successCount).toBe(1);
    });

    it('catches rejections from an async promoter', async () => {
      const promotingLibrary = new SkillLibrary({
        minSuccessesForPromotion: 1,
        skillPromoter: () => Promise.reject(new Error('async fail')),
      });
      const skill = promotingLibrary.addSkill(sampleSkill);

      promotingLibrary.recordExecution(skill.id, 'success', {});
      // Allow the rejected promise's catch handler to settle.
      await new Promise((r) => setTimeout(r, 5));
      // No throw → bookkeeping intact.
      expect(promotingLibrary.getSkill(skill.id)?.metrics.successCount).toBe(1);
    });

    it('passes successRate and executionCount in the event', () => {
      const captures: Array<{ successRate: number; executionCount: number }> = [];
      const promotingLibrary = new SkillLibrary({
        minSuccessesForPromotion: 2,
        skillPromoter: (e) => {
          captures.push({ successRate: e.successRate, executionCount: e.executionCount });
        },
      });
      const skill = promotingLibrary.addSkill(sampleSkill);

      promotingLibrary.recordExecution(skill.id, 'success', {});
      promotingLibrary.recordExecution(skill.id, 'failure', {}, undefined, 'meh');
      promotingLibrary.recordExecution(skill.id, 'success', {});
      // 2 successes out of 3 → 0.667; threshold crossed at this call.
      expect(captures).toHaveLength(1);
      expect(captures[0]?.executionCount).toBe(3);
      expect(captures[0]?.successRate).toBeCloseTo(2 / 3, 2);
    });
  });

  describe('findRelevantSkills', () => {
    beforeEach(() => {
      library.addSkill(sampleSkill);
      library.addSkill({
        ...sampleSkill,
        name: 'Write File',
        description: 'Writes content to a file on disk',
        tags: ['file', 'write', 'disk'],
      });
      library.addSkill({
        name: 'Execute Command',
        description: 'Runs a shell command',
        category: 'general',
        complexity: 'simple',
        code: 'exec(cmd)',
        parameters: [{ name: 'cmd', type: 'string', description: 'Command', required: true }],
        outputType: 'string',
        tags: ['shell', 'command', 'exec'],
      });
    });

    it('should find skills matching task description', () => {
      const skills = library.findRelevantSkills('I need to read a file from disk');
      expect(skills.length).toBeGreaterThan(0);
      expect(skills[0]?.name).toBe('Read File');
    });

    it('should limit results', () => {
      const skills = library.findRelevantSkills('file operations', 1);
      expect(skills.length).toBe(1);
    });
  });

  describe('updateSkill', () => {
    it('should update skill properties', () => {
      const skill = library.addSkill(sampleSkill);
      const updated = library.updateSkill(skill.id, {
        description: 'Updated description',
        complexity: 'simple',
      });

      expect(updated?.description).toBe('Updated description');
      expect(updated?.complexity).toBe('simple');
      expect(updated?.version).toBe(2);
    });

    it('should return undefined for unknown skill', () => {
      const result = library.updateSkill('unknown-id', { name: 'New Name' });
      expect(result).toBeUndefined();
    });
  });

  describe('removeSkill', () => {
    it('should remove skill from library', () => {
      const skill = library.addSkill(sampleSkill);
      const removed = library.removeSkill(skill.id);

      expect(removed).toBe(true);
      expect(library.getSkill(skill.id)).toBeUndefined();
    });

    it('should return false for unknown skill', () => {
      const result = library.removeSkill('unknown-id');
      expect(result).toBe(false);
    });
  });

  describe('getStatistics', () => {
    it('should return library statistics', () => {
      library.addSkill(sampleSkill);
      library.addSkill({
        ...sampleSkill,
        name: 'Parse JSON',
        category: 'code-analysis',
        complexity: 'simple',
      });

      const stats = library.getStatistics();

      expect(stats.totalSkills).toBe(2);
      expect(stats.skillsByCategory['file-operations']).toBe(1);
      expect(stats.skillsByCategory['code-analysis']).toBe(1);
      expect(stats.skillsByComplexity['primitive']).toBe(1);
      expect(stats.skillsByComplexity['simple']).toBe(1);
    });
  });

  describe('getTopPerformingSkills', () => {
    it('should return skills sorted by success rate', () => {
      const skill1 = library.addSkill({ ...sampleSkill, name: 'Skill 1' });
      const skill2 = library.addSkill({ ...sampleSkill, name: 'Skill 2' });

      library.recordExecution(skill1.id, 'success', {});
      library.recordExecution(skill1.id, 'failure', {});
      library.recordExecution(skill2.id, 'success', {});
      library.recordExecution(skill2.id, 'success', {});

      const top = library.getTopPerformingSkills(2);

      expect(top[0]?.name).toBe('Skill 2');
      expect(top[0]?.metrics.successRate).toBe(1);
      expect(top[1]?.name).toBe('Skill 1');
      expect(top[1]?.metrics.successRate).toBe(0.5);
    });
  });
});

describe('createSkillLibrary', () => {
  it('should create library with default config', () => {
    const library = createSkillLibrary();
    const config = library.getConfig();

    expect(config.maxSkills).toBe(1000);
    expect(config.enablePruning).toBe(true);
  });

  it('should accept custom config', () => {
    const library = createSkillLibrary({ maxSkills: 500 });
    expect(library.getConfig().maxSkills).toBe(500);
  });
});
