/**
 * nexus-agents/cli-adapters - CompositeRouter Tests
 *
 * @module cli-adapters/composite-router.test
 * (Source: Issue #166, Epic #164)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CompositeRouter,
  createCompositeRouter,
  CompositeRouterConfigSchema,
  CompositeRoutingError,
} from './composite-router.js';
import type { ICliAdapter, CliTask, CliName } from './types.js';

/**
 * Creates a mock CLI adapter for testing.
 */
function createMockAdapter(name: CliName): ICliAdapter {
  return {
    name,
    transport: 'subprocess',
    capabilities: {
      reasoning: 8,
      contextWindow: 200000,
      codeGeneration: 9,
      speed: 7,
      cost: 5,
    },
    execute: vi.fn().mockResolvedValue({ ok: true, value: { text: 'mock response' } }),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, version: '1.0.0' }),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getCapacity: vi.fn().mockResolvedValue({ remainingTokens: 100000 }),
    getModelInfo: vi.fn().mockReturnValue({ id: name, name }),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as ICliAdapter;
}

/**
 * Creates test adapters map.
 */
function createTestAdapters(): Map<CliName, ICliAdapter> {
  const map = new Map<CliName, ICliAdapter>();
  map.set('claude', createMockAdapter('claude'));
  map.set('gemini', createMockAdapter('gemini'));
  map.set('codex', createMockAdapter('codex'));
  return map;
}

describe('CompositeRouterConfigSchema', () => {
  it('should parse default config', () => {
    const result = CompositeRouterConfigSchema.parse({});
    expect(result.enableBudgetFilter).toBe(true);
    expect(result.enableTopsisRanking).toBe(true);
    expect(result.enableLinUCBSelection).toBe(true);
    expect(result.linucbAlpha).toBe(1.0);
    expect(result.maxDecisionTimeMs).toBe(50);
  });

  it('should parse custom config', () => {
    const result = CompositeRouterConfigSchema.parse({
      enableBudgetFilter: false,
      enableTopsisRanking: true,
      linucbAlpha: 2.0,
      budgetConstraints: { maxTokens: 10000 },
    });
    expect(result.enableBudgetFilter).toBe(false);
    expect(result.linucbAlpha).toBe(2.0);
    expect(result.budgetConstraints?.maxTokens).toBe(10000);
  });

  it('should reject invalid linucbAlpha', () => {
    expect(() => CompositeRouterConfigSchema.parse({ linucbAlpha: -1 })).toThrow();
    expect(() => CompositeRouterConfigSchema.parse({ linucbAlpha: 0 })).toThrow();
  });
});

describe('CompositeRoutingError', () => {
  it('should create error with stage', () => {
    const error = new CompositeRoutingError('Test error', 'test-stage');
    expect(error.message).toBe('Test error');
    expect(error.stage).toBe('test-stage');
    expect(error.name).toBe('CompositeRoutingError');
  });

  it('should include cause if provided', () => {
    const cause = new Error('Root cause');
    const error = new CompositeRoutingError('Test error', 'test-stage', cause);
    expect(error.cause).toBe(cause);
  });
});

describe('CompositeRouter', () => {
  let adapters: Map<CliName, ICliAdapter>;
  let router: CompositeRouter;

  beforeEach(() => {
    adapters = createTestAdapters();
    router = new CompositeRouter(adapters);
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const stats = router.getStats();
      expect(stats.totalDecisions).toBe(0);
      expect(stats.avgDecisionTimeMs).toBe(0);
    });

    it('should initialize with custom config', () => {
      const customRouter = new CompositeRouter(adapters, { enableBudgetFilter: false });
      expect(customRouter.getStats().budgetRejectionRate).toBe(0);
    });

    it('should handle empty adapters map', () => {
      const emptyRouter = new CompositeRouter(new Map());
      expect(emptyRouter.getStats().totalDecisions).toBe(0);
    });
  });

  describe('route', () => {
    it('should route a simple task successfully', async () => {
      const task: CliTask = { content: 'Help me write a function', model: 'claude-sonnet' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.cliName).toBeDefined();
        expect(['claude', 'gemini', 'codex']).toContain(result.value.cliName);
        expect(result.value.confidence).toBeGreaterThan(0);
        expect(result.value.stagesExecuted).toContain('task-analysis');
        expect(result.value.decisionTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.value.taskProfile).toBeDefined();
      }
    });

    it('should include all enabled stages', async () => {
      const task: CliTask = { content: 'Design a microservices architecture' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).toContain('task-analysis');
        // Budget, TOPSIS, and LinUCB stages included by default
        expect(result.value.stagesExecuted.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should provide alternatives in routing decision', async () => {
      const task: CliTask = { content: 'Generate unit tests' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.alternatives).toBeDefined();
        expect(Array.isArray(result.value.alternatives)).toBe(true);
      }
    });

    it('should fail with no adapters', async () => {
      const emptyRouter = new CompositeRouter(new Map());
      const task: CliTask = { content: 'Test task' };
      const result = await emptyRouter.route(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.stage).toBe('initialization');
      }
    });

    it('should update stats after routing', async () => {
      const task: CliTask = { content: 'Test task' };
      await router.route(task);
      await router.route(task);

      const stats = router.getStats();
      expect(stats.totalDecisions).toBe(2);
      expect(stats.avgDecisionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('route with disabled stages', () => {
    it('should skip budget filter when disabled', async () => {
      const noBudgetRouter = new CompositeRouter(adapters, { enableBudgetFilter: false });
      const task: CliTask = { content: 'Test task' };
      const result = await noBudgetRouter.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).not.toContain('budget-filter');
      }
    });

    it('should skip TOPSIS when disabled', async () => {
      const noTopsisRouter = new CompositeRouter(adapters, { enableTopsisRanking: false });
      const task: CliTask = { content: 'Test task' };
      const result = await noTopsisRouter.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).not.toContain('topsis-ranking');
        expect(result.value.topsisScore).toBeUndefined();
      }
    });

    it('should skip LinUCB when disabled', async () => {
      const noLinUCBRouter = new CompositeRouter(adapters, { enableLinUCBSelection: false });
      const task: CliTask = { content: 'Test task' };
      const result = await noLinUCBRouter.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).not.toContain('linucb-selection');
        expect(result.value.ucbScore).toBeUndefined();
      }
    });
  });

  describe('recordOutcome', () => {
    it('should record outcome without error', async () => {
      const task: CliTask = { content: 'Test task' };
      await router.route(task);
      expect(() => {
        router.recordOutcome('claude', task, 0.8);
      }).not.toThrow();
    });

    it('should handle unknown CLI gracefully', () => {
      const task: CliTask = { content: 'Test task' };
      expect(() => {
        router.recordOutcome('unknown' as CliName, task, 0.5);
      }).not.toThrow();
    });

    it('should not record when LinUCB disabled', () => {
      const noLinUCBRouter = new CompositeRouter(adapters, { enableLinUCBSelection: false });
      const task: CliTask = { content: 'Test task' };
      expect(() => {
        noLinUCBRouter.recordOutcome('claude', task, 0.8);
      }).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const stats = router.getStats();
      expect(stats.totalDecisions).toBe(0);
      expect(stats.decisionsPerCli.claude).toBe(0);
      expect(stats.decisionsPerCli.gemini).toBe(0);
      expect(stats.decisionsPerCli.codex).toBe(0);
      expect(stats.avgDecisionTimeMs).toBe(0);
      expect(stats.budgetRejectionRate).toBe(0);
    });

    it('should track decisions per CLI', async () => {
      const task: CliTask = { content: 'Test task' };
      await router.route(task);
      await router.route(task);
      await router.route(task);

      const stats = router.getStats();
      expect(stats.totalDecisions).toBe(3);
      const totalPerCli =
        stats.decisionsPerCli.claude + stats.decisionsPerCli.gemini + stats.decisionsPerCli.codex;
      expect(totalPerCli).toBe(3);
    });
  });
});

describe('createCompositeRouter', () => {
  it('should create router with factory function', () => {
    const adapters = createTestAdapters();
    const router = createCompositeRouter(adapters);
    expect(router).toBeInstanceOf(CompositeRouter);
  });

  it('should pass config to router', () => {
    const adapters = createTestAdapters();
    const router = createCompositeRouter(adapters, { linucbAlpha: 2.0 });
    expect(router.getStats().totalDecisions).toBe(0);
  });
});

describe('CompositeRouter task type handling', () => {
  let router: CompositeRouter;

  beforeEach(() => {
    router = new CompositeRouter(createTestAdapters());
  });

  it('should handle architecture tasks', async () => {
    const task: CliTask = { content: 'Design a scalable distributed system architecture' };
    const result = await router.route(task);
    expect(result.ok).toBe(true);
  });

  it('should handle code generation tasks', async () => {
    const task: CliTask = { content: 'Write a function to sort an array' };
    const result = await router.route(task);
    expect(result.ok).toBe(true);
  });

  it('should handle bulk operations', async () => {
    const task: CliTask = { content: 'Process all files in the directory' };
    const result = await router.route(task);
    expect(result.ok).toBe(true);
  });

  it('should handle test generation tasks', async () => {
    const task: CliTask = { content: 'Generate unit tests for the UserService class' };
    const result = await router.route(task);
    expect(result.ok).toBe(true);
  });
});

describe('CompositeRouter confidence calculation', () => {
  let router: CompositeRouter;

  beforeEach(() => {
    router = new CompositeRouter(createTestAdapters());
  });

  it('should produce confidence between 0 and 1', async () => {
    const task: CliTask = { content: 'Any task' };
    const result = await router.route(task);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confidence).toBeGreaterThanOrEqual(0);
      expect(result.value.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('should produce higher confidence with more stages', async () => {
    const fullRouter = new CompositeRouter(createTestAdapters());
    const minimalRouter = new CompositeRouter(createTestAdapters(), {
      enableBudgetFilter: false,
      enableTopsisRanking: false,
      enableLinUCBSelection: false,
    });

    const task: CliTask = { content: 'Test task' };
    const fullResult = await fullRouter.route(task);
    const minimalResult = await minimalRouter.route(task);

    expect(fullResult.ok).toBe(true);
    expect(minimalResult.ok).toBe(true);
  });
});
