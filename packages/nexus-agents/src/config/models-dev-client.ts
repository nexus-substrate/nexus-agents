/**
 * models.dev API Client
 *
 * Fetches model pricing, context windows, and capability data from the
 * open-source models.dev database. Used by the sync-model-pricing script
 * to update the canonical model registry.
 *
 * @module config/models-dev-client
 * (Source: Issue #1125)
 */

import { z } from 'zod';
import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';

const MODELS_DEV_API_URL = 'https://models.dev/api.json';

/** Cost structure from models.dev API. */
const ModelCostSchema = z.object({
  input: z.number().optional(),
  output: z.number().optional(),
  cache_read: z.number().optional(),
});

/** Limit structure from models.dev API. */
const ModelLimitSchema = z.object({
  context: z.number().optional(),
  output: z.number().optional(),
});

/** Single model entry from models.dev API. */
const ModelsDevEntrySchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  family: z.string().optional(),
  cost: ModelCostSchema.optional(),
  limit: ModelLimitSchema.optional(),
});

export type ModelsDevEntry = z.infer<typeof ModelsDevEntrySchema>;

/** Parsed response from models.dev API (array of model entries). */
const ModelsDevResponseSchema = z.array(ModelsDevEntrySchema);

/**
 * Mapping from our cliModelName to models.dev model IDs.
 * models.dev uses provider-prefixed IDs (e.g., "anthropic/claude-opus-4-6").
 */
export const MODEL_ID_MAP: Record<string, string> = {
  'claude-opus-4-6': 'claude-opus-4-6',
  'claude-sonnet-4-5-20250929': 'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
  'gemini-3-pro-preview': 'gemini-3-pro-preview',
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-3-flash-preview': 'gemini-3-flash-preview',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  // OpenAI Codex models may use different naming
  'codex-5.3': 'codex-5.3',
  'codex-5.2': 'codex-5.2',
  'codex-5.1-mini': 'codex-5.1-mini',
};

/** A pricing diff for a single model field. */
export interface PricingDiff {
  readonly modelId: string;
  readonly field: string;
  readonly current: number;
  readonly upstream: number;
}

/**
 * Fetches the full models.dev API catalog.
 * Returns parsed entries or an error.
 */
export async function fetchModelsDevCatalog(): Promise<Result<ModelsDevEntry[], Error>> {
  try {
    const response = await fetch(MODELS_DEV_API_URL);
    if (!response.ok) {
      return err(new Error(`models.dev API returned ${String(response.status)}`));
    }
    const raw: unknown = await response.json();
    const parsed = ModelsDevResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return err(new Error(`models.dev API response validation failed: ${parsed.error.message}`));
    }
    return ok(parsed.data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown fetch error';
    return err(new Error(`Failed to fetch models.dev API: ${msg}`));
  }
}

/**
 * Finds a model in the models.dev catalog by searching for an ID match.
 * Tries exact match, then strips provider prefix and retries.
 */
export function findModelInCatalog(
  catalog: readonly ModelsDevEntry[],
  cliModelName: string
): ModelsDevEntry | undefined {
  const mapped = MODEL_ID_MAP[cliModelName] ?? cliModelName;
  // Try exact ID match
  const exact = catalog.find((m) => m.id === mapped);
  if (exact !== undefined) return exact;
  // Try suffix match (models.dev may prefix with provider)
  return catalog.find((m) => m.id.endsWith(`/${mapped}`) || m.id.endsWith(`/${cliModelName}`));
}

/**
 * Converts models.dev per-token cost to our per-1M-tokens format.
 * models.dev stores cost per token; we store cost per 1M tokens.
 */
export function convertToPerMillion(perTokenCost: number): number {
  return Math.round(perTokenCost * 1_000_000 * 100) / 100;
}
