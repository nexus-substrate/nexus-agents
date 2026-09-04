/* eslint-disable max-lines -- data-only registry; grows with every supported model (#4176) */
/**
 * nexus-agents/config - In-tree model data
 *
 * Hardcoded model capabilities matrix that feeds the ModelRegistry's
 * tier-2 (in-tree authoritative) entries via the converter in
 * `in-tree-entries.ts`. Renamed from `model-capabilities.ts` as the
 * finale of epic #2546 — the legacy helper surface (find*,
 * getModelCapabilities, modelSupportsAll) moved to
 * `model-config-helpers.ts` as registry-backed equivalents; this
 * file is data-only.
 *
 * Consumers should NOT import from here directly — they should read
 * via `getDefaultRegistry()` or the helpers in
 * `model-config-helpers.ts`. The only legitimate direct importers
 * are `in-tree-entries.ts` (the converter) and the helpers module
 * itself.
 *
 * @module config/in-tree-data
 * (Source: Issue #683, Epic #682; renamed in #2546 slice E)
 */

import type {
  ModelCapabilitiesMatrix,
  ModelId,
  CliNameLiteral,
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
  version: 3,
  updatedAt: '2026-07-03',
  models: [
    // ----- Anthropic Claude -----
    {
      id: 'claude-fable-5',
      displayName: 'Claude Fable 5',
      provider: 'anthropic',
      contextWindow: 1_000_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'pdf', 'code'],
      toolCapabilities: ['mcp', 'function_calling', 'computer_use', 'structured_output'],
      specialFeatures: ['extended_thinking', 'streaming', 'citations', 'context_caching'],
      notes: 'Frontier Claude (models.dev 2026-06-29); above Opus 4.6; 1M context',
      pricing: { inputPer1M: 10.0, outputPer1M: 50.0 },
      qualityScores: { reasoning: 10, codeGeneration: 10, speed: 5, cost: 4 },
      maxOutputTokens: 128_000,
      cliName: 'claude',
      cliAlias: 'fable',
      cliModelName: 'claude-fable-5',
      // #4176 belt-and-braces: fable→5.0 regex fallback already rejects temperature.
      unsupportedParameters: ['temperature'],
    },
    {
      id: 'claude-opus',
      displayName: 'Claude Opus 4.6',
      provider: 'anthropic',
      contextWindow: 1_000_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'pdf', 'code'],
      toolCapabilities: ['mcp', 'function_calling', 'computer_use', 'structured_output'],
      specialFeatures: ['extended_thinking', 'streaming', 'citations', 'context_caching'],
      notes:
        'Strongest reasoning; 1M context GA (March 2026); ideal for architecture and complex analysis',
      pricing: { inputPer1M: 5.0, outputPer1M: 25.0 },
      qualityScores: { reasoning: 10, codeGeneration: 9, speed: 5, cost: 6 },
      maxOutputTokens: 128_000,
      cliName: 'claude',
      cliAlias: 'opus',
      cliModelName: 'claude-opus-4-6',
      aliases: ['claude-opus-4', 'claude-opus-4-5-20251101'],
    },
    {
      id: 'claude-sonnet',
      displayName: 'Claude Sonnet 4.6',
      provider: 'anthropic',
      contextWindow: 1_000_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'pdf', 'code'],
      toolCapabilities: ['mcp', 'function_calling', 'computer_use', 'structured_output'],
      specialFeatures: ['extended_thinking', 'streaming', 'citations', 'context_caching'],
      notes: 'Balanced performance and cost; 1M context GA (March 2026); default routing target',
      pricing: { inputPer1M: 3.0, outputPer1M: 15.0 },
      qualityScores: { reasoning: 9, codeGeneration: 9, speed: 7, cost: 6 },
      maxOutputTokens: 64_000,
      cliName: 'claude',
      cliAlias: 'sonnet',
      cliModelName: 'claude-sonnet-4-6',
      aliases: ['claude-sonnet-4', 'claude-sonnet-4-5-20250929'],
    },
    {
      id: 'claude-haiku',
      displayName: 'Claude Haiku 4.5',
      provider: 'anthropic',
      contextWindow: 200_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'pdf', 'code'],
      toolCapabilities: ['mcp', 'function_calling', 'structured_output'],
      specialFeatures: ['streaming'],
      notes: 'Fastest Claude model; optimized for speed and cost',
      pricing: { inputPer1M: 1.0, outputPer1M: 5.0 },
      qualityScores: { reasoning: 7, codeGeneration: 7, speed: 9, cost: 9 },
      maxOutputTokens: 64_000,
      cliName: 'claude',
      cliAlias: 'haiku',
      cliModelName: 'claude-haiku-4-5-20251001',
      aliases: ['claude-haiku-4', 'claude-haiku-3'],
    },
    // ----- Google Gemini -----
    {
      id: 'gemini-3-pro',
      displayName: 'Gemini 3.1 Pro (Preview)',
      provider: 'google',
      contextWindow: 1_048_576,
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
      notes: 'Gemini 3.1 Pro; replaces deprecated 3 Pro Preview (March 9 2026); 1M context',
      pricing: { inputPer1M: 2.0, outputPer1M: 12.0 },
      qualityScores: { reasoning: 10, codeGeneration: 9, speed: 8, cost: 6 },
      maxOutputTokens: 65_536,
      cliName: 'gemini',
      cliModelName: 'gemini-3.1-pro-preview',
    },
    {
      id: 'gemini-pro',
      displayName: 'Gemini 2.5 Pro',
      provider: 'google',
      contextWindow: 1_048_576,
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
      maxOutputTokens: 65_536,
      cliName: 'gemini',
      cliModelName: 'gemini-2.5-pro',
    },
    {
      id: 'gemini-3.5-flash',
      displayName: 'Gemini 3.5 Flash',
      provider: 'google',
      contextWindow: 1_048_576,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'audio', 'video', 'pdf', 'code'],
      toolCapabilities: [
        'function_calling',
        'code_execution_sandbox',
        'web_search',
        'structured_output',
      ],
      specialFeatures: ['streaming', 'grounding'],
      notes: 'Latest fast Gemini (models.dev 2026-06-29); flash tier, NOT the gemini default',
      pricing: { inputPer1M: 1.5, outputPer1M: 9.0 },
      // Flash tier: reasoning stays BELOW gemini-3-pro (10) so pro keeps winning.
      qualityScores: { reasoning: 8, codeGeneration: 9, speed: 10, cost: 8 },
      maxOutputTokens: 65_536,
      cliName: 'gemini',
      cliModelName: 'gemini-3.5-flash',
    },
    {
      id: 'gemini-3-flash',
      displayName: 'Gemini 3 Flash (Preview)',
      provider: 'google',
      contextWindow: 1_048_576,
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
      pricing: { inputPer1M: 0.5, outputPer1M: 3.0 },
      qualityScores: { reasoning: 8, codeGeneration: 8, speed: 10, cost: 9 },
      maxOutputTokens: 65_536,
      cliName: 'gemini',
      cliModelName: 'gemini-3-flash-preview',
    },
    {
      id: 'gemini-flash',
      displayName: 'Gemini 2.5 Flash',
      provider: 'google',
      contextWindow: 1_048_576,
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
      pricing: { inputPer1M: 0.3, outputPer1M: 2.5 },
      qualityScores: { reasoning: 7, codeGeneration: 7, speed: 10, cost: 9 },
      maxOutputTokens: 65_536,
      cliName: 'gemini',
      cliModelName: 'gemini-2.5-flash',
    },
    // ----- OpenAI Codex -----
    {
      id: 'gpt-5.5',
      displayName: 'GPT-5.5',
      provider: 'openai',
      contextWindow: 1_050_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'pdf', 'code'],
      toolCapabilities: [
        'function_calling',
        'code_execution_sandbox',
        'web_search',
        'file_operations',
        'structured_output',
        'apply_patch',
        'computer_use',
      ],
      specialFeatures: ['streaming'],
      notes: 'Frontier GPT (models.dev 2026-06-29); succeeds GPT-5.4 in Codex CLI; 1M context',
      pricing: { inputPer1M: 5.0, outputPer1M: 30.0 },
      qualityScores: { reasoning: 10, codeGeneration: 10, speed: 7, cost: 4 },
      maxOutputTokens: 128_000,
      cliName: 'codex',
      cliModelName: 'gpt-5.5',
      unsupportedParameters: ['temperature'],
      maxTokensParam: 'max_completion_tokens',
    },
    {
      id: 'codex-5.3',
      displayName: 'GPT-5.4',
      provider: 'openai',
      contextWindow: 1_050_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'pdf', 'code'],
      toolCapabilities: [
        'function_calling',
        'code_execution_sandbox',
        'web_search',
        'file_operations',
        'structured_output',
        'apply_patch',
        'computer_use',
      ],
      specialFeatures: ['streaming'],
      notes: 'GPT-5.4; replaces GPT-5.3-Codex in Codex CLI; 1M context; native computer use',
      pricing: { inputPer1M: 2.5, outputPer1M: 15.0 },
      qualityScores: { reasoning: 10, codeGeneration: 10, speed: 7, cost: 5 },
      maxOutputTokens: 128_000,
      cliName: 'codex',
      cliModelName: 'gpt-5.4',
      unsupportedParameters: ['temperature'],
      maxTokensParam: 'max_completion_tokens',
    },
    {
      id: 'codex-5.2',
      displayName: 'GPT-5.3 Codex Spark',
      provider: 'openai',
      contextWindow: 128_000,
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
      // #5091: repointed from gpt-5.2-codex, which codex 0.146.0 no longer
      // serves (~/.codex/models_cache.json visibility=list). Context window,
      // max output and pricing are models.dev's figures for this slug
      // (snapshot 2026-08-31). Quality scores are the codex arm's tier
      // positions carried over from the replaced entry, not a measurement of
      // this slug; `cost` is unchanged because the price is identical.
      notes:
        'GPT-5.3 Codex Spark (models.dev 2026-08-31); fast codex-tuned tier below GPT-5.4; 128K context; sandboxed execution environment',
      pricing: { inputPer1M: 1.75, outputPer1M: 14.0 },
      qualityScores: { reasoning: 9, codeGeneration: 10, speed: 8, cost: 7 },
      maxOutputTokens: 32_000,
      cliName: 'codex',
      cliModelName: 'gpt-5.3-codex-spark',
      unsupportedParameters: ['temperature'],
      maxTokensParam: 'max_completion_tokens',
    },
    {
      id: 'codex-5.1-mini',
      displayName: 'GPT-5.4 Mini',
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
      // #5091: repointed from o3-mini, which codex 0.146.0 no longer serves
      // (~/.codex/models_cache.json visibility=list). Context window, max
      // output and pricing are models.dev's figures for this slug (snapshot
      // 2026-08-31). Quality scores are the codex arm's tier positions carried
      // over from the replaced entry, not a measurement of this slug; `cost`
      // follows the registry's own price scale ($1/$5 haiku and $0.5/$3
      // gemini-3-flash both score 9, and $0.75/$4.5 sits between them).
      notes:
        'GPT-5.4 Mini (models.dev 2026-08-31); compact codex tier; fast and cost-effective for code tasks; 400K context',
      pricing: { inputPer1M: 0.75, outputPer1M: 4.5 },
      qualityScores: { reasoning: 7, codeGeneration: 8, speed: 9, cost: 9 },
      maxOutputTokens: 128_000,
      cliName: 'codex',
      cliModelName: 'gpt-5.4-mini',
      unsupportedParameters: ['temperature'],
      maxTokensParam: 'max_completion_tokens',
    },
    // ----- OpenCode (multi-provider proxy) -----
    {
      id: 'opencode-default',
      displayName: 'OpenCode Default',
      provider: 'anthropic',
      contextWindow: 1_000_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'code'],
      toolCapabilities: ['mcp', 'function_calling', 'file_operations', 'structured_output'],
      specialFeatures: ['streaming'],
      notes: 'OpenCode multi-provider proxy; model selected via --model flag',
      pricing: { inputPer1M: 3.0, outputPer1M: 15.0 },
      qualityScores: { reasoning: 9, codeGeneration: 9, speed: 7, cost: 6 },
      maxOutputTokens: 64_000,
      cliName: 'opencode',
      cliModelName: 'anthropic/claude-sonnet-4-6',
    },
    // ----- OpenCode + Custom OpenAI-compatible endpoint -----
    {
      id: 'opencode-custom-opus',
      displayName: 'Custom Endpoint — Claude Opus',
      provider: 'custom-openai',
      contextWindow: 1_000_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'pdf', 'code'],
      toolCapabilities: ['mcp', 'function_calling', 'structured_output'],
      specialFeatures: ['extended_thinking', 'streaming', 'citations', 'context_caching'],
      notes: 'Claude Opus via custom OpenAI-compatible gateway (opencode transport); 1M context',
      pricing: { inputPer1M: 5.0, outputPer1M: 25.0 },
      qualityScores: { reasoning: 10, codeGeneration: 9, speed: 5, cost: 6 },
      maxOutputTokens: 128_000,
      cliName: 'opencode',
      cliAlias: 'custom-opus',
      cliModelName: 'custom/claude-opus-4-6',
    },
    {
      id: 'opencode-custom-sonnet',
      displayName: 'Custom Endpoint — Claude Sonnet',
      provider: 'custom-openai',
      contextWindow: 1_000_000,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'image', 'pdf', 'code'],
      toolCapabilities: ['mcp', 'function_calling', 'structured_output'],
      specialFeatures: ['streaming', 'citations', 'context_caching'],
      notes: 'Claude Sonnet via custom OpenAI-compatible gateway (opencode transport); 1M context',
      pricing: { inputPer1M: 3.0, outputPer1M: 15.0 },
      qualityScores: { reasoning: 9, codeGeneration: 9, speed: 7, cost: 6 },
      maxOutputTokens: 64_000,
      cliName: 'opencode',
      cliAlias: 'custom-sonnet',
      cliModelName: 'custom/claude-sonnet-4-6',
    },

    // ── OpenRouter Free Models (via OpenAI-compatible API) ────────
    {
      id: 'openrouter-nemotron-super',
      displayName: 'NVIDIA Nemotron 3 Super 120B (free)',
      provider: 'openrouter',
      // The `:free` SKU serves 262K; the paid `nvidia/nemotron-3-super-120b-a12b`
      // is the 1M one. Copying the paid variant's headline here made every
      // context-budgeting consumer overstate capacity by ~4x (#4416).
      contextWindow: 262_144,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'code'],
      toolCapabilities: ['function_calling', 'structured_output'],
      specialFeatures: ['streaming'],
      notes:
        'Hybrid Mamba-Transformer MoE (120B total, 12B active). ' +
        'Designed for agentic reasoning. Free via OpenRouter.',
      pricing: { inputPer1M: 0, outputPer1M: 0 },
      qualityScores: { reasoning: 7, codeGeneration: 7, speed: 8, cost: 10 },
      maxOutputTokens: 32_768,
      cliName: 'opencode',
      cliModelName: 'nvidia/nemotron-3-super-120b-a12b:free',
    },
    {
      id: 'openrouter-qwen-coder',
      displayName: 'Qwen3 Coder 480B A35B',
      provider: 'openrouter',
      contextWindow: 262_144,
      outputModalities: ['text', 'structured_json', 'code'],
      inputModalities: ['text', 'code'],
      toolCapabilities: ['function_calling', 'structured_output'],
      specialFeatures: ['streaming'],
      notes:
        'Strongest coding-specialized model on OpenRouter. 480B parameters ' +
        '(35B active), 262K context. The zero-cost SKU this entry used to ' +
        'point at was retired (#4410); `qwen/qwen3-coder` is the same ' +
        'checkpoint at list price.',
      pricing: { inputPer1M: 0.3, outputPer1M: 1 },
      qualityScores: { reasoning: 7, codeGeneration: 8, speed: 6, cost: 9 },
      maxOutputTokens: 32_768,
      cliName: 'opencode',
      cliModelName: 'qwen/qwen3-coder',
    },
  ],
};

/**
 * Default (strongest) model per CLI tool.
 * Quality-first: each CLI routes to its strongest model by default.
 */
export const DEFAULT_MODEL_PER_CLI: Record<CliNameLiteral, ModelId> = {
  // #4176: fable/gpt-5.5 are strongest per CLI; gemini-3.5-flash is flash-tier, not default.
  claude: 'claude-fable-5',
  gemini: 'gemini-3-pro',
  codex: 'gpt-5.5',
  opencode: 'opencode-default',
};

/** A per-1M-token USD pricing pair (input/output). */
export interface CostPer1M {
  readonly input: number;
  readonly output: number;
}

/**
 * Static per-CLI USD/1M-token fallback, used ONLY when the registry has no
 * pricing for a CLI's resolved default model (#4168). Single authoritative
 * representation of the former hardcoded per-CLI cost tables (previously
 * duplicated in `budget-utils.TOKEN_COSTS`, `budget-stage`'s
 * `COST_PER_1K_TOKENS`, and `test-metrics`).
 *
 * It is a FALLBACK, not the primary source: a priced model always upgrades to
 * real registry data via `resolveModelCostPer1M`. Because every current
 * `DEFAULT_MODEL_PER_CLI` entry is priced, this map is dormant today; it exists
 * so an UNPRICED candidate stays CONSERVATIVE (never $0) in budget/TOPSIS gates
 * — a $0 fails OPEN and gets the unknown model over-selected (#4168 cond. 2).
 *
 * Lives in this leaf data module (not `model-config-helpers`) so the
 * module-load-time `buildTopsisProfiles` call reads it after initialization,
 * dodging the TDZ hazard documented for the registry builders.
 */
export const STATIC_CLI_COST_PER_1M: Record<CliNameLiteral, CostPer1M> = {
  claude: { input: 3.0, output: 15.0 },
  gemini: { input: 0.075, output: 0.3 },
  codex: { input: 2.5, output: 10.0 },
  opencode: { input: 2.0, output: 8.0 },
};
