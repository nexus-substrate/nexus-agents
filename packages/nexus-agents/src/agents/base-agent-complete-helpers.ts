/**
 * nexus-agents/agents - BaseAgent Complete Method Helpers (Issue #306)
 *
 * Helper functions for the BaseAgent.complete() method.
 * Extracted to reduce method and file complexity in base-agent.ts.
 */

import type { IEventBus } from './collaboration/event-bus-types.js';
import { createEvent } from './collaboration/event-bus.js';
import type { ContextPruner } from './context-pruner.js';
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
