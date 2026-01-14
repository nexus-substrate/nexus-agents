/**
 * nexus-agents/agents - ContextManager Types
 *
 * Type definitions, constants, and Zod schemas for ContextManager.
 */

import { z } from 'zod';

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
  category: ContextItemCategory;
  /** Token count for this item */
  tokenCount: number;
  /** When this item was added */
  addedAt: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Type alias for context item categories (excludes 'reserved').
 */
export type ContextItemCategory = keyof Omit<ContextBudget, 'reserved'>;

/**
 * Configuration for ContextManager.
 */
export interface ContextManagerConfig {
  /** Maximum context window size in tokens */
  maxTokens: number;
  /** Budget allocation (defaults to DEFAULT_BUDGET) */
  budget?: ContextBudget;
  /** Model adapter for token counting */
  adapter?: import('../core/index.js').IModelAdapter;
  /** Custom logger */
  logger?: import('../core/index.js').ILogger;
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
  categoryTokens: Record<ContextItemCategory, number>;
  /** Number of items per category */
  itemCounts: Record<ContextItemCategory, number>;
  /** Available tokens (total - reserved) */
  availableTokens: number;
  /** Whether any category is over budget */
  isOverBudget: boolean;
  /** Categories that are over budget */
  overBudgetCategories: ContextItemCategory[];
  /** Percentage of total capacity used */
  usagePercentage: number;
}

/**
 * Average characters per token for estimation fallback.
 * (Source: OpenAI documentation suggests ~4 chars per token for English)
 */
export const CHARS_PER_TOKEN = 4;
