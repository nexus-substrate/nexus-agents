/**
 * nexus-agents/mcp - Delegate to Model Types
 *
 * Type definitions, schemas, and constants for model routing.
 *
 * @module mcp/tools/delegate-to-model-types
 * (Source: cli-project_plan.md v2.0.0)
 */

import { z } from 'zod';
import type { ICompositeRouter } from '../../core/index.js';
import type { IFeedbackIntegration } from '../../learning/feedback-integration.js';
import type { IMcpNotifier } from '../mcp-notifier.js';
import type { BaseMcpToolDeps } from './tool-result.js';

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
  task: z.string().min(1).max(50000).describe('Task to execute or analyze'),
  preferred_capability: z
    .enum(['reasoning', 'context', 'speed', 'code'])
    .optional()
    .describe('Preferred capability for routing: reasoning, context, speed, or code'),
  model_hint: z
    .string()
    .max(100)
    .optional()
    .describe('Explicit model preference (e.g., claude-opus, gemini-pro)'),
  // estimate_tokens flag removed (#2723). The field was declared in two schemas
  // (here and in TOOL_SCHEMA below) but never read by any consumer — calling
  // `delegate_to_model { estimate_tokens: true }` returned the full routing
  // decision identical to omitting the flag. The output already carries
  // `estimated_tokens` so the use case the flag advertised is satisfied
  // without the flag.
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
  recommended_model: z.string().max(100).describe('The model recommended for this task'),
  reasoning: z.string().max(2000).describe('Why this model was selected'),
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
        model: z.string().max(100),
        score: z.number(),
        tradeoff: z.string().max(500),
      })
    )
    .max(10)
    .describe('Alternative model options with tradeoffs'),
  governance: z
    .object({
      domain: z.string().max(100).describe('Governance domain (e.g., security, architecture)'),
      votingThreshold: z
        .string()
        .max(50)
        .describe('Required voting threshold (e.g., supermajority)'),
      promotionReason: z.string().max(500).describe('Why governance was promoted'),
    })
    .optional()
    .describe('Present when task triggers governance promotion'),
});

export type DelegateOutput = z.infer<typeof DelegateOutputSchema>;

/**
 * Dependencies for the delegate_to_model tool.
 */
export interface DelegateDeps extends BaseMcpToolDeps {
  /** Optional CompositeRouter for intelligent routing (Issue #169) */
  router?: ICompositeRouter | undefined;
  /** Optional FeedbackIntegration for closed-loop learning (Issue #167) */
  feedbackIntegration?: IFeedbackIntegration | undefined;
  /** MCP notifier for client-visible logging (Issue #974) */
  notifier?: IMcpNotifier | undefined;
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
export type ToolResult = {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
};

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

/**
 * Keywords indicating the task explicitly needs MCP tool invocation
 * (Issue #685). Phrases must be unambiguous — `'interact'` and `'browse'`
 * (the pre-#2722 entries) false-positive on plain English: a task asking
 * "how do these components **interact**?" flipped `needsMcp` true and
 * silently filtered out gemini, then misleadingly reported "prefer gemini"
 * while picking a non-gemini model. Keep entries explicit MCP / browser-
 * automation phrases.
 */
export const MCP_KEYWORDS = [
  'mcp',
  'mcp tool',
  'tool use',
  'computer use',
  'browse the web',
  'browser automation',
] as const;

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
  task: z.string().min(1).max(50000).describe('Task to execute or analyze'),
  preferred_capability: z
    .enum(['reasoning', 'context', 'speed', 'code'])
    .optional()
    .describe('Preferred capability for routing'),
  model_hint: z.string().max(100).optional().describe('Explicit model preference'),
  // estimate_tokens removed (#2723) — see comment above on DelegateInputSchema.
  billing_mode: z.enum(['plan', 'api']).optional().describe('Billing mode for cost handling'),
};
