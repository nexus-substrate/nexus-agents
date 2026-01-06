/**
 * nexus-agents/agents - Pruning Strategies
 *
 * Implementation of advanced pruning strategies for context management:
 * - Sliding Window: Keep N most recent, summarize older
 * - Hierarchical: Keep system prompt + recent, summarize middle
 * - Semantic: Keep relevant to current task, summarize irrelevant
 */

import { z } from 'zod';
import type { Result, IModelAdapter, ILogger, Message } from '../core/index.js';
import { ok, err, ValidationError } from '../core/index.js';
import { ContentPriority, type ContextItem, type ContextBudget } from './context-manager.js';

/**
 * Configuration options specific to sliding window strategy.
 */
export interface SlidingWindowOptions {
  /** Number of recent messages to preserve (default: 10) */
  preserveRecentCount: number;
  /** Whether to summarize older messages (default: true) */
  summarizeOlder: boolean;
}

/**
 * Configuration options specific to hierarchical strategy.
 */
export interface HierarchicalOptions {
  /** Always preserve system prompt (default: true) */
  preserveSystemPrompt: boolean;
  /** Number of recent messages to preserve (default: 5) */
  preserveRecentCount: number;
  /** Summarize middle section (default: true) */
  summarizeMiddle: boolean;
}

/**
 * Configuration options specific to semantic strategy.
 */
export interface SemanticOptions {
  /** Current task description for relevance scoring */
  currentTask: string | undefined;
  /** Minimum relevance score to keep (0-1, default: 0.3) */
  minRelevanceScore: number;
  /** Number of top relevant items to preserve (default: 10) */
  topRelevantCount: number;
}

/**
 * Schema for sliding window options validation.
 */
export const SlidingWindowOptionsSchema = z.object({
  preserveRecentCount: z.number().int().min(1).default(10),
  summarizeOlder: z.boolean().default(true),
});

/**
 * Schema for hierarchical options validation.
 */
export const HierarchicalOptionsSchema = z.object({
  preserveSystemPrompt: z.boolean().default(true),
  preserveRecentCount: z.number().int().min(1).default(5),
  summarizeMiddle: z.boolean().default(true),
});

/**
 * Schema for semantic options validation.
 */
export const SemanticOptionsSchema = z.object({
  currentTask: z.string().optional(),
  minRelevanceScore: z.number().min(0).max(1).default(0.3),
  topRelevantCount: z.number().int().min(1).default(10),
});

/**
 * Summarization prompt for sliding window strategy.
 */
export const SLIDING_WINDOW_PROMPT = `Summarize the following older conversation messages concisely.
Preserve key decisions, conclusions, and important context while condensing the content:`;

/**
 * Summarization prompt for hierarchical strategy.
 */
export const HIERARCHICAL_PROMPT = `Summarize the following middle section of a conversation.
Preserve key points, decisions, and context while significantly condensing the content.
Focus on information that may be referenced later in the conversation:`;

/**
 * Summarization prompt for semantic strategy.
 */
export const SEMANTIC_PROMPT = `Summarize the following content that has lower relevance to the current task.
Extract and preserve any potentially useful background information while condensing significantly:`;

/**
 * Result of a pruning operation.
 */
export interface PruneResult {
  removedItems: ContextItem[];
  summarizedItems: ContextItem[];
  summaryItem?: ContextItem;
  tokensFreed: number;
  targetReached: boolean;
}

/**
 * Context for strategy execution.
 */
export interface StrategyContext {
  adapter: IModelAdapter | undefined;
  logger: ILogger;
  protectedPriority: number;
  minItemsPerCategory: number;
}

/**
 * Interface for context manager operations needed by strategies.
 */
export interface IContextManagerOperations {
  remove(id: string): boolean;
  add(
    item: Omit<ContextItem, 'tokenCount' | 'addedAt'>
  ): Promise<Result<ContextItem, ValidationError>>;
  countTokens(text: string): Promise<number>;
  getAllItems(): ContextItem[];
  getByCategory(category: keyof Omit<ContextBudget, 'reserved'>): ContextItem[];
}

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
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'can',
    'this',
    'that',
    'these',
    'those',
    'i',
    'you',
    'he',
    'she',
    'it',
    'we',
    'they',
    'what',
    'which',
    'who',
    'when',
    'where',
    'why',
    'how',
    'all',
    'each',
    'every',
    'both',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'nor',
    'not',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    'just',
    'and',
    'but',
    'if',
    'or',
    'because',
    'as',
    'until',
    'while',
    'of',
    'at',
    'by',
    'for',
    'with',
    'about',
    'against',
    'between',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'to',
    'from',
    'up',
    'down',
    'in',
    'out',
    'on',
    'off',
    'over',
    'under',
    'again',
    'further',
    'then',
    'once',
    'here',
    'there',
  ]);
  return new Set(words.filter((w) => w.length > 2 && !stopWords.has(w)));
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
