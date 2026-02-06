/**
 * nexus-agents/mcp - Delegate to Model Types
 *
 * Type definitions, schemas, and constants for model routing.
 *
 * @module mcp/tools/delegate-to-model-types
 * (Source: cli-project_plan.md v2.0.0)
 */

import { z } from 'zod';
import type { ILogger, ICompositeRouter } from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import type { IFeedbackIntegration } from '../../learning/feedback-integration.js';

/**
 * Billing mode for model routing.
 * - 'plan': CLI adapters on monthly plans (cost is irrelevant, strongest model wins)
 * - 'api': Pay-per-token API usage (cost matters for routing decisions)
 */
export type BillingMode = 'plan' | 'api';

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
 * Derived from the canonical model registry (Issue #807).
 */

import { buildCapabilityProfiles } from '../../config/model-config-helpers.js';

export const MODEL_CAPABILITIES: Record<string, CapabilityProfile> = buildCapabilityProfiles();

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
  billing_mode: z
    .enum(['plan', 'api'])
    .optional()
    .describe('Billing mode: plan (monthly subscription, ignore cost) or api (pay-per-token)'),
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
  /** Whether the task requires image generation output (Issue #685) */
  needsImageGen: boolean;
  /** Whether the task requires audio output (Issue #685) */
  needsAudioOutput: boolean;
  /** Whether the task requires MCP tool support (Issue #685) */
  needsMcp: boolean;
  /** Whether the task is exploration/research (benefits from large context) (Issue #807) */
  needsExploration: boolean;
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

/** Keywords indicating image generation needs (Issue #685). */
export const IMAGE_GEN_KEYWORDS = [
  'image',
  'picture',
  'photo',
  'diagram',
  'illustration',
  'png',
  'jpeg',
  'visual',
  'draw',
  'render image',
] as const;

/** Keywords indicating audio output needs (Issue #685). */
export const AUDIO_OUTPUT_KEYWORDS = [
  'audio',
  'speech',
  'voice',
  'tts',
  'text-to-speech',
  'read aloud',
  'narrate',
] as const;

/** Keywords indicating MCP tool needs (Issue #685). */
export const MCP_KEYWORDS = ['mcp', 'tool use', 'computer use', 'browse', 'interact'] as const;

/** Keywords indicating exploration/research tasks (Issue #807). */
export const EXPLORATION_KEYWORDS = [
  'explore',
  'research',
  'search',
  'scan',
  'browse',
  'discover',
  'survey',
  'navigate',
] as const;

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
  billing_mode: z.enum(['plan', 'api']).optional().describe('Billing mode for cost handling'),
};
