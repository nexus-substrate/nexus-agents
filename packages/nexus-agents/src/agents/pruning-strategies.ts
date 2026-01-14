/**
 * nexus-agents/agents - Pruning Strategies
 *
 * Implementation of advanced pruning strategies for context management:
 * - Sliding Window: Keep N most recent, summarize older
 * - Hierarchical: Keep system prompt + recent, summarize middle
 * - Semantic: Keep relevant to current task, summarize irrelevant
 *
 * @module agents/pruning-strategies
 */

import type { Result, IModelAdapter, ILogger, Message } from '../core/index.js';
import { ok, err, ValidationError } from '../core/index.js';
import { ContentPriority, type ContextItem, type ContextBudget } from './context-manager.js';
import type { PruneResult, IContextManagerOperations } from './pruning-strategies-types.js';
import { STOP_WORDS, SLIDING_WINDOW_PROMPT } from './pruning-strategies-types.js';

// Re-export types for backward compatibility
export type {
  SlidingWindowOptions,
  HierarchicalOptions,
  SemanticOptions,
  PruneResult,
  StrategyContext,
  IContextManagerOperations,
} from './pruning-strategies-types.js';
export {
  STOP_WORDS,
  SlidingWindowOptionsSchema,
  HierarchicalOptionsSchema,
  SemanticOptionsSchema,
  SLIDING_WINDOW_PROMPT,
  HIERARCHICAL_PROMPT,
  SEMANTIC_PROMPT,
} from './pruning-strategies-types.js';

/**
 * Generate a summary using the model adapter.
 */
export async function generateSummary(
  content: string,
  prompt: string,
  adapter: IModelAdapter
): Promise<Result<string, ValidationError>> {
  const messages: Message[] = [{ role: 'user', content: `${prompt}\n\n${content}` }];

  const result = await adapter.complete({
    messages,
    temperature: 0.3,
    maxTokens: 1024,
  });

  if (!result.ok) {
    return err(new ValidationError(`Summarization failed: ${result.error.message}`));
  }

  const textContent = result.value.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return ok(textContent);
}

/**
 * Add a summary item to the context manager.
 */
export async function addSummaryItem(
  summary: string,
  category: keyof Omit<ContextBudget, 'reserved'>,
  manager: IContextManagerOperations
): Promise<{ item: ContextItem | undefined; tokenCount: number }> {
  const tokenCount = await manager.countTokens(summary);
  const result = await manager.add({
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
 * Find the dominant category among items.
 */
export function findDominantCategory(items: ContextItem[]): keyof Omit<ContextBudget, 'reserved'> {
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
 * Create an empty prune result.
 * @param targetReached - Whether the target was reached (default: true for empty results)
 */
export function createEmptyPruneResult(targetReached = true): PruneResult {
  return {
    removedItems: [],
    summarizedItems: [],
    tokensFreed: 0,
    targetReached,
  };
}

/**
 * Remove items directly without summarization.
 */
export function removeItemsDirectly(
  items: ContextItem[],
  targetTokens: number,
  manager: IContextManagerOperations
): PruneResult {
  const removedItems: ContextItem[] = [];
  let tokensFreed = 0;

  for (const item of items) {
    if (tokensFreed >= targetTokens) break;
    manager.remove(item.id);
    removedItems.push(item);
    tokensFreed += item.tokenCount;
  }

  return {
    removedItems,
    summarizedItems: [],
    tokensFreed,
    targetReached: tokensFreed >= targetTokens,
  };
}

/**
 * Options for summarize and remove operation.
 */
export interface SummarizeAndRemoveOptions {
  items: ContextItem[];
  targetTokens: number;
  manager: IContextManagerOperations;
  adapter: IModelAdapter;
  logger: ILogger;
  customPrompt: string | undefined;
}

/**
 * Summarize items and remove originals.
 */
export async function summarizeAndRemoveItems(
  options: SummarizeAndRemoveOptions
): Promise<PruneResult> {
  const { items, targetTokens, manager, adapter, logger, customPrompt } = options;
  const content = items.map((item) => item.content).join('\n\n---\n\n');
  const prompt = customPrompt ?? SLIDING_WINDOW_PROMPT;

  const summaryResult = await generateSummary(content, prompt, adapter);
  if (!summaryResult.ok) {
    logger.warn('Summarization failed, removing items without summary');
    return removeItemsDirectly(items, targetTokens, manager);
  }

  // Remove original items
  let tokensFreed = 0;
  for (const item of items) {
    manager.remove(item.id);
    tokensFreed += item.tokenCount;
  }

  // Add summary
  const category = findDominantCategory(items);
  const summaryAddResult = await addSummaryItem(summaryResult.value, category, manager);
  if (summaryAddResult.item !== undefined) {
    tokensFreed -= summaryAddResult.tokenCount;
  }

  logger.info('Summarization pruning completed', {
    summarizedItems: items.length,
    tokensFreed,
    targetReached: tokensFreed >= targetTokens,
  });

  const result: PruneResult = {
    removedItems: [],
    summarizedItems: items,
    tokensFreed,
    targetReached: tokensFreed >= targetTokens,
  };
  if (summaryAddResult.item !== undefined) {
    result.summaryItem = summaryAddResult.item;
  }
  return result;
}

/**
 * Extract keywords from text for relevance matching.
 * MVP implementation using simple word extraction.
 */
export function extractKeywords(text: string): Set<string> {
  const words = text.toLowerCase().split(/\W+/);
  return new Set(words.filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
}

/**
 * Calculate relevance score between content and keywords.
 * Returns score between 0 and 1 using Jaccard similarity.
 */
export function calculateRelevance(content: string, keywords: Set<string>): number {
  if (keywords.size === 0) {
    return 0.5; // Default score when no task keywords
  }

  const contentWords = extractKeywords(content);
  if (contentWords.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const word of contentWords) {
    if (keywords.has(word)) {
      intersection++;
    }
  }

  const union = keywords.size + contentWords.size - intersection;
  return union > 0 ? intersection / union : 0;
}
