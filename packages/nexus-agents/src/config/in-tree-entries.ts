/**
 * Build the tier-2 `inTreeEntries` for the default ModelRegistry from
 * `DEFAULT_MODEL_CAPABILITIES`. This is the missing wiring identified
 * in #2546 slice A — `buildDefaultRegistry()` previously loaded
 * tiers 1 (manifest) and 3 (models.dev snapshot) but never the
 * authoritative in-tree data.
 *
 * Each `ModelCapability` is converted to a `ModelEntry` by running
 * pattern derivation for behaviour fields (parallelToolCalls,
 * promptCaching, profileId, etc.) and overlaying the matrix's
 * capability fields (contextWindow, pricing, modalities) on top.
 * Aliases include the matrix's `aliases` array plus `cliModelName` so
 * vendor-style lookups (`claude-opus-4-6`) resolve to the canonical
 * short id (`claude-opus`).
 *
 * @module config/in-tree-entries
 */

import { DEFAULT_MODEL_CAPABILITIES } from './in-tree-data.js';
import type { ModelCapability, Provider } from './model-capabilities-types.js';
import { deriveEntry } from './model-derivation.js';
import type { ModelEntry } from './model-registry.js';
import { resolveModelIdentitySync, type ModelVendor } from './model-identity.js';

/**
 * Map the matrix's `provider` (which includes gateway labels like
 * `custom-openai` and `openrouter`) to the registry's coarser
 * `ModelVendor`. Gateway providers resolve to `'unknown'` so identity
 * resolution falls back to modelId pattern detection.
 */
function providerToVendor(provider: Provider): ModelVendor {
  switch (provider) {
    case 'anthropic':
    case 'google':
    case 'openai':
      return provider;
    default:
      return 'unknown';
  }
}

/**
 * Convert one `ModelCapability` row into a `ModelEntry`. Behaviour
 * fields come from `deriveEntry()` (so vendor/family defaults apply);
 * capability fields come from the matrix.
 */
function optionalFields(model: ModelCapability): Partial<ModelEntry> {
  const out: Partial<{ -readonly [K in keyof ModelEntry]: ModelEntry[K] }> = {};
  if (model.maxOutputTokens !== undefined) out.maxOutputTokens = model.maxOutputTokens;
  if (model.pricing !== undefined) out.pricing = model.pricing;
  if (model.qualityScores !== undefined) out.qualityScores = model.qualityScores;
  if (model.notes !== undefined) out.notes = model.notes;
  if (model.cliName !== undefined) out.cliName = model.cliName;
  if (model.cliAlias !== undefined) out.cliAlias = model.cliAlias;
  if (model.cliModelName !== undefined) out.cliModelName = model.cliModelName;
  if (model.unsupportedParameters !== undefined) {
    out.unsupportedParameters = model.unsupportedParameters;
  }
  if (model.maxTokensParam !== undefined) out.maxTokensParam = model.maxTokensParam;
  return out;
}

function toEntry(model: ModelCapability): ModelEntry {
  const vendorHint = providerToVendor(model.provider);
  const identity = resolveModelIdentitySync(model.id, { vendor: vendorHint });
  const derived = deriveEntry(model.id, identity);

  const allAliases = new Set<string>(model.aliases ?? []);
  if (model.cliModelName !== undefined && model.cliModelName !== model.id) {
    allAliases.add(model.cliModelName);
  }

  return {
    ...derived,
    id: model.id,
    ...(allAliases.size > 0 && { aliases: [...allAliases] }),
    displayName: model.displayName,
    contextWindow: model.contextWindow,
    inputModalities: model.inputModalities,
    outputModalities: model.outputModalities,
    toolCapabilities: model.toolCapabilities,
    specialFeatures: model.specialFeatures,
    ...optionalFields(model),
    source: 'in-tree',
  };
}

/**
 * Build the full set of in-tree entries from the static matrix. Called
 * once at default-registry construction.
 */
export function buildInTreeEntries(): readonly ModelEntry[] {
  return DEFAULT_MODEL_CAPABILITIES.models.map(toEntry);
}
