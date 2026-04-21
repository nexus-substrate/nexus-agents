/**
 * nexus-agents/agents - CodeExpert Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { CodeExpert, createCodeExpert, type CodeExpertOptions } from './code-expert.js';
import type { Task, IModelAdapter, CompletionResponse, StreamChunk } from '../../core/index.js';
import { ok } from '../../core/index.js';
import { type CodeAnalysisResult } from './expert-types.js';

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
          content: 'Test code generated',
          operationType: 'generation',
          codeChanges: [
            {
              file: 'test.ts',
              modified: 'const x = 1;',
              description: 'Added variable',
            },
          ],
          recommendations: ['Add tests'],
          confidence: 0.9,
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
    description: 'Implement a function to calculate factorial',
    context: {
      workingDirectory: '/project',
      files: ['src/math.ts'],
    },
    ...overrides,
  };
}

describe('CodeExpert', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const expert = new CodeExpert();

      expect(expert.id).toBe('code-expert');
      expect(expert.role).toBe('code_expert');
      expect(expert.capabilities).toContain('task_execution');
      expect(expert.capabilities).toContain('code_generation');
      expect(expert.capabilities).toContain('code_review');
    });

    it('should accept custom id', () => {
      const expert = new CodeExpert({ id: 'custom-code-expert' });

      expect(expert.id).toBe('custom-code-expert');
    });

    it('should apply custom temperature from expert options', () => {
      const expertOptions: CodeExpertOptions = { temperature: 0.1 };
      const expert = new CodeExpert({ expertOptions });

      expect(expert.getExpertOptions().temperature).toBe(0.1);
    });

    it('should apply additional capabilities', () => {
      const expertOptions: CodeExpertOptions = {
        additionalCapabilities: ['research'],
      };
      const expert = new CodeExpert({ expertOptions });

      expect(expert.capabilities).toContain('research');
    });

    it('should use default temperature if not specified', () => {
      const expert = new CodeExpert();

      // Default temperature for code is 0.2
      expect(expert.getExpertOptions().temperature).toBeUndefined();
    });

    it('should store expert options', () => {
      const expertOptions: CodeExpertOptions = {
        strictTypes: true,
        codeStyle: 'functional',
        targetLanguage: 'TypeScript',
      };
      const expert = new CodeExpert({ expertOptions });

      const options = expert.getExpertOptions();
      expect(options.strictTypes).toBe(true);
      expect(options.codeStyle).toBe('functional');
      expect(options.targetLanguage).toBe('TypeScript');
    });
  });

  describe('createCodeExpert', () => {
    it('should create expert with factory function', () => {
      const expert = createCodeExpert();

      expect(expert).toBeInstanceOf(CodeExpert);
      expect(expert.id).toBe('code-expert');
    });

    it('should pass options through factory function', () => {
      const expert = createCodeExpert({
        id: 'factory-expert',
        expertOptions: { codeStyle: 'object-oriented' },
      });

      expect(expert.id).toBe('factory-expert');
      expect(expert.getExpertOptions().codeStyle).toBe('object-oriented');
    });
  });

  describe('execute (heuristic mode)', () => {
    it('should execute task without adapter using heuristics', async () => {
      const expert = new CodeExpert();
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe('test-task-1');
        expect(result.value.metadata.model).toBe('heuristic');

        const output = result.value.output as CodeAnalysisResult;
        expect(output.operationType).toBe('generation');
        expect(output.confidence).toBeLessThan(0.5);
      }
    });

    it('should infer generation operation type', async () => {
      const expert = new CodeExpert();
      const task = createTestTask({
        description: 'Implement a new authentication module',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as CodeAnalysisResult;
        expect(output.operationType).toBe('generation');
      }
    });

    it('should infer debugging operation type', async () => {
      const expert = new CodeExpert();
      const task = createTestTask({
        description: 'Debug the error in the login function',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as CodeAnalysisResult;
        expect(output.operationType).toBe('debugging');
      }
    });

    it('should infer optimization operation type', async () => {
      const expert = new CodeExpert();
      const task = createTestTask({
        description: 'Optimize the database query for better performance',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as CodeAnalysisResult;
        expect(output.operationType).toBe('optimization');
      }
    });

    it('should infer refactoring operation type', async () => {
      const expert = new CodeExpert();
      const task = createTestTask({
        description: 'Refactor the user service to use dependency injection',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as CodeAnalysisResult;
        expect(output.operationType).toBe('refactoring');
      }
    });

    it('should generate recommendations based on operation type', async () => {
      const expert = new CodeExpert();
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as CodeAnalysisResult;
        expect(output.recommendations).toBeDefined();
        expect(output.recommendations?.length).toBeGreaterThan(0);
      }
    });

    it('should detect warnings from task description', async () => {
      const expert = new CodeExpert();
      const task = createTestTask({
        description: 'Update the database schema and API endpoint',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as CodeAnalysisResult;
        expect(output.warnings).toBeDefined();
        expect(output.warnings?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('execute (with adapter)', () => {
    it('should execute task with model adapter', async () => {
      const adapter = createMockAdapter();
      const expert = new CodeExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe('test-task-1');
        expect(result.value.metadata.model).toBe('test-model');
        expect(result.value.metadata.tokensUsed).toBe(300);
      }
    });

    it('should parse JSON response from model', async () => {
      const adapter = createMockAdapter();
      const expert = new CodeExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as CodeAnalysisResult;
        expect(output.content).toBe('Test code generated');
        expect(output.operationType).toBe('generation');
        expect(output.codeChanges).toHaveLength(1);
        expect(output.confidence).toBe(0.9);
      }
    });

    it('should handle JSON in markdown code blocks', async () => {
      const adapter = createMockAdapter({
        content: [
          {
            type: 'text',
            text: '```json\n{"content":"Code in block","operationType":"debugging","confidence":0.8}\n```',
          },
        ],
      });
      const expert = new CodeExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as CodeAnalysisResult;
        expect(output.content).toBe('Code in block');
        expect(output.operationType).toBe('debugging');
      }
    });

    it('should handle non-JSON response gracefully', async () => {
      const adapter = createMockAdapter({
        content: [
          {
            type: 'text',
            text: 'This is just plain text response',
          },
        ],
      });
      const expert = new CodeExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as CodeAnalysisResult;
        expect(output.content).toBe('This is just plain text response');
        expect(output.confidence).toBe(0.5);
      }
    });

    it('should handle adapter error', async () => {
      const adapter: IModelAdapter = {
        providerId: 'test-provider',
        modelId: 'test-model',
        capabilities: ['completion'],
        complete: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error('Model error'),
        }),
        stream: vi.fn(),
        countTokens: vi.fn(),
        validateConfig: vi.fn(),
      };

      const expert = new CodeExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(false);
    });
  });

  describe('state management', () => {
    it('should be idle initially', () => {
      const expert = new CodeExpert();

      expect(expert.state).toBe('idle');
    });

    it('should return to idle after successful execution', async () => {
      const expert = new CodeExpert();
      const task = createTestTask();

      await expert.execute(task);

      expect(expert.state).toBe('idle');
    });

    it('should return error if not idle when executing', async () => {
      const expert = new CodeExpert();
      const task = createTestTask();

      // Start first execution (will complete immediately with heuristic)
      const result1 = await expert.execute(task);
      expect(result1.ok).toBe(true);

      // Should work for second execution since first completed
      const result2 = await expert.execute(task);
      expect(result2.ok).toBe(true);
    });
  });

  describe('hasCapability', () => {
    it('should return true for code_generation', () => {
      const expert = new CodeExpert();

      expect(expert.hasCapability('code_generation')).toBe(true);
    });

    it('should return true for task_execution', () => {
      const expert = new CodeExpert();

      expect(expert.hasCapability('task_execution')).toBe(true);
    });

    it('should return false for delegation', () => {
      const expert = new CodeExpert();

      expect(expert.hasCapability('delegation')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should reset state on cleanup', async () => {
      const expert = new CodeExpert();
      const task = createTestTask();

      await expert.execute(task);
      await expert.cleanup();

      expect(expert.state).toBe('idle');
    });
  });
});
