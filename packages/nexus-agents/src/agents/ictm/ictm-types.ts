/**
 * nexus-agents/agents - ICTM Types
 *
 * Core type definitions for the AOrchestra ICTM pattern.
 * ICTM = (Instructions, Context, Tools, Model) tuple for dynamic sub-agent creation.
 *
 * @see https://arxiv.org/abs/2602.03786
 * @see Issue #756
 *
 * @module agents/ictm/ictm-types
 */

import { z } from 'zod';

// =============================================================================
// CONTEXT FILTER
// =============================================================================

/**
 * Context pruning strategy for sub-agent context curation.
 */
export type ContextPruneStrategy = 'recency' | 'importance' | 'hybrid';

/**
 * Context filter configuration.
 * Controls what information flows to a sub-agent to prevent
 * long-horizon degradation (AOrchestra Section 3.2).
 */
export interface ContextFilter {
  /** Maximum token budget for curated context */
  maxTokens: number;
  /** Minimum relevance score (0-1) to include context items */
  relevanceThreshold: number;
  /** Whether to include conversation history */
  includeHistory: boolean;
  /** Strategy for pruning excess context */
  pruneStrategy: ContextPruneStrategy;
}

// =============================================================================
// TOOL SET
// =============================================================================

/**
 * Tool set configuration for a sub-agent.
 * Restricts capabilities to only what the subtask needs.
 */
export interface ToolSet {
  /** Allowed capabilities (from AgentCapability values) */
  capabilities: string[];
  /** Explicit tool restrictions — tool names to exclude */
  restrictions?: string[] | undefined;
}

// =============================================================================
// MODEL SELECTION
// =============================================================================

/**
 * Reasoning depth hint for model selection.
 */
export type ReasoningDepth = 'minimal' | 'standard' | 'extended';

/**
 * Model selection for a sub-agent.
 * Enables per-subtask model optimization (performance-cost tradeoff).
 */
export interface ModelSelection {
  /** Provider ID (e.g., 'anthropic', 'openai') */
  provider?: string | undefined;
  /** Specific model ID */
  modelId?: string | undefined;
  /** Generation temperature (0-2) */
  temperature?: number | undefined;
  /** Maximum response tokens */
  maxTokens?: number | undefined;
  /** Reasoning depth hint */
  reasoning?: ReasoningDepth | undefined;
}

// =============================================================================
// ICTM CONFIG
// =============================================================================

/**
 * ICTM configuration tuple.
 *
 * Each sub-agent receives a unique ICTM config tailored to its subtask,
 * enabling dynamic specialization instead of static expert roles.
 *
 * @example
 * ```typescript
 * const config: ICTMConfig = {
 *   instructions: 'Analyze the authentication module for SQL injection vulnerabilities.',
 *   context: { maxTokens: 8000, relevanceThreshold: 0.7, includeHistory: false, pruneStrategy: 'importance' },
 *   tools: { capabilities: ['code_review', 'research'], restrictions: ['code_generation'] },
 *   model: { temperature: 0.1, reasoning: 'extended' },
 * };
 * ```
 */
export interface ICTMConfig {
  /** Task-specific instructions (extends the base system prompt) */
  instructions: string;
  /** Context curation filter */
  context: ContextFilter;
  /** Selected tool capabilities */
  tools: ToolSet;
  /** Model configuration */
  model: ModelSelection;
  /** Optional metadata for tracking/extensions */
  metadata?: Record<string, unknown> | undefined;
}

// =============================================================================
// INFERENCE RESULT
// =============================================================================

/**
 * Result of ICTM inference — the inferred config plus reasoning.
 */
export interface ICTMInferenceResult {
  /** Inferred ICTM configuration */
  config: ICTMConfig;
  /** Reasoning for each ICTM component */
  reasoning: {
    instructions: string;
    context: string;
    tools: string;
    model: string;
  };
  /** Confidence in the inference (0-1) */
  confidence: number;
}

// =============================================================================
// CONTEXT ITEM (for curation)
// =============================================================================

/**
 * A context item that can be filtered and ranked.
 */
export interface CuratedContextItem {
  /** Unique item identifier */
  id: string;
  /** Text content */
  content: string;
  /** Estimated token count */
  tokenCount: number;
  /** Timestamp (ms since epoch) for recency scoring */
  timestamp: number;
  /** Relevance score (0-1) assigned during curation */
  relevance: number;
  /** Source category */
  source: 'history' | 'knowledge' | 'task' | 'result';
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const ContextPruneStrategySchema = z.enum(['recency', 'importance', 'hybrid']);

export const ContextFilterSchema = z.object({
  maxTokens: z.number().int().min(100).max(1_000_000),
  relevanceThreshold: z.number().min(0).max(1),
  includeHistory: z.boolean(),
  pruneStrategy: ContextPruneStrategySchema,
});

export const ToolSetSchema = z.object({
  capabilities: z.array(z.string().min(1)).min(1),
  restrictions: z.array(z.string().min(1)).optional(),
});

export const ReasoningDepthSchema = z.enum(['minimal', 'standard', 'extended']);

export const ModelSelectionSchema = z.object({
  provider: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(200_000).optional(),
  reasoning: ReasoningDepthSchema.optional(),
});

export const ICTMConfigSchema = z.object({
  instructions: z.string().min(1, 'Instructions are required'),
  context: ContextFilterSchema,
  tools: ToolSetSchema,
  model: ModelSelectionSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ICTMInferenceResultSchema = z.object({
  config: ICTMConfigSchema,
  reasoning: z.object({
    instructions: z.string(),
    context: z.string(),
    tools: z.string(),
    model: z.string(),
  }),
  confidence: z.number().min(0).max(1),
});
