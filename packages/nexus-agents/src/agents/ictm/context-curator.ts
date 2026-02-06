/**
 * nexus-agents/agents - Context Curator
 *
 * Curates context for ICTM sub-agents by filtering, ranking,
 * and trimming context items to fit within token budgets.
 *
 * Prevents long-horizon degradation by ensuring each sub-agent
 * receives only the most relevant context subset.
 *
 * @see Issue #756
 * @module agents/ictm/context-curator
 */

import type { ContextFilter, ContextPruneStrategy, CuratedContextItem } from './ictm-types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Decay half-life for recency scoring (30 minutes in ms) */
const RECENCY_HALF_LIFE_MS = 30 * 60 * 1000;

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

/**
 * Score an item by recency using exponential decay.
 * More recent items score higher.
 */
export function scoreByRecency(item: CuratedContextItem, nowMs: number): number {
  const age = Math.max(0, nowMs - item.timestamp);
  return Math.exp((-age * Math.LN2) / RECENCY_HALF_LIFE_MS);
}

/**
 * Score an item by importance (uses pre-assigned relevance).
 */
export function scoreByImportance(item: CuratedContextItem): number {
  return item.relevance;
}

/**
 * Score an item using hybrid strategy (weighted average of recency + importance).
 */
export function scoreByHybrid(item: CuratedContextItem, nowMs: number): number {
  const recency = scoreByRecency(item, nowMs);
  const importance = scoreByImportance(item);
  return 0.4 * recency + 0.6 * importance;
}

/**
 * Get the scoring function for a given strategy.
 */
function getScoringFn(
  strategy: ContextPruneStrategy,
  nowMs: number
): (item: CuratedContextItem) => number {
  switch (strategy) {
    case 'recency':
      return (item) => scoreByRecency(item, nowMs);
    case 'importance':
      return (item) => scoreByImportance(item);
    case 'hybrid':
      return (item) => scoreByHybrid(item, nowMs);
  }
}

// =============================================================================
// CURATION
// =============================================================================

/**
 * Filter items by relevance threshold.
 */
function filterByRelevance(
  items: readonly CuratedContextItem[],
  threshold: number
): CuratedContextItem[] {
  return items.filter((item) => item.relevance >= threshold);
}

/**
 * Filter out history items when not requested.
 */
function filterHistory(items: CuratedContextItem[], includeHistory: boolean): CuratedContextItem[] {
  if (includeHistory) {
    return items;
  }
  return items.filter((item) => item.source !== 'history');
}

/**
 * Rank items by the given strategy, returning a new sorted array (descending score).
 */
function rankItems(
  items: CuratedContextItem[],
  strategy: ContextPruneStrategy,
  nowMs: number
): CuratedContextItem[] {
  const scoreFn = getScoringFn(strategy, nowMs);
  return [...items].sort((a, b) => scoreFn(b) - scoreFn(a));
}

/**
 * Trim ranked items to fit within the token budget.
 * Returns items that fit, preserving rank order.
 */
function trimToTokenBudget(ranked: CuratedContextItem[], maxTokens: number): CuratedContextItem[] {
  const result: CuratedContextItem[] = [];
  let usedTokens = 0;

  for (const item of ranked) {
    if (usedTokens + item.tokenCount > maxTokens) {
      continue;
    }
    result.push(item);
    usedTokens += item.tokenCount;
  }

  return result;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Curated context result.
 */
export interface CurationResult {
  /** Selected context items, ordered by score (descending) */
  items: CuratedContextItem[];
  /** Total tokens used */
  totalTokens: number;
  /** Number of items filtered out */
  filteredCount: number;
  /** Number of items trimmed for token budget */
  trimmedCount: number;
}

/**
 * Curate context items according to a context filter.
 *
 * Pipeline: filter by history → filter by relevance → rank by strategy → trim to budget.
 *
 * @param items - All available context items
 * @param filter - Context filter configuration from ICTM config
 * @param nowMs - Current timestamp in ms (defaults to Date.now())
 * @returns Curated result with selected items and stats
 */
export function curateContext(
  items: readonly CuratedContextItem[],
  filter: ContextFilter,
  nowMs?: number
): CurationResult {
  const now = nowMs ?? Date.now();
  const threshold = filter.relevanceThreshold;

  // Step 1: Filter history
  const afterHistory = filterHistory([...items], filter.includeHistory);

  // Step 2: Filter by relevance
  const afterRelevance = filterByRelevance(afterHistory, threshold);
  const relevanceFiltered = afterHistory.length - afterRelevance.length;

  // Step 3: Rank by strategy
  const ranked = rankItems(afterRelevance, filter.pruneStrategy, now);

  // Step 4: Trim to token budget
  const trimmed = trimToTokenBudget(ranked, filter.maxTokens);
  const trimmedCount = ranked.length - trimmed.length;

  const totalTokens = trimmed.reduce((sum, item) => sum + item.tokenCount, 0);
  const totalFiltered = items.length - afterHistory.length + relevanceFiltered;

  return {
    items: trimmed,
    totalTokens,
    filteredCount: totalFiltered,
    trimmedCount,
  };
}

/**
 * Estimate token count for a text string.
 * Uses a simple char/4 heuristic (same as preference-router-extractor).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Create a context item from raw text.
 */
export function createContextItem(
  id: string,
  content: string,
  source: CuratedContextItem['source'],
  relevance: number,
  timestamp?: number
): CuratedContextItem {
  return {
    id,
    content,
    tokenCount: estimateTokens(content),
    timestamp: timestamp ?? Date.now(),
    relevance,
    source,
  };
}
