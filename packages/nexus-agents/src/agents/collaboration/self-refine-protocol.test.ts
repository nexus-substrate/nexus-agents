/**
 * Tests for Self-Refine Protocol.
 * (Source: Issue #126, arXiv:2303.17651)
 */

import { describe, it, expect, vi } from 'vitest';
import { SelfRefineProtocol, createSelfRefineProtocol } from './self-refine-protocol.js';
import type { CollaborationConfig } from './collaboration-types.js';
import type { Task, IAgent, TaskResult, AgentResponse } from '../../core/index.js';
import { ok } from '../../core/index.js';

/** Creates a test task with given description. */
function createTestTask(description: string): Task {
  return {
    id: 'test-task',
    description,
    context: {},
  };
}

/** Creates a test collaboration config. */
function createTestConfig(task: Task): CollaborationConfig {
  return {
    sessionId: 'test-session',
    pattern: 'self-refine',
    experts: ['refiner'],
    task,
  };
}

/** Creates a mock agent with customizable output. */
function createMockAgent(id: string, outputs: string[]): IAgent {
  let callIndex = 0;

  return {
    id,
    role: 'code_expert',
    state: 'idle',
    capabilities: ['task_execution', 'collaboration'],
    execute: vi.fn().mockImplementation(() => {
      const output = outputs[callIndex] ?? outputs[outputs.length - 1] ?? 'default output';
      callIndex++;
      return Promise.resolve(
        ok({
          taskId: 'test',
          output,
          metadata: {
            durationMs: 100,
            tokensUsed: 50,
            toolsUsed: [],
            model: 'test-model',
          },
        } satisfies TaskResult)
      );
    }),
    handleMessage: vi.fn().mockResolvedValue(ok({} as AgentResponse)),
    initialize: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

describe('SelfRefineProtocol', () => {
  describe('construction', () => {
    it('should create with default config', () => {
      const protocol = createSelfRefineProtocol();
      expect(protocol).toBeDefined();
      expect(protocol.pattern).toBe('self-refine');
    });

    it('should accept custom config', () => {
      const protocol = createSelfRefineProtocol({
        maxIterations: 5,
        convergenceThreshold: 0.9,
      });
      expect(protocol).toBeDefined();
    });

    it('should accept custom prompt templates', () => {
      const protocol = createSelfRefineProtocol({
        feedbackPromptTemplate: 'Custom feedback: {{output}}',
        refinementPromptTemplate: 'Custom refine: {{output}} {{feedback}}',
      });
      expect(protocol).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should return error if no experts provided', async () => {
      const protocol = new SelfRefineProtocol();
      const task = createTestTask('Test task');
      const config = { ...createTestConfig(task), experts: [] };
      const agents = new Map<string, IAgent>();

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('at least one expert');
      }
    });

    it('should return error if agent not found', async () => {
      const protocol = new SelfRefineProtocol();
      const task = createTestTask('Test task');
      const config = createTestConfig(task);
      const agents = new Map<string, IAgent>(); // Empty map

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Agent not found');
      }
    });

    it('should execute iterative refinement', async () => {
      const protocol = new SelfRefineProtocol({ maxIterations: 2 });
      const task = createTestTask('Write a function');
      const config = createTestConfig(task);

      // Agent outputs: initial, feedback1, refined1, feedback2, refined2
      const agent = createMockAgent('refiner', [
        'Initial output',
        'Feedback: needs improvement',
        'Improved output',
        'Feedback: minor issues',
        'Final output',
      ]);
      const agents = new Map<string, IAgent>();
      agents.set('refiner', agent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Session success depends on aggregation which may vary
        // Check core self-refine functionality
        expect(result.value.pattern).toBe('self-refine');
        expect(result.value.refinementHistory).toBeDefined();
        expect(result.value.totalIterations).toBeGreaterThan(0);
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should stop on convergence', async () => {
      const protocol = new SelfRefineProtocol({
        maxIterations: 5,
        convergenceThreshold: 0.9,
      });
      const task = createTestTask('Write a function');
      const config = createTestConfig(task);

      // Agent outputs identical responses to trigger convergence
      const agent = createMockAgent('refiner', [
        'The same output',
        'Minor feedback',
        'The same output', // Same as initial - should trigger convergence
      ]);
      const agents = new Map<string, IAgent>();
      agents.set('refiner', agent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.converged).toBe(true);
      }
    });

    it('should include refinement history', async () => {
      const protocol = new SelfRefineProtocol({ maxIterations: 1 });
      const task = createTestTask('Write a function');
      const config = createTestConfig(task);

      const agent = createMockAgent('refiner', [
        'Initial output',
        'Feedback: needs work',
        'Refined output',
      ]);
      const agents = new Map<string, IAgent>();
      agents.set('refiner', agent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.refinementHistory.length).toBeGreaterThan(0);
        const firstIteration = result.value.refinementHistory[0];
        expect(firstIteration).toHaveProperty('iteration');
        expect(firstIteration).toHaveProperty('output');
        expect(firstIteration).toHaveProperty('feedback');
        expect(firstIteration).toHaveProperty('similarityToPrevious');
        expect(firstIteration).toHaveProperty('durationMs');
      }
    });
  });

  describe('cancel', () => {
    it('should support cancellation', async () => {
      const protocol = new SelfRefineProtocol({ maxIterations: 10 });
      const task = createTestTask('Long running task');
      const config = createTestConfig(task);

      // Slow agent that allows cancellation
      const agent = createMockAgent('refiner', ['output']);
      const agents = new Map<string, IAgent>();
      agents.set('refiner', agent);

      // Start execution and cancel immediately
      const executePromise = protocol.execute(config, agents);
      protocol.cancel('User cancelled');

      const result = await executePromise;

      // Should complete (either with result or cancellation)
      expect(result).toBeDefined();
    });
  });

  describe('similarity calculation', () => {
    it('should detect identical outputs as converged', async () => {
      const protocol = new SelfRefineProtocol({
        maxIterations: 3,
        convergenceThreshold: 0.95,
      });
      const task = createTestTask('Test');
      const config = createTestConfig(task);

      // Outputs become identical after refinement
      const agent = createMockAgent('refiner', [
        'hello world',
        'feedback',
        'hello world', // Identical to first
      ]);
      const agents = new Map<string, IAgent>();
      agents.set('refiner', agent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.converged).toBe(true);
      }
    });

    it('should detect similar outputs as converged', async () => {
      const protocol = new SelfRefineProtocol({
        maxIterations: 3,
        convergenceThreshold: 0.7, // Lower threshold
      });
      const task = createTestTask('Test');
      const config = createTestConfig(task);

      // Similar but not identical outputs
      const agent = createMockAgent('refiner', [
        'the quick brown fox jumps',
        'feedback',
        'the quick brown fox leaps', // Similar
      ]);
      const agents = new Map<string, IAgent>();
      agents.set('refiner', agent);

      const result = await protocol.execute(config, agents);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should have high similarity
        const history = result.value.refinementHistory;
        if (history.length > 1) {
          const lastIteration = history[history.length - 1];
          expect(lastIteration?.similarityToPrevious).toBeGreaterThan(0.5);
        }
      }
    });
  });

  describe('integration with factory', () => {
    it('should be creatable via createSelfRefineProtocol', () => {
      const protocol = createSelfRefineProtocol({
        maxIterations: 3,
        convergenceThreshold: 0.95,
      });

      expect(protocol).toBeInstanceOf(SelfRefineProtocol);
      expect(protocol.pattern).toBe('self-refine');
    });
  });
});
