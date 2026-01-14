/**
 * nexus-agents/agents - ContextManager Helpers
 *
 * Pure utility functions for context management operations.
 */

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
 * @param category - Category to check
 * @param tokenCount - Tokens to add
 * @param currentCategoryTokens - Current tokens in category
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
