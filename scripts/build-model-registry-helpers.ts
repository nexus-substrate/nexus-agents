/**
 * Pure helpers for the build-time model registry generator (T2 tier, epic #2174).
 *
 * Parsing, merging, and bounds validation are isolated here so they can be
 * unit-tested offline against fixture inputs — the orchestration script
 * (`build-model-registry.ts`) is kept thin.
 *
 * @module scripts/build-model-registry-helpers
 */

import type {
  GeneratedModelEntry,
  LiteLlmEntry,
  LiteLlmResponse,
  ModelsDevEntry,
  ModelsDevResponse,
} from './build-model-registry-types.js';
import {
  MAX_CONTEXT_WINDOW,
  MAX_COST_PER_1M_USD,
  GeneratedModelEntrySchema,
  LiteLlmEntrySchema,
  ModelsDevEntrySchema,
} from './build-model-registry-types.js';
import type { GeneratedPricing } from './build-model-registry-types.js';

// ---------------------------------------------------------------------------
// Provider allow-list
// ---------------------------------------------------------------------------

/**
 * Upstream providers we emit into the generated registry.
 * Matches the providers the router can actually reach today plus the
 * vendor-native paths that are live targets for epic #2182 (Bedrock / Vertex /
 * Azure). Emitting these as T2 metadata lets billing + ctx lookup work even
 * before the provider plugins land.
 *
 * Narrower than the full upstream coverage on purpose — adding providers
 * bloats the bundled JSON without giving the current router anything to do
 * with the entries. Users who need additional providers can add them via
 * the T3 YAML overlay (#2178).
 */
export const ALLOWED_MODELS_DEV_PROVIDERS: readonly string[] = [
  'anthropic',
  'google',
  'openai',
  'amazon-bedrock',
  'google-vertex',
  'azure-openai',
  'openrouter',
  'deepseek',
] as const;

/** LiteLLM uses its own provider names; map to our canonical provider ids. */
export const LITELLM_PROVIDER_CANONICAL: Record<string, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  'vertex_ai-anthropic_models': 'google-vertex',
  'vertex_ai-language-models': 'google-vertex',
  vertex_ai: 'google-vertex',
  bedrock: 'amazon-bedrock',
  bedrock_converse: 'amazon-bedrock',
  azure: 'azure-openai',
  azure_ai: 'azure-openai',
  openrouter: 'openrouter',
  gemini: 'google',
  deepseek: 'deepseek',
};

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function isPositive(value: number | undefined): boolean {
  return value !== undefined && value > 0;
}

function modelsDevEntryHasUsableData(entry: ModelsDevEntry): boolean {
  return (
    isPositive(entry.cost?.input) ||
    isPositive(entry.cost?.output) ||
    isPositive(entry.limit?.context) ||
    isPositive(entry.limit?.output)
  );
}

/** Whether a models.dev entry should be included in the output. */
export function shouldIncludeModelsDevEntry(providerId: string, entry: ModelsDevEntry): boolean {
  if (!ALLOWED_MODELS_DEV_PROVIDERS.includes(providerId)) return false;
  return modelsDevEntryHasUsableData(entry);
}

function isChatLikeMode(mode: string | undefined): boolean {
  return mode === undefined || mode === 'chat' || mode === 'completion';
}

function liteLlmEntryHasUsableData(entry: LiteLlmEntry): boolean {
  const hasPricing =
    isPositive(entry.input_cost_per_token) || isPositive(entry.output_cost_per_token);
  const hasContext = isPositive(entry.max_input_tokens) || isPositive(entry.max_tokens);
  return hasPricing || hasContext;
}

/** models.dev cost block → generated pricing, cache rates included (#5170). */
function modelsDevPricing(entry: ModelsDevEntry): GeneratedPricing | undefined {
  return toPricing(
    entry.cost?.input,
    entry.cost?.output,
    entry.cost?.cache_read,
    entry.cost?.cache_write
  );
}

/** Whether a LiteLLM entry should be included (filters sample_spec + image-gen). */
export function shouldIncludeLiteLlmEntry(id: string, entry: LiteLlmEntry): boolean {
  if (id === 'sample_spec') return false;
  const provider = entry.litellm_provider;
  if (provider === undefined || !(provider in LITELLM_PROVIDER_CANONICAL)) return false;
  if (!isChatLikeMode(entry.mode)) return false;
  return liteLlmEntryHasUsableData(entry);
}

// ---------------------------------------------------------------------------
// Mapping upstream → generated entry
// ---------------------------------------------------------------------------

interface MapContext {
  readonly fetchedAt: string;
}

function positiveOrUndefined(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}

export function mapModelsDevEntry(
  providerId: string,
  entry: ModelsDevEntry,
  ctx: MapContext
): GeneratedModelEntry | undefined {
  const context = positiveOrUndefined(entry.limit?.context);
  if (context === undefined) return undefined;
  const pricing = modelsDevPricing(entry);
  const maxOutput = positiveOrUndefined(entry.limit?.output);
  const candidate = {
    id: `${providerId}/${entry.id}`,
    displayName: entry.name ?? entry.id,
    provider: providerId,
    contextWindow: context,
    ...(pricing !== undefined ? { pricing } : {}),
    ...(maxOutput !== undefined ? { maxOutputTokens: maxOutput } : {}),
    provenance: {
      source: 'models.dev' as const,
      fetchedAt: ctx.fetchedAt,
      upstreamUrl: 'https://models.dev/api.json',
    },
  };
  const parsed = GeneratedModelEntrySchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

function resolveLiteLlmProvider(entry: LiteLlmEntry): string | undefined {
  const provider = entry.litellm_provider;
  if (provider === undefined) return undefined;
  return LITELLM_PROVIDER_CANONICAL[provider];
}

export function mapLiteLlmEntry(
  id: string,
  entry: LiteLlmEntry,
  ctx: MapContext
): GeneratedModelEntry | undefined {
  const canonicalProvider = resolveLiteLlmProvider(entry);
  if (canonicalProvider === undefined) return undefined;

  const contextWindow = positiveOrUndefined(entry.max_input_tokens ?? entry.max_tokens);
  if (contextWindow === undefined) return undefined;

  const pricing = toPricingFromPerToken(
    entry.input_cost_per_token,
    entry.output_cost_per_token,
    entry.cache_read_input_token_cost,
    entry.cache_creation_input_token_cost
  );
  const maxOutput = positiveOrUndefined(entry.max_output_tokens);
  const candidate = {
    id: `${canonicalProvider}/${id}`,
    displayName: id,
    provider: canonicalProvider,
    contextWindow,
    ...(pricing !== undefined ? { pricing } : {}),
    ...(maxOutput !== undefined ? { maxOutputTokens: maxOutput } : {}),
    ...(entry.deprecation_date !== undefined ? { deprecated: true } : {}),
    provenance: {
      source: 'litellm' as const,
      fetchedAt: ctx.fetchedAt,
      upstreamUrl:
        'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
    },
  };
  const parsed = GeneratedModelEntrySchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

// ---------------------------------------------------------------------------
// Pricing helpers
// ---------------------------------------------------------------------------

/** models.dev publishes per-MILLION rates, so no scaling. */
function toPricing(
  input: number | undefined,
  output: number | undefined,
  cacheRead?: number,
  cacheWrite?: number
): GeneratedPricing | undefined {
  if (input === undefined || output === undefined) return undefined;
  return {
    inputPer1M: round4(input),
    outputPer1M: round4(output),
    // Spread-if-defined: an absent cache rate must stay ABSENT, not become 0.
    // A zero would price a cache-heavy call as free instead of reporting the
    // component unpriced (#5170).
    ...(cacheRead !== undefined && { cacheReadPer1M: round4(cacheRead) }),
    ...(cacheWrite !== undefined && { cacheWritePer1M: round4(cacheWrite) }),
  };
}

/** LiteLLM publishes per-TOKEN rates, so every component scales by 1e6. */
function toPricingFromPerToken(
  input: number | undefined,
  output: number | undefined,
  cacheRead?: number,
  cacheWrite?: number
): GeneratedPricing | undefined {
  if (input === undefined || output === undefined) return undefined;
  return {
    inputPer1M: round4(input * 1_000_000),
    outputPer1M: round4(output * 1_000_000),
    ...(cacheRead !== undefined && { cacheReadPer1M: round4(cacheRead * 1_000_000) }),
    ...(cacheWrite !== undefined && { cacheWritePer1M: round4(cacheWrite * 1_000_000) }),
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// Bulk parsing
// ---------------------------------------------------------------------------

export function parseModelsDev(
  response: ModelsDevResponse,
  ctx: MapContext
): readonly GeneratedModelEntry[] {
  const out: GeneratedModelEntry[] = [];
  for (const [providerId, provider] of Object.entries(response)) {
    for (const [, rawEntry] of Object.entries(provider.models)) {
      const parsedEntry = ModelsDevEntrySchema.safeParse(rawEntry);
      if (!parsedEntry.success) continue;
      const entry: ModelsDevEntry = parsedEntry.data;
      if (!shouldIncludeModelsDevEntry(providerId, entry)) continue;
      const mapped = mapModelsDevEntry(providerId, entry, ctx);
      if (mapped !== undefined) out.push(mapped);
    }
  }
  return out;
}

export function parseLiteLlm(
  response: LiteLlmResponse,
  ctx: MapContext
): readonly GeneratedModelEntry[] {
  const out: GeneratedModelEntry[] = [];
  for (const [id, rawEntry] of Object.entries(response)) {
    const parsedEntry = LiteLlmEntrySchema.safeParse(rawEntry);
    if (!parsedEntry.success) continue;
    const entry: LiteLlmEntry = parsedEntry.data;
    if (!shouldIncludeLiteLlmEntry(id, entry)) continue;
    const mapped = mapLiteLlmEntry(id, entry, ctx);
    if (mapped !== undefined) out.push(mapped);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Merging: models.dev wins on id collision, LiteLLM fills coverage gaps
// ---------------------------------------------------------------------------

export function mergeEntries(
  primary: readonly GeneratedModelEntry[],
  secondary: readonly GeneratedModelEntry[]
): readonly GeneratedModelEntry[] {
  const byId = new Map<string, GeneratedModelEntry>();
  for (const entry of primary) byId.set(entry.id, entry);
  for (const entry of secondary) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
  }
  const sorted = [...byId.values()];
  sorted.sort((a, b) => a.id.localeCompare(b.id));
  return sorted;
}

// ---------------------------------------------------------------------------
// Sanity rails
// ---------------------------------------------------------------------------

/**
 * Reject entries that would indicate upstream corruption / poisoning.
 * These bounds are also enforced by the Zod schema; this helper returns the
 * reasons so callers can log per-entry rejections.
 */
export function outOfRangeReason(entry: GeneratedModelEntry): string | undefined {
  if (entry.contextWindow > MAX_CONTEXT_WINDOW) {
    return `contextWindow ${String(entry.contextWindow)} exceeds ceiling ${String(MAX_CONTEXT_WINDOW)}`;
  }
  if (entry.pricing !== undefined) {
    if (entry.pricing.inputPer1M > MAX_COST_PER_1M_USD) {
      return `pricing.inputPer1M ${String(entry.pricing.inputPer1M)} exceeds ceiling ${String(MAX_COST_PER_1M_USD)}`;
    }
    if (entry.pricing.outputPer1M > MAX_COST_PER_1M_USD) {
      return `pricing.outputPer1M ${String(entry.pricing.outputPer1M)} exceeds ceiling ${String(MAX_COST_PER_1M_USD)}`;
    }
  }
  return undefined;
}
