/**
 * nexus-agents/agents - Context Pruner Helpers
 *
 * Pure helper functions for context pruning operations.
 * Extracted from context-pruner.ts to maintain file size limits.
 *
 * @module agents/context-pruner-helpers
 */

import type { ILogger } from '../core/index.js';
import { getTimeProvider } from '../core/index.js';
import type { ContextItem, ContextBudget } from './context-manager.js';
import { createEmptyPruneResult, type PruneResult } from './pruning-strategies.js';

/** Stats shape needed for default target calculation. */
export interface ContextStats {
  availableTokens: number;
  totalTokens: number;
}

/** Interface for context manager operations needed by helpers. */
export interface IPruneManagerOperations {
  remove(id: string): boolean;
  getByCategory(category: keyof Omit<ContextBudget, 'reserved'>): ContextItem[];
}

/** Score entry for priority-weighted pruning. */
export interface PruneScore {
  item: ContextItem;
  score: number;
}

/** Options for removeItemsToTarget function. */
export interface RemoveItemsOptions {
  sortedItems: ContextItem[];
  targetTokens: number;
  categories: Array<keyof Omit<ContextBudget, 'reserved'>>;
  manager: IPruneManagerOperations;
  minItemsPerCategory: number;
  logger: ILogger;
}

/**
 * Calculate the default target tokens to free based on usage threshold.
 *
 * @param stats - Current context statistics
 * @param autoTriggerThreshold - Threshold for auto-triggering pruning (0-1)
 * @returns Number of tokens to free
 */
export function calculateDefaultTarget(stats: ContextStats, autoTriggerThreshold: number): number {
  const targetUsage = autoTriggerThreshold - 0.1;
  const targetTotal = Math.floor(stats.availableTokens * targetUsage);
  return Math.max(0, stats.totalTokens - targetTotal);
}

/**
 * Calculate priority-weighted age score for an item.
 * Lower scores indicate items that should be pruned first.
 *
 * @param item - Context item to score
 * @param now - Current timestamp in milliseconds
 * @returns Score for the item
 */
export function calculatePriorityWeightedScore(item: ContextItem, now: number): number {
  const ageHours = (now - item.addedAt) / (1000 * 60 * 60);
  return item.priority * (1 / (ageHours + 1));
}

/**
 * Score and sort items by priority-weighted age.
 *
 * @param candidates - Items to score
 * @returns Sorted array of items (lowest score first = prune first)
 */
export function scoreByPriorityWeightedAge(candidates: ContextItem[]): ContextItem[] {
  const now = getTimeProvider().now();
  const scores: PruneScore[] = candidates.map((item) => ({
    item,
    score: calculatePriorityWeightedScore(item, now),
  }));
  scores.sort((a, b) => a.score - b.score);
  return scores.map((s) => s.item);
}

/**
 * Remove items until target tokens are freed, respecting category minimums.
 *
 * @param options - Options for the removal operation
 * @returns Prune result with removed items and tokens freed
 */
export function removeItemsToTarget(options: RemoveItemsOptions): PruneResult {
  const { sortedItems, targetTokens, categories, manager, minItemsPerCategory, logger } = options;
  const categoryRemaining = new Map<keyof Omit<ContextBudget, 'reserved'>, number>();
  for (const category of categories) {
    categoryRemaining.set(category, manager.getByCategory(category).length);
  }

  const removedItems: ContextItem[] = [];
  let tokensFreed = 0;

  for (const item of sortedItems) {
    if (tokensFreed >= targetTokens) break;
    const remaining = categoryRemaining.get(item.category) ?? 0;
    if (remaining <= minItemsPerCategory) continue;

    manager.remove(item.id);
    removedItems.push(item);
    tokensFreed += item.tokenCount;
    categoryRemaining.set(item.category, remaining - 1);
  }

  const targetReached = tokensFreed >= targetTokens;
  logger.info('Pruning completed', {
    itemsRemoved: removedItems.length,
    tokensFreed,
    targetTokens,
    targetReached,
  });

  return { removedItems, summarizedItems: [], tokensFreed, targetReached };
}

/**
 * Wrap a PruneResult in a successful Result type.
 * Convenience function for consistent return types.
 *
 * @param result - The prune result to wrap
 * @returns Ok result containing the prune result
 */
export function wrapPruneResult(result: PruneResult): { ok: true; value: PruneResult } {
  return { ok: true, value: result };
}

/**
 * Create result for empty/no-op pruning operations.
 *
 * @returns Ok result with empty prune result
 */
export function createEmptyPruneOk(): { ok: true; value: PruneResult } {
  return { ok: true, value: createEmptyPruneResult() };
}
