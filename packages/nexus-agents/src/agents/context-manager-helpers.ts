/**
 * nexus-agents/agents - ContextManager Helpers
 *
 * Pure utility functions for context management operations.
 */

import type { Message } from '../core/index.js';
import type {
  ContextItem,
  ContextItemCategory,
  ContextStats,
  ContextBudget,
} from './context-manager-types.js';

/**
 * Sort context items by priority (desc) then addedAt (asc).
 *
 * @param items - Items to sort
 * @returns Sorted items array
 */
export function sortItemsByPriority(items: ContextItem[]): ContextItem[] {
  return [...items].sort((a, b) => {
    // Higher priority first
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    // Then by addedAt (older first for FIFO within same priority)
    return a.addedAt - b.addedAt;
  });
}

/**
 * Filter items by category and sort by priority.
 *
 * @param items - All items
 * @param category - Category to filter by
 * @returns Filtered and sorted items
 */
export function filterAndSortByCategory(
  items: ContextItem[],
  category: ContextItemCategory
): ContextItem[] {
  return sortItemsByPriority(items.filter((item) => item.category === category));
}

/**
 * Calculate token counts per category from items.
 *
 * @param items - Context items to analyze
 * @returns Token counts by category
 */
export function calculateCategoryTokens(
  items: Iterable<ContextItem>
): Record<ContextItemCategory, number> {
  const categoryTokens: Record<ContextItemCategory, number> = {
    system: 0,
    task: 0,
    active: 0,
  };

  for (const item of items) {
    categoryTokens[item.category] += item.tokenCount;
  }

  return categoryTokens;
}

/**
 * Calculate item counts per category.
 *
 * @param items - Context items to analyze
 * @returns Item counts by category
 */
export function calculateItemCounts(
  items: Iterable<ContextItem>
): Record<ContextItemCategory, number> {
  const itemCounts: Record<ContextItemCategory, number> = {
    system: 0,
    task: 0,
    active: 0,
  };

  for (const item of items) {
    itemCounts[item.category]++;
  }

  return itemCounts;
}

/**
 * Calculate the total tokens from category token counts.
 *
 * @param categoryTokens - Token counts by category
 * @returns Total token count
 */
export function calculateTotalTokens(categoryTokens: Record<ContextItemCategory, number>): number {
  return categoryTokens.system + categoryTokens.task + categoryTokens.active;
}

/**
 * Calculate available tokens (total minus reserved).
 *
 * @param maxTokens - Maximum token budget
 * @param reserved - Reserved percentage (0-1)
 * @returns Available tokens
 */
export function calculateAvailableTokens(maxTokens: number, reserved: number): number {
  return Math.floor(maxTokens * (1 - reserved));
}

/**
 * Get categories that are over budget.
 *
 * @param categoryTokens - Current token counts by category
 * @param maxTokens - Maximum token budget
 * @param budget - Budget allocation
 * @returns Array of over-budget categories
 */
export function getOverBudgetCategories(
  categoryTokens: Record<ContextItemCategory, number>,
  maxTokens: number,
  budget: ContextBudget
): ContextItemCategory[] {
  const categories: ContextItemCategory[] = ['system', 'task', 'active'];
  const overBudget: ContextItemCategory[] = [];

  for (const category of categories) {
    const categoryBudget = Math.floor(maxTokens * budget[category]);
    if (categoryTokens[category] > categoryBudget) {
      overBudget.push(category);
    }
  }

  return overBudget;
}

/**
 * Calculate complete context statistics.
 *
 * @param items - Context items
 * @param maxTokens - Maximum token budget
 * @param budget - Budget allocation
 * @returns Complete context statistics
 */
export function calculateContextStats(
  items: Iterable<ContextItem>,
  maxTokens: number,
  budget: ContextBudget
): ContextStats {
  // Convert to array to allow multiple iterations
  const itemArray = Array.isArray(items) ? items : Array.from(items);

  const categoryTokens = calculateCategoryTokens(itemArray);
  const itemCounts = calculateItemCounts(itemArray);
  const totalTokens = calculateTotalTokens(categoryTokens);
  const availableTokens = calculateAvailableTokens(maxTokens, budget.reserved);
  const usagePercentage = totalTokens / availableTokens;
  const overBudgetCategories = getOverBudgetCategories(categoryTokens, maxTokens, budget);

  return {
    totalTokens,
    categoryTokens,
    itemCounts,
    availableTokens,
    isOverBudget: overBudgetCategories.length > 0,
    overBudgetCategories,
    usagePercentage,
  };
}

/**
 * Build system prompt from system category items.
 *
 * @param items - All context items
 * @returns Combined system prompt or undefined
 */
export function buildSystemPrompt(items: ContextItem[]): string | undefined {
  const systemItems = filterAndSortByCategory(items, 'system');
  if (systemItems.length === 0) {
    return undefined;
  }
  return systemItems.map((item) => item.content).join('\n\n');
}

/**
 * Result of a budget check operation.
 */
export interface BudgetCheckResult {
  /** Whether the budget check passed */
  ok: boolean;
  /** Current token count (for category or total) */
  currentTokens: number;
  /** Budget limit */
  budget: number;
  /** New total after adding tokens */
  newTotal: number;
}

/**
 * Check if adding tokens would exceed category budget.
 *
 * @param currentCategoryTokens - Current tokens in category
 * @param tokenCount - Tokens to add
 * @param maxTokens - Max context tokens
 * @param budgetAllocation - Budget allocation for category (0-1)
 * @returns Budget check result
 */
export function checkCategoryBudgetLimit(
  currentCategoryTokens: number,
  tokenCount: number,
  maxTokens: number,
  budgetAllocation: number
): BudgetCheckResult {
  const categoryBudget = Math.floor(maxTokens * budgetAllocation);
  const newTotal = currentCategoryTokens + tokenCount;

  return {
    ok: newTotal <= categoryBudget,
    currentTokens: currentCategoryTokens,
    budget: categoryBudget,
    newTotal,
  };
}

/**
 * Check if adding tokens would exceed total budget.
 *
 * @param currentTotal - Current total tokens
 * @param tokenCount - Tokens to add
 * @param maxTokens - Max context tokens
 * @param reserved - Reserved percentage (0-1)
 * @returns Budget check result
 */
export function checkTotalBudgetLimit(
  currentTotal: number,
  tokenCount: number,
  maxTokens: number,
  reserved: number
): BudgetCheckResult {
  const usableTokens = calculateAvailableTokens(maxTokens, reserved);
  const newTotal = currentTotal + tokenCount;

  return {
    ok: newTotal <= usableTokens,
    currentTokens: currentTotal,
    budget: usableTokens,
    newTotal,
  };
}

/**
 * Build messages array from context items.
 * Converts context items to Message format for model requests.
 * System items are skipped as they should be in systemPrompt.
 *
 * @param items - Sorted context items
 * @returns Array of messages
 */
export function buildMessagesFromItems(items: ContextItem[]): Message[] {
  const messages: Message[] = [];

  for (const item of items) {
    // Skip system items as they go in systemPrompt
    if (item.category === 'system') {
      continue;
    }

    // Parse content to determine role
    // By default, treat as user message
    messages.push({
      role: 'user',
      content: item.content,
    });
  }

  return messages;
}

/**
 * Create error message for category budget exceeded.
 */
export function createCategoryBudgetError(
  category: ContextItemCategory,
  result: BudgetCheckResult
): string {
  return `Adding item would exceed ${category} budget: ${String(result.newTotal)} > ${String(result.budget)}`;
}

/**
 * Create error message for total budget exceeded.
 */
export function createTotalBudgetError(result: BudgetCheckResult): string {
  return `Adding item would exceed total context budget: ${String(result.newTotal)} > ${String(result.budget)}`;
}

/**
 * Update token counts in a category map (add operation).
 */
export function addTokensToCategory(
  categoryTokenCounts: Map<ContextItemCategory, number>,
  category: ContextItemCategory,
  tokenCount: number
): void {
  const current = categoryTokenCounts.get(category) ?? 0;
  categoryTokenCounts.set(category, current + tokenCount);
}

/**
 * Update token counts in a category map (subtract operation).
 */
export function subtractTokensFromCategory(
  categoryTokenCounts: Map<ContextItemCategory, number>,
  category: ContextItemCategory,
  tokenCount: number
): void {
  const current = categoryTokenCounts.get(category) ?? 0;
  categoryTokenCounts.set(category, Math.max(0, current - tokenCount));
}

/**
 * Reset all category token counts to zero.
 */
export function resetCategoryTokenCounts(
  categoryTokenCounts: Map<ContextItemCategory, number>
): void {
  categoryTokenCounts.set('system', 0);
  categoryTokenCounts.set('task', 0);
  categoryTokenCounts.set('active', 0);
}

/**
 * Create initial category token counts map.
 */
export function createCategoryTokenCounts(): Map<ContextItemCategory, number> {
  return new Map([
    ['system', 0],
    ['task', 0],
    ['active', 0],
  ]);
}

/**
 * Calculate category budget in tokens.
 */
export function calculateCategoryBudget(maxTokens: number, budgetAllocation: number): number {
  return Math.floor(maxTokens * budgetAllocation);
}
