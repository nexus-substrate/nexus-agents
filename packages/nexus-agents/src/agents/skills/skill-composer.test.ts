/**
 * nexus-agents/agents - Skill Composer Tests
 *
 * @module agents/skills/skill-composer.test
 * (Source: Issue #150)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillComposer, createSkillComposer } from './skill-composer.js';
import { SkillLibrary } from './skill-library.js';
import type { CreateSkillOptions } from './skill-types.js';

describe('SkillComposer', () => {
  let library: SkillLibrary;
  let composer: SkillComposer;

  const readFileSkill: CreateSkillOptions = {
    name: 'Read File',
    description: 'Reads content from a file',
    category: 'file-operations',
    complexity: 'primitive',
    code: 'fs.readFileSync(path, "utf-8")',
    parameters: [{ name: 'path', type: 'string', description: 'File path', required: true }],
    outputType: 'string',
    tags: ['file', 'read'],
  };

  const parseJsonSkill: CreateSkillOptions = {
    name: 'Parse JSON',
    description: 'Parses JSON string to object',
    category: 'code-analysis',
    complexity: 'primitive',
    code: 'JSON.parse(input)',
    parameters: [{ name: 'input', type: 'string', description: 'JSON string', required: true }],
    outputType: 'object',
    tags: ['json', 'parse'],
  };

  const analyzeCodeSkill: CreateSkillOptions = {
    name: 'Analyze Code',
    description: 'Performs static analysis on code',
    category: 'code-analysis',
    complexity: 'moderate',
    code: 'analyzeAst(code)',
    parameters: [{ name: 'code', type: 'string', description: 'Source code', required: true }],
    outputType: 'AnalysisResult',
    tags: ['code', 'analysis', 'static'],
  };

  beforeEach(() => {
    library = new SkillLibrary();
    // Lower confidence threshold for testing
    composer = new SkillComposer(library, { minConfidence: 0.1 });

    const skill1 = library.addSkill(readFileSkill);
    const skill2 = library.addSkill(parseJsonSkill);
    const skill3 = library.addSkill(analyzeCodeSkill);

    // Record multiple executions to build up experience
    for (let i = 0; i < 10; i++) {
      library.recordExecution(skill1.id, 'success', { path: `/test${String(i)}.txt` });
      library.recordExecution(skill2.id, 'success', { input: '{}' });
      library.recordExecution(skill3.id, 'success', { code: 'const x = 1;' });
    }
  });

  describe('compose', () => {
    it('should compose relevant skills for a task', () => {
      const composition = composer.compose({
        taskDescription: 'Read a JSON file and parse its contents',
      });

      expect(composition).not.toBeNull();
      expect(composition?.steps.length).toBeGreaterThan(0);
      expect(composition?.confidence).toBeGreaterThan(0);
    });

    it('should return null when no relevant skills found', () => {
      const emptyLibrary = new SkillLibrary();
      const emptyComposer = new SkillComposer(emptyLibrary);

      const composition = emptyComposer.compose({
        taskDescription: 'Deploy to production',
      });

      expect(composition).toBeNull();
    });

    it('should respect maxSkillCount', () => {
      const composition = composer.compose({
        taskDescription: 'Read file, parse JSON, analyze code',
        maxSkillCount: 2,
      });

      expect(composition).not.toBeNull();
      expect(composition?.steps.length).toBeLessThanOrEqual(2);
    });

    it('should respect maxComplexity', () => {
      const composition = composer.compose({
        taskDescription: 'Analyze code structure',
        maxComplexity: 'simple',
      });

      if (composition !== null) {
        for (const step of composition.steps) {
          const skill = library.getSkill(step.skillId);
          expect(['primitive', 'simple']).toContain(skill?.complexity);
        }
      }
    });

    it('should include skill names in steps', () => {
      const composition = composer.compose({
        taskDescription: 'Read a file',
      });

      expect(composition).not.toBeNull();
      expect(composition?.steps[0]?.skillName).toBeDefined();
    });

    it('should generate input bindings', () => {
      const composition = composer.compose({
        taskDescription: 'Parse JSON data',
        context: 'some context',
      });

      expect(composition).not.toBeNull();
      const firstStep = composition?.steps[0];
      expect(firstStep?.inputBinding).toBeDefined();
    });
  });

  describe('validateComposition', () => {
    it('should validate a correct composition', () => {
      const composition = composer.compose({
        taskDescription: 'Read and parse JSON file',
      });

      expect(composition).not.toBeNull();
      if (composition !== null) {
        const validation = composer.validateComposition(composition);
        expect(validation.valid).toBe(true);
        expect(validation.errors.length).toBe(0);
      }
    });

    it('should detect missing skills', () => {
      const composition = composer.compose({
        taskDescription: 'Read file',
      });

      expect(composition).not.toBeNull();
      if (composition !== null) {
        for (const step of composition.steps) {
          library.removeSkill(step.skillId);
        }

        const validation = composer.validateComposition(composition);
        expect(validation.valid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
      }
    });

    it('does not report an empty composition as valid (#4585)', () => {
      // A composition with zero steps executes nothing; the step loop never
      // runs, so `errors.length === 0` used to render absence as validity.
      const validation = composer.validateComposition({
        steps: [],
        description: 'Empty composition',
        estimatedComplexity: 'primitive',
        confidence: 1,
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('no steps'))).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should use default config values', () => {
      const defaultComposer = new SkillComposer(library);
      const config = defaultComposer.getConfig();
      expect(config.maxCandidateSkills).toBe(20);
      expect(config.maxCompositionSteps).toBe(5);
      expect(config.minConfidence).toBe(0.3);
    });

    it('should accept custom config', () => {
      const customComposer = new SkillComposer(library, {
        maxCompositionSteps: 3,
        minConfidence: 0.5,
      });

      const config = customComposer.getConfig();
      expect(config.maxCompositionSteps).toBe(3);
      expect(config.minConfidence).toBe(0.5);
    });
  });

  describe('complexity estimation', () => {
    it('should estimate composition complexity', () => {
      const composition = composer.compose({
        taskDescription: 'Analyze code structure',
      });

      expect(composition).not.toBeNull();
      expect(composition?.estimatedComplexity).toBeDefined();
    });
  });

  describe('description generation', () => {
    it('should generate composition description', () => {
      const composition = composer.compose({
        taskDescription: 'Read a JSON configuration file',
      });

      expect(composition).not.toBeNull();
      expect(composition?.description).toBeDefined();
      expect(composition?.description.length).toBeGreaterThan(0);
    });
  });
});

describe('createSkillComposer', () => {
  it('should create composer with library', () => {
    const library = new SkillLibrary();
    const composer = createSkillComposer(library);

    expect(composer.getConfig().maxCandidateSkills).toBe(20);
  });

  it('should accept custom config', () => {
    const library = new SkillLibrary();
    const composer = createSkillComposer(library, { maxCompositionSteps: 10 });

    expect(composer.getConfig().maxCompositionSteps).toBe(10);
  });
});
