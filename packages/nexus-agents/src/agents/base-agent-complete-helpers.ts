/**
 * nexus-agents/agents - BaseAgent Complete Method Helpers (Issue #306)
 *
 * Helper functions for the BaseAgent.complete() method.
 * Extracted to reduce method and file complexity in base-agent.ts.
 */

import type {
  Result,
  CompletionRequest,
  CompletionResponse,
  IModelAdapter,
} from '../core/index.js';
import { ok, err, AgentError, getTimeProvider, getRandomProvider } from '../core/index.js';
import type { ITokenBudgetTracker } from '../context/token-budget-tracker.js';
import type { IEventBus } from './collaboration/event-bus-types.js';
import { createEvent } from './collaboration/event-bus.js';
import type { ContextPruner } from './context-pruner.js';
import { ContentPriority, type ContextManager } from './context-manager.js';
import type { ResolvedPruningConfig, ContextPruningMetrics } from './base-agent-pruning-init.js';

// Re-export for convenience
export type { ContextPruningMetrics } from './base-agent-pruning-init.js';

/** Parameters for executing context pruning. */
export interface PruneContextParams {
  agentId: string;
  contextPruner: ContextPruner;
  pruningConfig: ResolvedPruningConfig;
  pruningMetrics: ContextPruningMetrics;
  eventBus: IEventBus;
}

/** Result of context pruning execution. */
export interface PruneContextResult {
  pruned: boolean;
  tokensFreed: number;
  itemsRemoved: number;
  targetReached: boolean;
}

/**
 * Executes context pruning if needed and updates metrics.
 * Returns information about the pruning operation.
 */
export async function executeContextPruning(
  params: PruneContextParams
): Promise<PruneContextResult> {
  const { agentId, contextPruner, pruningConfig, pruningMetrics, eventBus } = params;

  const shouldPrune = contextPruner.shouldPrune();
  if (!shouldPrune) {
    return { pruned: false, tokensFreed: 0, itemsRemoved: 0, targetReached: false };
  }

  const pruneResultOutcome = await contextPruner.prune();
  if (!pruneResultOutcome.ok) {
    return { pruned: false, tokensFreed: 0, itemsRemoved: 0, targetReached: false };
  }

  const pruneResult = pruneResultOutcome.value;
  const tokensFreed = pruneResult.tokensFreed;
  const itemsRemoved = pruneResult.removedItems.length;

  // Update metrics (mutates the passed object)
  pruningMetrics.totalTokensPruned += tokensFreed;
  pruningMetrics.pruningRounds += 1;
  pruningMetrics.lastPruningTokens = tokensFreed;
  pruningMetrics.lastPruningItemsRemoved = itemsRemoved;
  pruningMetrics.lastPruningTargetReached = pruneResult.targetReached;

  // Emit event for observability
  const event = createEvent('agent.context_pruned', {
    agentId,
    tokensFreed,
    itemsRemoved,
    strategy: pruningConfig.strategy,
    totalPruningRounds: pruningMetrics.pruningRounds,
  });
  eventBus.emit(event);

  return {
    pruned: true,
    tokensFreed,
    itemsRemoved,
    targetReached: pruneResult.targetReached,
  };
}

/** Parameters for budget check. */
export interface BudgetCheckParams {
  agentId: string;
  budgetTracker: ITokenBudgetTracker;
}

/** Result of budget check. Returns error if budget exceeded. */
export function checkBudgetBeforeComplete(params: BudgetCheckParams): Result<void, AgentError> {
  const { agentId, budgetTracker } = params;
  const estimatedTokens = budgetTracker.predictNextTokens();
  const budgetCheck = budgetTracker.checkBudget(estimatedTokens);
  if (!budgetCheck.allowed) {
    const ctx = {
      agentId,
      estimatedTokens,
      remainingTaskBudget: budgetCheck.remainingTaskBudget,
      remainingSessionBudget: budgetCheck.remainingSessionBudget,
    };
    const opts: { context: typeof ctx; cause?: Error } = { context: ctx };
    if (budgetCheck.error !== undefined) opts.cause = budgetCheck.error;
    return err(new AgentError('Token budget exceeded', opts));
  }
  return ok(undefined);
}

/** Parameters for model completion. */
export interface CompleteModelParams {
  agentId: string;
  adapter: IModelAdapter;
  request: CompletionRequest;
  budgetTracker: ITokenBudgetTracker;
}

/** Executes model completion and records token usage. */
export async function executeModelCompletion(
  params: CompleteModelParams
): Promise<Result<CompletionResponse, AgentError>> {
  const { agentId, adapter, request, budgetTracker } = params;

  const result = await adapter.complete(request);
  if (!result.ok) {
    return err(
      new AgentError(`Model completion failed: ${result.error.message}`, {
        context: { agentId },
        cause: result.error,
      })
    );
  }

  // Record actual token usage for EMA tracking (Issue #304)
  budgetTracker.recordUsage({
    timestamp: getTimeProvider().now(),
    inputTokens: result.value.usage?.inputTokens ?? 0,
    outputTokens: result.value.usage?.outputTokens ?? 0,
    totalTokens: result.value.usage?.totalTokens ?? 0,
  });

  return ok(result.value);
}

/** Parameters for adding a context item. */
export interface AddContextItemParams {
  contextManager: ContextManager;
  content: string;
  priority?: (typeof ContentPriority)[keyof typeof ContentPriority] | undefined;
  category?: 'system' | 'task' | 'active' | undefined;
}

/**
 * Adds content to the context manager for pruning consideration.
 * Generates a unique ID based on timestamp and random suffix.
 */
export async function addContextItem(params: AddContextItemParams): Promise<void> {
  const { contextManager, content, priority, category } = params;
  const timestamp = getTimeProvider().now().toString();
  const randomSuffix = getRandomProvider().random().toString(36).slice(2, 9);
  await contextManager.add({
    id: `ctx-${timestamp}-${randomSuffix}`,
    content,
    priority: priority ?? ContentPriority.HISTORY,
    category: category ?? 'active',
  });
}

// Re-export ContentPriority for consumers
export { ContentPriority } from './context-manager.js';
