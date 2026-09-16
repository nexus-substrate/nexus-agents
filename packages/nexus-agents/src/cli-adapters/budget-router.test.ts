/**
 * Tests for budget-constrained task router.
 * (Source: Issue #102, arXiv:2508.21141)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BudgetRouter, createBudgetRouter, estimateRegistryCostUsd } from './budget-router.js';
import { estimateArmCostUsd } from './budget-arm-cost.js';
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
  RoutingArmId,
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
      rateLimited: false,
      exhausted: false,
      quotaExhausted: false,
      observed: true,
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

    it('rejects a task whose fastest candidate exceeds maxLatencyMs (#4907)', () => {
      // `maxLatencyMs` was Zod-validated, defaulted, and copied from routing
      // YAML — and read by nothing. No input could make it bind, so a consumer
      // reporting "no latency violations" reported the absence of a check.
      // The fastest entry in DEFAULT_COST_MODELS is codex at 1000ms.
      const task: CliTask = { content: 'Test task' };

      const result = router.checkBudget(task, { maxLatencyMs: 500 });

      expect(result.withinBudget).toBe(false);
      expect(result.adapter).toBeNull();
    });

    it('admits a task whose candidate meets maxLatencyMs (#4907)', () => {
      // The pair: 5000ms clears every profile in the table, so the constraint
      // is being evaluated rather than always failing.
      const task: CliTask = { content: 'Test task' };

      const result = router.checkBudget(task, { maxLatencyMs: 5000 });

      expect(result.withinBudget).toBe(true);
      expect(result.adapter).not.toBeNull();
    });

    it('reports estimatedLatencyMs as unmeasured when no candidate fits', () => {
      // Naming the empty case: with no adapter selected there is no latency to
      // report, and 0 would read as instantaneous.
      const task: CliTask = { content: 'Test task' };

      const result = router.checkBudget(task, { maxLatencyMs: 1 });

      expect(result.estimatedLatencyMs).toBeUndefined();
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

// ============================================================================
// Gateway arms under the task-class ceiling (#4392 increment 2, step 1)
// ============================================================================

describe('BudgetRouter task-class cost ceiling — gateway arms (#4392 inc 2)', () => {
  // Same task as the #4196 suite: code_generation, ~10k output tokens.
  // gemini (gemini-3-pro, $2/$12) ≈ $0.12 sits under a 0.2 ceiling; claude
  // (claude-fable-5, $10/$50) ≈ $0.50 sits over it. The gateway arm is the
  // subject; the vendor arms are the control that must not move.
  const ceilingTask: CliTask = { content: 'implement a function', maxTokens: 10_000 };
  const candidates: RoutingArmId[] = ['claude', 'gemini', 'api:custom-openai'];

  function makeRouter(): BudgetRouter {
    return new BudgetRouter(new Map<RoutingArmId, ICliAdapter>(), {
      taskClassCostCeilings: { code_generation: 0.2 },
    });
  }

  beforeEach(() => {
    vi.stubEnv('NEXUS_GATEWAY_COST', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('excludes an UNDECLARED gateway arm (fail-closed) and leaves vendor arms unchanged', () => {
    const r = makeRouter();
    // Before this step api:custom-openai was silently priced as opencode's
    // default model ($3/$15 ≈ $0.15) and slipped under the ceiling.
    expect(r.filterByTaskClassCeiling(ceilingTask, candidates)).toEqual(['gemini']);
    r.dispose();
  });

  it('admits a gateway declared free', () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', 'free');
    const r = makeRouter();
    expect(r.filterByTaskClassCeiling(ceilingTask, candidates)).toEqual([
      'gemini',
      'api:custom-openai',
    ]);
    r.dispose();
  });

  it('prices a gateway declared priced:<in>,<out> at that flat rate', () => {
    // $2/$10 per 1M with ~10k output → ≈ $0.10: under the 0.2 ceiling.
    vi.stubEnv('NEXUS_GATEWAY_COST', 'priced:2,10');
    const cheap = makeRouter();
    expect(cheap.filterByTaskClassCeiling(ceilingTask, candidates)).toEqual([
      'gemini',
      'api:custom-openai',
    ]);
    cheap.dispose();

    // $50/$50 per 1M with ~10k output → ≈ $0.50: over the 0.2 ceiling.
    vi.stubEnv('NEXUS_GATEWAY_COST', 'priced:50,50');
    const dear = makeRouter();
    expect(dear.filterByTaskClassCeiling(ceilingTask, candidates)).toEqual(['gemini']);
    dear.dispose();
  });

  it('a scoped declaration for another endpoint leaves this gateway undeclared', () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', 'corp-proxy=free');
    const r = makeRouter();
    expect(r.filterByTaskClassCeiling(ceilingTask, candidates)).toEqual(['gemini']);
    r.dispose();
  });
});

describe('estimateArmCostUsd (#4392 inc 2)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is undefined for an undeclared gateway arm, never 0', () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', undefined);
    expect(estimateArmCostUsd('api:custom-openai', 1_000, 1_000)).toBeUndefined();
  });

  it('is 0 for a gateway declared local', () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', 'local');
    expect(estimateArmCostUsd('api:custom-openai', 1_000, 1_000)).toBe(0);
  });

  it('is the flat rate for priced:<in>,<out>', () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', 'priced:2,10');
    // 1M input at $2 + 1M output at $10.
    expect(estimateArmCostUsd('api:custom-openai', 1_000_000, 1_000_000)).toBeCloseTo(12, 6);
  });

  it('a vendor arm is priced by the registry regardless of the declaration', () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', 'free');
    const viaArm = estimateArmCostUsd('api:google', 1_000, 1_000);
    const viaSlot = estimateRegistryCostUsd('gemini', 1_000, 1_000);
    expect(viaArm).toBe(viaSlot);
    expect(viaArm).toBeGreaterThan(0);
  });

  it('accepts an explicit env so callers need not mutate process.env', () => {
    vi.stubEnv('NEXUS_GATEWAY_COST', undefined);
    expect(
      estimateArmCostUsd('api:custom-openai', 1_000, 1_000, { NEXUS_GATEWAY_COST: 'free' })
    ).toBe(0);
  });
});
