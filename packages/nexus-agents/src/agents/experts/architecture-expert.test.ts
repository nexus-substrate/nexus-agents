/**
 * @nexus-agents/agents - ArchitectureExpert Tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ArchitectureExpert,
  createArchitectureExpert,
  type ArchitectureExpertOptions,
} from './architecture-expert.js';
import type {
  Task,
  IModelAdapter,
  CompletionResponse,
  ModelCapability,
  StreamChunk,
} from '../../core/index.js';
import { ok } from '../../core/index.js';
import { type ArchitectureAnalysisResult } from './expert-types.js';

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
          content: 'Architecture analysis completed',
          analysisType: 'design',
          patterns: [
            {
              name: 'Microservices',
              category: 'Architectural',
              applicability: 0.85,
              tradeoffs: {
                pros: ['Scalability', 'Independent deployment'],
                cons: ['Complexity', 'Network overhead'],
              },
            },
          ],
          decisions: [
            {
              id: 'ADR-001',
              title: 'Use Event-Driven Architecture',
              context: 'Need for loose coupling',
              decision: 'Adopt event-driven communication',
              consequences: ['Improved scalability', 'Added complexity'],
              status: 'accepted',
            },
          ],
          components: [
            {
              name: 'API Gateway',
              type: 'Service',
              responsibilities: ['Request routing', 'Authentication'],
              dependencies: ['Auth Service'],
            },
          ],
          recommendations: ['Document component interfaces'],
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
    capabilities: ['completion' as ModelCapability],
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
    description: 'Design a scalable microservices architecture for an e-commerce platform',
    context: {
      workingDirectory: '/project',
      files: ['docs/architecture.md'],
    },
    ...overrides,
  };
}

describe('ArchitectureExpert', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const expert = new ArchitectureExpert();

      expect(expert.id).toBe('architecture-expert');
      expect(expert.role).toBe('architecture_expert');
      expect(expert.capabilities).toContain('task_execution');
      expect(expert.capabilities).toContain('research');
      expect(expert.capabilities).toContain('collaboration');
    });

    it('should accept custom id', () => {
      const expert = new ArchitectureExpert({ id: 'custom-arch-expert' });

      expect(expert.id).toBe('custom-arch-expert');
    });

    it('should apply custom temperature', () => {
      const expertOptions: ArchitectureExpertOptions = { temperature: 0.6 };
      const expert = new ArchitectureExpert({ expertOptions });

      expect(expert.getExpertOptions().temperature).toBe(0.6);
    });

    it('should store architecture-specific options', () => {
      const expertOptions: ArchitectureExpertOptions = {
        preferredStyles: ['microservices', 'event_driven'],
        generateADRs: true,
        includeC4Suggestions: true,
        qualityPriorities: ['scalability', 'maintainability'],
      };
      const expert = new ArchitectureExpert({ expertOptions });

      const options = expert.getExpertOptions();
      expect(options.preferredStyles).toEqual(['microservices', 'event_driven']);
      expect(options.generateADRs).toBe(true);
      expect(options.includeC4Suggestions).toBe(true);
      expect(options.qualityPriorities).toEqual(['scalability', 'maintainability']);
    });
  });

  describe('createArchitectureExpert', () => {
    it('should create expert with factory function', () => {
      const expert = createArchitectureExpert();

      expect(expert).toBeInstanceOf(ArchitectureExpert);
      expect(expert.id).toBe('architecture-expert');
    });

    it('should pass options through factory function', () => {
      const expert = createArchitectureExpert({
        expertOptions: { generateADRs: true },
      });

      expect(expert.getExpertOptions().generateADRs).toBe(true);
    });
  });

  describe('execute (heuristic mode)', () => {
    it('should execute task without adapter using heuristics', async () => {
      const expert = new ArchitectureExpert();
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe('test-task-1');
        expect(result.value.metadata.model).toBe('heuristic');

        const output = result.value.output as ArchitectureAnalysisResult;
        expect(output.confidence).toBeLessThan(0.5);
      }
    });

    it('should infer design analysis type', async () => {
      const expert = new ArchitectureExpert();
      const task = createTestTask({
        description: 'Design a new payment processing system',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ArchitectureAnalysisResult;
        expect(output.analysisType).toBe('design');
      }
    });

    it('should infer review analysis type', async () => {
      const expert = new ArchitectureExpert();
      const task = createTestTask({
        description: 'Review and assess the current system architecture',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ArchitectureAnalysisResult;
        expect(output.analysisType).toBe('review');
      }
    });

    it('should infer pattern_selection analysis type', async () => {
      const expert = new ArchitectureExpert();
      const task = createTestTask({
        description: 'Which pattern should we use for the data layer?',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ArchitectureAnalysisResult;
        expect(output.analysisType).toBe('pattern_selection');
      }
    });

    it('should identify microservices pattern', async () => {
      const expert = new ArchitectureExpert();
      const task = createTestTask({
        description: 'Design a distributed microservices system',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ArchitectureAnalysisResult;
        expect(output.patterns).toBeDefined();

        const msPattern = output.patterns?.find((p) => p.name === 'Microservices');
        expect(msPattern).toBeDefined();
        expect(msPattern?.category).toBe('Architectural');
      }
    });

    it('should identify event-driven pattern', async () => {
      const expert = new ArchitectureExpert();
      const task = createTestTask({
        description: 'Design an async message-based system with pub/sub',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ArchitectureAnalysisResult;
        const eventPattern = output.patterns?.find((p) => p.name === 'Event-Driven');
        expect(eventPattern).toBeDefined();
      }
    });

    it('should identify layered architecture pattern', async () => {
      const expert = new ArchitectureExpert();
      const task = createTestTask({
        description: 'Design a three-tier MVC presentation layer',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ArchitectureAnalysisResult;
        const layeredPattern = output.patterns?.find((p) => p.name === 'Layered Architecture');
        expect(layeredPattern).toBeDefined();
      }
    });

    it('should identify components from description', async () => {
      const expert = new ArchitectureExpert();
      const task = createTestTask({
        description: 'Design an API with database persistence and security',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ArchitectureAnalysisResult;
        expect(output.components).toBeDefined();
        expect(output.components?.length).toBeGreaterThan(0);
      }
    });

    it('should generate ADRs when enabled', async () => {
      const expert = new ArchitectureExpert({
        expertOptions: { generateADRs: true },
      });
      const task = createTestTask({
        description: 'Design a microservices system',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ArchitectureAnalysisResult;
        expect(output.decisions).toBeDefined();
        expect(output.decisions!.length).toBeGreaterThan(0);
        expect(output.decisions![0]!.id).toContain('ADR');
        expect(output.decisions![0]!.status).toBe('proposed');
      }
    });

    it('should detect architecture warnings', async () => {
      const expert = new ArchitectureExpert();
      const task = createTestTask({
        description: 'Migrate the legacy monolith to microservices',
      });

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ArchitectureAnalysisResult;
        expect(output.warnings).toBeDefined();
        expect(output.warnings?.length).toBeGreaterThan(0);
      }
    });

    it('should generate recommendations based on analysis type', async () => {
      const expert = new ArchitectureExpert();
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ArchitectureAnalysisResult;
        expect(output.recommendations).toBeDefined();
        expect(output.recommendations?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('execute (with adapter)', () => {
    it('should execute task with model adapter', async () => {
      const adapter = createMockAdapter();
      const expert = new ArchitectureExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe('test-task-1');
        expect(result.value.metadata.model).toBe('test-model');
      }
    });

    it('should parse patterns from model response', async () => {
      const adapter = createMockAdapter();
      const expert = new ArchitectureExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ArchitectureAnalysisResult;
        expect(output.patterns).toHaveLength(1);
        expect(output.patterns![0]!.name).toBe('Microservices');
        expect(output.patterns![0]!.applicability).toBe(0.85);
      }
    });

    it('should parse decisions from model response', async () => {
      const adapter = createMockAdapter();
      const expert = new ArchitectureExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ArchitectureAnalysisResult;
        expect(output.decisions).toHaveLength(1);
        expect(output.decisions![0]!.id).toBe('ADR-001');
        expect(output.decisions![0]!.status).toBe('accepted');
      }
    });

    it('should parse components from model response', async () => {
      const adapter = createMockAdapter();
      const expert = new ArchitectureExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ArchitectureAnalysisResult;
        expect(output.components).toHaveLength(1);
        expect(output.components![0]!.name).toBe('API Gateway');
        expect(output.components![0]!.type).toBe('Service');
      }
    });

    it('should handle non-JSON response gracefully', async () => {
      const adapter = createMockAdapter({
        content: [
          {
            type: 'text',
            text: 'I recommend using a layered architecture with clear separation of concerns.',
          },
        ],
      });
      const expert = new ArchitectureExpert({ adapter });
      const task = createTestTask();

      const result = await expert.execute(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const output = result.value.output as ArchitectureAnalysisResult;
        expect(output.content).toContain('layered architecture');
        expect(output.confidence).toBe(0.5);
      }
    });
  });

  describe('hasCapability', () => {
    it('should return true for research', () => {
      const expert = new ArchitectureExpert();

      expect(expert.hasCapability('research')).toBe(true);
    });

    it('should return true for collaboration', () => {
      const expert = new ArchitectureExpert();

      expect(expert.hasCapability('collaboration')).toBe(true);
    });

    it('should return false for code_generation', () => {
      const expert = new ArchitectureExpert();

      expect(expert.hasCapability('code_generation')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should reset state on cleanup', async () => {
      const expert = new ArchitectureExpert();
      const task = createTestTask();

      await expert.execute(task);
      await expert.cleanup();

      expect(expert.state).toBe('idle');
    });
  });
});
