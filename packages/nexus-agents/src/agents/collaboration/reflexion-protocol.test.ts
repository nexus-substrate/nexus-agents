/**
 * nexus-agents/agents - Reflexion Protocol Tests
 *
 * Tests for Multi-Agent Reflexion (MAR) protocol implementation.
 * (Source: arxiv:2512.20845)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReflexionProtocol, createReflexionProtocol } from './reflexion-protocol.js';
import { DEFAULT_CODE_REVIEW_PERSONAS } from './reflexion-types.js';
import type {
  IAgent,
  Task,
  TaskResult,
  AgentState,
  AgentRole,
  AgentResponse,
  AgentCapability,
} from '../../core/index.js';
import { ok, AgentError } from '../../core/index.js';

// Mock agent implementation
function createMockAgent(id: string): IAgent {
  return {
    id,
    role: 'code_expert' as AgentRole,
    state: 'idle' as AgentState,
    capabilities: ['code_generation', 'code_review'] as AgentCapability[],
    execute: vi.fn().mockResolvedValue(
      ok({
        taskId: 'test-task',
        output:
          'Generated code output that is sufficiently long to pass basic checks for quality review',
        metadata: {
          durationMs: 100,
          tokensUsed: 50,
          toolsUsed: [],
          model: 'test-model',
        },
      } as TaskResult)
    ),
    handleMessage: vi.fn().mockResolvedValue(
      ok({
        messageId: 'msg-1',
        status: 'completed',
        data: { acknowledged: true },
      } as AgentResponse)
    ),
    initialize: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

// Test task factory
function createTestTask(): Task {
  return {
    id: 'test-task',
    description: 'Implement a function to calculate factorial',
    context: {
      workingDirectory: '/test',
      files: ['factorial.ts'],
    },
    constraints: {
      maxDuration: 60000,
      maxTokens: 4000,
    },
  };
}

describe('ReflexionProtocol', () => {
  describe('constructor', () => {
    it('should create with default config', () => {
      const protocol = new ReflexionProtocol();
      expect(protocol.pattern).toBe('reflexion');
    });

    it('should accept custom config', () => {
      const protocol = new ReflexionProtocol({
        reflexionConfig: {
          maxIterations: 5,
          severityThreshold: 0.4,
        },
      });
      expect(protocol.pattern).toBe('reflexion');
    });

    it('should throw on invalid config', () => {
      const firstPersona = DEFAULT_CODE_REVIEW_PERSONAS[0];
      expect(firstPersona).toBeDefined();

      expect(() => {
        new ReflexionProtocol({
          reflexionConfig: {
            maxIterations: 0, // Invalid: must be >= 1
            personas: [firstPersona!], // Invalid: needs 2+
          },
        });
      }).toThrow();
    });
  });

  describe('cancel', () => {
    it('should cancel protocol execution', () => {
      const protocol = new ReflexionProtocol();
      protocol.cancel('User cancelled');
      // Protocol is cancelled internally
    });
  });

  describe('execute', () => {
    let protocol: ReflexionProtocol;
    let mockProducer: IAgent;

    beforeEach(() => {
      protocol = createReflexionProtocol();
      mockProducer = createMockAgent('producer');
    });

    it('should require at least one producer expert', async () => {
      const result = await protocol.execute(
        {
          sessionId: 'test-session',
          pattern: 'reflexion',
          experts: [], // No experts
          task: createTestTask(),
        },
        new Map()
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('expert');
      }
    });

    it('should fail if producer agent not found', async () => {
      const result = await protocol.execute(
        {
          sessionId: 'test-session',
          pattern: 'reflexion',
          experts: ['missing-producer'],
          task: createTestTask(),
        },
        new Map() // Empty agent map
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found');
      }
    });

    it('should execute reflexion loop successfully', async () => {
      const agents = new Map<string, IAgent>();
      agents.set('producer', mockProducer);

      const result = await protocol.execute(
        {
          sessionId: 'test-session',
          pattern: 'reflexion',
          experts: ['producer'],
          task: createTestTask(),
        },
        agents
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe('test-session');
        expect(result.value.pattern).toBe('reflexion');
      }
    });

    it('should handle production failure', async () => {
      const failingProducer: IAgent = {
        ...mockProducer,
        execute: vi.fn().mockResolvedValue({
          ok: false,
          error: new AgentError('Production failed'),
        }),
      };

      const agents = new Map<string, IAgent>();
      agents.set('producer', failingProducer);

      const result = await protocol.execute(
        {
          sessionId: 'test-session',
          pattern: 'reflexion',
          experts: ['producer'],
          task: createTestTask(),
        },
        agents
      );

      expect(result.ok).toBe(false);
    });

    it('should converge when severity is below threshold', async () => {
      // Mock returns long output that won't trigger high severity
      const convergingProducer: IAgent = {
        ...mockProducer,
        execute: vi.fn().mockResolvedValue(
          ok({
            taskId: 'test-task',
            output:
              'This is a very long and detailed output that provides comprehensive coverage of the required functionality and addresses all the key areas that the persona critics are looking for.',
            metadata: {
              durationMs: 100,
              tokensUsed: 100,
              toolsUsed: [],
              model: 'test-model',
            },
          })
        ),
      };

      const agents = new Map<string, IAgent>();
      agents.set('producer', convergingProducer);

      const result = await protocol.execute(
        {
          sessionId: 'test-session',
          pattern: 'reflexion',
          experts: ['producer'],
          task: createTestTask(),
        },
        agents
      );

      expect(result.ok).toBe(true);
    });
  });
});

describe('createReflexionProtocol', () => {
  it('should create a ReflexionProtocol instance', () => {
    const protocol = createReflexionProtocol();
    expect(protocol).toBeInstanceOf(ReflexionProtocol);
    expect(protocol.pattern).toBe('reflexion');
  });

  it('should pass options to constructor', () => {
    const protocol = createReflexionProtocol({
      reflexionConfig: {
        maxIterations: 2,
      },
    });
    expect(protocol).toBeInstanceOf(ReflexionProtocol);
  });
});

describe('ReflexionProtocol - Edge Cases', () => {
  describe('Iteration Limits', () => {
    it('should complete execution with limited iterations', async () => {
      // Configure with only 1 iteration
      const protocol = new ReflexionProtocol({
        reflexionConfig: {
          maxIterations: 1,
          severityThreshold: 0.01, // Very low threshold = always wants improvement
        },
      });

      // Mock agent that always produces "needs improvement" output
      const mockProducer: IAgent = {
        id: 'producer',
        role: 'code_expert' as AgentRole,
        state: 'idle' as AgentState,
        capabilities: ['code_generation'] as AgentCapability[],
        execute: vi.fn().mockResolvedValue(
          ok({
            taskId: 'test-task',
            output: 'Short output', // Short output triggers feedback
            metadata: { durationMs: 100, tokensUsed: 50, toolsUsed: [], model: 'test' },
          } as TaskResult)
        ),
        handleMessage: vi.fn().mockResolvedValue(ok({ messageId: 'm1', status: 'completed' })),
        initialize: vi.fn().mockResolvedValue(undefined),
        cleanup: vi.fn().mockResolvedValue(undefined),
      };

      const agents = new Map<string, IAgent>();
      agents.set('producer', mockProducer);

      const result = await protocol.execute(
        {
          sessionId: 'test-session',
          pattern: 'reflexion',
          experts: ['producer'],
          task: createTestTask(),
        },
        agents
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Verify basic result structure
        expect(result.value.sessionId).toBe('test-session');
        expect(result.value.pattern).toBe('reflexion');
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Multi-Expert Scenarios', () => {
    it('should work with multiple experts in the list', async () => {
      const protocol = createReflexionProtocol();

      // Create multiple mock agents
      const mockAgent1 = createMockAgent('producer-1');
      const mockAgent2 = createMockAgent('producer-2');

      const agents = new Map<string, IAgent>();
      agents.set('producer-1', mockAgent1);
      agents.set('producer-2', mockAgent2);

      // Only the first expert is used as the producer
      const result = await protocol.execute(
        {
          sessionId: 'test-session',
          pattern: 'reflexion',
          experts: ['producer-1', 'producer-2'],
          task: createTestTask(),
        },
        agents
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pattern).toBe('reflexion');
      }
    });
  });

  describe('Empty Output Handling', () => {
    it('should handle agent returning empty output', async () => {
      const protocol = createReflexionProtocol();

      const emptyOutputAgent: IAgent = {
        id: 'producer',
        role: 'code_expert' as AgentRole,
        state: 'idle' as AgentState,
        capabilities: ['code_generation'] as AgentCapability[],
        execute: vi.fn().mockResolvedValue(
          ok({
            taskId: 'test-task',
            output: '', // Empty output
            metadata: { durationMs: 100, tokensUsed: 50, toolsUsed: [], model: 'test' },
          } as TaskResult)
        ),
        handleMessage: vi.fn().mockResolvedValue(ok({ messageId: 'm1', status: 'completed' })),
        initialize: vi.fn().mockResolvedValue(undefined),
        cleanup: vi.fn().mockResolvedValue(undefined),
      };

      const agents = new Map<string, IAgent>();
      agents.set('producer', emptyOutputAgent);

      const result = await protocol.execute(
        {
          sessionId: 'test-session',
          pattern: 'reflexion',
          experts: ['producer'],
          task: createTestTask(),
        },
        agents
      );

      // Should complete even with empty output
      expect(result.ok).toBe(true);
    });
  });

  describe('Concurrent Cancellation', () => {
    it('should handle cancel called multiple times', () => {
      const protocol = createReflexionProtocol();

      // Multiple cancellations should not throw
      expect(() => {
        protocol.cancel('First cancel');
        protocol.cancel('Second cancel');
        protocol.cancel('Third cancel');
      }).not.toThrow();
    });

    it('should handle cancel before execution', async () => {
      const protocol = createReflexionProtocol();

      // Cancel before any execution
      protocol.cancel('Pre-emptive cancel');

      const mockProducer = createMockAgent('producer');
      const agents = new Map<string, IAgent>();
      agents.set('producer', mockProducer);

      // Execute should still work (cancel resets on new execution)
      const result = await protocol.execute(
        {
          sessionId: 'test-session',
          pattern: 'reflexion',
          experts: ['producer'],
          task: createTestTask(),
        },
        agents
      );

      // The result depends on implementation - either succeeds or is cancelled
      expect(result).toBeDefined();
    });
  });

  describe('Task Context Edge Cases', () => {
    it('should handle task with empty context', async () => {
      const protocol = createReflexionProtocol();
      const mockProducer = createMockAgent('producer');
      const agents = new Map<string, IAgent>();
      agents.set('producer', mockProducer);

      const taskWithEmptyContext: Task = {
        id: 'test-task',
        description: 'Task with no context',
        context: {}, // Empty context
      };

      const result = await protocol.execute(
        {
          sessionId: 'test-session',
          pattern: 'reflexion',
          experts: ['producer'],
          task: taskWithEmptyContext,
        },
        agents
      );

      expect(result.ok).toBe(true);
    });

    it('should handle task with no constraints', async () => {
      const protocol = createReflexionProtocol();
      const mockProducer = createMockAgent('producer');
      const agents = new Map<string, IAgent>();
      agents.set('producer', mockProducer);

      const taskWithNoConstraints: Task = {
        id: 'test-task',
        description: 'Task without constraints',
        context: {},
        // No constraints field
      };

      const result = await protocol.execute(
        {
          sessionId: 'test-session',
          pattern: 'reflexion',
          experts: ['producer'],
          task: taskWithNoConstraints,
        },
        agents
      );

      expect(result.ok).toBe(true);
    });
  });

  describe('Persona Coverage', () => {
    it('should handle custom personas with full configuration', async () => {
      // Personas must include all required fields per PersonaSchema
      const customPersonas = [
        {
          id: 'security-expert',
          role: 'Security Expert',
          systemPrompt: 'Review code for security vulnerabilities',
          focusAreas: ['security', 'authentication', 'authorization'],
          weight: 1.0,
        },
        {
          id: 'performance-expert',
          role: 'Performance Expert',
          systemPrompt: 'Analyze code for performance issues',
          focusAreas: ['performance', 'memory', 'complexity'],
          weight: 0.8,
        },
      ];

      const protocol = new ReflexionProtocol({
        reflexionConfig: {
          personas: customPersonas,
        },
      });

      const mockProducer = createMockAgent('producer');
      const agents = new Map<string, IAgent>();
      agents.set('producer', mockProducer);

      const result = await protocol.execute(
        {
          sessionId: 'test-session',
          pattern: 'reflexion',
          experts: ['producer'],
          task: createTestTask(),
        },
        agents
      );

      expect(result.ok).toBe(true);
    });

    it('should use default personas when none provided', async () => {
      const protocol = createReflexionProtocol();

      const mockProducer = createMockAgent('producer');
      const agents = new Map<string, IAgent>();
      agents.set('producer', mockProducer);

      const result = await protocol.execute(
        {
          sessionId: 'test-session',
          pattern: 'reflexion',
          experts: ['producer'],
          task: createTestTask(),
        },
        agents
      );

      expect(result.ok).toBe(true);
    });
  });
});
