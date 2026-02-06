/**
 * Tests for BaseAgent Complete Flow Helpers
 *
 * @module agents/base-agent-complete-flow.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateAdapter,
  executePreCompletionChecks,
  runModelCompletion,
} from './base-agent-complete-flow.js';
import type { CompleteFlowContext } from './base-agent-complete-flow.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeBudgetTracker(allowed = true) {
  return {
    predictNextTokens: vi.fn().mockReturnValue(1000),
    checkBudget: vi.fn().mockReturnValue({ allowed }),
    recordUsage: vi.fn(),
    getRemainingBudget: vi.fn().mockReturnValue(50_000),
  } as never;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeCtx(overrides: Partial<CompleteFlowContext> = {}) {
  return {
    agentId: 'agent-1',
    adapter: {
      providerId: 'test',
      complete: vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          value: {
            content: 'response',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          },
        })
      ),
    },
    budgetTracker: makeBudgetTracker(),
    contextPruningEnabled: false,
    contextPruner: undefined,
    pruningConfig: { enabled: false },
    pruningMetrics: { totalPruned: 0 },
    eventBus: { emit: vi.fn() },
    ...overrides,
  } as unknown as CompleteFlowContext;
}

// ============================================================================
// validateAdapter
// ============================================================================

describe('validateAdapter', () => {
  it('returns adapter when configured', () => {
    const ctx = makeCtx();
    const result = validateAdapter(ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeDefined();
    }
  });

  it('returns error when adapter is undefined', () => {
    const ctx = makeCtx({ adapter: undefined });
    const result = validateAdapter(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No model adapter configured');
    }
  });

  it('includes agentId in error context', () => {
    const ctx = makeCtx({ adapter: undefined, agentId: 'test-agent' });
    const result = validateAdapter(ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.context).toHaveProperty('agentId', 'test-agent');
    }
  });
});

// ============================================================================
// executePreCompletionChecks
// ============================================================================

describe('executePreCompletionChecks', () => {
  it('passes when budget available and pruning disabled', async () => {
    const ctx = makeCtx();
    const result = await executePreCompletionChecks(ctx);

    expect(result.ok).toBe(true);
  });

  it('fails when budget exhausted', async () => {
    const ctx = makeCtx({
      budgetTracker: makeBudgetTracker(false),
    });

    const result = await executePreCompletionChecks(ctx);

    expect(result.ok).toBe(false);
  });

  it('invokes pruning when enabled with pruner', async () => {
    const pruner = {
      shouldPrune: vi.fn().mockReturnValue(false),
      prune: vi.fn().mockImplementation(() => Promise.resolve({ pruned: 0 })),
    };
    const ctx = makeCtx({
      contextPruningEnabled: true,
      contextPruner: pruner as never,
    });

    const result = await executePreCompletionChecks(ctx);

    expect(result.ok).toBe(true);
  });

  it('skips pruning when disabled', async () => {
    const pruner = { prune: vi.fn() };
    const ctx = makeCtx({
      contextPruningEnabled: false,
      contextPruner: pruner as never,
    });

    await executePreCompletionChecks(ctx);

    expect(pruner.prune).not.toHaveBeenCalled();
  });

  it('skips pruning when pruner is undefined', async () => {
    const ctx = makeCtx({
      contextPruningEnabled: true,
      contextPruner: undefined,
    });

    const result = await executePreCompletionChecks(ctx);

    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// runModelCompletion
// ============================================================================

describe('runModelCompletion', () => {
  it('delegates to executeModelCompletion', async () => {
    const adapter = {
      providerId: 'test',
      complete: vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          value: {
            content: 'Hello',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          },
        })
      ),
    } as never;

    const ctx = makeCtx({ adapter, budgetTracker: makeBudgetTracker() });
    const request = { messages: [{ role: 'user', content: 'Hi' }] } as never;

    const result = await runModelCompletion(ctx, adapter, request);

    expect(result.ok).toBe(true);
  });
});
