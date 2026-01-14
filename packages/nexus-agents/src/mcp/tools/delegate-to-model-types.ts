/**
 * nexus-agents/mcp - Delegate to Model Types
 *
 * Type definitions, schemas, and constants for model routing.
 *
 * @module mcp/tools/delegate-to-model-types
 * (Source: cli-project_plan.md v2.0.0)
 */

import { z } from 'zod';
import type { ILogger } from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import type { ICompositeRouter } from '../../cli-adapters/composite-router.js';
import type { IFeedbackIntegration } from '../../learning/feedback-integration.js';

/**
 * Preferred capability for task routing.
 */
export type PreferredCapability = 'reasoning' | 'context' | 'speed' | 'code';

/**
 * Model capability profile for routing decisions.
 */
export interface CapabilityProfile {
  /** Complex reasoning ability (0-10) */
  readonly reasoning: number;
  /** Maximum context window in tokens */
  readonly contextWindow: number;
  /** Code generation quality (0-10) */
  readonly codeGeneration: number;
  /** Response latency score (0-10, higher = faster) */
  readonly speed: number;
  /** Cost efficiency (0-10, higher = cheaper) */
  readonly cost: number;
}

/**
 * Available model configurations with capability profiles.
 * (Source: cli-project_plan.md v2.0.0 - Capability Matching Matrix)
 */
export const MODEL_CAPABILITIES: Record<string, CapabilityProfile> = {
  'claude-opus': {
    reasoning: 10,
    contextWindow: 200_000,
    codeGeneration: 9,
    speed: 5,
    cost: 3,
  },
  'claude-sonnet': {
    reasoning: 9,
    contextWindow: 200_000,
    codeGeneration: 9,
    speed: 7,
    cost: 6,
  },
  'claude-haiku': {
    reasoning: 7,
    contextWindow: 200_000,
    codeGeneration: 7,
    speed: 9,
    cost: 9,
  },
  'gemini-pro': {
    reasoning: 8,
    contextWindow: 1_000_000,
    codeGeneration: 7,
    speed: 8,
    cost: 8,
  },
  'gemini-flash': {
    reasoning: 6,
    contextWindow: 1_000_000,
    codeGeneration: 6,
    speed: 10,
    cost: 10,
  },
  'codex-5.2': {
    reasoning: 9,
    contextWindow: 400_000,
    codeGeneration: 10,
    speed: 8,
    cost: 7,
  },
  'codex-5.1-mini': {
    reasoning: 7,
    contextWindow: 400_000,
    codeGeneration: 8,
    speed: 9,
    cost: 9,
  },
} as const;

/**
 * Input schema for the delegate_to_model tool.
 */
export const DelegateInputSchema = z.object({
  task: z.string().min(1).describe('Task to execute or analyze'),
  preferred_capability: z
    .enum(['reasoning', 'context', 'speed', 'code'])
    .optional()
    .describe('Preferred capability for routing: reasoning, context, speed, or code'),
  model_hint: z
    .string()
    .optional()
    .describe('Explicit model preference (e.g., claude-opus, gemini-pro)'),
  estimate_tokens: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, return token estimate only without execution'),
});

export type DelegateInput = z.infer<typeof DelegateInputSchema>;

/**
 * Output schema for the delegate_to_model tool response.
 */
export const DelegateOutputSchema = z.object({
  recommended_model: z.string().describe('The model recommended for this task'),
  reasoning: z.string().describe('Why this model was selected'),
  capabilities: z.object({
    reasoning: z.number(),
    contextWindow: z.number(),
    codeGeneration: z.number(),
    speed: z.number(),
    cost: z.number(),
  }),
  estimated_tokens: z.number().describe('Estimated tokens for task'),
  alternatives: z
    .array(
      z.object({
        model: z.string(),
        score: z.number(),
        tradeoff: z.string(),
      })
    )
    .describe('Alternative model options with tradeoffs'),
});

export type DelegateOutput = z.infer<typeof DelegateOutputSchema>;

/**
 * Dependencies for the delegate_to_model tool.
 */
export interface DelegateDeps {
  /** Logger instance */
  logger?: ILogger | undefined;
  /** Rate limiter for throttling tool calls (required) */
  rateLimiter: RateLimiter;
  /** Optional CompositeRouter for intelligent routing (Issue #169) */
  router?: ICompositeRouter | undefined;
  /** Optional FeedbackIntegration for closed-loop learning (Issue #167) */
  feedbackIntegration?: IFeedbackIntegration | undefined;
  /** Security configuration (includes timeout settings - Issue #271) */
  security?: SecurityConfig | undefined;
}

/**
 * Analyzes task to determine requirements.
 */
export interface TaskRequirements {
  estimatedTokens: number;
  needsReasoning: boolean;
  needsLargeContext: boolean;
  needsSpeed: boolean;
  needsCodeGen: boolean;
  isCostSensitive: boolean;
}

/**
 * Model scoring result.
 */
export interface ScoredModel {
  name: string;
  profile: CapabilityProfile;
  score: number;
}

/**
 * Tool result type.
 */
export type ToolResult = { isError?: boolean; content: Array<{ type: 'text'; text: string }> };

/** Keywords indicating reasoning needs. */
export const REASONING_KEYWORDS = [
  'analyze',
  'design',
  'architect',
  'compare',
  'evaluate',
  'complex',
  'think',
  'reason',
  'explain why',
  'trade-off',
] as const;

/** Keywords indicating large context needs. */
export const CONTEXT_KEYWORDS = [
  'codebase',
  'repository',
  'all files',
  'entire',
  'whole project',
  'summarize',
  'review all',
] as const;

/** Keywords indicating speed needs. */
export const SPEED_KEYWORDS = ['quick', 'fast', 'simple', 'brief', 'short', 'immediately'] as const;

/** Keywords indicating code generation needs. */
export const CODE_KEYWORDS = [
  'implement',
  'code',
  'write',
  'function',
  'test',
  'refactor',
  'fix',
  'debug',
  'generate',
] as const;

/** Keywords indicating cost sensitivity. */
export const COST_KEYWORDS = ['cheap', 'cost', 'budget', 'economical', 'free'] as const;

/**
 * Tool input schema definition.
 */
export const TOOL_SCHEMA = {
  task: z.string().min(1).describe('Task to execute or analyze'),
  preferred_capability: z
    .enum(['reasoning', 'context', 'speed', 'code'])
    .optional()
    .describe('Preferred capability for routing'),
  model_hint: z.string().optional().describe('Explicit model preference'),
  estimate_tokens: z.boolean().optional().describe('Return token estimate only'),
};
