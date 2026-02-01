/**
 * nexus-agents/agents - ContextManager
 *
 * Manages context window for agents, enforcing token budgets
 * and content priority levels. Integrates with model adapters
 * for accurate token counting.
 */

import type { Result, Message, IModelAdapter, ILogger } from '../core/index.js';
import {
  ok,
  err,
  ValidationError,
  createLogger,
  getTimeProvider,
  getTokenEstimator,
  formatZodError,
} from '../core/index.js';
import type {
  ContextBudget,
  ContextItem,
  ContextManagerConfig,
  ContextStats,
  ContextItemCategory,
} from './context-manager-types.js';
import { DEFAULT_BUDGET, ContextManagerConfigSchema } from './context-manager-types.js';
import {
  sortItemsByPriority,
  filterAndSortByCategory,
  calculateContextStats,
  calculateAvailableTokens,
  buildSystemPrompt,
  checkCategoryBudgetLimit,
  checkTotalBudgetLimit,
  buildMessagesFromItems,
  createCategoryBudgetError,
  createTotalBudgetError,
  addTokensToCategory,
  subtractTokensFromCategory,
  resetCategoryTokenCounts,
  createCategoryTokenCounts,
  calculateCategoryBudget,
} from './context-manager-helpers.js';

// Re-export types for backward compatibility
export type { ContextBudget, ContextItem, ContextManagerConfig, ContextStats, ContextItemCategory };
export {
  ContentPriority,
  DEFAULT_BUDGET,
  ContextManagerConfigSchema,
  ContextBudgetSchema,
  CHARS_PER_TOKEN,
} from './context-manager-types.js';

/**
 * Manages context window for agents with token budget enforcement.
 */
export class ContextManager {
  private readonly maxTokens: number;
  private readonly budget: ContextBudget;
  private readonly adapter: IModelAdapter | undefined;
  private readonly logger: ILogger;
  private readonly warningThreshold: number;
  private readonly items: Map<string, ContextItem> = new Map();
  private cachedStats: ContextStats | null = null;
  /** Running totals for token counts by category. O(1) lookups. */
  private categoryTokenCounts: Map<ContextItemCategory, number> = createCategoryTokenCounts();
  /** Running total token count across all categories. O(1) lookups. */
  private totalTokenCount: number = 0;

  constructor(config: ContextManagerConfig) {
    const validation = ContextManagerConfigSchema.safeParse(config);
    if (!validation.success) {
      throw new ValidationError(
        `Invalid ContextManager config: ${formatZodError(validation.error)}`,
        {
          context: { config, validationErrors: validation.error.issues },
        }
      );
    }

    this.maxTokens = config.maxTokens;
    this.budget = config.budget ?? DEFAULT_BUDGET;
    this.adapter = config.adapter;
    this.warningThreshold = config.warningThreshold ?? 0.8;
    this.logger = config.logger ?? createLogger({ component: 'ContextManager' });
  }

  /** Add an item to the context. Returns Result with the added item or error. */
  async add(
    item: Omit<ContextItem, 'tokenCount' | 'addedAt'>
  ): Promise<Result<ContextItem, ValidationError>> {
    const tokenCount = await this.countTokens(item.content);

    const fullItem: ContextItem = {
      ...item,
      tokenCount,
      addedAt: getTimeProvider().now(),
    };

    // Validate budget constraints
    const budgetError = this.validateBudgetConstraints(item.category, tokenCount);
    if (budgetError !== null) {
      return err(budgetError);
    }

    // Add or replace the item
    this.storeItem(item.id, fullItem);
    this.checkWarningThreshold();

    return ok(fullItem);
  }

  /** Validate that adding tokens would not exceed budget constraints. */
  private validateBudgetConstraints(
    category: ContextItemCategory,
    tokenCount: number
  ): ValidationError | null {
    const categoryError = this.checkCategoryBudget(category, tokenCount);
    if (categoryError !== null) {
      return categoryError;
    }

    return this.checkTotalBudget(tokenCount);
  }

  /** Check if adding tokens would exceed category budget. */
  private checkCategoryBudget(
    category: ContextItemCategory,
    tokenCount: number
  ): ValidationError | null {
    const result = checkCategoryBudgetLimit(
      this.getCategoryTokenCount(category),
      tokenCount,
      this.maxTokens,
      this.budget[category]
    );
    if (!result.ok) {
      this.logger.warn('Item would exceed category budget', {
        category,
        itemTokens: tokenCount,
        currentTokens: result.currentTokens,
        budget: result.budget,
      });
      return new ValidationError(createCategoryBudgetError(category, result), {
        context: { category, tokenCount, categoryBudget: result.budget },
      });
    }
    return null;
  }

  /** Check if adding tokens would exceed total budget. */
  private checkTotalBudget(tokenCount: number): ValidationError | null {
    const result = checkTotalBudgetLimit(
      this.getTotalTokenCount(),
      tokenCount,
      this.maxTokens,
      this.budget.reserved
    );
    if (!result.ok) {
      this.logger.warn('Item would exceed total budget', {
        itemTokens: tokenCount,
        currentTotal: result.currentTokens,
        usableTokens: result.budget,
      });
      return new ValidationError(createTotalBudgetError(result), {
        context: { tokenCount, currentTotal: result.currentTokens, usableTokens: result.budget },
      });
    }
    return null;
  }

  /** Store an item, update running token count totals, and log the operation. */
  private storeItem(id: string, fullItem: ContextItem): void {
    const existing = this.items.get(id);

    // Update running totals
    if (existing !== undefined) {
      // Remove old item's token count from totals
      this.subtractFromTotals(existing.category, existing.tokenCount);
    }
    // Add new item's token count to totals
    this.addToTotals(fullItem.category, fullItem.tokenCount);

    this.items.set(id, fullItem);
    this.invalidateCache();

    if (existing !== undefined) {
      this.logger.debug('Replaced existing item', { id });
    } else {
      this.logger.debug('Added new item', {
        id,
        category: fullItem.category,
        tokenCount: fullItem.tokenCount,
      });
    }
  }

  /** Remove an item from the context. Returns true if removed, false if not found. */
  remove(id: string): boolean {
    const item = this.items.get(id);
    if (item === undefined) {
      return false;
    }

    // Update running totals before removal
    this.subtractFromTotals(item.category, item.tokenCount);

    this.items.delete(id);
    this.invalidateCache();
    this.logger.debug('Removed item', { id });
    return true;
  }

  /** Get an item by ID. */
  get(id: string): ContextItem | undefined {
    return this.items.get(id);
  }

  /** Check if an item with the given content can be added to a category. */
  async canAdd(content: string, category: ContextItemCategory): Promise<boolean> {
    const tokenCount = await this.countTokens(content);
    const categoryBudget = this.getCategoryBudget(category);
    const currentCategoryTokens = this.getCategoryTokenCount(category);

    if (currentCategoryTokens + tokenCount > categoryBudget) {
      return false;
    }

    const usableTokens = this.maxTokens * (1 - this.budget.reserved);
    const currentTotal = this.getTotalTokenCount();

    return currentTotal + tokenCount <= usableTokens;
  }

  /** Get all items in a category, sorted by priority (desc) then addedAt (asc). */
  getByCategory(category: ContextItemCategory): ContextItem[] {
    return filterAndSortByCategory(Array.from(this.items.values()), category);
  }

  /** Get all items sorted by priority (desc) then addedAt (asc). */
  getAllItems(): ContextItem[] {
    return sortItemsByPriority(Array.from(this.items.values()));
  }

  /** Build messages array from context items for model requests. */
  buildMessages(): Message[] {
    return buildMessagesFromItems(this.getAllItems());
  }

  /** Get the system prompt from system category items. */
  getSystemPrompt(): string | undefined {
    return buildSystemPrompt(Array.from(this.items.values()));
  }

  /** Get current context statistics. */
  getStats(): ContextStats {
    if (this.cachedStats !== null) {
      return this.cachedStats;
    }

    this.cachedStats = calculateContextStats(this.items.values(), this.maxTokens, this.budget);
    return this.cachedStats;
  }

  /** Get remaining tokens available in a category. */
  getRemainingTokens(category: ContextItemCategory): number {
    const budget = this.getCategoryBudget(category);
    const used = this.getCategoryTokenCount(category);
    return Math.max(0, budget - used);
  }

  /** Get total remaining tokens across all categories. */
  getTotalRemainingTokens(): number {
    const usableTokens = calculateAvailableTokens(this.maxTokens, this.budget.reserved);
    return Math.max(0, usableTokens - this.getTotalTokenCount());
  }

  /** Clear all items from the context. */
  clear(): void {
    this.items.clear();
    this.resetTokenCounts();
    this.invalidateCache();
    this.logger.info('Context cleared');
  }

  /** Clear items from a specific category. Returns number of items removed. */
  clearCategory(category: ContextItemCategory): number {
    let count = 0;
    let tokensRemoved = 0;
    for (const [id, item] of this.items.entries()) {
      if (item.category === category) {
        tokensRemoved += item.tokenCount;
        this.items.delete(id);
        count++;
      }
    }
    if (count > 0) {
      // Update running totals
      this.subtractFromTotals(category, tokensRemoved);
      this.invalidateCache();
      this.logger.debug('Cleared category', { category, itemsRemoved: count });
    }
    return count;
  }

  /** Count tokens in text using adapter or fallback estimation. */
  async countTokens(text: string): Promise<number> {
    if (this.adapter !== undefined) {
      return await this.adapter.countTokens(text);
    }
    // Fallback: use unified TokenEstimator
    return getTokenEstimator().estimateText(text);
  }

  /** Get the token budget for a category. */
  private getCategoryBudget(category: ContextItemCategory): number {
    return calculateCategoryBudget(this.maxTokens, this.budget[category]);
  }

  /** Get current token count for a category. O(1). */
  private getCategoryTokenCount(category: ContextItemCategory): number {
    return this.categoryTokenCounts.get(category) ?? 0;
  }

  /** Get total token count across all categories. O(1). */
  private getTotalTokenCount(): number {
    return this.totalTokenCount;
  }

  /** Invalidate cached statistics. */
  private invalidateCache(): void {
    this.cachedStats = null;
  }

  /** Add token count to running totals for a category. */
  private addToTotals(category: ContextItemCategory, tokenCount: number): void {
    addTokensToCategory(this.categoryTokenCounts, category, tokenCount);
    this.totalTokenCount += tokenCount;
  }

  /** Subtract token count from running totals for a category. */
  private subtractFromTotals(category: ContextItemCategory, tokenCount: number): void {
    subtractTokensFromCategory(this.categoryTokenCounts, category, tokenCount);
    this.totalTokenCount = Math.max(0, this.totalTokenCount - tokenCount);
  }

  /** Reset all token count totals to zero. */
  private resetTokenCounts(): void {
    resetCategoryTokenCounts(this.categoryTokenCounts);
    this.totalTokenCount = 0;
  }

  /** Check if usage exceeds warning threshold and log. */
  private checkWarningThreshold(): void {
    const stats = this.getStats();
    if (stats.usagePercentage >= this.warningThreshold) {
      this.logger.warn('Context usage approaching limit', {
        usagePercentage: Math.round(stats.usagePercentage * 100),
        totalTokens: stats.totalTokens,
        availableTokens: stats.availableTokens,
        threshold: Math.round(this.warningThreshold * 100),
      });
    }
  }
}
