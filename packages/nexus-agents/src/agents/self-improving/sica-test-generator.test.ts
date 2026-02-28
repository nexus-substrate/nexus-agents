/**
 * Tests for SICA Test Generator
 *
 * (Source: Issue #256, Phase 3.2 - Self-Generated Test Automation)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SicaTestGenerator } from './sica-test-generator.js';
import type { GeneratedTest, TestGenerationOptions, SicaTestEvent } from './sica-test-types.js';
import type { AgentVersion } from './sica-types.js';

describe('SicaTestGenerator', () => {
  let generator: SicaTestGenerator;

  beforeEach(() => {
    generator = new SicaTestGenerator();
  });

  describe('generateTests', () => {
    it('should generate tests with default options', async () => {
      const result = await generator.generateTests();

      expect(result.success).toBe(true);
      expect(result.tests.length).toBeGreaterThan(0);
      expect(result.coverageBefore).toBeDefined();
      expect(result.coverageAfter).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should generate tests with custom target coverage', async () => {
      const options: TestGenerationOptions = {
        targetCoverage: 90,
      };

      const result = await generator.generateTests(options);

      expect(result.success).toBe(true);
      expect(result.tests.length).toBeGreaterThan(0);
    });

    it('should use specified test framework', async () => {
      const options: TestGenerationOptions = {
        framework: 'jest',
      };

      const result = await generator.generateTests(options);

      expect(result.success).toBe(true);
      for (const test of result.tests) {
        expect(test.framework).toBe('jest');
      }
    });

    it('should respect maxTestsPerFile limit', async () => {
      const options: TestGenerationOptions = {
        maxTestsPerFile: 2,
      };

      const result = await generator.generateTests(options);

      expect(result.success).toBe(true);
      expect(result.tests.length).toBeLessThanOrEqual(2);
    });

    it('should filter by focus paths', async () => {
      const options: TestGenerationOptions = {
        focusPaths: ['nonexistent-path'],
      };

      const result = await generator.generateTests(options);

      expect(result.success).toBe(true);
      expect(result.tests.length).toBe(0);
    });

    it('should calculate coverage gain correctly', async () => {
      const result = await generator.generateTests();

      expect(result.coverageGain).toBeDefined();
      expect(result.coverageAfter.line).toBeGreaterThanOrEqual(result.coverageBefore.line);
    });

    it('should emit tests_generated event', async () => {
      const events: SicaTestEvent[] = [];
      generator.onEvent((e) => events.push(e));

      await generator.generateTests();

      const genEvent = events.find((e) => e.type === 'tests_generated');
      expect(genEvent).toBeDefined();
      expect(genEvent?.data.count).toBeGreaterThan(0);
    });
  });

  describe('validateTests', () => {
    it('should validate tests with describe and expect', async () => {
      const tests: GeneratedTest[] = [
        {
          id: 'test-1',
          name: 'should work',
          type: 'unit',
          code: `describe('Test', () => { it('works', () => { expect(true).toBe(true); }); });`,
          target: 'test.ts',
          scenarios: ['basic test'],
          framework: 'vitest',
          generatedAt: new Date(),
        },
      ];

      const results = await generator.validateTests(tests);

      expect(results.length).toBe(1);
      expect(results[0]!.valid).toBe(true);
    });

    it('should reject tests missing describe block', async () => {
      const tests: GeneratedTest[] = [
        {
          id: 'test-2',
          name: 'invalid',
          type: 'unit',
          code: `expect(true).toBe(true);`,
          target: 'test.ts',
          scenarios: [],
          framework: 'vitest',
          generatedAt: new Date(),
        },
      ];

      const results = await generator.validateTests(tests);

      expect(results.length).toBe(1);
      expect(results[0]!.valid).toBe(false);
      expect(results[0]!.syntaxErrors).toContain('Missing describe block');
    });

    it('should emit tests_validated event', async () => {
      const events: SicaTestEvent[] = [];
      generator.onEvent((e) => events.push(e));

      const tests: GeneratedTest[] = [
        {
          id: 'test-3',
          name: 'test',
          type: 'unit',
          code: `describe('Test', () => { it('works', () => { expect(1).toBe(1); }); });`,
          target: 'test.ts',
          scenarios: [],
          framework: 'vitest',
          generatedAt: new Date(),
        },
      ];

      await generator.validateTests(tests);

      const valEvent = events.find((e) => e.type === 'tests_validated');
      expect(valEvent).toBeDefined();
      expect(valEvent?.data.total).toBe(1);
    });

    it('should track validation duration', async () => {
      const tests: GeneratedTest[] = [
        {
          id: 'test-4',
          name: 'test',
          type: 'unit',
          code: `describe('Test', () => { it('works', () => { expect(1).toBe(1); }); });`,
          target: 'test.ts',
          scenarios: [],
          framework: 'vitest',
          generatedAt: new Date(),
        },
      ];

      const results = await generator.validateTests(tests);

      expect(results[0]!.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('measureCoverage', () => {
    it('should return coverage metrics', async () => {
      const coverage = await generator.measureCoverage();

      expect(coverage.line).toBeGreaterThanOrEqual(0);
      expect(coverage.line).toBeLessThanOrEqual(100);
      expect(coverage.branch).toBeGreaterThanOrEqual(0);
      expect(coverage.function).toBeGreaterThanOrEqual(0);
      expect(coverage.statement).toBeGreaterThanOrEqual(0);
    });

    it('should emit coverage_measured event', async () => {
      const events: SicaTestEvent[] = [];
      generator.onEvent((e) => events.push(e));

      await generator.measureCoverage();

      const covEvent = events.find((e) => e.type === 'coverage_measured');
      expect(covEvent).toBeDefined();
      expect(covEvent?.data.line).toBeDefined();
    });
  });

  describe('findCoverageGaps', () => {
    it('should find gaps below target', async () => {
      const gaps = await generator.findCoverageGaps(90);

      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps[0]!.gap).toBeGreaterThan(0);
    });

    it('should return empty when coverage meets target', async () => {
      const gaps = await generator.findCoverageGaps(50);

      expect(gaps.length).toBe(0);
    });

    it('should include priority in gaps', async () => {
      const gaps = await generator.findCoverageGaps(95);

      if (gaps.length > 0) {
        expect(gaps[0]!.priority).toBeGreaterThan(0);
      }
    });

    it('should include uncovered areas', async () => {
      const gaps = await generator.findCoverageGaps(90);

      if (gaps.length > 0) {
        expect(gaps[0]!.uncoveredAreas.length).toBeGreaterThan(0);
      }
    });
  });

  describe('generateTestsForVersion', () => {
    it('should generate tests for a version', async () => {
      const version: AgentVersion = {
        id: 'v-1',
        version: '1.0.0',
        parentVersion: null,
        configuration: {
          systemPrompt: 'Test prompt',
          temperature: 0.5,
          maxTokens: 1000,
          parameters: {},
        },
        createdAt: new Date(),
        status: 'active',
      };

      const result = await generator.generateTestsForVersion(version);

      expect(result.success).toBe(true);
    });

    it('should update version metrics after generation', async () => {
      const version: AgentVersion = {
        id: 'v-2',
        version: '1.0.0',
        parentVersion: null,
        configuration: {
          systemPrompt: 'Test',
          temperature: 0.5,
          maxTokens: 1000,
          parameters: {},
        },
        createdAt: new Date(),
        status: 'active',
      };

      await generator.generateTestsForVersion(version);

      const metrics = generator.getVersionMetrics('v-2');
      expect(metrics).toBeDefined();
      expect(metrics?.testCount).toBeGreaterThan(0);
    });
  });

  describe('getVersionMetrics', () => {
    it('should return undefined for unknown version', () => {
      const metrics = generator.getVersionMetrics('unknown-version');

      expect(metrics).toBeUndefined();
    });

    it('should return metrics after test generation', async () => {
      const version: AgentVersion = {
        id: 'v-3',
        version: '1.0.0',
        parentVersion: null,
        configuration: {
          systemPrompt: 'Test',
          temperature: 0.5,
          maxTokens: 1000,
          parameters: {},
        },
        createdAt: new Date(),
        status: 'active',
      };

      await generator.generateTestsForVersion(version);

      const metrics = generator.getVersionMetrics('v-3');
      expect(metrics).toBeDefined();
      expect(metrics?.coverage).toBeDefined();
      expect(metrics?.passRate).toBeGreaterThan(0);
    });
  });

  describe('recordTestImprovement', () => {
    it('should emit test_improvement_attempted event', () => {
      const events: SicaTestEvent[] = [];
      generator.onEvent((e) => events.push(e));

      generator.recordTestImprovement({
        sourceVersionId: 'v-src',
        generatedTests: [],
        validationResults: [],
        coverageGain: 5,
        qualityScore: 0.8,
        successful: true,
        attemptedAt: new Date(),
      });

      const impEvent = events.find((e) => e.type === 'test_improvement_attempted');
      expect(impEvent).toBeDefined();
      expect(impEvent?.versionId).toBe('v-src');
      expect(impEvent?.data.successful).toBe(true);
    });
  });

  describe('onEvent', () => {
    it('should subscribe to events', async () => {
      const events: SicaTestEvent[] = [];
      generator.onEvent((e) => events.push(e));

      await generator.measureCoverage();

      expect(events.length).toBeGreaterThan(0);
    });

    it('should allow unsubscribing', async () => {
      const events: SicaTestEvent[] = [];
      const unsubscribe = generator.onEvent((e) => events.push(e));

      await generator.measureCoverage();
      const countBefore = events.length;

      unsubscribe();
      await generator.measureCoverage();

      expect(events.length).toBe(countBefore);
    });
  });

  describe('generated test structure', () => {
    it('should generate tests with all required fields', async () => {
      const result = await generator.generateTests();

      for (const test of result.tests) {
        expect(test.id).toBeDefined();
        expect(test.name).toBeDefined();
        expect(test.type).toBeDefined();
        expect(test.code).toBeDefined();
        expect(test.target).toBeDefined();
        expect(test.scenarios).toBeDefined();
        expect(test.framework).toBeDefined();
        expect(test.generatedAt).toBeInstanceOf(Date);
      }
    });

    it('should generate vitest-compatible code', async () => {
      const result = await generator.generateTests({ framework: 'vitest' });

      for (const test of result.tests) {
        expect(test.code).toContain("import { describe, it, expect } from 'vitest'");
      }
    });

    it('should generate scenarios for each test', async () => {
      const result = await generator.generateTests();

      for (const test of result.tests) {
        expect(test.scenarios.length).toBeGreaterThan(0);
      }
    });
  });
});
