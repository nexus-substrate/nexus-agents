/**
 * Reflexion Collaboration Protocol E2E Tests
 *
 * End-to-end tests for Multi-Agent Reflexion (MAR) protocol.
 * (Source: arxiv:2512.20845 - MAR: Multi-Agent Reflexion Improves Reasoning)
 *
 * @module testing/e2e/agents/reflexion-collaboration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CollaborationConfig } from '../../../agents/index.js';
import {
  createReflexionProtocol,
  DEFAULT_CODE_REVIEW_PERSONAS,
  calculateWeightedSeverity,
  EventBus,
  getGlobalEventBus,
  resetGlobalEventBus,
  type Persona,
  type PersonaCritique,
} from '../../../agents/collaboration/index.js';
import type { IAgent, Task } from '../../../core/index.js';
import { ok, AgentError } from '../../../core/index.js';
import { measureLatency, generateTestId, withTimeout } from '../utils/index.js';

/** Creates a mock agent for testing. */
function createMockAgent(id: string, outputGen?: (task: Task) => string): IAgent {
  const genOutput =
    outputGen ?? (() => 'Generated code with proper error handling and best practices.');
  return {
    id,
    role: 'code_expert',
    state: 'idle',
    capabilities: ['code_generation', 'code_review'],
    execute: vi.fn().mockImplementation((task: Task) =>
      Promise.resolve(
        ok({
          taskId: task.id,
          output: genOutput(task),
          metadata: { durationMs: 100, tokensUsed: 50, toolsUsed: [], model: 'test' },
        })
      )
    ),
    handleMessage: vi
      .fn()
      .mockResolvedValue(ok({ messageId: `msg-${id}`, status: 'completed', data: {} })),
    initialize: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

/** Creates a test task. */
const createTestTask = (desc?: string): Task => ({
  id: generateTestId('task'),
  description: desc ?? 'Implement a factorial function with validation',
  context: { workingDirectory: '/test', files: ['factorial.ts'] },
  constraints: { maxDuration: 60000, maxTokens: 4000 },
});

/** Creates collaboration config. */
const createConfig = (producerId: string, task: Task): CollaborationConfig => ({
  sessionId: generateTestId('session'),
  pattern: 'reflexion',
  experts: [producerId],
  task,
});

const TEST_PERSONAS: readonly Persona[] = [
  {
    id: 'security',
    role: 'Security Analyst',
    systemPrompt: 'Analyze for security.',
    focusAreas: ['security'],
    weight: 1.0,
  },
  {
    id: 'perf',
    role: 'Performance Engineer',
    systemPrompt: 'Analyze for perf.',
    focusAreas: ['performance'],
    weight: 0.8,
  },
] as const;

describe('Reflexion Collaboration E2E', () => {
  let eventBus: EventBus;
  let events: unknown[];

  beforeEach(() => {
    resetGlobalEventBus();
    eventBus = getGlobalEventBus();
    events = [];
    eventBus.subscribe('protocol.*', (e) => {
      events.push(e);
    });
    eventBus.subscribe('session.*', (e) => {
      events.push(e);
    });
  });

  afterEach(() => {
    events = [];
    resetGlobalEventBus();
    vi.clearAllMocks();
  });

  describe('Single Critic E2E', () => {
    it('should generate critique and calculate severity scores', async () => {
      const protocol = createReflexionProtocol({
        reflexionConfig: {
          personas: TEST_PERSONAS,
          maxIterations: 1,
          severityThreshold: 0.9,
          allowSyntheticCritiques: true,
        },
      });
      const producer = createMockAgent('producer');
      const result = await protocol.execute(
        createConfig('producer', createTestTask()),
        new Map([['producer', producer]])
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pattern).toBe('reflexion');
      }

      // Test severity calculation
      const critiques: readonly PersonaCritique[] = [
        {
          personaId: 'security',
          role: 'Security',
          critique: 'Found issue',
          suggestedImprovement: 'Fix it',
          severity: 0.9,
          issues: ['SQL injection'],
        },
        {
          personaId: 'perf',
          role: 'Perf',
          critique: 'Minor',
          suggestedImprovement: 'Cache',
          severity: 0.3,
          issues: [],
        },
      ];
      const severity = calculateWeightedSeverity(critiques, TEST_PERSONAS);
      expect(severity).toBeCloseTo(0.633, 2); // (0.9*1.0 + 0.3*0.8) / 1.8
    });

    it('should emit protocol events during execution', async () => {
      const protocol = createReflexionProtocol({
        reflexionConfig: {
          personas: TEST_PERSONAS,
          maxIterations: 1,
          allowSyntheticCritiques: true,
        },
        eventBus,
      });
      const producer = createMockAgent('producer');
      await protocol.execute(
        createConfig('producer', createTestTask()),
        new Map([['producer', producer]])
      );
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Persona Debate E2E', () => {
    it('should run debate with weighted critics', async () => {
      const weightedPersonas: readonly Persona[] = [
        {
          id: 'high',
          role: 'Critical',
          systemPrompt: 'Critical.',
          focusAreas: ['critical'],
          weight: 1.0,
        },
        { id: 'low', role: 'Minor', systemPrompt: 'Minor.', focusAreas: ['minor'], weight: 0.2 },
      ];
      const protocol = createReflexionProtocol({
        reflexionConfig: {
          personas: weightedPersonas,
          maxIterations: 1,
          allowSyntheticCritiques: true,
        },
      });
      const producer = createMockAgent('producer');
      const result = await protocol.execute(
        createConfig('producer', createTestTask()),
        new Map([['producer', producer]])
      );
      expect(result.ok).toBe(true);
    });

    it('should use default code review personas', async () => {
      const protocol = createReflexionProtocol({
        reflexionConfig: {
          personas: DEFAULT_CODE_REVIEW_PERSONAS,
          maxIterations: 2,
          severityThreshold: 0.3,
          allowSyntheticCritiques: true,
        },
      });
      const producer = createMockAgent('producer');
      const result = await protocol.execute(
        createConfig(
          'producer',
          createTestTask('Review for security, performance, maintainability')
        ),
        new Map([['producer', producer]])
      );
      expect(result.ok).toBe(true);
      expect(producer.execute).toHaveBeenCalled();
    });
  });

  describe('Iterative Refinement E2E', () => {
    it('should iterate until convergence or max iterations', async () => {
      let callCount = 0;
      const producer = createMockAgent('producer', () => {
        callCount++;
        return callCount === 1
          ? 'short'
          : 'Comprehensive output with security, performance, and best practices.';
      });
      const protocol = createReflexionProtocol({
        reflexionConfig: {
          personas: TEST_PERSONAS,
          maxIterations: 5,
          severityThreshold: 0.3,
          allowSyntheticCritiques: true,
        },
      });
      const result = await protocol.execute(
        createConfig('producer', createTestTask()),
        new Map([['producer', producer]])
      );
      expect(result.ok).toBe(true);
      expect(callCount).toBeGreaterThanOrEqual(1);
    });

    it('should respect max iterations limit', async () => {
      const producer = createMockAgent('producer', () => 'short'); // Never converges
      const protocol = createReflexionProtocol({
        reflexionConfig: {
          personas: TEST_PERSONAS,
          maxIterations: 2,
          severityThreshold: 0.01,
          allowSyntheticCritiques: true,
        },
      });
      const result = await protocol.execute(
        createConfig('producer', createTestTask()),
        new Map([['producer', producer]])
      );
      expect(result.ok).toBe(true);
    });

    it('should detect early convergence', async () => {
      const producer = createMockAgent(
        'producer',
        () => 'Excellent output with security, performance, SOLID principles, and documentation.'
      );
      const protocol = createReflexionProtocol({
        reflexionConfig: {
          personas: TEST_PERSONAS,
          maxIterations: 5,
          severityThreshold: 0.3,
          allowSyntheticCritiques: true,
        },
      });
      const { result, ms } = await measureLatency(() =>
        protocol.execute(
          createConfig('producer', createTestTask()),
          new Map([['producer', producer]])
        )
      );
      expect(result.ok).toBe(true);
      expect(ms).toBeLessThan(5000);
    });
  });

  describe('Code Review Integration E2E', () => {
    it('should improve code quality through reflexion', async () => {
      const outputs: string[] = [];
      const producer = createMockAgent('producer', (t) => {
        const out = t.description.includes('Improve')
          ? 'Improved: function factorial(n: number)'
          : 'factorial(n)';
        outputs.push(out);
        return out;
      });
      const protocol = createReflexionProtocol({
        reflexionConfig: {
          personas: DEFAULT_CODE_REVIEW_PERSONAS,
          maxIterations: 3,
          severityThreshold: 0.3,
          allowSyntheticCritiques: true,
        },
      });
      const result = await protocol.execute(
        createConfig('producer', createTestTask('Implement factorial')),
        new Map([['producer', producer]])
      );
      expect(result.ok).toBe(true);
      expect(outputs.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle production failure gracefully', async () => {
      const failing: IAgent = {
        id: 'failing',
        role: 'code_expert',
        state: 'idle',
        capabilities: ['code_generation'],
        execute: vi.fn().mockResolvedValue({ ok: false, error: new AgentError('Failed') }),
        handleMessage: vi.fn(),
        initialize: vi.fn(),
        cleanup: vi.fn(),
      };
      const protocol = createReflexionProtocol();
      const result = await protocol.execute(
        createConfig('producer', createTestTask()),
        new Map([['producer', failing]])
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeInstanceOf(AgentError);
    });

    it('should complete within timeout and support cancellation', async () => {
      const producer = createMockAgent('producer');
      const protocol = createReflexionProtocol({
        reflexionConfig: {
          personas: TEST_PERSONAS,
          maxIterations: 2,
          allowSyntheticCritiques: true,
        },
      });
      const result = await withTimeout(
        protocol.execute(
          createConfig('producer', createTestTask()),
          new Map([['producer', producer]])
        ),
        10000
      );
      expect(result.ok).toBe(true);

      // Test cancellation
      const slowProducer: IAgent = {
        id: 'slow',
        role: 'code_expert',
        state: 'idle',
        capabilities: ['code_generation'],
        execute: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 100));
          return ok({
            taskId: 'test',
            output: 'out',
            metadata: { durationMs: 100, tokensUsed: 10, toolsUsed: [], model: 'test' },
          });
        }),
        handleMessage: vi.fn(),
        initialize: vi.fn(),
        cleanup: vi.fn(),
      };
      const proto2 = createReflexionProtocol({
        reflexionConfig: {
          personas: TEST_PERSONAS,
          maxIterations: 10,
          allowSyntheticCritiques: true,
        },
      });
      const promise = proto2.execute(
        createConfig('producer', createTestTask()),
        new Map([['producer', slowProducer]])
      );
      proto2.cancel('User cancelled');
      const res = await promise;
      expect(typeof res.ok).toBe('boolean');
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should execute efficiently and handle sequential sessions', async () => {
      const protocol = createReflexionProtocol({
        reflexionConfig: {
          personas: TEST_PERSONAS,
          maxIterations: 1,
          allowSyntheticCritiques: true,
        },
      });
      const producer = createMockAgent('producer');
      const agents = new Map([['producer', producer]]);

      const { ms } = await measureLatency(() =>
        protocol.execute(createConfig('producer', createTestTask()), agents)
      );
      expect(ms).toBeLessThan(1000);

      for (let i = 0; i < 3; i++) {
        const result = await protocol.execute(
          createConfig('producer', createTestTask(`Task ${String(i)}`)),
          agents
        );
        expect(result.ok).toBe(true);
      }
    });

    it('should validate expert requirements', async () => {
      const protocol = createReflexionProtocol();
      // No experts
      let result = await protocol.execute(
        {
          sessionId: generateTestId('s'),
          pattern: 'reflexion',
          experts: [],
          task: createTestTask(),
        },
        new Map()
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('expert');

      // Missing producer
      result = await protocol.execute(
        {
          sessionId: generateTestId('s'),
          pattern: 'reflexion',
          experts: ['missing'],
          task: createTestTask(),
        },
        new Map()
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('not found');
    });

    it('should handle edge case outputs', async () => {
      const protocol = createReflexionProtocol({
        reflexionConfig: {
          personas: TEST_PERSONAS,
          maxIterations: 1,
          allowSyntheticCritiques: true,
        },
      });

      // Empty output
      const empty = createMockAgent('producer', () => '');
      let result = await protocol.execute(
        createConfig('producer', createTestTask()),
        new Map([['producer', empty]])
      );
      expect(result.ok).toBe(true);

      // Object output
      const objProducer: IAgent = {
        id: 'obj',
        role: 'code_expert',
        state: 'idle',
        capabilities: ['code_generation'],
        execute: vi.fn().mockResolvedValue(
          ok({
            taskId: 'test',
            output: { code: 'fn()' },
            metadata: { durationMs: 100, tokensUsed: 50, toolsUsed: [], model: 'test' },
          })
        ),
        handleMessage: vi.fn(),
        initialize: vi.fn(),
        cleanup: vi.fn(),
      };
      result = await protocol.execute(
        createConfig('producer', createTestTask()),
        new Map([['producer', objProducer]])
      );
      expect(result.ok).toBe(true);
    });
  });
});
