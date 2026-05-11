/**
 * Unified ModelRegistry (#2540).
 *
 * Single source of truth for per-model metadata. Replaces the previous
 * split between:
 *   - `model-capabilities.ts` (canonical hardcoded list, still in-tree;
 *     migration tracked in #2546)
 *   - `model-behavior-profile.ts` (vendor-pattern-matched runtime
 *     behaviour; file deleted in #2540 PR 2)
 *
 * Each `ModelEntry` carries BOTH capability and behaviour fields. The
 * registry's `getEntry()` always returns something — exact match if
 * the modelId is known, derived entry if vendor + family can be
 * inferred, universal default otherwise.
 *
 * Resolution chain (most specific first):
 *
 *   1. modelHints / explicit alias        ← operator override
 *   2. models.dev snapshot                ← seeded externally (PR 4)
 *   3. in-tree authoritative entries      ← measured/validated by us
 *   4. derived from vendor + family       ← pattern-matched fallback
 *   5. universal default                  ← never fails
 *
 * This module ships the type + class + derived-fallback logic. The
 * authoritative entries (PR 1's payload) are populated alongside; the
 * models.dev snapshot loader lands in PR 4.
 *
 * Availability is a SEPARATE concern — see `AvailableModelsCache` in
 * a later PR. The registry tells you "what does this model id mean";
 * `AvailableModelsCache` tells you "is the harness currently able to
 * serve it." Routing decisions consume both.
 *
 * @module config/model-registry
 */

import {
  resolveModelIdentitySync,
  type ModelHints,
  type ModelVendor,
  type ResolvedModelIdentity,
} from './model-identity.js';
import { loadManifestOverlay } from './manifest-overlay.js';
import { loadModelsDevSnapshot } from './models-dev-snapshot-loader.js';
import type {
  InputModality,
  OutputModality,
  Pricing,
  QualityScores,
  SpecialFeature,
  ToolCapability,
} from './model-capabilities-types.js';

// ============================================================================
// Per-model behaviour types — were previously split into model-behavior-profile.ts
// (deleted in #2540 PR 2 when AgenticAdapter migrated to ModelRegistry).
// ============================================================================

/**
 * Tool-definition format the model expects in `CompletionRequest.tools`.
 * Each `IModelAdapter` translates from the canonical `ToolDefinition`
 * shape to the provider's native form, so this field is informational
 * for routing/scoring, not request-side.
 */
export type ToolDefinitionFormat = 'openai' | 'anthropic' | 'gemini';

/**
 * Prompt-caching opt-in level. `'ephemeral'` adds Anthropic-style
 * `cache_control` markers; other providers ignore the field.
 */
export type PromptCachingMode = 'none' | 'ephemeral' | 'aggressive';

// ============================================================================
// ModelEntry — the unified shape
// ============================================================================

/**
 * Where this entry came from. Higher-priority sources override lower
 * ones field-by-field; `derived` is always the fallback floor.
 */
export type EntrySource = 'in-tree' | 'models-dev' | 'manifest' | 'derived';

/**
 * One model's full metadata. Combines what was previously split
 * across `ModelCapability` (capability/pricing/quality) and
 * `ModelBehaviorProfile` (runtime behaviour toggles).
 *
 * All capability + pricing + quality fields are optional because
 * derived entries (vendor known but no authoritative data) won't
 * have them. Routing consumers must handle absence gracefully.
 *
 * Behaviour fields always have values (defaulted from vendor/family
 * profile if no exact entry exists).
 */
export interface ModelEntry {
  // ---- Identity ----
  /** Canonical id, e.g. `claude-opus-4-1`, `gpt-5.4`, `meta/llama-3-70b`. */
  readonly id: string;
  /**
   * Alternate strings that should resolve to this entry. Operators
   * extend via the manifest (PR 4) when a gateway exposes a renamed
   * version of a known model.
   */
  readonly aliases?: readonly string[];
  /** Coarse vendor bucket — drives behaviour-profile fallback chains. */
  readonly vendor: ModelVendor;
  /** Family inside a vendor — `claude-opus`, `gpt-4o`, `llama-3`. */
  readonly family: string;
  /** Version string (best-effort; `4-1`, `2024-08-06`, etc). */
  readonly version?: string;
  /** Human-readable display name for UI / logs. */
  readonly displayName?: string;

  // ---- Capabilities (carried from ModelCapability) ----
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly inputModalities?: readonly InputModality[];
  readonly outputModalities?: readonly OutputModality[];
  readonly toolCapabilities?: readonly ToolCapability[];
  readonly specialFeatures?: readonly SpecialFeature[];
  readonly pricing?: Pricing;
  readonly qualityScores?: QualityScores;
  readonly notes?: string;

  // ---- Behaviour (carried from ModelBehaviorProfile) ----
  readonly parallelToolCalls: boolean;
  readonly promptCaching: PromptCachingMode;
  readonly toolDefinitionFormat: ToolDefinitionFormat;
  readonly maxRecommendedTurnBudget: number;
  readonly strictJson: boolean;
  readonly quirks: readonly string[];
  readonly profileId: string;

  // ---- Provenance ----
  readonly source: EntrySource;
  /** ISO date when this entry was last validated against the upstream. */
  readonly verifiedAt?: string;
}

// ============================================================================
// Defaults
// ============================================================================

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

/**
 * Per-vendor default behaviour. Used when the vendor is known but
 * no in-tree authoritative entry exists for the specific model.
 *
 * Sparse: only fields that differ from `DEFAULT_ENTRY` are listed.
 */
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

// ============================================================================
// Registry
// ============================================================================

export interface ModelRegistryOptions {
  /** Authoritative in-tree entries. Highest priority. */
  readonly inTreeEntries?: readonly ModelEntry[];
  /** models.dev snapshot entries. Lower priority than in-tree. */
  readonly modelsDevEntries?: readonly ModelEntry[];
  /** Operator manifest entries. Higher priority than in-tree. */
  readonly manifestEntries?: readonly ModelEntry[];
}

/**
 * The unified model-metadata registry. Construct once, share across
 * the process. `getEntry(modelId)` always returns something.
 */
export class ModelRegistry {
  private readonly byId = new Map<string, ModelEntry>();
  private readonly byAlias = new Map<string, string>(); // alias → canonical id

  constructor(options: ModelRegistryOptions = {}) {
    // Load order: lowest priority first; later sources overwrite.
    if (options.modelsDevEntries !== undefined) {
      this.loadEntries(options.modelsDevEntries);
    }
    if (options.inTreeEntries !== undefined) {
      this.loadEntries(options.inTreeEntries);
    }
    if (options.manifestEntries !== undefined) {
      this.loadEntries(options.manifestEntries);
    }
  }

  /**
   * Resolve a model id to its full metadata entry. Always returns —
   * unknown models get a derived entry with sensible defaults.
   */
  getEntry(modelId: string, hints?: ModelHints): ModelEntry {
    // 1. Exact match (canonical id or alias)
    const direct = this.lookupExact(modelId);
    if (direct !== undefined) return direct;

    // 2. Pattern-derived — resolve identity, build derived entry
    const identity = resolveModelIdentitySync(modelId, hints);
    return deriveEntry(modelId, identity);
  }

  /**
   * Has the registry got an authoritative entry for this id?
   * Consumers use this to distinguish "we know X" from "we guessed."
   */
  hasAuthoritative(modelId: string): boolean {
    return this.lookupExact(modelId) !== undefined;
  }

  /** All authoritative entries (in-tree + models.dev + manifest, deduped). */
  allEntries(): readonly ModelEntry[] {
    return [...this.byId.values()];
  }

  /** Snapshot of canonical id → entry mapping. */
  toMap(): ReadonlyMap<string, ModelEntry> {
    return new Map(this.byId);
  }

  private lookupExact(modelId: string): ModelEntry | undefined {
    const direct = this.byId.get(modelId);
    if (direct !== undefined) return direct;
    const canonical = this.byAlias.get(modelId);
    if (canonical !== undefined) return this.byId.get(canonical);
    return undefined;
  }

  private loadEntries(entries: readonly ModelEntry[]): void {
    for (const entry of entries) {
      this.byId.set(entry.id, entry);
      if (entry.aliases !== undefined) {
        for (const alias of entry.aliases) {
          this.byAlias.set(alias, entry.id);
        }
      }
    }
  }
}

// ============================================================================
// Derivation — build a ModelEntry from a ResolvedModelIdentity
// ============================================================================

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

// ============================================================================
// Convenience — global default registry, populated lazily
// ============================================================================

let globalRegistry: ModelRegistry | undefined;

/**
 * Lazy global registry. Most consumers should accept a `ModelRegistry`
 * via dependency injection instead, but this is the convenient default
 * for migration from the existing module-level constants.
 *
 * The first call constructs the registry and loads the operator
 * manifest overlay (#2547 4a) from `$NEXUS_MODELS_OVERLAY_PATH` or
 * `$NEXUS_DATA_DIR/models-manifest.yaml`. Missing / malformed manifests
 * never throw — rejections are logged at warn level and dropped.
 */
export function getDefaultRegistry(): ModelRegistry {
  globalRegistry ??= buildDefaultRegistry();
  return globalRegistry;
}

function buildDefaultRegistry(): ModelRegistry {
  const overlay = loadManifestOverlay();
  const snapshot = loadModelsDevSnapshot();
  const options: ModelRegistryOptions = {};
  if (overlay.status === 'loaded' && overlay.entries.length > 0) {
    (options as { manifestEntries?: readonly ModelEntry[] }).manifestEntries = overlay.entries;
  }
  if (snapshot.status === 'loaded' && snapshot.entries.length > 0) {
    (options as { modelsDevEntries?: readonly ModelEntry[] }).modelsDevEntries = snapshot.entries;
  }
  return new ModelRegistry(options);
}

/** Replace the global registry. Reserved for tests + bootstrap. */
export function setDefaultRegistry(registry: ModelRegistry | undefined): void {
  globalRegistry = registry;
}
