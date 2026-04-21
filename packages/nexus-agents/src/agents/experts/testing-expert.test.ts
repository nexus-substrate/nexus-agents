/**
 * nexus-agents/agents - TestingExpert Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { TestingExpert, createTestingExpert, type TestingExpertOptions } from './testing-expert.js';
import type { Task, IModelAdapter, CompletionResponse, StreamChunk } from '../../core/index.js';
import { ok } from '../../core/index.js';
import { type TestingAnalysisResult } from './expert-types.js';

/**
 * Create a mock model adapter for testing.
 */
function createMockAdapter(responseOverride?: Partial<CompletionResponse>): IModelAdapter {
  const defaultResponse: CompletionResponse = {
    model: 'test-model',
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          content: 'Testing analysis completed',
          operationType: 'generation',
          tests: [
            {
              name: 'should calculate sum correctly',
              type: 'unit',
              code: 'expect(sum(1, 2)).toBe(3);',
              target: 'sum function',
              scenarios: ['positive numbers', 'negative numbers'],
            },
          ],
          coverage: {
            line: 85,
            branch: 75,
            function: 90,
            statement: 87,
            uncoveredAreas: ['error handling branch'],
          },
          quality: {
            score: 80,
            isolation: 'good',
            assertionQuality: 'good',
            issues: [],
          },
          recommendations: ['Add edge case tests'],
          confidence: 0.88,
        }),
      },
    ],
    usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    stopReason: 'end_turn',
    ...responseOverride,
  };

  return {
    providerId: 'test-provider',
    modelId: 'test-model',
    capabilities: ['completion'],
    complete: vi.fn().mockResolvedValue(ok(defaultResponse)),
    stream: vi.fn().mockImplementation(function* (): Iterable<StreamChunk> {
      yield { type: 'message_start', message: { model: 'test-model' } };
      yield { type: 'message_stop' };
    }),
    countTokens: vi.fn().mockResolvedValue(10),
    validateConfig: vi.fn().mockReturnValue(ok(undefined)),
  };
}

/**
 * Create a test task.
 */
function createTestTask(overrides?: Partial<Task>): Task {
  return {
    id: 'test-task-1',
    description: 'Generate unit tests for the math utility functions',
    context: {
      workingDirectory: '/project',
      files: ['src/utils/math.ts'],
    },
    ...overrides,
  };
}

describe('TestingExpert', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const expert = new TestingExpert();

      expect(expert.id).toBe('testing-expert');
      expect(expert.role).toBe('testing_expert');
      expect(expert.capabilities).toContain('task_execution');
      expect(expert.capabilities).toContain('code_generation');
      expect(expert.capabilities).toContain('tool_use');
    });

    it('should accept custom id', () => {
      const expert = new TestingExpert({ id: 'custom-testing-expert' });

      expect(expert.id).toBe('custom-testing-expert');
    });

    it('should apply custom temperature', () => {
      const expertOptions: TestingExpertOptions = { temperature: 0.2 };
      const expert = new TestingExpert({ expertOptions });

      expect(expert.getExpertOptions().temperature).toBe(0.2);
    });

    it('should store testing-specific options', () => {
      const expertOptions: TestingExpertOptions = {
        framework: 'vitest',
        targetCoverage: 90,
        includeMocking: true,
        testStyle: 'bdd',
        generateFactories: true,
      };
      const expert = new TestingExpert({ expertOptions });

      const options = expert.getExpertOptions();
      expect(options.framework).toBe('vitest');
      expect(options.targetCoverage).toBe(90);
      expect(options.includeMocking).toBe(true);
      expect(options.testStyle).toBe('bdd');
      expect(options.generateFactories).toBe(true);
    });
  });

  describe('createTestingExpert', () => {
    it('should create expert with factory function', () => {
      const expert = createTestingExpert();

      expect(expert).toBeInstanceOf(TestingExpert);
      expect(expert.id).toBe('testing-expert');
    });

    it('should pass options through factory function', () => {
      const expert = createTestingExpert({
        expertOptions: { framework: 'jest' },
      });

      expect(expert.getExpertOptions().framework).toBe('jest');
    });
  });

  describe('execute (heuristic mode)', () => {
    it('should execute task without adapter using heuristics', async () => {
      const expert = new TestingExpert();
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe('test-task-1');
        expect(result.value.metadata.model).toBe('heuristic');

        const output = result.value.output as TestingAnalysisResult;
        expect(output.confidence).toBeLessThan(0.5);
      }
    });

    it('should infer generation operation type', async () => {
      const expert = new TestingExpert();
      const task = createTestTask({
        description: 'Generate tests for the user service',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.operationType).toBe('generation');
      }
    });

    it('should infer coverage_analysis operation type', async () => {
      const expert = new TestingExpert();
      const task = createTestTask({
        description: 'Analyze the test coverage and find uncovered areas',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.operationType).toBe('coverage_analysis');
      }
    });

    it('should infer quality_assessment operation type', async () => {
      const expert = new TestingExpert();
      const task = createTestTask({
        description: 'Assess the quality of the existing test suite',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.operationType).toBe('quality_assessment');
      }
    });

    it('should generate unit test template for function', async () => {
      const expert = new TestingExpert();
      const task = createTestTask({
        description: 'Generate tests for the utility function',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.tests).toBeDefined();
        expect(output.tests!.length).toBeGreaterThan(0);
        expect(output.tests![0]!.type).toBe('unit');
      }
    });

    it('should generate integration test template for API', async () => {
      const expert = new TestingExpert();
      const task = createTestTask({
        description: 'Generate tests for the API endpoint',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.tests).toBeDefined();

        const integrationTest = output.tests?.find((t) => t.type === 'integration');
        expect(integrationTest).toBeDefined();
      }
    });

    it('should generate component test template for UI', async () => {
      const expert = new TestingExpert();
      const task = createTestTask({
        description: 'Generate tests for the React component',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.tests).toBeDefined();
        expect(output.tests![0]!.code).toContain('render');
      }
    });

    it('should create heuristic coverage for coverage analysis', async () => {
      const expert = new TestingExpert();
      const task = createTestTask({
        description: 'Analyze test coverage',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.coverage).toBeDefined();
        expect(output.coverage?.line).toBe(0);
        expect(output.coverage?.uncoveredAreas).toBeDefined();
      }
    });

    it('should assess quality for quality assessment', async () => {
      const expert = new TestingExpert();
      const task = createTestTask({
        description: 'Review test quality and assess issues with flaky tests',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.quality).toBeDefined();
        expect(output.quality?.score).toBeLessThanOrEqual(100);
        expect(output.quality?.issues?.length).toBeGreaterThan(0);
      }
    });

    it('should detect testing warnings', async () => {
      const expert = new TestingExpert();
      const task = createTestTask({
        description: 'Generate tests for async database operations',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.warnings).toBeDefined();
        expect(output.warnings?.length).toBeGreaterThan(0);
      }
    });

    it('should generate recommendations based on operation type', async () => {
      const expert = new TestingExpert();
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.recommendations).toBeDefined();
        expect(output.recommendations?.length).toBeGreaterThan(0);
      }
    });

    it('should use specified framework in templates', async () => {
      const expert = new TestingExpert({
        expertOptions: { framework: 'jest' },
      });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.tests![0]!.code).toContain('jest');
      }
    });
  });

  describe('execute (with adapter)', () => {
    it('should execute task with model adapter', async () => {
      const adapter = createMockAdapter();
      const expert = new TestingExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe('test-task-1');
        expect(result.value.metadata.model).toBe('test-model');
      }
    });

    it('should parse tests from model response', async () => {
      const adapter = createMockAdapter();
      const expert = new TestingExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.tests).toHaveLength(1);
        expect(output.tests![0]!.name).toBe('should calculate sum correctly');
        expect(output.tests![0]!.type).toBe('unit');
      }
    });

    it('should parse coverage from model response', async () => {
      const adapter = createMockAdapter();
      const expert = new TestingExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.coverage).toBeDefined();
        expect(output.coverage?.line).toBe(85);
        expect(output.coverage?.branch).toBe(75);
        expect(output.coverage?.function).toBe(90);
      }
    });

    it('should parse quality assessment from model response', async () => {
      const adapter = createMockAdapter();
      const expert = new TestingExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.quality).toBeDefined();
        expect(output.quality?.score).toBe(80);
        expect(output.quality?.isolation).toBe('good');
      }
    });

    it('should handle invalid test schema gracefully', async () => {
      const adapter = createMockAdapter({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              content: 'Tests generated',
              operationType: 'generation',
              tests: [
                { invalid: 'data' }, // Invalid test
                {
                  name: 'valid test',
                  type: 'unit',
                  code: 'expect(true).toBe(true)',
                  target: 'boolean',
                  scenarios: ['truth'],
                },
              ],
              confidence: 0.8,
            }),
          },
        ],
      });
      const expert = new TestingExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        // Only valid test should be included
        expect(output.tests).toHaveLength(1);
        expect(output.tests![0]!.name).toBe('valid test');
      }
    });

    it('should handle non-JSON response gracefully', async () => {
      const adapter = createMockAdapter({
        content: [
          {
            type: 'text',
            text: 'Here are some test suggestions for your code...',
          },
        ],
      });
      const expert = new TestingExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as TestingAnalysisResult;
        expect(output.content).toContain('test suggestions');
        expect(output.confidence).toBe(0.5);
      }
    });
  });

  describe('hasCapability', () => {
    it('should return true for code_generation', () => {
      const expert = new TestingExpert();

      expect(expert.hasCapability('code_generation')).toBe(true);
    });

    it('should return true for tool_use', () => {
      const expert = new TestingExpert();

      expect(expert.hasCapability('tool_use')).toBe(true);
    });

    it('should return false for delegation', () => {
      const expert = new TestingExpert();

      expect(expert.hasCapability('delegation')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should reset state on cleanup', async () => {
      const expert = new TestingExpert();
      const task = createTestTask();

      await expert.execute(task);
      await expert.cleanup();

      expect(expert.state).toBe('idle');
    });
  });
});
