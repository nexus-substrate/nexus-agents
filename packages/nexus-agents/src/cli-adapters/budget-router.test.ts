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

      // Claude and Gemini are tied at cost 6 (DEFAULT_CAPABILITIES, not mock);
      // Codex is 5. Any of the tied-highest adapters is acceptable.
      expect(['claude', 'gemini']).toContain(result.adapter?.name);
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

// ============================================================================
// Per-task-class cost ceiling (#4196)
// ============================================================================

// Partial-mock the registry pricing lookup so the fail-closed (missing
// pricing) branch is testable; all other exports stay real.
vi.mock('../config/model-config-helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/model-config-helpers.js')>();
  return { ...actual, getModelPricing: vi.fn(actual.getModelPricing) };
});

describe('BudgetRouter task-class cost ceiling (#4196)', () => {
  // 'implement a function' → detectTaskCategory → code_generation.
  // Registry pricing of per-CLI default models (in-tree-data):
  //   claude → claude-fable-5 ($10/$50 per 1M)
  //   gemini → gemini-3-pro   ($2/$12 per 1M)
  //   codex  → gpt-5.5        ($5/$30 per 1M)
  // With maxTokens 10_000 output: claude ≈ $0.50, codex ≈ $0.30, gemini ≈ $0.12.
  const ceilingTask: CliTask = { content: 'implement a function', maxTokens: 10_000 };
  const candidates: CliName[] = ['claude', 'gemini', 'codex'];

  function makeAdapters(): Map<CliName, ICliAdapter> {
    return new Map<CliName, ICliAdapter>([
      ['claude', createMockAdapter('claude')],
      ['gemini', createMockAdapter('gemini')],
      ['codex', createMockAdapter('codex')],
    ]);
  }

  afterEach(async () => {
    // Re-point the partial mock at the real implementation after each test.
    const helpers = await import('../config/model-config-helpers.js');
    const actual = await vi.importActual<typeof import('../config/model-config-helpers.js')>(
      '../config/model-config-helpers.js'
    );
    vi.mocked(helpers.getModelPricing).mockImplementation(actual.getModelPricing);
  });

  it('returns candidates unchanged when no ceilings are configured (default OFF)', () => {
    const r = new BudgetRouter(makeAdapters());
    expect(r.filterByTaskClassCeiling(ceilingTask, candidates)).toEqual(candidates);
    r.dispose();
  });

  it('returns candidates unchanged when the task class has no ceiling', () => {
    const r = new BudgetRouter(makeAdapters(), {
      taskClassCostCeilings: { architecture: 0.001 },
    });
    expect(r.filterByTaskClassCeiling(ceilingTask, candidates)).toEqual(candidates);
    r.dispose();
  });

  it('returns candidates unchanged when the task matches no category', () => {
    const r = new BudgetRouter(makeAdapters(), {
      taskClassCostCeilings: { code_generation: 0.001 },
    });
    const vague: CliTask = { content: 'hello there', maxTokens: 10_000 };
    expect(r.filterByTaskClassCeiling(vague, candidates)).toEqual(candidates);
    r.dispose();
  });

  it('excludes candidates whose registry-priced estimate exceeds the class ceiling', () => {
    const r = new BudgetRouter(makeAdapters(), {
      taskClassCostCeilings: { code_generation: 0.2 },
    });
    expect(r.filterByTaskClassCeiling(ceilingTask, candidates)).toEqual(['gemini']);
    r.dispose();
  });

  it('keeps every candidate under a generous ceiling', () => {
    const r = new BudgetRouter(makeAdapters(), {
      taskClassCostCeilings: { code_generation: 5.0 },
    });
    expect(r.filterByTaskClassCeiling(ceilingTask, candidates)).toEqual(candidates);
    r.dispose();
  });

  it('fails CLOSED when pricing is missing — candidate excluded, no return-all fallback', async () => {
    const helpers = await import('../config/model-config-helpers.js');
    vi.mocked(helpers.getModelPricing).mockReturnValue(undefined);
    const r = new BudgetRouter(makeAdapters(), {
      taskClassCostCeilings: { code_generation: 5.0 },
    });
    // Every candidate has unknown cost → ALL fail the ceiling (fail-closed),
    // NOT the filterByPreferenceTier-style return-all-candidates pattern.
    expect(r.filterByTaskClassCeiling(ceilingTask, candidates)).toEqual([]);
    r.dispose();
  });
});
