/**
 * nexus-agents/config - Model Capabilities Type Definitions
 *
 * Zod schemas and TypeScript interfaces for the model capabilities matrix.
 * Defines output/input modalities, tool support, and special features
 * for each supported AI model.
 *
 * @module config/model-capabilities-types
 * (Source: Issue #683, Epic #682)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Modality Enums
// ---------------------------------------------------------------------------

/** Output modalities a model can produce. */
export const OUTPUT_MODALITIES = [
  'text',
  'image_png',
  'image_jpeg',
  'audio_pcm',
  'audio_wav',
  'audio_mp3',
  'video_mp4',
  'svg',
  'structured_json',
  'code',
] as const;

export type OutputModality = (typeof OUTPUT_MODALITIES)[number];

/** Input modalities a model can accept. */
export const INPUT_MODALITIES = ['text', 'image', 'audio', 'video', 'pdf', 'code'] as const;

export type InputModality = (typeof INPUT_MODALITIES)[number];

/** Tool capabilities a model supports. */
export const TOOL_CAPABILITIES = [
  'mcp',
  'function_calling',
  'computer_use',
  'code_execution_sandbox',
  'web_search',
  'file_operations',
  'structured_output',
  'apply_patch',
] as const;

export type ToolCapability = (typeof TOOL_CAPABILITIES)[number];

/** Special features beyond standard text generation. */
export const SPECIAL_FEATURES = [
  'extended_thinking',
  'deep_research',
  'streaming',
  'grounding',
  'citations',
  'image_editing',
  'voice_cloning',
  'live_api',
  'context_caching',
] as const;

export type SpecialFeature = (typeof SPECIAL_FEATURES)[number];

// ---------------------------------------------------------------------------
// Provider, CLI Name & Model ID enums
// ---------------------------------------------------------------------------

export const PROVIDERS = ['anthropic', 'google', 'openai', 'custom-openai', 'openrouter'] as const;
export type Provider = (typeof PROVIDERS)[number];

/** CLI tool names supported by the routing system. */
export const CLI_NAMES = ['claude', 'gemini', 'codex', 'opencode'] as const;
export type CliNameLiteral = (typeof CLI_NAMES)[number];

/** Zod schema for CLI name validation. Canonical schema — import this instead of inlining z.enum. */
export const CliNameSchema = z.enum(CLI_NAMES);

/** Default CLI used as fallback when task category detection yields no match. */
export const DEFAULT_CLI: CliNameLiteral = 'claude';

/** Default confidence score for routing when no task analysis is performed. */
export const DEFAULT_ROUTING_CONFIDENCE = 0.85;

/**
 * Canonical model id enum used for narrow `ModelId` typing and as the
 * argument to `z.enum(MODEL_IDS)` in `ModelCapabilitySchema`.
 *
 * This is a hand-maintained narrow tuple rather than a derived view
 * from `ModelRegistry` because the literal-union type is load-bearing:
 * — the Zod schema (`ModelCapabilitySchema.id`) needs a
 *   closed enum at compile time.
 * — Many function signatures across `src/` accept `ModelId` and rely
 *   on the narrowed type for exhaustiveness.
 *
 * The runtime invariant — `MODEL_IDS` matches the in-tree registry
 * entries — is asserted by `model-ids-invariant.test.ts`. If you add
 * or remove a model in `DEFAULT_MODEL_CAPABILITIES.models`, you must
 * also update this list (and the test will tell you when they drift).
 *
 * Slice E of #2546 will collapse `model-capabilities.ts` itself; at
 * that point `MODEL_IDS` either moves to `model-config-helpers.ts` or
 * its consumers are loosened to `string`. This narrow type stays
 * until then.
 */
export const MODEL_IDS = [
  'claude-fable-5',
  'claude-opus',
  'claude-sonnet',
  'claude-haiku',
  'gemini-3-pro',
  'gemini-pro',
  'gemini-3.5-flash',
  'gemini-3-flash',
  'gemini-flash',
  'gpt-5.5',
  'codex-5.3',
  'codex-5.2',
  'codex-5.1-mini',
  'opencode-default',
  'opencode-custom-opus',
  'opencode-custom-sonnet',
  'openrouter-nemotron-super',
  'openrouter-qwen-coder',
] as const;

export type ModelId = (typeof MODEL_IDS)[number];

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

/** Quality scores for model capability routing (0-10 scale). */
export const QualityScoresSchema = z.object({
  reasoning: z.number().min(0).max(10),
  codeGeneration: z.number().min(0).max(10),
  speed: z.number().min(0).max(10),
  cost: z.number().min(0).max(10),
});

export type QualityScores = z.infer<typeof QualityScoresSchema>;

/** Pricing information (USD per 1M tokens). */
export const PricingSchema = z.object({
  inputPer1M: z.number().nonnegative(),
  outputPer1M: z.number().nonnegative(),
});

export type Pricing = z.infer<typeof PricingSchema>;

export const ModelCapabilitySchema = z.object({
  /** Unique model identifier matching delegate_to_model model IDs */
  id: z.enum(MODEL_IDS),
  /** Human-readable display name */
  displayName: z.string().min(1),
  /** Provider/vendor */
  provider: z.enum(PROVIDERS),
  /** Maximum context window in tokens */
  contextWindow: z.number().int().positive(),
  /** Output modalities this model can produce */
  outputModalities: z.array(z.enum(OUTPUT_MODALITIES)).min(1),
  /** Input modalities this model can accept */
  inputModalities: z.array(z.enum(INPUT_MODALITIES)).min(1),
  /** Tool/integration capabilities */
  toolCapabilities: z.array(z.enum(TOOL_CAPABILITIES)),
  /** Special features beyond standard generation */
  specialFeatures: z.array(z.enum(SPECIAL_FEATURES)),
  /** Known constraints or limitations */
  constraints: z.array(z.string()).optional(),
  /**
   * Request parameters this model REJECTS (e.g. `['temperature']`); the adapter
   * must omit them. Data-driven generalization of `temperatureUnsupportedForModel`
   * (#4067). When absent, the regex fallback in `model-parameter-support.ts`
   * applies (Claude>4.6, OpenAI o-series/codex/gpt-5 reject `temperature`).
   */
  unsupportedParameters: z.array(z.string()).optional(),
  /**
   * Which max-tokens param name this model expects; OpenAI reasoning models use
   * `'max_completion_tokens'` (#4049). Defaults to `'max_tokens'` when absent.
   */
  maxTokensParam: z.enum(['max_tokens', 'max_completion_tokens']).optional(),
  /** Notes about the model (e.g., beta features, pricing tier) */
  notes: z.string().optional(),
  /** Pricing per 1M tokens (USD) */
  pricing: PricingSchema.optional(),
  /** Quality scores for routing (0-10 scale) */
  qualityScores: QualityScoresSchema.optional(),
  /** Maximum output tokens */
  maxOutputTokens: z.number().int().positive().optional(),
  /** Which CLI tool this model belongs to */
  cliName: z.enum(CLI_NAMES).optional(),
  /** Short alias used by the CLI (e.g., 'opus' for Claude CLI) */
  cliAlias: z.string().optional(),
  /** Model name the CLI binary expects (e.g., 'gemini-2.5-pro') */
  cliModelName: z.string().optional(),
  /**
   * Legacy / version-suffixed names that resolve to this model. Used by
   * adapters and routing to map historical user-facing names (e.g.,
   * `claude-opus-4-5-20251101`, `gemini-2.5-pro`) to the current registry
   * entry. Empty strings are rejected; uniqueness within the array is not
   * enforced at schema level (caller responsibility).
   *
   * Added for issue #2199 Child 1; populated by the companion migration
   * epic #2200.
   */
  aliases: z.array(z.string().min(1)).optional(),
  /** Whether this model is deprecated and should receive a scoring penalty */
  deprecated: z.boolean().optional(),
  /** ISO date when the model was deprecated (informational) */
  deprecatedAt: z.string().optional(),
  /** Model ID to migrate to (informational guidance) */
});

export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const ModelCapabilitiesMatrixSchema = z.object({
  /** Schema version for forward compatibility */
  version: z.number().int().positive(),
  /** Last updated date (ISO 8601) */
  updatedAt: z.string(),
  /** Model capability definitions */
  models: z.array(ModelCapabilitySchema).min(1),
});

export type ModelCapabilitiesMatrix = z.infer<typeof ModelCapabilitiesMatrixSchema>;
