/**
 * Tests for BudgetFilterStage
 *
 * Covers cost estimation, budget filtering, signal generation, and statistics.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BudgetFilterStage, createBudgetStage } from './budget-stage.js';
import type { RoutingOutcome } from '../router-stage.js';
import { createRoutingContext } from '../router-stage.js';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../../../core/index.js';

// ============================================================================
// Setup
// ============================================================================

const FIXED_TIME = 1700000000000;

beforeEach(() => {
  setTimeProvider(new FixedTimeProvider(FIXED_TIME));
  return () => {
    resetTimeProvider();
  };
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeCtx(task = 'test task') {
  return createRoutingContext(task);
}

// ============================================================================
// Construction
// ============================================================================

describe('BudgetFilterStage', () => {
  it('uses default config when no overrides', () => {
    const stage = new BudgetFilterStage();
    expect(stage.name).toBe('budget-filter');
    expect(stage.priority).toBe(20);
  });

  it('merges custom config with defaults', () => {
    const stage = new BudgetFilterStage({ maxCostUsd: 5.0 });
    const stats = stage.getStats() as { config: { maxCostUsd: number } };
    expect(stats.config.maxCostUsd).toBe(5.0);
  });

  it('createBudgetStage factory returns a BudgetFilterStage', () => {
    const stage = createBudgetStage();
    expect(stage).toBeInstanceOf(BudgetFilterStage);
  });
});

// ============================================================================
// canHandle
// ============================================================================

describe('BudgetFilterStage.canHandle', () => {
  it('returns true when candidates remain', () => {
    const stage = new BudgetFilterStage();
    expect(stage.canHandle(makeCtx())).toBe(true);
  });

  it('returns false when all candidates filtered', () => {
    const stage = new BudgetFilterStage();
    const ctx = makeCtx();
    // Filter all candidates
    const filtered = new Map(ctx.filtered);
    for (const cli of ctx.availableClis) {
      filtered.set(cli, 'test');
    }
    expect(stage.canHandle({ ...ctx, filtered })).toBe(false);
  });
});

// ============================================================================
// route - budget filtering
// ============================================================================

describe('BudgetFilterStage.route', () => {
  it('allows all CLIs when budget is generous', async () => {
    const stage = new BudgetFilterStage({ maxCostUsd: 100.0 });
    const result = await stage.route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      // No candidates should be filtered
      expect(result.value.context.filtered.size).toBe(0);
      expect(result.value.continuesPipeline).toBe(true);
    }
  });

  it('filters expensive CLIs when budget is tight', async () => {
    // With very low budget, claude (most expensive) should be filtered
    const stage = new BudgetFilterStage({
      maxCostUsd: 0.001,
      enforceHardLimits: true,
    });
    const result = await stage.route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Some or all candidates may be filtered
      expect(result.value.context.filtered.size).toBeGreaterThan(0);
    }
  });

  it('does not filter when enforceHardLimits is false', async () => {
    const stage = new BudgetFilterStage({
      maxCostUsd: 0.0001,
      enforceHardLimits: false,
    });
    const result = await stage.route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.context.filtered.size).toBe(0);
    }
  });

  it('adds budget signals', async () => {
    const stage = new BudgetFilterStage({ maxCostUsd: 100.0 });
    const result = await stage.route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const signals = result.value.context.signals;
      // Should have cheapest signal
      const cheapestSignal = signals.find((s) => s.startsWith('budget:cheapest-'));
      expect(cheapestSignal).toBeDefined();
    }
  });

  it('adds trace entry', async () => {
    const stage = new BudgetFilterStage();
    const result = await stage.route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const trace = result.value.context.trace;
      expect(trace.length).toBe(1);
      expect(trace[0]?.stageName).toBe('budget-filter');
      expect(trace[0]?.action).toBe('filter');
    }
  });

  it('filters by token limit', async () => {
    const stage = new BudgetFilterStage({
      maxTokens: 1, // impossibly low
      enforceHardLimits: true,
    });
    const result = await stage.route(makeCtx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      // All should be filtered (1500 tokens > 1)
      expect(result.value.context.filtered.size).toBe(4);
      expect(result.value.continuesPipeline).toBe(false);
    }
  });
});

// ============================================================================
// recordOutcome
// ============================================================================

describe('BudgetFilterStage.recordOutcome', () => {
  it('does not throw', () => {
    const stage = new BudgetFilterStage();
    const outcome: RoutingOutcome = {
      selectedCli: 'claude',
      task: 'test',
      success: true,
      latencyMs: 1000,
    };
    expect(() => {
      stage.recordOutcome(outcome);
    }).not.toThrow();
  });
});

// ============================================================================
// getStats
// ============================================================================

describe('BudgetFilterStage.getStats', () => {
  it('returns initial stats', () => {
    const stage = new BudgetFilterStage();
    const stats = stage.getStats() as {
      routingsCount: number;
      filteredCount: number;
      filterRate: number;
    };
    expect(stats.routingsCount).toBe(0);
    expect(stats.filteredCount).toBe(0);
    expect(stats.filterRate).toBe(0);
  });

  it('updates stats after routing', async () => {
    const stage = new BudgetFilterStage({ maxCostUsd: 100.0 });
    await stage.route(makeCtx());
    const stats = stage.getStats() as { routingsCount: number };
    expect(stats.routingsCount).toBe(1);
  });
});
