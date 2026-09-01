/**
 * A budget must state whether what it accumulated was measured (#5240).
 *
 * `executeWithBudget` debits:
 *
 *   const actualTokens  = result.value.usage?.totalTokens ?? estimatedTokens;
 *   const actualCostUsd = result.value.costUsd ?? estimatedCostUsd;
 *
 * Both hold EITHER a measurement OR the router's own estimate, and nothing
 * downstream recorded which. `SessionBudget` accumulated the mixture, so a
 * reader of `utilizationPercent` could not tell whether it rested on reported
 * token counts or on a guess — while the log line called the whole thing
 * `actualTokens` either way.
 *
 * The two lines are NOT the same defect, which #5240 corrects #5119 on:
 * `usage` has always been populated (`subprocess-adapter` calls
 * `extractUsage`), so line 377 genuinely takes its left branch. `costUsd` had
 * no producer at all until #5241 wired the Claude CLI's `total_cost_usd`
 * through — so before that, line 378 could never take its left branch.
 *
 * Now that both branches are live, the mixture is real rather than theoretical,
 * which is why the basis has to be recorded rather than inferred.
 *
 * @module cli-adapters/budget-basis.test
 */

import { describe, it, expect, vi } from 'vitest';
import { BudgetRouter } from './budget-router.js';
import type {
  ICliAdapter,
  CliTask,
  CliResponse,
  CapabilityProfile,
  HealthStatus,
  CapacityStatus,
  ModelInfo,
} from './types.js';

/** An adapter returning exactly the response shape a case needs. */
function adapterReturning(value: CliResponse): ICliAdapter {
  const caps: CapabilityProfile = {
    reasoning: 8,
    codeGeneration: 8,
    speed: 7,
    cost: 5,
    contextWindow: 200000,
  };
  return {
    name: 'claude',
    transport: 'subprocess',
    capabilities: caps,
    execute: vi.fn().mockResolvedValue({ ok: true, value }),
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
  } as unknown as ICliAdapter;
}

function routerFor(value: CliResponse): BudgetRouter {
  return new BudgetRouter(new Map([['claude', adapterReturning(value)]]), {
    sessionBudget: { tokenBudget: 100000, costBudgetUsd: 10, resetIntervalMs: 0 },
  });
}

const TASK: CliTask = { content: 'Hello world' };

describe('SessionBudget records the basis of what it accumulated (#5240)', () => {
  it('reports zero debits on a fresh budget', () => {
    // The empty case, named. A brand-new budget has measured nothing — it must
    // not read as fully-measured coverage, which is what an absent field or a
    // default of "measured" would do.
    const router = routerFor({ text: 'x', durationMs: 1 });
    const coverage = router.getSessionBudget().coverage;

    expect(coverage.measuredTokenDebits).toBe(0);
    expect(coverage.estimatedTokenDebits).toBe(0);
    expect(coverage.measuredCostDebits).toBe(0);
    expect(coverage.estimatedCostDebits).toBe(0);
    router.dispose();
  });

  it('counts a fully-measured debit as measured on both dimensions', async () => {
    const router = routerFor({
      text: 'x',
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      costUsd: 0.004,
      durationMs: 1,
    });
    await router.executeWithBudget(TASK);
    const coverage = router.getSessionBudget().coverage;

    expect(coverage.measuredTokenDebits).toBe(1);
    expect(coverage.estimatedTokenDebits).toBe(0);
    expect(coverage.measuredCostDebits).toBe(1);
    expect(coverage.estimatedCostDebits).toBe(0);
    router.dispose();
  });

  it('separates the dimensions when usage is reported but cost is not', async () => {
    // The common case for every vendor except Claude: `extractUsage` returns
    // tokens, and no CLI reports a cost. Collapsing the two dimensions into one
    // flag would call this debit "estimated" and discard a real token
    // measurement, or "measured" and assert a cost nobody reported.
    const router = routerFor({
      text: 'x',
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      durationMs: 1,
    });
    await router.executeWithBudget(TASK);
    const coverage = router.getSessionBudget().coverage;

    expect(coverage.measuredTokenDebits).toBe(1);
    expect(coverage.estimatedTokenDebits).toBe(0);
    expect(coverage.measuredCostDebits).toBe(0);
    expect(coverage.estimatedCostDebits).toBe(1);
    router.dispose();
  });

  it('counts a debit with neither as estimated on both dimensions', async () => {
    const router = routerFor({ text: 'x', durationMs: 1 });
    await router.executeWithBudget(TASK);
    const coverage = router.getSessionBudget().coverage;

    expect(coverage.estimatedTokenDebits).toBe(1);
    expect(coverage.estimatedCostDebits).toBe(1);
    expect(coverage.measuredTokenDebits).toBe(0);
    expect(coverage.measuredCostDebits).toBe(0);
    router.dispose();
  });

  it('accumulates the mixture across calls', async () => {
    // The point of the whole change: a budget reading built from two measured
    // and one estimated debit must be able to say so.
    const router = routerFor({
      text: 'x',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      durationMs: 1,
    });
    await router.executeWithBudget(TASK);
    await router.executeWithBudget(TASK);
    const coverage = router.getSessionBudget().coverage;

    expect(coverage.measuredTokenDebits).toBe(2);
    expect(coverage.estimatedCostDebits).toBe(2);
    router.dispose();
  });

  it('clears coverage when the budget resets', async () => {
    // A reset budget has spent nothing and measured nothing. Leaving stale
    // counts would let a fresh window claim coverage it never had.
    const router = routerFor({
      text: 'x',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      durationMs: 1,
    });
    await router.executeWithBudget(TASK);
    router.resetBudget();
    const coverage = router.getSessionBudget().coverage;

    expect(coverage.measuredTokenDebits).toBe(0);
    expect(coverage.estimatedCostDebits).toBe(0);
    router.dispose();
  });
});
