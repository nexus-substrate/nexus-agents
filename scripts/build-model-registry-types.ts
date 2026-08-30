/**
 * Zod schemas for the build-time generated model registry (T2 tier of epic #2174).
 *
 * These schemas are intentionally LOOSER than `ModelCapabilitySchema` in
 * packages/nexus-agents/src/config/model-capabilities-types.ts — the curated
 * canonical registry (T1) constrains id/provider to closed enums, but the
 * generated registry pulls from upstream sources that cover hundreds of
 * providers and thousands of model ids we don't want to enumerate.
 *
 * `.loose()` is used on upstream shapes so a new field showing up in
 * models.dev / LiteLLM doesn't break the build — it flows through and is
 * trimmed during output mapping.
 *
 * @module scripts/build-model-registry-types
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Upstream: models.dev API shape (subset of fields we consume)
// ---------------------------------------------------------------------------

/** A single model entry in the models.dev api.json response. */
export const ModelsDevEntrySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    family: z.string().optional(),
    tool_call: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    structured_output: z.boolean().optional(),
    temperature: z.boolean().optional(),
    attachment: z.boolean().optional(),
    knowledge: z.string().optional(),
    release_date: z.string().optional(),
    last_updated: z.string().optional(),
    open_weights: z.boolean().optional(),
    modalities: z
      .object({
        input: z.array(z.string()).optional(),
        output: z.array(z.string()).optional(),
      })
      .loose()
      .optional(),
    cost: z
      .object({
        input: z.number().nonnegative().optional(),
        output: z.number().nonnegative().optional(),
        cache_read: z.number().nonnegative().optional(),
        cache_write: z.number().nonnegative().optional(),
      })
      .loose()
      .optional(),
    limit: z
      .object({
        context: z.number().int().nonnegative().optional(),
        input: z.number().int().nonnegative().optional(),
        output: z.number().int().nonnegative().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

export type ModelsDevEntry = z.infer<typeof ModelsDevEntrySchema>;

/**
 * A provider block in models.dev (wraps a models record).
 * Inner models are kept as `z.unknown()` so one bad entry does not fail the
 * whole batch — each entry is validated in the mapping loop via safeParse.
 */
export const ModelsDevProviderSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    doc: z.string().optional(),
    env: z.array(z.string()).optional(),
    npm: z.string().optional(),
    models: z.record(z.string(), z.unknown()),
  })
  .loose();

export type ModelsDevProvider = z.infer<typeof ModelsDevProviderSchema>;

/** The full models.dev api.json response (keyed by provider id). */
export const ModelsDevResponseSchema = z.record(z.string(), ModelsDevProviderSchema);

export type ModelsDevResponse = z.infer<typeof ModelsDevResponseSchema>;

// ---------------------------------------------------------------------------
// Upstream: LiteLLM model_prices_and_context_window.json
// ---------------------------------------------------------------------------

/**
 * A single LiteLLM entry. LiteLLM keys entries by model id, with a top-level
 * "sample_spec" pseudo-entry documenting the schema that we filter out.
 */
export const LiteLlmEntrySchema = z
  .object({
    input_cost_per_token: z.number().nonnegative().optional(),
    output_cost_per_token: z.number().nonnegative().optional(),
    cache_creation_input_token_cost: z.number().nonnegative().optional(),
    cache_read_input_token_cost: z.number().nonnegative().optional(),
    max_tokens: z.number().int().nonnegative().optional(),
    max_input_tokens: z.number().int().nonnegative().optional(),
    max_output_tokens: z.number().int().nonnegative().optional(),
    litellm_provider: z.string().optional(),
    mode: z.string().optional(),
    supports_vision: z.boolean().optional(),
    supports_function_calling: z.boolean().optional(),
    supports_prompt_caching: z.boolean().optional(),
    supports_computer_use: z.boolean().optional(),
    supports_pdf_input: z.boolean().optional(),
    deprecation_date: z.string().optional(),
  })
  .loose();

export type LiteLlmEntry = z.infer<typeof LiteLlmEntrySchema>;

/**
 * Outer LiteLLM response is kept permissive — entries are validated one at a
 * time in the mapping loop so that one malformed entry does not kill the batch.
 */
export const LiteLlmResponseSchema = z.record(z.string(), z.unknown());

export type LiteLlmResponse = z.infer<typeof LiteLlmResponseSchema>;

// ---------------------------------------------------------------------------
// Output: generated registry entry
// ---------------------------------------------------------------------------

/** Sanity ceilings — rails against upstream corruption / poisoning. */
export const MAX_CONTEXT_WINDOW = 10_000_000;
export const MAX_COST_PER_1M_USD = 1_000;

/** Maximum accepted raw payload size per upstream source (bytes). */
export const MAX_UPSTREAM_PAYLOAD_BYTES = 5 * 1024 * 1024;

/** Provenance tag on each generated entry. */
export const GeneratedProvenanceSchema = z.object({
  source: z.enum(['models.dev', 'litellm']),
  fetchedAt: z.string(),
  upstreamUrl: z.url(),
});

export type GeneratedProvenance = z.infer<typeof GeneratedProvenanceSchema>;

/**
 * Schema for a single entry in model-registry.generated.json (T2).
 *
 * Intentionally LOOSE vs the canonical T1 ModelCapabilitySchema:
 * - `id`, `provider`, `cliName` accept any string (upstream uses values not
 *   in our closed enums — e.g. provider 'amazon-bedrock').
 * - Modality / tool / feature arrays are optional because upstream coverage
 *   varies.
 * - CLI-routing fields (cliName, cliAlias, cliModelName) are never emitted
 *   by the generator — they are routing configuration, not model metadata.
 *   Users can add them via the T3 YAML overlay (child issue #2178).
 */
/** Pricing block on a generated entry. Cache rates optional — see #5170. */
export interface GeneratedPricing {
  readonly inputPer1M: number;
  readonly outputPer1M: number;
  readonly cacheReadPer1M?: number;
  readonly cacheWritePer1M?: number;
}

export const GeneratedModelEntrySchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  provider: z.string().min(1),
  contextWindow: z.number().int().positive().max(MAX_CONTEXT_WINDOW),
  pricing: z
    .object({
      inputPer1M: z.number().nonnegative().max(MAX_COST_PER_1M_USD),
      outputPer1M: z.number().nonnegative().max(MAX_COST_PER_1M_USD),
      // #5170: both upstreams publish cache rates and both were dropped at the
      // mapping, so a cache-heavy call could not be priced at all. Optional
      // because most catalogue entries carry neither — absent must stay
      // distinguishable from zero, or an unpriced cache component would read
      // as free.
      cacheReadPer1M: z.number().nonnegative().max(MAX_COST_PER_1M_USD).optional(),
      cacheWritePer1M: z.number().nonnegative().max(MAX_COST_PER_1M_USD).optional(),
    })
    .optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  deprecated: z.boolean().optional(),
  provenance: GeneratedProvenanceSchema,
});

export type GeneratedModelEntry = z.infer<typeof GeneratedModelEntrySchema>;

/** Top-level shape of model-registry.generated.json. */
export const GeneratedRegistrySchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  entryCount: z.number().int().nonnegative(),
  entries: z.array(GeneratedModelEntrySchema),
});

export type GeneratedRegistry = z.infer<typeof GeneratedRegistrySchema>;
