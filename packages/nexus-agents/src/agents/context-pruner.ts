/** Context pruning with priority-based retention and multiple strategies. */

import { z } from 'zod';
import type { Result, IModelAdapter, ILogger } from '../core/index.js';
import { err, ValidationError, createLogger } from '../core/index.js';
import {
  ContextManager,
  ContentPriority,
  type ContextItem,
  type ContextBudget,
} from './context-manager.js';
import {
  type SlidingWindowOptions,
  type HierarchicalOptions,
  type SemanticOptions,
  SlidingWindowOptionsSchema,
  HierarchicalOptionsSchema,
  SemanticOptionsSchema,
  SLIDING_WINDOW_PROMPT,
  HIERARCHICAL_PROMPT,
  SEMANTIC_PROMPT,
  removeItemsDirectly,
  summarizeAndRemoveItems,
  extractKeywords,
  calculateRelevance,
  type PruneResult,
} from './pruning-strategies.js';
import {
  calculateDefaultTarget,
  scoreByPriorityWeightedAge,
  removeItemsToTarget,
  wrapPruneResult,
  createEmptyPruneOk,
} from './context-pruner-helpers.js';

// Re-export strategy types
export type { SlidingWindowOptions, HierarchicalOptions, SemanticOptions, PruneResult };
export { SlidingWindowOptionsSchema, HierarchicalOptionsSchema, SemanticOptionsSchema };

/** Strategy for pruning context when budget is exceeded. */
export const PruningStrategy = {
  OLDEST_FIRST: 'oldest_first',
  LOWEST_PRIORITY: 'lowest_priority',
  PRIORITY_WEIGHTED_AGE: 'priority_weighted_age',
  SUMMARIZE: 'summarize',
  SLIDING_WINDOW: 'sliding_window',
  HIERARCHICAL: 'hierarchical',
  SEMANTIC: 'semantic',
} as const;

export type PruningStrategy = (typeof PruningStrategy)[keyof typeof PruningStrategy];

/** Configuration for ContextPruner. */
export interface ContextPrunerConfig {
  contextManager: ContextManager;
  adapter?: IModelAdapter;
  logger?: ILogger;
  defaultStrategy?: PruningStrategy;
  minItemsPerCategory?: number;
  protectedPriority?: ContentPriority;
  autoTriggerThreshold?: number;
}

export const ContextPrunerConfigSchema = z.object({
  defaultStrategy: z
    .enum([
      PruningStrategy.OLDEST_FIRST,
      PruningStrategy.LOWEST_PRIORITY,
      PruningStrategy.PRIORITY_WEIGHTED_AGE,
      PruningStrategy.SUMMARIZE,
      PruningStrategy.SLIDING_WINDOW,
      PruningStrategy.HIERARCHICAL,
      PruningStrategy.SEMANTIC,
    ])
    .optional(),
  minItemsPerCategory: z.number().int().min(0).optional(),
  protectedPriority: z.number().min(0).max(100).optional(),
  autoTriggerThreshold: z.number().min(0).max(1).optional(),
});

/** Options for a pruning operation. */
export interface PruneOptions {
  targetTokens?: number;
  strategy?: PruningStrategy;
  categories?: Array<keyof Omit<ContextBudget, 'reserved'>>;
  summarizationPrompt?: string;
  slidingWindowOptions?: Partial<SlidingWindowOptions>;
  hierarchicalOptions?: Partial<HierarchicalOptions>;
  semanticOptions?: Partial<SemanticOptions>;
}

const DEFAULT_MIN_ITEMS = 1;
const DEFAULT_AUTO_TRIGGER = 0.9;

/** Handles context pruning with multiple strategies. */
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
      throw new ValidationError(`Invalid ContextPruner config: ${validation.error.message}`, {
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

  /** Check if pruning should be triggered based on usage threshold. */
  shouldPrune(): boolean {
    return this.contextManager.getStats().usagePercentage >= this.autoTriggerThreshold;
  }

  /** Prune context to free tokens or reach target capacity. */
  async prune(options: PruneOptions = {}): Promise<Result<PruneResult, ValidationError>> {
    const strategy = options.strategy ?? this.defaultStrategy;
    const categories = options.categories ?? ['active', 'task'];
    const stats = this.contextManager.getStats();
    const targetTokens =
      options.targetTokens ?? calculateDefaultTarget(stats, this.autoTriggerThreshold);

    if (targetTokens <= 0) {
      return createEmptyPruneOk();
    }

    this.logger.info('Starting pruning operation', { strategy, targetTokens, categories });

    return this.executeStrategy(strategy, targetTokens, categories, options);
  }

  /** Execute the selected pruning strategy. */
  private async executeStrategy(
    strategy: PruningStrategy,
    targetTokens: number,
    categories: Array<keyof Omit<ContextBudget, 'reserved'>>,
    options: PruneOptions
  ): Promise<Result<PruneResult, ValidationError>> {
    switch (strategy) {
      case PruningStrategy.OLDEST_FIRST:
        return this.pruneOldestFirst(targetTokens, categories);
      case PruningStrategy.LOWEST_PRIORITY:
        return this.pruneLowestPriority(targetTokens, categories);
      case PruningStrategy.PRIORITY_WEIGHTED_AGE:
        return this.prunePriorityWeightedAge(targetTokens, categories);
      case PruningStrategy.SUMMARIZE:
        return this.pruneWithSummarization(targetTokens, categories, options.summarizationPrompt);
      case PruningStrategy.SLIDING_WINDOW:
        return this.pruneSlidingWindow(targetTokens, categories, options);
      case PruningStrategy.HIERARCHICAL:
        return this.pruneHierarchical(targetTokens, categories, options);
      case PruningStrategy.SEMANTIC:
        return this.pruneSemantic(targetTokens, categories, options);
      default:
        return err(new ValidationError(`Unknown pruning strategy: ${String(strategy)}`));
    }
  }

  /** Prune items from a specific category. */
  async pruneCategory(
    category: keyof Omit<ContextBudget, 'reserved'>,
    targetTokens: number
  ): Promise<Result<PruneResult, ValidationError>> {
    return this.prune({ targetTokens, categories: [category] });
  }

  /** Get candidates for pruning from specified categories. */
  getPruneCandidates(categories: Array<keyof Omit<ContextBudget, 'reserved'>>): ContextItem[] {
    const allItems: ContextItem[] = [];
    for (const category of categories) {
      allItems.push(...this.contextManager.getByCategory(category));
    }
    return allItems.filter((item) => item.priority < this.protectedPriority);
  }

  /** Estimate tokens that can be freed from specified categories. */
  estimateFreeableTokens(categories: Array<keyof Omit<ContextBudget, 'reserved'>>): number {
    const candidates = this.getPruneCandidates(categories);
    const categoryItems = new Map<keyof Omit<ContextBudget, 'reserved'>, ContextItem[]>();

    for (const item of candidates) {
      const existing = categoryItems.get(item.category) ?? [];
      existing.push(item);
      categoryItems.set(item.category, existing);
    }

    let freeableTokens = 0;
    for (const [, items] of categoryItems) {
      const sorted = items.sort((a, b) => a.priority - b.priority || a.addedAt - b.addedAt);
      const prunableCount = Math.max(0, sorted.length - this.minItemsPerCategory);
      for (let i = 0; i < prunableCount; i++) {
        const item = sorted[i];
        if (item !== undefined) freeableTokens += item.tokenCount;
      }
    }
    return freeableTokens;
  }

  private pruneOldestFirst(
    targetTokens: number,
    categories: Array<keyof Omit<ContextBudget, 'reserved'>>
  ): Result<PruneResult, ValidationError> {
    const candidates = this.getPruneCandidates(categories);
    const sorted = candidates.sort((a, b) => a.addedAt - b.addedAt);
    return this.removeItemsToTargetInternal(sorted, targetTokens, categories);
  }

  private pruneLowestPriority(
    targetTokens: number,
    categories: Array<keyof Omit<ContextBudget, 'reserved'>>
  ): Result<PruneResult, ValidationError> {
    const candidates = this.getPruneCandidates(categories);
    const sorted = candidates.sort((a, b) => a.priority - b.priority || a.addedAt - b.addedAt);
    return this.removeItemsToTargetInternal(sorted, targetTokens, categories);
  }

  private prunePriorityWeightedAge(
    targetTokens: number,
    categories: Array<keyof Omit<ContextBudget, 'reserved'>>
  ): Result<PruneResult, ValidationError> {
    const candidates = this.getPruneCandidates(categories);
    const sorted = scoreByPriorityWeightedAge(candidates);
    return this.removeItemsToTargetInternal(sorted, targetTokens, categories);
  }

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
    if (candidates.length === 0) return createEmptyPruneOk();

    const toSummarize = candidates
      .sort((a, b) => a.addedAt - b.addedAt)
      .slice(0, Math.ceil(candidates.length / 2));
    const result = await summarizeAndRemoveItems({
      items: toSummarize,
      targetTokens,
      manager: this.contextManager,
      adapter: this.adapter,
      logger: this.logger,
      customPrompt,
    });
    return wrapPruneResult(result);
  }

  private async pruneSlidingWindow(
    targetTokens: number,
    categories: Array<keyof Omit<ContextBudget, 'reserved'>>,
    options: PruneOptions
  ): Promise<Result<PruneResult, ValidationError>> {
    const parsed = SlidingWindowOptionsSchema.safeParse(options.slidingWindowOptions ?? {});
    const config: SlidingWindowOptions = parsed.success
      ? parsed.data
      : { preserveRecentCount: 10, summarizeOlder: true };

    const candidates = this.getPruneCandidates(categories);
    if (candidates.length === 0) return createEmptyPruneOk();

    const sorted = candidates.sort((a, b) => b.addedAt - a.addedAt);
    const olderItems = sorted.slice(config.preserveRecentCount);
    if (olderItems.length === 0) return createEmptyPruneOk();

    if (config.summarizeOlder && this.adapter !== undefined) {
      const result = await summarizeAndRemoveItems({
        items: olderItems,
        targetTokens,
        manager: this.contextManager,
        adapter: this.adapter,
        logger: this.logger,
        customPrompt: options.summarizationPrompt ?? SLIDING_WINDOW_PROMPT,
      });
      return wrapPruneResult(result);
    }
    return wrapPruneResult(removeItemsDirectly(olderItems, targetTokens, this.contextManager));
  }

  private async pruneHierarchical(
    targetTokens: number,
    categories: Array<keyof Omit<ContextBudget, 'reserved'>>,
    options: PruneOptions
  ): Promise<Result<PruneResult, ValidationError>> {
    const parsed = HierarchicalOptionsSchema.safeParse(options.hierarchicalOptions ?? {});
    const config: HierarchicalOptions = parsed.success
      ? parsed.data
      : { preserveSystemPrompt: true, preserveRecentCount: 5, summarizeMiddle: true };

    const allItems = this.contextManager.getAllItems();
    const nonSystemItems = allItems.filter((item) => item.category !== 'system');
    const sorted = nonSystemItems.sort((a, b) => b.addedAt - a.addedAt);
    const middleItems = sorted.slice(config.preserveRecentCount);

    const prunableMiddle = middleItems.filter(
      (item) => categories.includes(item.category) && item.priority < this.protectedPriority
    );
    if (prunableMiddle.length === 0) return createEmptyPruneOk();

    if (config.summarizeMiddle && this.adapter !== undefined) {
      const result = await summarizeAndRemoveItems({
        items: prunableMiddle,
        targetTokens,
        manager: this.contextManager,
        adapter: this.adapter,
        logger: this.logger,
        customPrompt: options.summarizationPrompt ?? HIERARCHICAL_PROMPT,
      });
      return wrapPruneResult(result);
    }
    return this.removeItemsToTargetInternal(prunableMiddle, targetTokens, categories);
  }

  private async pruneSemantic(
    targetTokens: number,
    categories: Array<keyof Omit<ContextBudget, 'reserved'>>,
    options: PruneOptions
  ): Promise<Result<PruneResult, ValidationError>> {
    const parsed = SemanticOptionsSchema.safeParse(options.semanticOptions ?? {});
    const defaultConfig: SemanticOptions = {
      minRelevanceScore: 0.3,
      topRelevantCount: 10,
      currentTask: undefined,
    };
    const config: SemanticOptions = parsed.success
      ? {
          currentTask: parsed.data.currentTask,
          minRelevanceScore: parsed.data.minRelevanceScore,
          topRelevantCount: parsed.data.topRelevantCount,
        }
      : defaultConfig;

    const candidates = this.getPruneCandidates(categories);
    if (candidates.length === 0) return createEmptyPruneOk();

    const taskKeywords = extractKeywords(config.currentTask ?? '');
    const scoredItems = candidates.map((item) => ({
      item,
      relevance: calculateRelevance(item.content, taskKeywords),
    }));
    scoredItems.sort((a, b) => b.relevance - a.relevance);

    const toPrune = scoredItems
      .slice(config.topRelevantCount)
      .filter((scored) => scored.relevance < config.minRelevanceScore)
      .map((scored) => scored.item);

    if (toPrune.length === 0) return createEmptyPruneOk();

    if (this.adapter !== undefined) {
      const result = await summarizeAndRemoveItems({
        items: toPrune,
        targetTokens,
        manager: this.contextManager,
        adapter: this.adapter,
        logger: this.logger,
        customPrompt: options.summarizationPrompt ?? SEMANTIC_PROMPT,
      });
      return wrapPruneResult(result);
    }
    return wrapPruneResult(removeItemsDirectly(toPrune, targetTokens, this.contextManager));
  }

  /** Internal method that delegates to the helper function. */
  private removeItemsToTargetInternal(
    sortedItems: ContextItem[],
    targetTokens: number,
    categories: Array<keyof Omit<ContextBudget, 'reserved'>>
  ): Result<PruneResult, ValidationError> {
    const result = removeItemsToTarget({
      sortedItems,
      targetTokens,
      categories,
      manager: this.contextManager,
      minItemsPerCategory: this.minItemsPerCategory,
      logger: this.logger,
    });
    return wrapPruneResult(result);
  }
}
