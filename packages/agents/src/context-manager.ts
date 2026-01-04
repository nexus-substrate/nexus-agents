/**
 * @nexus-agents/agents - ContextManager
 *
 * Manages context window for agents, enforcing token budgets
 * and content priority levels. Integrates with model adapters
 * for accurate token counting.
 */

import { z } from 'zod';
import type { Result, Message, IModelAdapter, ILogger } from '@nexus-agents/core';
import { ok, err, ValidationError, createLogger } from '@nexus-agents/core';

/**
 * Priority levels for context content.
 * Higher priority content is retained longer during pruning.
 */
export const ContentPriority = {
  /** System instructions - highest priority, never pruned */
  SYSTEM: 100,
  /** Current task description and requirements */
  TASK: 80,
  /** Active working content (recent code, research) */
  ACTIVE: 60,
  /** Historical context (older messages, results) */
  HISTORY: 40,
  /** Ephemeral content (debug logs, temp data) */
  EPHEMERAL: 20,
} as const;

export type ContentPriority = (typeof ContentPriority)[keyof typeof ContentPriority];

/**
 * Budget allocation for context categories.
 * Based on PROJECT_PLAN.md recommendations.
 */
export interface ContextBudget {
  /** System instructions and project context (default: 15%) */
  system: number;
  /** Current task description and requirements (default: 20%) */
  task: number;
  /** Active working content (default: 50%) */
  active: number;
  /** Reserved for response generation (default: 15%) */
  reserved: number;
}

/**
 * Default budget allocation percentages.
 */
export const DEFAULT_BUDGET: ContextBudget = {
  system: 0.15,
  task: 0.2,
  active: 0.5,
  reserved: 0.15,
};

/**
 * Zod schema for ContextBudget validation.
 */
export const ContextBudgetSchema = z
  .object({
    system: z.number().min(0).max(1),
    task: z.number().min(0).max(1),
    active: z.number().min(0).max(1),
    reserved: z.number().min(0).max(1),
  })
  .refine((data) => data.system + data.task + data.active + data.reserved <= 1.0, {
    message: 'Budget allocations must not exceed 100%',
  });

/**
 * A piece of content in the context with its metadata.
 */
export interface ContextItem {
  /** Unique identifier for this item */
  id: string;
  /** The content (message, text, etc.) */
  content: string;
  /** Priority level for retention */
  priority: ContentPriority;
  /** Budget category this item belongs to */
  category: keyof Omit<ContextBudget, 'reserved'>;
  /** Token count for this item */
  tokenCount: number;
  /** When this item was added */
  addedAt: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for ContextManager.
 */
export interface ContextManagerConfig {
  /** Maximum context window size in tokens */
  maxTokens: number;
  /** Budget allocation (defaults to DEFAULT_BUDGET) */
  budget?: ContextBudget;
  /** Model adapter for token counting */
  adapter?: IModelAdapter;
  /** Custom logger */
  logger?: ILogger;
  /** Warning threshold (0-1) - warn when this % of budget is used */
  warningThreshold?: number;
}

/**
 * Schema for ContextManagerConfig validation.
 */
export const ContextManagerConfigSchema = z.object({
  maxTokens: z.number().positive(),
  budget: ContextBudgetSchema.optional(),
  warningThreshold: z.number().min(0).max(1).optional(),
});

/**
 * Statistics about context usage.
 */
export interface ContextStats {
  /** Total tokens currently used */
  totalTokens: number;
  /** Tokens used per category */
  categoryTokens: Record<keyof Omit<ContextBudget, 'reserved'>, number>;
  /** Number of items per category */
  itemCounts: Record<keyof Omit<ContextBudget, 'reserved'>, number>;
  /** Available tokens (total - reserved) */
  availableTokens: number;
  /** Whether any category is over budget */
  isOverBudget: boolean;
  /** Categories that are over budget */
  overBudgetCategories: Array<keyof Omit<ContextBudget, 'reserved'>>;
  /** Percentage of total capacity used */
  usagePercentage: number;
}

/**
 * Average characters per token for estimation fallback.
 * (Source: OpenAI documentation suggests ~4 chars per token for English)
 */
const CHARS_PER_TOKEN = 4;

/**
 * Manages context window for agents with token budget enforcement.
 *
 * @example
 * ```typescript
 * const manager = new ContextManager({
 *   maxTokens: 128000,
 *   adapter: claudeAdapter,
 * });
 *
 * // Add content with priority
 * await manager.add({
 *   id: 'system-prompt',
 *   content: systemPrompt,
 *   priority: ContentPriority.SYSTEM,
 *   category: 'system',
 * });
 *
 * // Check if we can add more
 * const canAdd = await manager.canAdd(newContent, 'active');
 * ```
 */
/**
 * Type alias for context item categories (excludes 'reserved').
 */
type ContextItemCategory = keyof Omit<ContextBudget, 'reserved'>;

export class ContextManager {
  private readonly maxTokens: number;
  private readonly budget: ContextBudget;
  private readonly adapter: IModelAdapter | undefined;
  private readonly logger: ILogger;
  private readonly warningThreshold: number;
  private readonly items: Map<string, ContextItem> = new Map();
  private cachedStats: ContextStats | null = null;

  /**
   * Running totals for token counts by category.
   * Updated incrementally on add/remove operations for O(1) lookups.
   */
  private categoryTokenCounts: Map<ContextItemCategory, number> = new Map([
    ['system', 0],
    ['task', 0],
    ['active', 0],
  ]);

  /**
   * Running total token count across all categories.
   * Updated incrementally on add/remove operations for O(1) lookups.
   */
  private totalTokenCount: number = 0;

  constructor(config: ContextManagerConfig) {
    const validation = ContextManagerConfigSchema.safeParse(config);
    if (!validation.success) {
      const issues = validation.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new ValidationError(`Invalid ContextManager config: ${issues}`, {
        context: { config, validationErrors: validation.error.issues },
      });
    }

    this.maxTokens = config.maxTokens;
    this.budget = config.budget ?? DEFAULT_BUDGET;
    this.adapter = config.adapter;
    this.warningThreshold = config.warningThreshold ?? 0.8;
    this.logger = config.logger ?? createLogger({ component: 'ContextManager' });
  }

  /**
   * Add an item to the context.
   *
   * @param item - The item to add (without tokenCount, will be calculated)
   * @returns Result with the added item or error
   */
  async add(
    item: Omit<ContextItem, 'tokenCount' | 'addedAt'>
  ): Promise<Result<ContextItem, ValidationError>> {
    const tokenCount = await this.countTokens(item.content);

    const fullItem: ContextItem = {
      ...item,
      tokenCount,
      addedAt: Date.now(),
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

  /**
   * Validate that adding tokens would not exceed budget constraints.
   */
  private validateBudgetConstraints(
    category: keyof Omit<ContextBudget, 'reserved'>,
    tokenCount: number
  ): ValidationError | null {
    const categoryError = this.checkCategoryBudget(category, tokenCount);
    if (categoryError !== null) {
      return categoryError;
    }

    return this.checkTotalBudget(tokenCount);
  }

  /**
   * Check if adding tokens would exceed category budget.
   */
  private checkCategoryBudget(
    category: keyof Omit<ContextBudget, 'reserved'>,
    tokenCount: number
  ): ValidationError | null {
    const categoryBudget = this.getCategoryBudget(category);
    const currentCategoryTokens = this.getCategoryTokenCount(category);
    const newTotal = currentCategoryTokens + tokenCount;

    if (newTotal > categoryBudget) {
      this.logger.warn('Item would exceed category budget', {
        category,
        itemTokens: tokenCount,
        currentTokens: currentCategoryTokens,
        budget: categoryBudget,
      });
      return new ValidationError(
        `Adding item would exceed ${category} budget: ${String(newTotal)} > ${String(categoryBudget)}`,
        { context: { category, tokenCount, categoryBudget } }
      );
    }
    return null;
  }

  /**
   * Check if adding tokens would exceed total budget.
   */
  private checkTotalBudget(tokenCount: number): ValidationError | null {
    const usableTokens = this.maxTokens * (1 - this.budget.reserved);
    const currentTotal = this.getTotalTokenCount();
    const newTotal = currentTotal + tokenCount;

    if (newTotal > usableTokens) {
      this.logger.warn('Item would exceed total budget', {
        itemTokens: tokenCount,
        currentTotal,
        usableTokens,
      });
      return new ValidationError(
        `Adding item would exceed total context budget: ${String(newTotal)} > ${String(usableTokens)}`,
        { context: { tokenCount, currentTotal, usableTokens } }
      );
    }
    return null;
  }

  /**
   * Store an item and log the operation.
   * Updates running token count totals.
   */
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

  /**
   * Remove an item from the context.
   *
   * @param id - The item ID to remove
   * @returns True if item was removed, false if not found
   */
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

  /**
   * Get an item by ID.
   *
   * @param id - The item ID
   * @returns The item or undefined
   */
  get(id: string): ContextItem | undefined {
    return this.items.get(id);
  }

  /**
   * Check if an item with the given content can be added to a category.
   *
   * @param content - The content to check
   * @param category - The target category
   * @returns True if the content can fit
   */
  async canAdd(content: string, category: keyof Omit<ContextBudget, 'reserved'>): Promise<boolean> {
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

  /**
   * Get all items in a category.
   *
   * @param category - The category to filter by
   * @returns Items in the category, sorted by priority (desc) then addedAt (asc)
   */
  getByCategory(category: keyof Omit<ContextBudget, 'reserved'>): ContextItem[] {
    return Array.from(this.items.values())
      .filter((item) => item.category === category)
      .sort((a, b) => {
        // Higher priority first
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        // Then by addedAt (older first for FIFO within same priority)
        return a.addedAt - b.addedAt;
      });
  }

  /**
   * Get all items sorted by priority (desc) then addedAt (asc).
   *
   * @returns All items sorted
   */
  getAllItems(): ContextItem[] {
    return Array.from(this.items.values()).sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.addedAt - b.addedAt;
    });
  }

  /**
   * Build messages array from context items.
   * Converts context items to Message format for model requests.
   *
   * @returns Array of messages
   */
  buildMessages(): Message[] {
    const items = this.getAllItems();
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
   * Get the system prompt from system category items.
   *
   * @returns Combined system prompt or undefined
   */
  getSystemPrompt(): string | undefined {
    const systemItems = this.getByCategory('system');
    if (systemItems.length === 0) {
      return undefined;
    }
    return systemItems.map((item) => item.content).join('\n\n');
  }

  /**
   * Get current context statistics.
   *
   * @returns Context usage statistics
   */
  getStats(): ContextStats {
    if (this.cachedStats !== null) {
      return this.cachedStats;
    }

    const categoryTokens: Record<keyof Omit<ContextBudget, 'reserved'>, number> = {
      system: 0,
      task: 0,
      active: 0,
    };

    const itemCounts: Record<keyof Omit<ContextBudget, 'reserved'>, number> = {
      system: 0,
      task: 0,
      active: 0,
    };

    for (const item of this.items.values()) {
      categoryTokens[item.category] += item.tokenCount;
      itemCounts[item.category]++;
    }

    const totalTokens = categoryTokens.system + categoryTokens.task + categoryTokens.active;
    const availableTokens = Math.floor(this.maxTokens * (1 - this.budget.reserved));
    const usagePercentage = totalTokens / availableTokens;

    const overBudgetCategories: Array<keyof Omit<ContextBudget, 'reserved'>> = [];
    const categories: Array<keyof Omit<ContextBudget, 'reserved'>> = ['system', 'task', 'active'];

    for (const category of categories) {
      const budget = this.getCategoryBudget(category);
      if (categoryTokens[category] > budget) {
        overBudgetCategories.push(category);
      }
    }

    this.cachedStats = {
      totalTokens,
      categoryTokens,
      itemCounts,
      availableTokens,
      isOverBudget: overBudgetCategories.length > 0,
      overBudgetCategories,
      usagePercentage,
    };

    return this.cachedStats;
  }

  /**
   * Get remaining tokens available in a category.
   *
   * @param category - The category to check
   * @returns Available tokens in the category
   */
  getRemainingTokens(category: keyof Omit<ContextBudget, 'reserved'>): number {
    const budget = this.getCategoryBudget(category);
    const used = this.getCategoryTokenCount(category);
    return Math.max(0, budget - used);
  }

  /**
   * Get total remaining tokens across all categories.
   *
   * @returns Available tokens in total
   */
  getTotalRemainingTokens(): number {
    const usableTokens = Math.floor(this.maxTokens * (1 - this.budget.reserved));
    return Math.max(0, usableTokens - this.getTotalTokenCount());
  }

  /**
   * Clear all items from the context.
   */
  clear(): void {
    this.items.clear();
    this.resetTokenCounts();
    this.invalidateCache();
    this.logger.info('Context cleared');
  }

  /**
   * Clear items from a specific category.
   *
   * @param category - The category to clear
   * @returns Number of items removed
   */
  clearCategory(category: keyof Omit<ContextBudget, 'reserved'>): number {
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

  /**
   * Count tokens in text using adapter or fallback estimation.
   *
   * @param text - Text to count tokens for
   * @returns Token count
   */
  async countTokens(text: string): Promise<number> {
    if (this.adapter !== undefined) {
      return await this.adapter.countTokens(text);
    }
    // Fallback: rough character-based estimation
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Get the token budget for a category.
   */
  private getCategoryBudget(category: keyof Omit<ContextBudget, 'reserved'>): number {
    return Math.floor(this.maxTokens * this.budget[category]);
  }

  /**
   * Get current token count for a category.
   * Returns cached value updated on add/remove operations (O(1)).
   */
  private getCategoryTokenCount(category: ContextItemCategory): number {
    return this.categoryTokenCounts.get(category) ?? 0;
  }

  /**
   * Get total token count across all categories.
   * Returns cached value updated on add/remove operations (O(1)).
   */
  private getTotalTokenCount(): number {
    return this.totalTokenCount;
  }

  /**
   * Invalidate cached statistics.
   */
  private invalidateCache(): void {
    this.cachedStats = null;
  }

  /**
   * Add token count to running totals for a category.
   */
  private addToTotals(category: ContextItemCategory, tokenCount: number): void {
    const current = this.categoryTokenCounts.get(category) ?? 0;
    this.categoryTokenCounts.set(category, current + tokenCount);
    this.totalTokenCount += tokenCount;
  }

  /**
   * Subtract token count from running totals for a category.
   */
  private subtractFromTotals(category: ContextItemCategory, tokenCount: number): void {
    const current = this.categoryTokenCounts.get(category) ?? 0;
    this.categoryTokenCounts.set(category, Math.max(0, current - tokenCount));
    this.totalTokenCount = Math.max(0, this.totalTokenCount - tokenCount);
  }

  /**
   * Reset all token count totals to zero.
   */
  private resetTokenCounts(): void {
    this.categoryTokenCounts.set('system', 0);
    this.categoryTokenCounts.set('task', 0);
    this.categoryTokenCounts.set('active', 0);
    this.totalTokenCount = 0;
  }

  /**
   * Check if usage exceeds warning threshold and log.
   */
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
