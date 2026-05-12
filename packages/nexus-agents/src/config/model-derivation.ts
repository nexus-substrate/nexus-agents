/**
 * Pattern-derivation logic for ModelRegistry — extracted from
 * `model-registry.ts` to break a runtime circular import with
 * `in-tree-entries.ts` (which needs `deriveEntry` to build the
 * in-tree slice for `buildDefaultRegistry()`).
 *
 * No state lives here; everything is pure. The `ModelEntry` type
 * is imported type-only from `model-registry.ts` to avoid a runtime
 * dependency cycle.
 *
 * @module config/model-derivation
 */

import type { ModelHints, ModelVendor, ResolvedModelIdentity } from './model-identity.js';
import type { ModelEntry } from './model-registry.js';

/**
 * Universal fallback. Used when nothing more specific matches —
 * unknown vendor + family + no probe data. Safe defaults.
 */
export const DEFAULT_ENTRY: Omit<ModelEntry, 'id' | 'vendor' | 'family' | 'profileId' | 'source'> =
  {
    parallelToolCalls: false,
    promptCaching: 'none',
    toolDefinitionFormat: 'openai',
    maxRecommendedTurnBudget: 10,
    strictJson: true,
    quirks: [],
  };

type VendorOverride = Partial<Omit<ModelEntry, 'id' | 'vendor' | 'family' | 'source'>>;

const VENDOR_DEFAULTS: Partial<Record<ModelVendor, VendorOverride>> = {
  anthropic: {
    profileId: 'anthropic-default',
    parallelToolCalls: true,
    promptCaching: 'ephemeral',
    toolDefinitionFormat: 'anthropic',
    maxRecommendedTurnBudget: 15,
  },
  openai: {
    profileId: 'openai-default',
    parallelToolCalls: true,
    toolDefinitionFormat: 'openai',
    maxRecommendedTurnBudget: 15,
  },
  google: {
    profileId: 'google-default',
    parallelToolCalls: true,
    toolDefinitionFormat: 'gemini',
    maxRecommendedTurnBudget: 15,
  },
  meta: {
    profileId: 'meta-default',
    parallelToolCalls: false,
    toolDefinitionFormat: 'openai',
    maxRecommendedTurnBudget: 8,
  },
  qwen: {
    profileId: 'qwen-default',
    parallelToolCalls: false,
    toolDefinitionFormat: 'openai',
    maxRecommendedTurnBudget: 8,
  },
  nvidia: {
    profileId: 'nvidia-nemotron-default',
    parallelToolCalls: false,
    toolDefinitionFormat: 'openai',
    maxRecommendedTurnBudget: 8,
  },
  mistral: {
    profileId: 'mistral-default',
    parallelToolCalls: false,
    toolDefinitionFormat: 'openai',
    maxRecommendedTurnBudget: 8,
  },
  cohere: {
    profileId: 'cohere-default',
    parallelToolCalls: false,
    toolDefinitionFormat: 'openai',
    maxRecommendedTurnBudget: 8,
  },
  deepseek: {
    profileId: 'deepseek-default',
    parallelToolCalls: false,
    toolDefinitionFormat: 'openai',
    maxRecommendedTurnBudget: 10,
  },
};

interface FamilyOverrideEntry {
  readonly vendor: ModelVendor;
  readonly family: string;
  readonly override: VendorOverride;
}

const FAMILY_DEFAULTS: readonly FamilyOverrideEntry[] = [
  {
    vendor: 'anthropic',
    family: 'claude-opus',
    override: { profileId: 'claude-opus', maxRecommendedTurnBudget: 20 },
  },
  {
    vendor: 'anthropic',
    family: 'claude-haiku',
    override: { profileId: 'claude-haiku', maxRecommendedTurnBudget: 8 },
  },
  {
    vendor: 'openai',
    family: 'o-reasoning',
    override: { profileId: 'openai-o-reasoning', maxRecommendedTurnBudget: 25 },
  },
  {
    vendor: 'google',
    family: 'gemini-flash',
    override: { profileId: 'gemini-flash', maxRecommendedTurnBudget: 8 },
  },
];

/**
 * Build an entry from vendor + family + quirks when no authoritative
 * row matches. Source stamped `'derived'`; capability fields left
 * undefined (derived entries don't have measured pricing/quality data).
 */
export function deriveEntry(modelId: string, identity: ResolvedModelIdentity): ModelEntry {
  const vendorOverride = VENDOR_DEFAULTS[identity.vendor] ?? {};
  const familyOverride =
    FAMILY_DEFAULTS.find((f) => f.vendor === identity.vendor && f.family === identity.family)
      ?.override ?? {};

  const merged = {
    ...DEFAULT_ENTRY,
    profileId: 'default',
    ...vendorOverride,
    ...familyOverride,
  };

  // Apply quirk overlay — `'thinking'` bumps budget 1.5×, `'embedding'`
  // is propagated for adapter consumers to refuse construction.
  const quirks = [...new Set([...merged.quirks, ...identity.quirks])];
  let budget = merged.maxRecommendedTurnBudget;
  if (identity.quirks.includes('thinking')) {
    budget = Math.ceil(budget * 1.5);
  }

  return {
    id: modelId,
    vendor: identity.vendor,
    family: identity.family,
    ...(identity.version !== undefined && { version: identity.version }),
    parallelToolCalls: merged.parallelToolCalls,
    promptCaching: merged.promptCaching,
    toolDefinitionFormat: merged.toolDefinitionFormat,
    maxRecommendedTurnBudget: budget,
    strictJson: merged.strictJson,
    quirks,
    profileId: merged.profileId,
    source: 'derived',
  };
}

// Re-export so old call sites that pulled hints type from this side
// of the tree don't need to change.
export type { ModelHints };
