/**
 * @nexus-agents/agents - ContextPruner
 *
 * Handles context pruning with priority-based content retention,
 * summarization triggers, and various history pruning strategies.
 */

import { z } from 'zod';
import type { Result, IModelAdapter, ILogger, Message } from '@nexus-agents/core';
import { ok, err, ValidationError, createLogger } from '@nexus-agents/core';
import {
  ContextManager,
  ContentPriority,
  type ContextItem,
  type ContextBudget,
} from './context-manager.js';

/**
 * Strategy for pruning context when budget is exceeded.
 */
export const PruningStrategy = {
  /** Remove oldest items first (FIFO) */
  OLDEST_FIRST: 'oldest_first',
  /** Remove lowest priority items first */
  LOWEST_PRIORITY: 'lowest_priority',
  /** Remove items by combining priority and age */
  PRIORITY_WEIGHTED_AGE: 'priority_weighted_age',
  /** Summarize old content instead of removing */
  SUMMARIZE: 'summarize',
} as const;

export type PruningStrategy = (typeof PruningStrategy)[keyof typeof PruningStrategy];

/**
 * Result of a pruning operation.
 */
export interface PruneResult {
  /** Items that were removed */
  removedItems: ContextItem[];
  /** Items that were summarized (if using SUMMARIZE strategy) */
  summarizedItems: ContextItem[];
  /** New summary item (if content was summarized) */
  summaryItem?: ContextItem;
  /** Tokens freed by pruning */
  tokensFreed: number;
  /** Whether pruning achieved the target */
  targetReached: boolean;
}

/**
 * Configuration for ContextPruner.
 */
export interface ContextPrunerConfig {
  /** The context manager to prune */
  contextManager: ContextManager;
  /** Model adapter for summarization (optional) */
  adapter?: IModelAdapter;
  /** Custom logger */
  logger?: ILogger;
  /** Default pruning strategy */
  defaultStrategy?: PruningStrategy;
  /** Minimum items to keep in each category */
  minItemsPerCategory?: number;
  /** Items with priority >= this are never pruned */
  protectedPriority?: ContentPriority;
  /** Token threshold that triggers automatic pruning (0-1) */
  autoTriggerThreshold?: number;
}

/**
 * Schema for ContextPrunerConfig validation.
 */
export const ContextPrunerConfigSchema = z.object({
  defaultStrategy: z
    .enum([
      PruningStrategy.OLDEST_FIRST,
      PruningStrategy.LOWEST_PRIORITY,
      PruningStrategy.PRIORITY_WEIGHTED_AGE,
      PruningStrategy.SUMMARIZE,
    ])
    .optional(),
  minItemsPerCategory: z.number().int().min(0).optional(),
  protectedPriority: z.number().min(0).max(100).optional(),
  autoTriggerThreshold: z.number().min(0).max(1).optional(),
});

/**
 * Options for a pruning operation.
 */
export interface PruneOptions {
  /** Target tokens to free */
  targetTokens?: number;
  /** Strategy to use (overrides default) */
  strategy?: PruningStrategy;
  /** Categories to prune (defaults to all non-protected) */
  categories?: Array<keyof Omit<ContextBudget, 'reserved'>>;
  /** Prompt for summarization (if using SUMMARIZE strategy) */
  summarizationPrompt?: string;
}

/**
 * Score for an item used in priority-weighted pruning.
 */
interface PruneScore {
  item: ContextItem;
  score: number;
}

/**
 * Default minimum items to keep per category.
 */
const DEFAULT_MIN_ITEMS = 1;

/**
 * Default threshold that triggers auto-pruning.
 */
const DEFAULT_AUTO_TRIGGER = 0.9;

/**
 * Default summarization prompt.
 */
const DEFAULT_SUMMARIZATION_PROMPT = `Summarize the following content concisely, preserving key information:`;

/**
 * Handles context pruning with multiple strategies.
 *
 * @example
 * ```typescript
 * const pruner = new ContextPruner({
 *   contextManager,
 *   adapter: claudeAdapter,
 *   defaultStrategy: PruningStrategy.PRIORITY_WEIGHTED_AGE,
 * });
 *
 * // Prune to free 10000 tokens
 * const result = await pruner.prune({ targetTokens: 10000 });
 *
 * // Check if auto-pruning is needed
 * if (pruner.shouldPrune()) {
 *   await pruner.prune();
 * }
 * ```
 */
export class ContextPruner {
  private readonly contextManager: ContextManager;
  private readonly adapter: IModelAdapter | undefined;
  private readonly logger: ILogger;
  private readonly defaultStrategy: PruningStrategy;
  private readonly minItemsPerCategory: number;
  private readonly protectedPriority: ContentPriority;
  private readonly autoTriggerThreshold: number;

  constructor(config: ContextPrunerConfig) {
    const validation = ContextPrunerConfigSchema.safeParse({
      defaultStrategy: config.defaultStrategy,
      minItemsPerCategory: config.minItemsPerCategory,
      protectedPriority: config.protectedPriority,
      autoTriggerThreshold: config.autoTriggerThreshold,
    });

    if (!validation.success) {
      const issues = validation.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new ValidationError(`Invalid ContextPruner config: ${issues}`, {
        context: { validationErrors: validation.error.issues },
      });
    }

    this.contextManager = config.contextManager;
    this.adapter = config.adapter;
    this.logger = config.logger ?? createLogger({ component: 'ContextPruner' });
    this.defaultStrategy = config.defaultStrategy ?? PruningStrategy.PRIORITY_WEIGHTED_AGE;
    this.minItemsPerCategory = config.minItemsPerCategory ?? DEFAULT_MIN_ITEMS;
    this.protectedPriority = config.protectedPriority ?? ContentPriority.SYSTEM;
    this.autoTriggerThreshold = config.autoTriggerThreshold ?? DEFAULT_AUTO_TRIGGER;
  }

  /**
   * Check if pruning should be triggered based on usage threshold.
   *
   * @returns True if usage exceeds auto-trigger threshold
   */
  shouldPrune(): boolean {
    const stats = this.contextManager.getStats();
    return stats.usagePercentage >= this.autoTriggerThreshold;
  }

  /**
   * Prune context to free tokens or reach target capacity.
   *
   * @param options - Pruning options
   * @returns Result with pruning details
   */
  async prune(options: PruneOptions = {}): Promise<Result<PruneResult, ValidationError>> {
    const strategy = options.strategy ?? this.defaultStrategy;
    const categories = options.categories ?? ['active', 'task'];

    // Calculate target tokens to free
    const targetTokens = options.targetTokens ?? this.calculateDefaultTarget();

    if (targetTokens <= 0) {
      return ok({
        removedItems: [],
        summarizedItems: [],
        tokensFreed: 0,
        targetReached: true,
      });
    }

    this.logger.info('Starting pruning operation', {
      strategy,
      targetTokens,
      categories,
    });

    switch (strategy) {
      case PruningStrategy.OLDEST_FIRST:
        return this.pruneOldestFirst(targetTokens, categories);
      case PruningStrategy.LOWEST_PRIORITY:
        return this.pruneLowestPriority(targetTokens, categories);
      case PruningStrategy.PRIORITY_WEIGHTED_AGE:
        return this.prunePriorityWeightedAge(targetTokens, categories);
      case PruningStrategy.SUMMARIZE:
        return this.pruneWithSummarization(targetTokens, categories, options.summarizationPrompt);
      default:
        return err(new ValidationError(`Unknown pruning strategy: ${String(strategy)}`));
    }
  }

  /**
   * Prune items from a specific category.
   *
   * @param category - Category to prune
   * @param targetTokens - Tokens to free
   * @returns Result with pruning details
   */
  async pruneCategory(
    category: keyof Omit<ContextBudget, 'reserved'>,
    targetTokens: number
  ): Promise<Result<PruneResult, ValidationError>> {
    return this.prune({
      targetTokens,
      categories: [category],
    });
  }

  /**
   * Get candidates for pruning from specified categories.
   *
   * @param categories - Categories to consider
   * @returns Prunable items (excludes protected items)
   */
  getPruneCandidates(categories: Array<keyof Omit<ContextBudget, 'reserved'>>): ContextItem[] {
    const allItems: ContextItem[] = [];

    for (const category of categories) {
      const categoryItems = this.contextManager.getByCategory(category);
      allItems.push(...categoryItems);
    }

    // Filter out protected items
    const prunableItems = allItems.filter((item) => item.priority < this.protectedPriority);

    return prunableItems;
  }

  /**
   * Estimate tokens that can be freed from specified categories.
   *
   * @param categories - Categories to consider
   * @returns Tokens that could be freed
   */
  estimateFreeableTokens(categories: Array<keyof Omit<ContextBudget, 'reserved'>>): number {
    const candidates = this.getPruneCandidates(categories);

    // Account for minimum items per category
    const categoryItems: Map<keyof Omit<ContextBudget, 'reserved'>, ContextItem[]> = new Map();

    for (const item of candidates) {
      const existing = categoryItems.get(item.category) ?? [];
      existing.push(item);
      categoryItems.set(item.category, existing);
    }

    let freeableTokens = 0;
    for (const [, items] of categoryItems) {
      // Sort by pruning order (lowest priority, oldest first)
      const sorted = items.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.addedAt - b.addedAt;
      });

      // Can prune all except minItemsPerCategory
      const prunableCount = Math.max(0, sorted.length - this.minItemsPerCategory);
      for (let i = 0; i < prunableCount; i++) {
        const item = sorted[i];
        if (item !== undefined) {
          freeableTokens += item.tokenCount;
        }
      }
    }

    return freeableTokens;
  }

  /**
   * Calculate default target tokens based on current usage.
   */
  private calculateDefaultTarget(): number {
    const stats = this.contextManager.getStats();
    // Free 20% of current usage or enough to get below threshold
    const targetUsage = this.autoTriggerThreshold - 0.1;
    const targetTotal = Math.floor(stats.availableTokens * targetUsage);
    return Math.max(0, stats.totalTokens - targetTotal);
  }

  /**
   * Prune oldest items first (FIFO strategy).
   */
  private pruneOldestFirst(
    targetTokens: number,
    categories: Array<keyof Omit<ContextBudget, 'reserved'>>
  ): Result<PruneResult, ValidationError> {
    const candidates = this.getPruneCandidates(categories);

    // Sort by addedAt (oldest first)
    const sorted = candidates.sort((a, b) => a.addedAt - b.addedAt);

    return this.removeItemsToTarget(sorted, targetTokens, categories);
  }

  /**
   * Prune lowest priority items first.
   */
  private pruneLowestPriority(
    targetTokens: number,
    categories: Array<keyof Omit<ContextBudget, 'reserved'>>
  ): Result<PruneResult, ValidationError> {
    const candidates = this.getPruneCandidates(categories);

    // Sort by priority (lowest first), then age (oldest first)
    const sorted = candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.addedAt - b.addedAt;
    });

    return this.removeItemsToTarget(sorted, targetTokens, categories);
  }

  /**
   * Prune using priority-weighted age scoring.
   */
  private prunePriorityWeightedAge(
    targetTokens: number,
    categories: Array<keyof Omit<ContextBudget, 'reserved'>>
  ): Result<PruneResult, ValidationError> {
    const candidates = this.getPruneCandidates(categories);
    const now = Date.now();

    // Calculate score for each item
    // Lower score = prune first
    // Score = priority * recency_factor
    // recency_factor = 1 / (age_hours + 1)
    const scores: PruneScore[] = candidates.map((item) => {
      const ageMs = now - item.addedAt;
      const ageHours = ageMs / (1000 * 60 * 60);
      const recencyFactor = 1 / (ageHours + 1);
      const score = item.priority * recencyFactor;
      return { item, score };
    });

    // Sort by score (lowest first = prune first)
    scores.sort((a, b) => a.score - b.score);
    const sorted = scores.map((s) => s.item);

    return this.removeItemsToTarget(sorted, targetTokens, categories);
  }

  /**
   * Prune with summarization of old content.
   */
  private async pruneWithSummarization(
    targetTokens: number,
    categories: Array<keyof Omit<ContextBudget, 'reserved'>>,
    customPrompt?: string
  ): Promise<Result<PruneResult, ValidationError>> {
    if (this.adapter === undefined) {
      this.logger.warn('No adapter configured, falling back to priority-weighted pruning');
      return this.prunePriorityWeightedAge(targetTokens, categories);
    }

    const candidates = this.getPruneCandidates(categories);
    if (candidates.length === 0) {
      return ok(this.createEmptyPruneResult());
    }

    const toSummarize = this.selectItemsForSummarization(candidates);
    const summaryResult = await this.performSummarization(toSummarize, customPrompt);

    if (!summaryResult.ok) {
      this.logger.warn('Summarization failed, falling back to removal');
      return this.prunePriorityWeightedAge(targetTokens, categories);
    }

    return this.finalizeSummarization(toSummarize, summaryResult.value, targetTokens);
  }

  /**
   * Create an empty prune result.
   */
  private createEmptyPruneResult(): PruneResult {
    return {
      removedItems: [],
      summarizedItems: [],
      tokensFreed: 0,
      targetReached: false,
    };
  }

  /**
   * Select items to summarize (oldest 50%).
   */
  private selectItemsForSummarization(candidates: ContextItem[]): ContextItem[] {
    const sorted = candidates.sort((a, b) => a.addedAt - b.addedAt);
    return sorted.slice(0, Math.ceil(sorted.length / 2));
  }

  /**
   * Perform summarization of items.
   */
  private async performSummarization(
    items: ContextItem[],
    customPrompt?: string
  ): Promise<Result<string, ValidationError>> {
    const content = items.map((item) => item.content).join('\n\n---\n\n');
    const prompt = customPrompt ?? DEFAULT_SUMMARIZATION_PROMPT;
    return this.generateSummary(content, prompt);
  }

  /**
   * Finalize summarization by removing items and adding summary.
   */
  private async finalizeSummarization(
    toSummarize: ContextItem[],
    summary: string,
    targetTokens: number
  ): Promise<Result<PruneResult, ValidationError>> {
    let tokensFreed = this.removeSummarizedItems(toSummarize);
    const summaryCategory = this.findDominantCategory(toSummarize);

    const summaryAddResult = await this.addSummaryItem(summary, summaryCategory);
    let summaryItem: ContextItem | undefined;

    if (summaryAddResult.item !== undefined) {
      summaryItem = summaryAddResult.item;
      tokensFreed -= summaryAddResult.tokenCount;
    }

    const targetReached = tokensFreed >= targetTokens;
    this.logger.info('Pruning with summarization completed', {
      summarizedItems: toSummarize.length,
      tokensFreed,
      targetReached,
    });

    const result: PruneResult = {
      removedItems: [],
      summarizedItems: toSummarize,
      tokensFreed,
      targetReached,
    };

    if (summaryItem !== undefined) {
      result.summaryItem = summaryItem;
    }

    return ok(result);
  }

  /**
   * Remove summarized items and return tokens freed.
   */
  private removeSummarizedItems(items: ContextItem[]): number {
    let tokensFreed = 0;
    for (const item of items) {
      this.contextManager.remove(item.id);
      tokensFreed += item.tokenCount;
    }
    return tokensFreed;
  }

  /**
   * Find the category with most items.
   */
  private findDominantCategory(items: ContextItem[]): keyof Omit<ContextBudget, 'reserved'> {
    const counts = new Map<keyof Omit<ContextBudget, 'reserved'>, number>();
    for (const item of items) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }

    let dominant: keyof Omit<ContextBudget, 'reserved'> = 'active';
    let maxCount = 0;
    for (const [cat, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        dominant = cat;
      }
    }
    return dominant;
  }

  /**
   * Add a summary item to the context.
   */
  private async addSummaryItem(
    summary: string,
    category: keyof Omit<ContextBudget, 'reserved'>
  ): Promise<{ item: ContextItem | undefined; tokenCount: number }> {
    const tokenCount = await this.contextManager.countTokens(summary);
    const result = await this.contextManager.add({
      id: `summary-${String(Date.now())}`,
      content: summary,
      priority: ContentPriority.HISTORY,
      category,
    });

    return {
      item: result.ok ? result.value : undefined,
      tokenCount,
    };
  }

  /**
   * Remove items from sorted list until target is reached.
   */
  private removeItemsToTarget(
    sortedItems: ContextItem[],
    targetTokens: number,
    categories: Array<keyof Omit<ContextBudget, 'reserved'>>
  ): Result<PruneResult, ValidationError> {
    // Track items per category to enforce minimum
    const categoryRemaining = new Map<keyof Omit<ContextBudget, 'reserved'>, number>();
    for (const category of categories) {
      const items = this.contextManager.getByCategory(category);
      categoryRemaining.set(category, items.length);
    }

    const removedItems: ContextItem[] = [];
    let tokensFreed = 0;

    for (const item of sortedItems) {
      if (tokensFreed >= targetTokens) {
        break;
      }

      // Check minimum items constraint
      const remaining = categoryRemaining.get(item.category) ?? 0;
      if (remaining <= this.minItemsPerCategory) {
        continue;
      }

      // Remove the item
      this.contextManager.remove(item.id);
      removedItems.push(item);
      tokensFreed += item.tokenCount;
      categoryRemaining.set(item.category, remaining - 1);
    }

    const targetReached = tokensFreed >= targetTokens;

    this.logger.info('Pruning completed', {
      itemsRemoved: removedItems.length,
      tokensFreed,
      targetTokens,
      targetReached,
    });

    return ok({
      removedItems,
      summarizedItems: [],
      tokensFreed,
      targetReached,
    });
  }

  /**
   * Generate a summary using the model adapter.
   */
  private async generateSummary(
    content: string,
    prompt: string
  ): Promise<Result<string, ValidationError>> {
    if (this.adapter === undefined) {
      return err(new ValidationError('No adapter configured for summarization'));
    }

    const messages: Message[] = [{ role: 'user', content: `${prompt}\n\n${content}` }];

    const result = await this.adapter.complete({
      messages,
      temperature: 0.3,
      maxTokens: 1024,
    });

    if (!result.ok) {
      return err(new ValidationError(`Summarization failed: ${result.error.message}`));
    }

    // Extract text content from response
    const textContent = result.value.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return ok(textContent);
  }
}
