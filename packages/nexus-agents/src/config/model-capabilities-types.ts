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
] as const;

export type SpecialFeature = (typeof SPECIAL_FEATURES)[number];

// ---------------------------------------------------------------------------
// Provider & Model ID enums
// ---------------------------------------------------------------------------

export const PROVIDERS = ['anthropic', 'google', 'openai'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const MODEL_IDS = [
  'claude-opus',
  'claude-sonnet',
  'claude-haiku',
  'gemini-pro',
  'gemini-flash',
  'codex-5.3',
  'codex-5.2',
  'codex-5.1-mini',
] as const;

export type ModelId = (typeof MODEL_IDS)[number];

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

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
  /** Notes about the model (e.g., beta features, pricing tier) */
  notes: z.string().optional(),
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
