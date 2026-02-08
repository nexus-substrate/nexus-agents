/**
 * nexus-agents/config - Model Capabilities Matrix
 *
 * Structured capability definitions for all supported AI models.
 * Tracks output/input modalities, tool support, context windows,
 * and special features based on official provider documentation.
 *
 * @module config/model-capabilities
 * (Source: Issue #683, Epic #682)
 */

import type {
  ModelCapabilitiesMatrix,
  ModelCapability,
  ModelId,
  OutputModality,
  InputModality,
  ToolCapability,
  SpecialFeature,
  Provider,
  CliNameLiteral,
} from './model-capabilities-types.js';

// Re-export types for consumer convenience
export type {
  ModelCapabilitiesMatrix,
  ModelCapability,
  ModelId,
  OutputModality,
  InputModality,
  ToolCapability,
  SpecialFeature,
  Provider,
  QualityScores,
  Pricing,
  CliNameLiteral,
} from './model-capabilities-types.js';

export {
  ModelCapabilitySchema,
  ModelCapabilitiesMatrixSchema,
  QualityScoresSchema,
  PricingSchema,
  OUTPUT_MODALITIES,
  INPUT_MODALITIES,
  TOOL_CAPABILITIES,
  SPECIAL_FEATURES,
  PROVIDERS,
  MODEL_IDS,
  CLI_NAMES,
} from './model-capabilities-types.js';

// ---------------------------------------------------------------------------
// Capabilities Data
// ---------------------------------------------------------------------------

/**
 * Built-in model capabilities matrix.
 *
 * Sources:
 * - Anthropic: docs.anthropic.com (Claude model cards)
 * - Google: ai.google.dev (Gemini API docs, Veo/Imagen release notes)
 * - OpenAI: platform.openai.com (Codex/GPT model cards)
 */
export const DEFAULT_MODEL_CAPABILITIES: ModelCapabilitiesMatrix = {
  version: 2,
  updatedAt: '2026-02-08',
  models: [
    // ----- Anthropic Claude -----
    {
      id: 'claude-opus',
      displayName: 'Claude Opus 4.5',
      provider: 'anthropic',
      contextWindow: 200_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'pdf', 'code'],
      toolCapabilities: ['mcp', 'function_calling', 'computer_use', 'structured_output'],
      specialFeatures: ['extended_thinking', 'streaming', 'citations'],
      notes: 'Strongest reasoning; ideal for architecture and complex analysis',
      pricing: { inputPer1M: 15.0, outputPer1M: 75.0 },
      qualityScores: { reasoning: 10, codeGeneration: 9, speed: 5, cost: 3 },
      maxOutputTokens: 64_000,
      cliName: 'claude',
      cliAlias: 'opus',
    },
    {
      id: 'claude-sonnet',
      displayName: 'Claude Sonnet 4',
      provider: 'anthropic',
      contextWindow: 200_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'pdf', 'code'],
      toolCapabilities: ['mcp', 'function_calling', 'computer_use', 'structured_output'],
      specialFeatures: ['extended_thinking', 'streaming', 'citations'],
      notes: 'Balanced performance and cost; default routing target',
      pricing: { inputPer1M: 3.0, outputPer1M: 15.0 },
      qualityScores: { reasoning: 9, codeGeneration: 9, speed: 7, cost: 6 },
      maxOutputTokens: 64_000,
      cliName: 'claude',
      cliAlias: 'sonnet',
    },
    {
      id: 'claude-haiku',
      displayName: 'Claude Haiku 3.5',
      provider: 'anthropic',
      contextWindow: 200_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'pdf', 'code'],
      toolCapabilities: ['mcp', 'function_calling', 'structured_output'],
      specialFeatures: ['streaming'],
      notes: 'Fastest Claude model; optimized for speed and cost',
      pricing: { inputPer1M: 0.25, outputPer1M: 1.25 },
      qualityScores: { reasoning: 7, codeGeneration: 7, speed: 9, cost: 9 },
      maxOutputTokens: 64_000,
      cliName: 'claude',
      cliAlias: 'haiku',
    },
    // ----- Google Gemini -----
    {
      id: 'gemini-3-pro',
      displayName: 'Gemini 3 Pro (Preview)',
      provider: 'google',
      contextWindow: 1_000_000,
      outputModalities: [
        'text',
        'image_png',
        'image_jpeg',
        'audio_pcm',
        'audio_wav',
        'structured_json',
        'code',
      ],
      inputModalities: ['text', 'image', 'audio', 'video', 'pdf', 'code'],
      toolCapabilities: [
        'function_calling',
        'code_execution_sandbox',
        'web_search',
        'structured_output',
      ],
      specialFeatures: ['deep_research', 'streaming', 'grounding', 'live_api'],
      notes: 'Next-gen Gemini; improved reasoning over 2.5 Pro; 1M context',
      pricing: { inputPer1M: 1.25, outputPer1M: 10.0 },
      qualityScores: { reasoning: 10, codeGeneration: 9, speed: 8, cost: 7 },
      maxOutputTokens: 65_536,
      cliName: 'gemini',
      cliModelName: 'gemini-3-pro-preview',
    },
    {
      id: 'gemini-pro',
      displayName: 'Gemini 2.5 Pro',
      provider: 'google',
      contextWindow: 1_000_000,
      outputModalities: [
        'text',
        'image_png',
        'image_jpeg',
        'audio_pcm',
        'audio_wav',
        'structured_json',
        'code',
      ],
      inputModalities: ['text', 'image', 'audio', 'video', 'pdf', 'code'],
      toolCapabilities: [
        'function_calling',
        'code_execution_sandbox',
        'web_search',
        'structured_output',
      ],
      specialFeatures: ['deep_research', 'streaming', 'grounding', 'live_api'],
      notes: 'Largest context (1M tokens); complex reasoning; native multimodal output',
      pricing: { inputPer1M: 1.25, outputPer1M: 10.0 },
      qualityScores: { reasoning: 9, codeGeneration: 8, speed: 8, cost: 7 },
      maxOutputTokens: 8_192,
      cliName: 'gemini',
      cliModelName: 'gemini-2.5-pro',
    },
    {
      id: 'gemini-3-flash',
      displayName: 'Gemini 3 Flash (Preview)',
      provider: 'google',
      contextWindow: 1_000_000,
      outputModalities: ['text', 'image_png', 'image_jpeg', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'audio', 'video', 'pdf', 'code'],
      toolCapabilities: [
        'function_calling',
        'code_execution_sandbox',
        'web_search',
        'structured_output',
      ],
      specialFeatures: ['streaming', 'grounding'],
      notes: 'Next-gen fast Gemini; improved over 2.5 Flash; 1M context',
      pricing: { inputPer1M: 0.15, outputPer1M: 0.6 },
      qualityScores: { reasoning: 8, codeGeneration: 8, speed: 10, cost: 9 },
      maxOutputTokens: 65_536,
      cliName: 'gemini',
      cliModelName: 'gemini-3-flash-preview',
    },
    {
      id: 'gemini-flash',
      displayName: 'Gemini 2.5 Flash',
      provider: 'google',
      contextWindow: 1_000_000,
      outputModalities: ['text', 'image_png', 'image_jpeg', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'audio', 'video', 'pdf', 'code'],
      toolCapabilities: [
        'function_calling',
        'code_execution_sandbox',
        'web_search',
        'structured_output',
      ],
      specialFeatures: ['streaming', 'grounding'],
      notes: 'Ultra-fast Gemini 2.5; 1M context; agents and streaming optimized',
      pricing: { inputPer1M: 0.15, outputPer1M: 0.6 },
      qualityScores: { reasoning: 7, codeGeneration: 7, speed: 10, cost: 9 },
      maxOutputTokens: 8_192,
      cliName: 'gemini',
      cliModelName: 'gemini-2.5-flash',
    },
    // ----- OpenAI Codex -----
    {
      id: 'codex-5.3',
      displayName: 'GPT-5.3-Codex',
      provider: 'openai',
      contextWindow: 400_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'pdf', 'code'],
      toolCapabilities: [
        'function_calling',
        'code_execution_sandbox',
        'web_search',
        'file_operations',
        'structured_output',
        'apply_patch',
      ],
      specialFeatures: ['streaming'],
      notes: 'Latest Codex; strongest code generation + reasoning; 400K context',
      pricing: { inputPer1M: 2.0, outputPer1M: 8.0 },
      qualityScores: { reasoning: 10, codeGeneration: 10, speed: 7, cost: 5 },
      maxOutputTokens: 100_000,
      cliName: 'codex',
      cliModelName: 'o3',
    },
    {
      id: 'codex-5.2',
      displayName: 'GPT-5.2-Codex',
      provider: 'openai',
      contextWindow: 400_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'pdf', 'code'],
      toolCapabilities: [
        'function_calling',
        'code_execution_sandbox',
        'web_search',
        'file_operations',
        'structured_output',
        'apply_patch',
      ],
      specialFeatures: ['streaming'],
      constraints: [
        'Sandboxed execution only (Landlock/seccomp on Linux)',
        'No native image/audio/video generation',
        'Network access restricted in sandbox',
      ],
      notes: 'Best code generation; 400K context; sandboxed execution environment',
      pricing: { inputPer1M: 2.0, outputPer1M: 8.0 },
      qualityScores: { reasoning: 9, codeGeneration: 10, speed: 8, cost: 7 },
      maxOutputTokens: 100_000,
      cliName: 'codex',
    },
    {
      id: 'codex-5.1-mini',
      displayName: 'GPT-5.1-Mini-Codex',
      provider: 'openai',
      contextWindow: 400_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'code'],
      toolCapabilities: [
        'function_calling',
        'code_execution_sandbox',
        'file_operations',
        'structured_output',
        'apply_patch',
      ],
      specialFeatures: ['streaming'],
      constraints: ['Sandboxed execution only', 'No native image/audio/video generation'],
      notes: 'Compact Codex variant; fast and cost-effective for code tasks',
      pricing: { inputPer1M: 0.5, outputPer1M: 2.0 },
      qualityScores: { reasoning: 7, codeGeneration: 8, speed: 9, cost: 9 },
      maxOutputTokens: 100_000,
      cliName: 'codex',
      cliModelName: 'o3-mini',
    },
  ],
};

/**
 * Default (strongest) model per CLI tool.
 * Quality-first: each CLI routes to its strongest model by default.
 */
export const DEFAULT_MODEL_PER_CLI: Record<CliNameLiteral, ModelId> = {
  claude: 'claude-opus',
  gemini: 'gemini-3-pro',
  codex: 'codex-5.3',
};

// ---------------------------------------------------------------------------
// Query Functions
// ---------------------------------------------------------------------------

/** Get capabilities for a specific model by ID. */
export function getModelCapabilities(
  modelId: string,
  matrix: ModelCapabilitiesMatrix = DEFAULT_MODEL_CAPABILITIES
): ModelCapability | undefined {
  return matrix.models.find((m) => m.id === modelId);
}

/** Find all models that support a given output modality. */
export function findModelsByOutputModality(
  modality: OutputModality,
  matrix: ModelCapabilitiesMatrix = DEFAULT_MODEL_CAPABILITIES
): ModelCapability[] {
  return matrix.models.filter((m) => m.outputModalities.includes(modality));
}

/** Find all models that support a given input modality. */
export function findModelsByInputModality(
  modality: InputModality,
  matrix: ModelCapabilitiesMatrix = DEFAULT_MODEL_CAPABILITIES
): ModelCapability[] {
  return matrix.models.filter((m) => m.inputModalities.includes(modality));
}

/** Find all models that support a given tool capability. */
export function findModelsByToolCapability(
  capability: ToolCapability,
  matrix: ModelCapabilitiesMatrix = DEFAULT_MODEL_CAPABILITIES
): ModelCapability[] {
  return matrix.models.filter((m) => m.toolCapabilities.includes(capability));
}

/** Find all models that have a given special feature. */
export function findModelsByFeature(
  feature: SpecialFeature,
  matrix: ModelCapabilitiesMatrix = DEFAULT_MODEL_CAPABILITIES
): ModelCapability[] {
  return matrix.models.filter((m) => m.specialFeatures.includes(feature));
}

/** Find all models from a specific provider. */
export function findModelsByProvider(
  provider: Provider,
  matrix: ModelCapabilitiesMatrix = DEFAULT_MODEL_CAPABILITIES
): ModelCapability[] {
  return matrix.models.filter((m) => m.provider === provider);
}

/** Find the best model for a required output modality, preferring larger context. */
export function findBestModelForOutput(
  modality: OutputModality,
  matrix: ModelCapabilitiesMatrix = DEFAULT_MODEL_CAPABILITIES
): ModelCapability | undefined {
  const candidates = findModelsByOutputModality(modality, matrix);
  if (candidates.length === 0) return undefined;
  return candidates.sort((a, b) => b.contextWindow - a.contextWindow)[0];
}

/** Check that `haystack` includes every item in `required`. */
function includesAll<T>(haystack: readonly T[], required: readonly T[] | undefined): boolean {
  if (required === undefined) return true;
  return required.every((item) => haystack.includes(item));
}

/**
 * Check if a model supports all required capabilities.
 * Useful for filtering models before routing.
 */
export function modelSupportsAll(
  modelId: ModelId,
  requirements: {
    outputModalities?: OutputModality[];
    inputModalities?: InputModality[];
    toolCapabilities?: ToolCapability[];
    specialFeatures?: SpecialFeature[];
    minContextWindow?: number;
  },
  matrix: ModelCapabilitiesMatrix = DEFAULT_MODEL_CAPABILITIES
): boolean {
  const model = getModelCapabilities(modelId, matrix);
  if (model === undefined) return false;

  const meetsContext =
    requirements.minContextWindow === undefined ||
    model.contextWindow >= requirements.minContextWindow;

  return (
    meetsContext &&
    includesAll(model.outputModalities, requirements.outputModalities) &&
    includesAll(model.inputModalities, requirements.inputModalities) &&
    includesAll(model.toolCapabilities, requirements.toolCapabilities) &&
    includesAll(model.specialFeatures, requirements.specialFeatures)
  );
}
