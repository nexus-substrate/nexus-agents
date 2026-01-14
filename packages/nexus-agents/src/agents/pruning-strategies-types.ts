/**
 * Pruning Strategies Types and Constants
 *
 * Type definitions and constants for context pruning strategies.
 *
 * @module agents/pruning-strategies-types
 */

import { z } from 'zod';
import type { IModelAdapter, ILogger, Result } from '../core/index.js';
import type { ValidationError } from '../core/index.js';
import type { ContextItem, ContextBudget } from './context-manager.js';

// ============================================================================
// Stop Words
// ============================================================================

/**
 * Common English stop words to filter from keyword extraction.
 */
export const STOP_WORDS = new Set([
  // Articles
  'the',
  'a',
  'an',
  // Verbs - be
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  // Verbs - have/do
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  // Modal verbs
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'can',
  // Pronouns - demonstrative
  'this',
  'that',
  'these',
  'those',
  // Pronouns - personal
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  // Pronouns - interrogative
  'what',
  'which',
  'who',
  'when',
  'where',
  'why',
  'how',
  // Determiners
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
  // Adverbs/modifiers
  'no',
  'not',
  'only',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'own',
  'also',
  'now',
  // Conjunctions
  'and',
  'but',
  'or',
  'nor',
  'yet',
  'as',
  'if',
  'because',
  'while',
  'although',
  'though',
  'unless',
  // Prepositions
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

// ============================================================================
// Strategy Options Types
// ============================================================================

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

// ============================================================================
// Zod Schemas
// ============================================================================

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

// ============================================================================
// Prompt Constants
// ============================================================================

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

// ============================================================================
// Result and Context Types
// ============================================================================

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
