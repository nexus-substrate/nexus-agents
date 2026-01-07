/**
 * Tests for budget-constrained task router.
 * (Source: Issue #102, arXiv:2508.21141)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BudgetRouter, createBudgetRouter } from './budget-router.js';
import type {
  ICliAdapter,
  CliTask,
  CliResponse,
  CliName,
  CapabilityProfile,
  HealthStatus,
  CapacityStatus,
  ModelInfo,
  BudgetRouterOptions,
} from './types.js';

// Mock adapter factory
function createMockAdapter(
  name: CliName,
  capabilities: Partial<CapabilityProfile> = {}
): ICliAdapter {
  const defaultCaps: CapabilityProfile = {
    reasoning: 8,
    contextWindow: 200000,
    codeGeneration: 8,
    speed: 7,
    cost: 5,
    ...capabilities,
  };

  return {
    name,
    transport: 'subprocess',
    capabilities: defaultCaps,
    execute: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        text: 'Test response',
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
        costUsd: 0.001,
        durationMs: 1000,
      } satisfies CliResponse,
    }),
    healthCheck: vi.fn().mockResolvedValue({
      healthy: true,
      version: '1.0.0',
      versionStatus: 'supported',
      lastChecked: new Date(),
    } satisfies HealthStatus),
    getCapacity: vi.fn().mockResolvedValue({
      remainingTokens: 100000,
      remainingRequests: 100,
      resetTime: new Date(Date.now() + 3600000),
      utilizationPercent: 10,
      exhausted: false,
    } satisfies CapacityStatus),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getModelInfo: vi.fn().mockReturnValue({
      id: 'test-model',
      name: 'Test Model',
      contextWindow: 200000,
    } satisfies ModelInfo),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

describe('BudgetRouter', () => {
  let adapters: Map<CliName, ICliAdapter>;
  let router: BudgetRouter;

  beforeEach(() => {
    adapters = new Map([
      ['claude', createMockAdapter('claude', { cost: 5 })],
      ['gemini', createMockAdapter('gemini', { cost: 9 })],
      ['codex', createMockAdapter('codex', { cost: 7 })],
    ]);

    router = new BudgetRouter(adapters, {
      sessionBudget: {
        tokenBudget: 10000,
        costBudgetUsd: 1.0,
        resetIntervalMs: 0, // Disable auto-reset for tests
      },
      warningThresholds: {
        info: 50,
        warning: 75,
        critical: 90,
      },
      enforceHardLimits: true,
    });
  });

  afterEach(() => {
    router.dispose();
  });

  describe('getSessionBudget', () => {
    it('should return initial budget state', () => {
      const budget = router.getSessionBudget();

      expect(budget.tokenBudget).toBe(10000);
      expect(budget.costBudgetUsd).toBe(1.0);
      expect(budget.tokensUsed).toBe(0);
      expect(budget.costSpentUsd).toBe(0);
      expect(budget.tokensRemaining).toBe(10000);
      expect(budget.costRemainingUsd).toBe(1.0);
      expect(budget.utilizationPercent).toBe(0);
    });
  });

  describe('updateBudget', () => {
    it('should update token usage', () => {
      router.updateBudget({ tokens: 1000 });

      const budget = router.getSessionBudget();
      expect(budget.tokensUsed).toBe(1000);
      expect(budget.tokensRemaining).toBe(9000);
    });

    it('should update cost usage', () => {
      router.updateBudget({ costUsd: 0.5 });

      const budget = router.getSessionBudget();
      expect(budget.costSpentUsd).toBe(0.5);
      expect(budget.costRemainingUsd).toBe(0.5);
    });

    it('should accumulate multiple updates', () => {
      router.updateBudget({ tokens: 1000, costUsd: 0.1 });
      router.updateBudget({ tokens: 2000, costUsd: 0.2 });

      const budget = router.getSessionBudget();
      expect(budget.tokensUsed).toBe(3000);
      expect(budget.costSpentUsd).toBeCloseTo(0.3, 10);
    });
  });

  describe('resetBudget', () => {
    it('should reset all usage to zero', () => {
      router.updateBudget({ tokens: 5000, costUsd: 0.5 });
      router.resetBudget();

      const budget = router.getSessionBudget();
      expect(budget.tokensUsed).toBe(0);
      expect(budget.costSpentUsd).toBe(0);
      expect(budget.tokensRemaining).toBe(10000);
      expect(budget.costRemainingUsd).toBe(1.0);
    });
  });

  describe('checkBudget', () => {
    it('should return within budget for small task', () => {
      const task: CliTask = { content: 'Hello world' };

      const result = router.checkBudget(task);

      expect(result.withinBudget).toBe(true);
      expect(result.adapter).not.toBeNull();
      expect(result.estimatedTokens).toBeGreaterThan(0);
      expect(result.estimatedCostUsd).toBeGreaterThan(0);
    });

    it('should prefer cheaper adapters', () => {
      const task: CliTask = { content: 'Hello world' };

      const result = router.checkBudget(task);

      // Gemini has highest cost efficiency (9), should be selected
      expect(result.adapter?.name).toBe('gemini');
    });

    it('should generate warnings when approaching budget limits', () => {
      // Use 60% of budget
      router.updateBudget({ tokens: 6000 });

      const task: CliTask = { content: 'Test task' };
      const result = router.checkBudget(task);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.constraint === 'tokens')).toBe(true);
    });

    it('should reject tasks exceeding per-task budget', () => {
      const task: CliTask = { content: 'A'.repeat(100000) }; // Large task

      const result = router.checkBudget(task, { maxTokens: 100 });

      expect(result.withinBudget).toBe(false);
    });

    it('should project budget after task', () => {
      const task: CliTask = { content: 'Test task' };

      const result = router.checkBudget(task);

      expect(result.projectedBudget.tokensUsed).toBeGreaterThan(0);
      expect(result.projectedBudget.tokensRemaining).toBeLessThan(10000);
    });
  });

  describe('routeWithBudget', () => {
    it('should return success for task within budget', async () => {
      const task: CliTask = { content: 'Hello world' };

      const result = await router.routeWithBudget(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.withinBudget).toBe(true);
        expect(result.value.adapter).not.toBeNull();
      }
    });

    it('should return error when budget exceeded with hard limits', async () => {
      // Exhaust token budget
      router.updateBudget({ tokens: 9900 });

      const task: CliTask = { content: 'A'.repeat(1000) }; // Needs more tokens

      const result = await router.routeWithBudget(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('BUDGET_EXCEEDED');
        expect(result.error.constraint).toBeDefined();
        expect(result.error.suggestion).toBeDefined();
      }
    });

    it('should allow over-budget when hard limits disabled', async () => {
      const softRouter = new BudgetRouter(adapters, {
        sessionBudget: {
          tokenBudget: 100,
          costBudgetUsd: 0.001,
          resetIntervalMs: 0,
        },
        enforceHardLimits: false,
      });

      const task: CliTask = { content: 'Test task that exceeds budget' };

      const result = await softRouter.routeWithBudget(task);

      expect(result.ok).toBe(true);
      softRouter.dispose();
    });
  });

  describe('executeWithBudget', () => {
    it('should execute task and update budget', async () => {
      const task: CliTask = { content: 'Hello world' };

      const result = await router.executeWithBudget(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.text).toBe('Test response');
        expect(result.value.budgetAfter.tokensUsed).toBeGreaterThan(0);
      }
    });

    it('should reject task when budget exceeded', async () => {
      // Exhaust budget
      router.updateBudget({ tokens: 9900, costUsd: 0.99 });

      const task: CliTask = { content: 'A'.repeat(1000) };

      const result = await router.executeWithBudget(task);

      expect(result.ok).toBe(false);
    });

    it('should use actual usage from response', async () => {
      const task: CliTask = { content: 'Hello world' };

      await router.executeWithBudget(task);

      const budget = router.getSessionBudget();
      // Mock returns 300 total tokens
      expect(budget.tokensUsed).toBe(300);
    });
  });

  describe('warning thresholds', () => {
    it('should generate info warning at 50% utilization', () => {
      router.updateBudget({ tokens: 4000 }); // 40%

      const task: CliTask = { content: 'A'.repeat(1500) }; // ~15%
      const result = router.checkBudget(task);

      const infoWarnings = result.warnings.filter((w) => w.level === 'info');
      expect(infoWarnings.length).toBeGreaterThanOrEqual(1);
    });

    it('should generate warning at 75% utilization', () => {
      router.updateBudget({ tokens: 7000 }); // 70%

      const task: CliTask = { content: 'A'.repeat(1000) }; // ~10%
      const result = router.checkBudget(task);

      const warnings = result.warnings.filter((w) => w.level === 'warning');
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    });

    it('should generate critical warning at 90% utilization', () => {
      router.updateBudget({ tokens: 8500 }); // 85%

      const task: CliTask = { content: 'A'.repeat(1000) }; // ~10%
      const result = router.checkBudget(task);

      const criticalWarnings = result.warnings.filter((w) => w.level === 'critical');
      expect(criticalWarnings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('createBudgetRouter', () => {
    it('should create a BudgetRouter instance', () => {
      const router = createBudgetRouter(adapters);
      expect(router).toBeInstanceOf(BudgetRouter);
      (router as BudgetRouter).dispose();
    });

    it('should accept custom options', () => {
      const options: BudgetRouterOptions = {
        sessionBudget: {
          tokenBudget: 50000,
          costBudgetUsd: 5.0,
        },
      };

      const router = createBudgetRouter(adapters, options);
      const budget = router.getSessionBudget();

      expect(budget.tokenBudget).toBe(50000);
      expect(budget.costBudgetUsd).toBe(5.0);
      (router as BudgetRouter).dispose();
    });
  });
});
