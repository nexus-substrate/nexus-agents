/**
 * Tests for BaseAgent Complete Method Helpers
 *
 * @module agents/base-agent-complete-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executeContextPruning,
  checkBudgetBeforeComplete,
  executeModelCompletion,
  addContextItem,
} from './base-agent-complete-helpers.js';
import type {
  PruneContextParams,
  BudgetCheckParams,
  CompleteModelParams,
  AddContextItemParams,
} from './base-agent-complete-helpers.js';
import type { ContextPruningMetrics } from './base-agent-pruning-init.js';

// ============================================================================
// Helpers
// ============================================================================

function makePruningMetrics(): ContextPruningMetrics {
  return {
    totalTokensPruned: 0,
    pruningRounds: 0,
    lastPruningTokens: 0,
    lastPruningItemsRemoved: 0,
    lastPruningTargetReached: false,
  };
}

// ============================================================================
// executeContextPruning
// ============================================================================

describe('executeContextPruning', () => {
  it('returns not-pruned when shouldPrune is false', async () => {
    const params: PruneContextParams = {
      agentId: 'agent-1',
      contextPruner: {
        shouldPrune: vi.fn().mockReturnValue(false),
        prune: vi.fn(),
      } as never,
      pruningConfig: { strategy: 'sliding_window' } as never,
      pruningMetrics: makePruningMetrics(),
      eventBus: { emit: vi.fn() } as never,
    };

    const result = await executeContextPruning(params);

    expect(result.pruned).toBe(false);
    expect(result.tokensFreed).toBe(0);
  });

  it('returns not-pruned when prune fails', async () => {
    const params: PruneContextParams = {
      agentId: 'agent-1',
      contextPruner: {
        shouldPrune: vi.fn().mockReturnValue(true),
        prune: vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve({ ok: false, error: new Error('prune failed') })
          ),
      } as never,
      pruningConfig: { strategy: 'sliding_window' } as never,
      pruningMetrics: makePruningMetrics(),
      eventBus: { emit: vi.fn() } as never,
    };

    const result = await executeContextPruning(params);

    expect(result.pruned).toBe(false);
  });

  it('updates metrics and emits event on successful prune', async () => {
    const metrics = makePruningMetrics();
    const emitFn = vi.fn();
    const params: PruneContextParams = {
      agentId: 'agent-1',
      contextPruner: {
        shouldPrune: vi.fn().mockReturnValue(true),
        prune: vi.fn().mockImplementation(() =>
          Promise.resolve({
            ok: true,
            value: {
              tokensFreed: 500,
              removedItems: [{ id: 'a' }, { id: 'b' }],
              targetReached: true,
            },
          })
        ),
      } as never,
      pruningConfig: { strategy: 'sliding_window' } as never,
      pruningMetrics: metrics,
      eventBus: { emit: emitFn } as never,
    };

    const result = await executeContextPruning(params);

    expect(result.pruned).toBe(true);
    expect(result.tokensFreed).toBe(500);
    expect(result.itemsRemoved).toBe(2);
    expect(result.targetReached).toBe(true);

    // Metrics updated
    expect(metrics.totalTokensPruned).toBe(500);
    expect(metrics.pruningRounds).toBe(1);
    expect(metrics.lastPruningTokens).toBe(500);
    expect(metrics.lastPruningItemsRemoved).toBe(2);
    expect(metrics.lastPruningTargetReached).toBe(true);

    // Event emitted
    expect(emitFn).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// checkBudgetBeforeComplete
// ============================================================================

describe('checkBudgetBeforeComplete', () => {
  it('returns ok when budget is allowed', () => {
    const params: BudgetCheckParams = {
      agentId: 'agent-1',
      budgetTracker: {
        predictNextTokens: vi.fn().mockReturnValue(100),
        checkBudget: vi.fn().mockReturnValue({ allowed: true }),
      } as never,
    };

    const result = checkBudgetBeforeComplete(params);
    expect(result.ok).toBe(true);
  });

  it('returns error when budget exceeded', () => {
    const params: BudgetCheckParams = {
      agentId: 'agent-1',
      budgetTracker: {
        predictNextTokens: vi.fn().mockReturnValue(5000),
        checkBudget: vi.fn().mockReturnValue({
          allowed: false,
          remainingTaskBudget: 100,
          remainingSessionBudget: 200,
        }),
      } as never,
    };

    const result = checkBudgetBeforeComplete(params);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Token budget exceeded');
    }
  });

  it('includes cause from budget check error', () => {
    const cause = new Error('rate limit');
    const params: BudgetCheckParams = {
      agentId: 'agent-1',
      budgetTracker: {
        predictNextTokens: vi.fn().mockReturnValue(5000),
        checkBudget: vi.fn().mockReturnValue({
          allowed: false,
          remainingTaskBudget: 0,
          remainingSessionBudget: 0,
          error: cause,
        }),
      } as never,
    };

    const result = checkBudgetBeforeComplete(params);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause).toBe(cause);
    }
  });
});

// ============================================================================
// executeModelCompletion
// ============================================================================

describe('executeModelCompletion', () => {
  it('returns CompletionResponse on success', async () => {
    const response = {
      content: [{ type: 'text', text: 'Hello' }],
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      stopReason: 'end_turn',
      model: 'test-model',
    };
    const params: CompleteModelParams = {
      agentId: 'agent-1',
      adapter: {
        complete: vi.fn().mockImplementation(() => Promise.resolve({ ok: true, value: response })),
      } as never,
      request: { messages: [{ role: 'user', content: 'Hi' }] } as never,
      budgetTracker: { recordUsage: vi.fn() } as never,
    };

    const result = await executeModelCompletion(params);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content[0]).toEqual({ type: 'text', text: 'Hello' });
    }
  });

  it('records token usage on success', async () => {
    const response = {
      content: [],
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      stopReason: 'end_turn',
      model: 'test-model',
    };
    const recordUsage = vi.fn();
    const params: CompleteModelParams = {
      agentId: 'agent-1',
      adapter: {
        complete: vi.fn().mockImplementation(() => Promise.resolve({ ok: true, value: response })),
      } as never,
      request: { messages: [] },
      budgetTracker: { recordUsage } as never,
    };

    await executeModelCompletion(params);

    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      })
    );
  });

  it('returns AgentError on adapter failure', async () => {
    const params: CompleteModelParams = {
      agentId: 'agent-1',
      adapter: {
        complete: vi
          .fn()
          .mockImplementation(() => Promise.resolve({ ok: false, error: new Error('API down') })),
      } as never,
      request: { messages: [] },
      budgetTracker: { recordUsage: vi.fn() } as never,
    };

    const result = await executeModelCompletion(params);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Model completion failed');
      expect(result.error.message).toContain('API down');
    }
  });
});

// ============================================================================
// addContextItem
// ============================================================================

describe('addContextItem', () => {
  it('adds item to context manager with generated ID', async () => {
    const addFn = vi.fn().mockImplementation(() => Promise.resolve());
    const params: AddContextItemParams = {
      contextManager: { add: addFn } as never,
      content: 'Some context',
    };

    await addContextItem(params);

    expect(addFn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Some context',
        category: 'active',
      })
    );
    // ID should start with 'ctx-'
    const call = addFn.mock.calls[0]?.[0] as { id: string };
    expect(call.id).toMatch(/^ctx-/);
  });

  it('uses provided priority and category', async () => {
    const addFn = vi.fn().mockImplementation(() => Promise.resolve());
    const params: AddContextItemParams = {
      contextManager: { add: addFn } as never,
      content: 'System context',
      priority: 100, // ContentPriority.SYSTEM
      category: 'system',
    };

    await addContextItem(params);

    expect(addFn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'System context',
        category: 'system',
      })
    );
  });
});
