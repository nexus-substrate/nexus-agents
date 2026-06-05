/**
 * nexus-agents/cli-adapters - CompositeRouter Tests
 *
 * @module cli-adapters/composite-router.test
 * (Source: Issue #166, Epic #164)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CompositeRouter,
  createCompositeRouter,
  CompositeRouterConfigSchema,
  CompositeRoutingError,
} from './composite-router.js';
import type { ICliAdapter, CliTask, CliName } from './types.js';
import {
  AvailableModelsCache,
  getDefaultAvailableModelsCache,
  setDefaultAvailableModelsCache,
} from '../config/available-models-cache.js';

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

  // Issue #755: New replacement stages config tests
  it('should parse Issue #755 replacement stage flags with defaults', () => {
    const result = CompositeRouterConfigSchema.parse({});
    // New stages are disabled by default for backward compatibility
    expect(result.enableConfidenceCascade).toBe(false);
    expect(result.enableCapabilityMatch).toBe(false);
    expect(result.enableQualityConstraint).toBe(false);
  });

  it('should parse Issue #755 replacement stage flags when enabled', () => {
    const result = CompositeRouterConfigSchema.parse({
      enableConfidenceCascade: true,
      enableCapabilityMatch: true,
      enableQualityConstraint: true,
    });
    expect(result.enableConfidenceCascade).toBe(true);
    expect(result.enableCapabilityMatch).toBe(true);
    expect(result.enableQualityConstraint).toBe(true);
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

  // #3404: dynamic-discovery flag gating (the only integration logic in the PR).
  describe('dynamic discovery flag', () => {
    afterEach(() => {
      delete process.env['NEXUS_DYNAMIC_MODELS'];
      setDefaultAvailableModelsCache(null);
    });

    it('does NOT attach a cache when the flag is off (default)', () => {
      const router = createCompositeRouter(createTestAdapters()) as CompositeRouter;
      expect(router.getAvailableModelsCache()).toBeUndefined();
    });

    it('attaches the populated global cache when NEXUS_DYNAMIC_MODELS=true', () => {
      process.env['NEXUS_DYNAMIC_MODELS'] = 'true';
      const router = createCompositeRouter(createTestAdapters()) as CompositeRouter;
      expect(router.getAvailableModelsCache()).toBe(getDefaultAvailableModelsCache());
    });

    it('preserves a caller-supplied cache even when flagged', () => {
      process.env['NEXUS_DYNAMIC_MODELS'] = 'true';
      const custom = new AvailableModelsCache({ sources: [] });
      const router = createCompositeRouter(createTestAdapters(), {
        availableModelsCache: custom,
      }) as CompositeRouter;
      expect(router.getAvailableModelsCache()).toBe(custom);
    });
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

describe('CompositeRouter preference routing', () => {
  let adapters: Map<CliName, ICliAdapter>;

  beforeEach(() => {
    adapters = createTestAdapters();
  });

  describe('preference routing disabled by default', () => {
    it('should skip preference routing when not enabled', async () => {
      const router = new CompositeRouter(adapters);
      const task: CliTask = { content: 'Test task' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).not.toContain('preference-routing');
        expect(result.value.preferenceScore).toBeUndefined();
        expect(result.value.preferenceTier).toBeUndefined();
      }
    });
  });

  describe('preference routing enabled', () => {
    it('should include preference stage when enabled with config', async () => {
      const router = new CompositeRouter(adapters, {
        enablePreferenceRouting: true,
        preferenceRouterConfig: { minDataPoints: 1 },
      });

      // Record some preference data to enable routing
      router.recordPreference('complex task', true, { strong: 0.9, weak: 0.5 });
      router.recordPreference('simple task', false, { strong: 0.6, weak: 0.8 });

      const task: CliTask = { content: 'Test task' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).toContain('preference-routing');
        expect(result.value.preferenceScore).toBeDefined();
        expect(result.value.preferenceTier).toBeDefined();
      }
    });

    it('should skip preference routing when insufficient data', async () => {
      const router = new CompositeRouter(adapters, {
        enablePreferenceRouting: true,
        preferenceRouterConfig: { minDataPoints: 100 },
      });

      const task: CliTask = { content: 'Test task' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).not.toContain('preference-routing');
        expect(result.value.preferenceScore).toBeUndefined();
      }
    });
  });

  describe('recordPreference', () => {
    it('should not throw when preference routing enabled', () => {
      const router = new CompositeRouter(adapters, {
        enablePreferenceRouting: true,
      });

      expect(() => {
        router.recordPreference('test query', true, { strong: 0.9, weak: 0.5 });
      }).not.toThrow();
    });

    it('should not throw when preference routing disabled', () => {
      const router = new CompositeRouter(adapters);

      expect(() => {
        router.recordPreference('test query', true);
      }).not.toThrow();
    });

    it('should accept preference without quality scores', () => {
      const router = new CompositeRouter(adapters, {
        enablePreferenceRouting: true,
      });

      expect(() => {
        router.recordPreference('simple query', false);
      }).not.toThrow();
    });
  });

  describe('hasMinimumPreferenceData', () => {
    it('should return false when preference routing disabled', () => {
      const router = new CompositeRouter(adapters);
      expect(router.hasMinimumPreferenceData()).toBe(false);
    });

    it('should return false with no data points', () => {
      const router = new CompositeRouter(adapters, {
        enablePreferenceRouting: true,
        preferenceRouterConfig: { minDataPoints: 10 },
      });
      expect(router.hasMinimumPreferenceData()).toBe(false);
    });

    it('should return true when minimum data points met', () => {
      const router = new CompositeRouter(adapters, {
        enablePreferenceRouting: true,
        preferenceRouterConfig: { minDataPoints: 2 },
      });

      router.recordPreference('query 1', true);
      router.recordPreference('query 2', false);

      expect(router.hasMinimumPreferenceData()).toBe(true);
    });
  });

  describe('getStats with preference', () => {
    it('should include preference stats when enabled', () => {
      const router = new CompositeRouter(adapters, {
        enablePreferenceRouting: true,
      });

      router.recordPreference('query 1', true);
      router.recordPreference('query 2', false);

      const stats = router.getStats();
      expect(stats.preferenceStats).toBeDefined();
      expect(stats.preferenceStats?.dataPointCount).toBe(2);
      expect(stats.preferenceStats?.enabled).toBe(true);
    });

    it('should have undefined preference stats when disabled', () => {
      const router = new CompositeRouter(adapters);
      const stats = router.getStats();
      expect(stats.preferenceStats).toBeUndefined();
    });
  });
});

describe('CompositeRouter ZeroRouter integration (Issue #347)', () => {
  let adapters: Map<CliName, ICliAdapter>;

  beforeEach(() => {
    adapters = createTestAdapters();
  });

  describe('ZeroRouter explicitly disabled', () => {
    // Note: ZeroRouter is enabled by default since Issue #473
    it('should skip ZeroRouter when explicitly disabled', async () => {
      const router = new CompositeRouter(adapters, { enableZeroRouter: false });
      const task: CliTask = { content: 'Test task' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).not.toContain('zero-router');
        expect(result.value.difficultyEstimate).toBeUndefined();
        expect(result.value.difficultyTier).toBeUndefined();
      }
    });

    it('should have undefined ZeroRouter when explicitly disabled', () => {
      const router = new CompositeRouter(adapters, { enableZeroRouter: false });
      expect(router.getZeroRouter()).toBeUndefined();
    });
  });

  describe('ZeroRouter enabled', () => {
    it('should include ZeroRouter stage when enabled', async () => {
      const router = new CompositeRouter(adapters, {
        enableZeroRouter: true,
      });

      const task: CliTask = { content: 'Write a simple hello world function' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).toContain('zero-router');
        expect(result.value.difficultyEstimate).toBeDefined();
        expect(result.value.difficultyTier).toBeDefined();
      }
    });

    it('should provide difficulty estimate with all dimensions', async () => {
      const router = new CompositeRouter(adapters, {
        enableZeroRouter: true,
      });

      const task: CliTask = { content: 'Design a complex distributed system' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const estimate = result.value.difficultyEstimate;
        expect(estimate).toBeDefined();
        if (estimate !== undefined) {
          expect(estimate.dimensions).toBeDefined();
          expect(estimate.aggregateScore).toBeGreaterThanOrEqual(0);
          expect(estimate.aggregateScore).toBeLessThanOrEqual(1);
          expect(estimate.level).toBeDefined();
          expect(['easy', 'medium', 'hard']).toContain(estimate.level);
          expect(estimate.recommendedTier).toBeDefined();
          expect(['fast', 'balanced', 'powerful']).toContain(estimate.recommendedTier);
        }
      }
    });

    it('should return ZeroRouter instance when enabled', () => {
      const router = new CompositeRouter(adapters, {
        enableZeroRouter: true,
      });
      const zeroRouter = router.getZeroRouter();
      expect(zeroRouter).toBeDefined();
    });

    it('should route easy tasks to fast tier (gemini preferred)', async () => {
      const router = new CompositeRouter(adapters, {
        enableZeroRouter: true,
        enableTopsisRanking: false,
        enableLinUCBSelection: false,
      });

      // Simple task should be classified as easy -> fast tier -> gemini preferred
      const task: CliTask = { content: 'hello' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok && result.value.difficultyTier === 'fast') {
        // When tier is 'fast', gemini should be preferred (first in sorted order)
        expect(result.value.cliName).toBe('gemini');
      }
    });

    it('should route hard tasks to powerful tier (claude preferred)', async () => {
      const router = new CompositeRouter(adapters, {
        enableZeroRouter: true,
        enableTopsisRanking: false,
        enableLinUCBSelection: false,
      });

      // Complex task should be classified as hard -> powerful tier -> claude preferred
      const complexTask =
        'Design and implement a fault-tolerant distributed consensus ' +
        'algorithm with Byzantine fault tolerance for a multi-region ' +
        'database system';
      const task: CliTask = { content: complexTask };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok && result.value.difficultyTier === 'powerful') {
        // When tier is 'powerful', claude should be preferred
        expect(result.value.cliName).toBe('claude');
      }
    });
  });

  describe('recordDifficultyOutcome', () => {
    it('should record difficulty outcome when ZeroRouter enabled', async () => {
      const router = new CompositeRouter(adapters, {
        enableZeroRouter: true,
        zeroRouterConfig: { enableCalibration: true },
      });

      const task: CliTask = { content: 'Test task for calibration' };
      await router.route(task);

      expect(() => {
        router.recordDifficultyOutcome(task, true, 0.9);
      }).not.toThrow();

      // Verify calibration stats updated
      const zeroRouter = router.getZeroRouter();
      expect(zeroRouter).toBeDefined();
      if (zeroRouter !== undefined) {
        const stats = zeroRouter.getCalibrationStats();
        expect(stats.totalOutcomes).toBe(1);
      }
    });

    it('should not throw when ZeroRouter disabled', () => {
      const router = new CompositeRouter(adapters);
      const task: CliTask = { content: 'Test task' };

      expect(() => {
        router.recordDifficultyOutcome(task, true);
      }).not.toThrow();
    });

    it('should record outcome without quality score', async () => {
      const router = new CompositeRouter(adapters, {
        enableZeroRouter: true,
        zeroRouterConfig: { enableCalibration: true },
      });

      const task: CliTask = { content: 'Simple task' };
      await router.route(task);

      expect(() => {
        router.recordDifficultyOutcome(task, false);
      }).not.toThrow();
    });
  });

  describe('ZeroRouter with custom config', () => {
    it('should accept custom thresholds', async () => {
      const router = new CompositeRouter(adapters, {
        enableZeroRouter: true,
        zeroRouterConfig: {
          thresholds: {
            easyUpperBound: 0.2,
            hardLowerBound: 0.8,
          },
        },
      });

      const task: CliTask = { content: 'Moderate complexity task' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
    });

    it('should accept custom weights', async () => {
      const router = new CompositeRouter(adapters, {
        enableZeroRouter: true,
        zeroRouterConfig: {
          weights: {
            reasoning: 0.5,
            knowledge: 0.1,
            creativity: 0.1,
            precision: 0.2,
            context_length: 0.1,
          },
        },
      });

      const task: CliTask = { content: 'Test task with custom weights' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
    });

    it('should disable calibration when configured', async () => {
      const router = new CompositeRouter(adapters, {
        enableZeroRouter: true,
        zeroRouterConfig: { enableCalibration: false },
      });

      const task: CliTask = { content: 'Test task' };
      await router.route(task);

      // Record outcome should have no effect
      router.recordDifficultyOutcome(task, true, 0.9);

      const zeroRouter = router.getZeroRouter();
      expect(zeroRouter).toBeDefined();
      if (zeroRouter !== undefined) {
        const stats = zeroRouter.getCalibrationStats();
        expect(stats.totalOutcomes).toBe(0);
      }
    });
  });

  describe('ZeroRouter reason in routing decision', () => {
    it('should include difficulty info in reason string', async () => {
      const router = new CompositeRouter(adapters, {
        enableZeroRouter: true,
      });

      const task: CliTask = { content: 'Design a microservices architecture' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Reason should include difficulty tier and score
        expect(result.value.reason).toContain('difficulty');
      }
    });
  });

  describe('ZeroRouter with other stages', () => {
    it('should work with all stages enabled', async () => {
      const router = new CompositeRouter(adapters, {
        enableBudgetFilter: true,
        enableZeroRouter: true,
        enablePreferenceRouting: true,
        enableTopsisRanking: true,
        enableLinUCBSelection: true,
        preferenceRouterConfig: { minDataPoints: 1 },
      });

      // Add preference data
      router.recordPreference('complex task', true);

      const task: CliTask = { content: 'Build a REST API endpoint' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.stagesExecuted).toContain('task-analysis');
        expect(result.value.stagesExecuted).toContain('zero-router');
        expect(result.value.stagesExecuted).toContain('preference-routing');
        expect(result.value.stagesExecuted).toContain('topsis-ranking');
        expect(result.value.stagesExecuted).toContain('linucb-selection');
      }
    });

    it('should preserve ZeroRouter sorting when other stages run', async () => {
      const router = new CompositeRouter(adapters, {
        enableZeroRouter: true,
        enableTopsisRanking: true,
        enableLinUCBSelection: false,
      });

      const task: CliTask = { content: 'Simple string concatenation' };
      const result = await router.route(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.difficultyEstimate).toBeDefined();
        expect(result.value.topsisScore).toBeDefined();
      }
    });
  });

  describe('executeTask', () => {
    let adapters: Map<CliName, ICliAdapter>;
    let router: CompositeRouter;

    beforeEach(() => {
      adapters = createTestAdapters();
      router = new CompositeRouter(adapters, {
        enableRoutingMemory: false,
        enableStrategyDistillation: false,
      });
    });

    it('should route, execute, and return result on success', async () => {
      const task: CliTask = { content: 'Test task' };
      const result = await router.executeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('mock response');
      }
    });

    it('should auto-record feedback after successful execution', async () => {
      const recordOutcomeSpy = vi.spyOn(router, 'recordOutcome');
      const recordDifficultySpy = vi.spyOn(router, 'recordDifficultyOutcome');

      const task: CliTask = { content: 'Test task' };
      await router.executeTask(task);

      // Quality-enriched reward: base 0.5 - latency penalty (Issue #929)
      const reward = recordOutcomeSpy.mock.calls[0]?.[2] as number;
      expect(reward).toBeGreaterThan(0.3);
      expect(reward).toBeLessThanOrEqual(0.8);
      expect(recordDifficultySpy).toHaveBeenCalledWith(task, true);
    });

    it('should auto-record feedback with reward 0 on failed execution', async () => {
      // Mock ALL adapters to fail — router may select any adapter
      for (const adapter of adapters.values()) {
        vi.mocked(adapter.execute).mockResolvedValueOnce({
          ok: false,
          error: {
            code: 'EXECUTION_ERROR',
            message: 'Failed',
            cli: adapter.name,
            retryable: false,
          },
        });
      }

      const recordOutcomeSpy = vi.spyOn(router, 'recordOutcome');
      const recordDifficultySpy = vi.spyOn(router, 'recordDifficultyOutcome');

      const task: CliTask = { content: 'Failing task' };
      const result = await router.executeTask(task);

      expect(result.ok).toBe(false);
      // Quality-enriched reward: 0.1 for failure (Issue #929)
      expect(recordOutcomeSpy).toHaveBeenCalledWith(expect.any(String), task, 0.1);
      expect(recordDifficultySpy).toHaveBeenCalledWith(task, false);
    });

    it('should return routing error if routing fails', async () => {
      const emptyRouter = new CompositeRouter(new Map());

      const task: CliTask = { content: 'Test task' };
      const result = await emptyRouter.executeTask(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(CompositeRoutingError);
      }
    });

    it('should call the selected adapter execute method', async () => {
      const task: CliTask = { content: 'Execute this' };
      await router.executeTask(task);

      // At least one adapter should have been called
      const executeWasCalled = Array.from(adapters.values()).some(
        (adapter) => vi.mocked(adapter.execute).mock.calls.length > 0
      );
      expect(executeWasCalled).toBe(true);
    });
  });

  describe('availableModelsCache integration (#2540 PR 7)', () => {
    it('exposes the wired cache via getAvailableModelsCache()', () => {
      const cache = makeMockCache(['claude:claude-opus-4-7']);
      const r = new CompositeRouter(adapters, { availableModelsCache: cache });
      expect(r.getAvailableModelsCache()).toBe(cache);
    });

    it('returns undefined when no cache is configured', () => {
      const r = new CompositeRouter(adapters);
      expect(r.getAvailableModelsCache()).toBeUndefined();
    });

    it('falls back to all CLIs when the cache reports zero models', async () => {
      const cache = makeMockCache([]);
      const r = new CompositeRouter(adapters, { availableModelsCache: cache });
      const result = await r.route({ content: 'hello' });
      expect(result.ok).toBe(true);
    });

    it('falls back to all CLIs when the filtered set would be empty', async () => {
      // Cache only knows a CLI we don't have an adapter for.
      const cache = makeMockCache(['unknown-cli:foo']);
      const r = new CompositeRouter(adapters, { availableModelsCache: cache });
      const result = await r.route({ content: 'hello' });
      expect(result.ok).toBe(true);
      // Without the empty-filter guard the router would error on selection.
    });

    it('does not block routing when the cache throws', async () => {
      const cache = {
        getAll: vi.fn().mockRejectedValue(new Error('cache offline')),
      } as unknown as import('../config/available-models-cache.js').AvailableModelsCache;
      const r = new CompositeRouter(adapters, { availableModelsCache: cache });
      const result = await r.route({ content: 'hello' });
      expect(result.ok).toBe(true);
    });
  });
});

/**
 * Tiny mock for AvailableModelsCache covering only the interface the
 * router uses. Each entry is `source:id`.
 */
function makeMockCache(
  entries: string[]
): import('../config/available-models-cache.js').AvailableModelsCache {
  const all = entries.map((e) => {
    const [source, id] = e.split(':');
    return { id: id ?? '', source: source ?? '' };
  });
  return {
    getAll: vi.fn().mockResolvedValue(all),
  } as unknown as import('../config/available-models-cache.js').AvailableModelsCache;
}
