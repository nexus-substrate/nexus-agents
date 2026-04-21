/**
 * nexus-agents/agents - DocumentationExpert Tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DocumentationExpert,
  createDocumentationExpert,
  type DocumentationExpertOptions,
} from './documentation-expert.js';
import type { Task, IModelAdapter, CompletionResponse, StreamChunk } from '../../core/index.js';
import { ok } from '../../core/index.js';
import { type DocumentationResult } from './expert-types.js';

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
          content: '# Project Documentation\n\nThis is the generated documentation.',
          documentationType: 'readme',
          sections: [
            {
              title: 'Overview',
              content: 'Project overview content.',
            },
            {
              title: 'Installation',
              content: 'npm install',
            },
          ],
          apiDocs: {
            endpoints: [
              {
                name: 'createUser',
                description: 'Creates a new user',
                parameters: [
                  { name: 'name', type: 'string', description: 'User name', required: true },
                ],
                returns: { type: 'User', description: 'Created user object' },
                example: 'const user = createUser("John");',
              },
            ],
            types: [
              {
                name: 'User',
                description: 'User entity',
                properties: [
                  { name: 'id', type: 'string', description: 'Unique ID', optional: false },
                  { name: 'name', type: 'string', description: 'User name', optional: false },
                ],
              },
            ],
          },
          recommendations: ['Add more examples'],
          confidence: 0.92,
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
    description: 'Generate README documentation for the project',
    context: {
      workingDirectory: '/project',
      files: ['src/index.ts', 'package.json'],
    },
    ...overrides,
  };
}

describe('DocumentationExpert', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const expert = new DocumentationExpert();

      expect(expert.id).toBe('documentation-expert');
      expect(expert.role).toBe('documentation_expert');
      expect(expert.capabilities).toContain('task_execution');
      expect(expert.capabilities).toContain('research');
    });

    it('should accept custom id', () => {
      const expert = new DocumentationExpert({ id: 'custom-doc-expert' });

      expect(expert.id).toBe('custom-doc-expert');
    });

    it('should apply custom temperature', () => {
      const expertOptions: DocumentationExpertOptions = { temperature: 0.5 };
      const expert = new DocumentationExpert({ expertOptions });

      expect(expert.getExpertOptions().temperature).toBe(0.5);
    });

    it('should store documentation-specific options', () => {
      const expertOptions: DocumentationExpertOptions = {
        format: 'markdown',
        includeExamples: true,
        audienceLevel: 'intermediate',
        generateTOC: true,
        includeBadges: true,
      };
      const expert = new DocumentationExpert({ expertOptions });

      const options = expert.getExpertOptions();
      expect(options.format).toBe('markdown');
      expect(options.includeExamples).toBe(true);
      expect(options.audienceLevel).toBe('intermediate');
      expect(options.generateTOC).toBe(true);
      expect(options.includeBadges).toBe(true);
    });
  });

  describe('createDocumentationExpert', () => {
    it('should create expert with factory function', () => {
      const expert = createDocumentationExpert();

      expect(expert).toBeInstanceOf(DocumentationExpert);
      expect(expert.id).toBe('documentation-expert');
    });

    it('should pass options through factory function', () => {
      const expert = createDocumentationExpert({
        expertOptions: { format: 'jsdoc' },
      });

      expect(expert.getExpertOptions().format).toBe('jsdoc');
    });
  });

  describe('execute (heuristic mode)', () => {
    it('should execute task without adapter using heuristics', async () => {
      const expert = new DocumentationExpert();
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe('test-task-1');
        expect(result.value.metadata.model).toBe('heuristic');

        const output = result.value.output as DocumentationResult;
        expect(output.confidence).toBeLessThan(0.5);
      }
    });

    it('should infer readme documentation type', async () => {
      const expert = new DocumentationExpert();
      const task = createTestTask({
        description: 'Create a README for the project',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.documentationType).toBe('readme');
      }
    });

    it('should infer api documentation type', async () => {
      const expert = new DocumentationExpert();
      const task = createTestTask({
        description: 'Document the API endpoints and functions',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.documentationType).toBe('api');
      }
    });

    it('should infer guide documentation type', async () => {
      const expert = new DocumentationExpert();
      const task = createTestTask({
        description: 'Create a tutorial on how to use the library',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.documentationType).toBe('guide');
      }
    });

    it('should infer reference documentation type', async () => {
      const expert = new DocumentationExpert();
      const task = createTestTask({
        description: 'Generate technical documentation',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.documentationType).toBe('reference');
      }
    });

    it('should generate README sections', async () => {
      const expert = new DocumentationExpert();
      const task = createTestTask({
        description: 'Create README documentation',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.sections).toBeDefined();
        expect(output.sections?.length).toBeGreaterThan(0);

        const titles = output.sections?.map((s) => s.title);
        expect(titles).toContain('Overview');
        expect(titles).toContain('Installation');
        expect(titles).toContain('Usage');
      }
    });

    it('should generate API documentation sections', async () => {
      const expert = new DocumentationExpert();
      const task = createTestTask({
        description: 'Document the API',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.sections).toBeDefined();

        const titles = output.sections?.map((s) => s.title);
        expect(titles).toContain('API Overview');
      }
    });

    it('should generate guide sections', async () => {
      const expert = new DocumentationExpert();
      const task = createTestTask({
        description: 'Create a getting started guide',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.sections).toBeDefined();

        const titles = output.sections?.map((s) => s.title);
        expect(titles).toContain('Introduction');
        expect(titles).toContain('Prerequisites');
      }
    });

    it('should include badges when enabled for README', async () => {
      const expert = new DocumentationExpert({
        expertOptions: { includeBadges: true },
      });
      const task = createTestTask({
        description: 'Create README',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.content).toContain('![');
      }
    });

    it('should include TOC when enabled', async () => {
      const expert = new DocumentationExpert({
        expertOptions: { generateTOC: true },
      });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.content).toContain('Table of Contents');
      }
    });

    it('should detect documentation warnings', async () => {
      const expert = new DocumentationExpert();
      const task = createTestTask({
        description: 'Document the deprecated internal API',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.warnings).toBeDefined();
        expect(output.warnings?.length).toBeGreaterThan(0);
      }
    });

    it('should generate recommendations based on documentation type', async () => {
      const expert = new DocumentationExpert();
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.recommendations).toBeDefined();
        expect(output.recommendations?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('execute (with adapter)', () => {
    it('should execute task with model adapter', async () => {
      const adapter = createMockAdapter();
      const expert = new DocumentationExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe('test-task-1');
        expect(result.value.metadata.model).toBe('test-model');
      }
    });

    it('should parse sections from model response', async () => {
      const adapter = createMockAdapter();
      const expert = new DocumentationExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.sections).toHaveLength(2);
        expect(output.sections![0]!.title).toBe('Overview');
        expect(output.sections![1]!.title).toBe('Installation');
      }
    });

    it('should parse API docs from model response', async () => {
      const adapter = createMockAdapter();
      const expert = new DocumentationExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.apiDocs).toBeDefined();
        expect(output.apiDocs!.endpoints).toHaveLength(1);
        expect(output.apiDocs!.endpoints[0]!.name).toBe('createUser');
        expect(output.apiDocs!.types).toHaveLength(1);
        expect(output.apiDocs!.types[0]!.name).toBe('User');
      }
    });

    it('should parse API endpoint parameters', async () => {
      const adapter = createMockAdapter();
      const expert = new DocumentationExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        const endpoint = output.apiDocs!.endpoints[0]!;
        expect(endpoint.parameters).toHaveLength(1);
        expect(endpoint.parameters[0]!.name).toBe('name');
        expect(endpoint.parameters[0]!.required).toBe(true);
      }
    });

    it('should parse API type properties', async () => {
      const adapter = createMockAdapter();
      const expert = new DocumentationExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        const userType = output.apiDocs!.types[0]!;
        expect(userType.properties).toHaveLength(2);
        expect(userType.properties[0]!.name).toBe('id');
        expect(userType.properties[0]!.optional).toBe(false);
      }
    });

    it('should handle non-JSON response gracefully', async () => {
      const adapter = createMockAdapter({
        content: [
          {
            type: 'text',
            text: '# Project Title\n\nThis is the documentation for the project.',
          },
        ],
      });
      const expert = new DocumentationExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.content).toContain('Project Title');
        expect(output.confidence).toBe(0.5);
      }
    });

    it('should handle JSON in markdown code blocks', async () => {
      const adapter = createMockAdapter({
        content: [
          {
            type: 'text',
            text: '```json\n{"content":"Docs in block","documentationType":"api","confidence":0.8}\n```',
          },
        ],
      });
      const expert = new DocumentationExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as DocumentationResult;
        expect(output.content).toBe('Docs in block');
        expect(output.documentationType).toBe('api');
      }
    });
  });

  describe('hasCapability', () => {
    it('should return true for research', () => {
      const expert = new DocumentationExpert();

      expect(expert.hasCapability('research')).toBe(true);
    });

    it('should return true for task_execution', () => {
      const expert = new DocumentationExpert();

      expect(expert.hasCapability('task_execution')).toBe(true);
    });

    it('should return false for code_generation', () => {
      const expert = new DocumentationExpert();

      expect(expert.hasCapability('code_generation')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should reset state on cleanup', async () => {
      const expert = new DocumentationExpert();
      const task = createTestTask();

      await expert.execute(task);
      await expert.cleanup();

      expect(expert.state).toBe('idle');
    });
  });
});
