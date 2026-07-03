/**
 * Unified ModelRegistry (#2540).
 *
 * Single source of truth for per-model metadata. Replaces the previous
 * split between:
 *   - `model-capabilities.ts` (canonical hardcoded list; renamed to
 *     `in-tree-data.ts` in #2546 slice E, helpers moved here + into
 *     `model-config-helpers.ts`)
 *   - `model-behavior-profile.ts` (vendor-pattern-matched runtime
 *     behaviour; file deleted in #2540 PR 2)
 *
 * Each `ModelEntry` carries BOTH capability and behaviour fields. The
 * registry's `getEntry()` always returns something — exact match if
 * the modelId is known, derived entry if vendor + family can be
 * inferred, universal default otherwise.
 *
 * Resolution chain (highest priority first; the constructor loads
 * lowest-priority first so higher tiers overwrite lower ones field-by-field —
 * see {@link EntrySource} and `ModelRegistry` constructor):
 *
 *   1. modelHints / explicit alias        ← operator override (resolver hints)
 *   2. manifest entries                   ← operator manifest overlay (#2547)
 *   3. in-tree authoritative entries      ← measured/validated by us
 *   4. models.dev snapshot                ← seeded externally
 *   5. generated catalog (LiteLLM)        ← LOWEST tier; long-tail breadth (#3293)
 *   6. derived from vendor + family       ← pattern-matched fallback
 *   7. universal default                  ← never fails
 *
 * This module ships the type + class + derived-fallback logic. The
 * authoritative in-tree entries are populated by `buildInTreeEntries()`; the
 * models.dev snapshot is loaded by `loadModelsDevSnapshot()` in
 * `buildDefaultRegistry()`.
 *
 * Availability is a SEPARATE concern — see `AvailableModelsCache`
 * (`config/available-models-cache.ts`). The registry tells you "what does
 * this model id mean"; `AvailableModelsCache` tells you "is the harness
 * currently able to serve it." Routing decisions consume both.
 *
 * @module config/model-registry
 */

import {
  normaliseModelId,
  resolveModelIdentitySync,
  type ModelHints,
  type ModelVendor,
} from './model-identity.js';
import {
  MAX_FUZZY_ID_LENGTH,
  buildIdentityIndex,
  identityKeyFor,
  selectIdentityCandidate,
} from './model-fuzzy-resolution.js';
import { buildInTreeEntries } from './in-tree-entries.js';
import { loadManifestOverlay } from './manifest-overlay.js';
import { DEFAULT_ENTRY, deriveEntry } from './model-derivation.js';
import { loadModelsDevSnapshot } from './models-dev-snapshot-loader.js';
import { loadGeneratedRegistryEntries } from './models-generated-loader.js';
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
export type EntrySource = 'in-tree' | 'models-dev' | 'manifest' | 'derived' | 'generated';

/**
 * How the normalized/identity resolution tier (#4164) found a canonical
 * entry for a decorated gateway model id: `'normalized'` — the id matched
 * an entry/alias after `normaliseModelId`; `'identity'` — the parsed
 * {vendor, family, version} matched exactly one loaded entry.
 */
export type MatchedVia = 'normalized' | 'identity';

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
  /**
   * Request parameters this model rejects (carried from
   * `ModelCapability.unsupportedParameters`, #4067). Consumed by
   * `model-parameter-support.ts`; absence means the regex fallback applies.
   */
  readonly unsupportedParameters?: readonly string[];
  /**
   * Max-tokens param name this model expects (carried from
   * `ModelCapability.maxTokensParam`, #4049/#4067). Absence defaults to
   * `'max_tokens'` (with the OpenAI-reasoning regex fallback).
   */
  readonly maxTokensParam?: 'max_tokens' | 'max_completion_tokens';

  // ---- CLI routing metadata (in-tree entries only) ----
  /** Which CLI tool this model belongs to (e.g. 'claude', 'gemini'). */
  readonly cliName?: string;
  /** Short alias the CLI accepts (e.g. 'opus' for claude). */
  readonly cliAlias?: string;
  /** Vendor model id the CLI passes upstream (e.g. 'claude-opus-4-6'). */
  readonly cliModelName?: string;

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
  /**
   * Set when the normalized/identity resolution tier (#4164) matched this
   * (decorated) id to a canonical entry. Absent for exact/alias hits and
   * pure derivation.
   */
  readonly matchedVia?: MatchedVia;
  /** Canonical id of the matched entry the pricing/metadata came from. */
  readonly resolvedFrom?: string;
}

// Derivation (DEFAULT_ENTRY, VENDOR_DEFAULTS, FAMILY_DEFAULTS, deriveEntry)
// lives in `./model-derivation.ts` so `in-tree-entries.ts` can import
// `deriveEntry` without creating a runtime cycle back through this file.
// We re-export below for backward compatibility with existing call sites.

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
  /**
   * Broad generated-catalog (LiteLLM) breadth entries. LOWEST priority —
   * overwritten by every other tier; provides long-tail coverage so unknown
   * models resolve to real catalog data instead of a bare derived default
   * (#3293, preserving the legacy CapabilityDiscovery T2 breadth).
   */
  readonly generatedEntries?: readonly ModelEntry[];
}

/**
 * The unified model-metadata registry. Construct once, share across
 * the process. `getEntry(modelId)` always returns something.
 */
export class ModelRegistry {
  private readonly byId = new Map<string, ModelEntry>();
  private readonly byAlias = new Map<string, string>(); // alias → canonical id
  /**
   * `vendor|family|version` → candidate entries, for the identity tier
   * (#4164). Built ONCE, lazily on the first fuzzy lookup — the entry maps
   * are immutable after construction, so it never goes stale. No caching of
   * UNMATCHED ids happens anywhere (the index only holds loaded entries).
   */
  private identityIndex: Map<string, ModelEntry[]> | undefined;

  constructor(options: ModelRegistryOptions = {}) {
    // Load order: lowest priority first; later sources overwrite.
    if (options.generatedEntries !== undefined) {
      this.loadEntries(options.generatedEntries);
    }
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
   *
   * On exact miss, the normalized/identity resolution tier (#4164) runs
   * BEFORE derivation so decorated gateway ids (`Claude_Opus_4.8_hardened`)
   * still pick up the canonical entry's pricing/metadata.
   */
  getEntry(modelId: string, hints?: ModelHints): ModelEntry {
    const direct = this.lookupExact(modelId);
    // 'models-dev' and 'generated' are catalog breadth tiers: merge their data
    // with derivation rather than returning blindly (in-tree/manifest are
    // authoritative and return directly). (#3293)
    if (direct !== undefined && direct.source !== 'models-dev' && direct.source !== 'generated') {
      return direct;
    }
    if (direct === undefined) {
      const fuzzy = this.lookupFuzzy(modelId, hints);
      if (fuzzy !== undefined) return fuzzy;
    }

    const identity = resolveModelIdentitySync(modelId, augmentHints(hints, direct));
    const derived = deriveEntry(modelId, identity);
    if (direct !== undefined && identity.vendor !== 'unknown') {
      return mergeSnapshotWithDerived(direct, derived);
    }
    return direct ?? derived;
  }

  /**
   * Has the registry got an authoritative entry for this id?
   * Consumers use this to distinguish "we know X" from "we guessed."
   */
  hasAuthoritative(modelId: string): boolean {
    return this.lookupExact(modelId) !== undefined;
  }

  /**
   * All loaded entries across every tier (generated + models.dev + in-tree +
   * manifest), deduped by id (later sources overwrite earlier). This is NOT
   * filtered to authoritative entries — `models-dev`/`generated` are
   * catalog-breadth tiers; use `hasAuthoritative()` to tell them apart.
   */
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

  /**
   * Normalized/identity resolution tier (#4164). Runs on exact miss only:
   * (a) retry `lookupExact` with the `normaliseModelId`-normalized id so
   *     aliases + alias-shadow (#3293) keep working;
   * (b) identity-match {vendor, family, version} against the load-time
   *     index — version required on both sides, tier-ordered uniqueness,
   *     fail closed on ambiguity (see model-fuzzy-resolution.ts).
   * Over-long ids skip the tier entirely (straight to derivation).
   */
  private lookupFuzzy(modelId: string, hints?: ModelHints): ModelEntry | undefined {
    if (modelId.length > MAX_FUZZY_ID_LENGTH) return undefined;
    const normalized = normaliseModelId(modelId);
    const byNormalized = normalized === modelId ? undefined : this.lookupExact(normalized);
    if (byNormalized !== undefined) {
      return this.resolveMatched(byNormalized, modelId, hints, 'normalized');
    }
    const key = identityKeyFor(resolveModelIdentitySync(modelId, hints));
    if (key === undefined) return undefined;
    this.identityIndex ??= buildIdentityIndex(this.byId.values());
    const matched = selectIdentityCandidate(this.identityIndex.get(key));
    if (matched === undefined) return undefined;
    return this.resolveMatched(matched, modelId, hints, 'identity');
  }

  /**
   * Build the entry returned for a fuzzy match: a fresh COPY that keeps the
   * CALLER'S id and takes behaviour from derivation for that original id —
   * the matched entry grants pricing/metadata only.
   */
  private resolveMatched(
    matched: ModelEntry,
    modelId: string,
    hints: ModelHints | undefined,
    matchedVia: MatchedVia
  ): ModelEntry {
    const identity = resolveModelIdentitySync(modelId, augmentHints(hints, matched));
    const derived = deriveEntry(modelId, identity);
    return mergeMatchedWithDerived(matched, derived, matchedVia);
  }

  private loadEntries(entries: readonly ModelEntry[]): void {
    for (const entry of entries) {
      this.byId.set(entry.id, entry);
      if (entry.aliases !== undefined) {
        for (const alias of entry.aliases) {
          this.byAlias.set(alias, entry.id);
          // Tiers load lowest-priority first, so a direct `byId` entry under
          // this alias key can only come from a lower tier (e.g. the generated
          // breadth catalog). An authoritative alias must win: drop the shadow
          // so `lookupExact` resolves the alias to its canonical entry (#3293).
          if (alias !== entry.id) this.byId.delete(alias);
        }
      }
    }
  }
}

// When the modelId alone doesn't carry vendor info (e.g.
// `text-embedding-3-large`), promote the snapshot's vendor/family
// into resolver hints so identity can resolve and derivation can
// supply the correct behaviour fields.
function augmentHints(hints: ModelHints | undefined, direct: ModelEntry | undefined): ModelHints {
  const h = hints ?? {};
  if (direct === undefined) return h;
  const out: { -readonly [K in keyof ModelHints]: ModelHints[K] } = {
    vendor: h.vendor ?? direct.vendor,
    family: h.family ?? direct.family,
  };
  if (h.version !== undefined) out.version = h.version;
  if (h.quirks !== undefined) out.quirks = h.quirks;
  return out;
}

// Snapshot supplies per-version capability data (contextWindow,
// pricing, displayName); derived entries carry richer behaviour
// knowledge (parallelToolCalls, promptCaching, profileId, quirks).
// Merge so each layer wins where it has the better data.
function mergeSnapshotWithDerived(snapshot: ModelEntry, derived: ModelEntry): ModelEntry {
  return {
    ...snapshot,
    parallelToolCalls: derived.parallelToolCalls,
    promptCaching: derived.promptCaching,
    toolDefinitionFormat: derived.toolDefinitionFormat,
    maxRecommendedTurnBudget: derived.maxRecommendedTurnBudget,
    strictJson: derived.strictJson,
    quirks: derived.quirks,
    profileId: derived.profileId,
    source: 'derived',
  };
}

/**
 * Merge for the normalized/identity resolution tier (#4164) — extends the
 * #3293 `mergeSnapshotWithDerived` semantics: capability/metadata (pricing,
 * contextWindow, maxOutputTokens, displayName, modalities, quality) come
 * from the matched canonical entry, behaviour fields from the derived entry
 * for the ORIGINAL decorated id. On top of that base merge it:
 *   - keeps the CALLER'S id (and its parsed version) — not the canonical's,
 *   - withholds fields outside the pricing/metadata grant: alias/CLI routing
 *     belongs to the canonical entry, request-shaping fields
 *     (unsupportedParameters, maxTokensParam) must follow the original id,
 *     and `verifiedAt` attests the canonical entry — not this derivation,
 *   - stamps `matchedVia` + `resolvedFrom` provenance.
 * Always returns a fresh object — stored entries are never mutated.
 */
function mergeMatchedWithDerived(
  matched: ModelEntry,
  derived: ModelEntry,
  matchedVia: MatchedVia
): ModelEntry {
  const merged: { -readonly [K in keyof ModelEntry]?: ModelEntry[K] } = {
    ...mergeSnapshotWithDerived(matched, derived),
  };
  delete merged.aliases;
  delete merged.cliName;
  delete merged.cliAlias;
  delete merged.cliModelName;
  delete merged.unsupportedParameters;
  delete merged.maxTokensParam;
  delete merged.verifiedAt;
  merged.id = derived.id;
  if (derived.version !== undefined) merged.version = derived.version;
  merged.matchedVia = matchedVia;
  merged.resolvedFrom = matched.id;
  return merged as ModelEntry;
}

// Re-export the derivation surface so existing consumers keep working
// without needing to update their import paths.
export { DEFAULT_ENTRY, deriveEntry };

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

/**
 * Return the global registry ONLY if it has already been constructed; never
 * triggers lazy construction (#3185). Used by the early-bootstrap-sensitive
 * `getDefaultModelForCli` path so a module-load-time caller does NOT force the
 * filesystem-touching overlay load — that is the TDZ / re-entrancy hazard the
 * `inTreeById()` filesystem-free builders were created to dodge
 * (model-config-helpers.ts ~L60-69). Once any consumer has built the registry
 * (or after `reloadDefaultRegistry`), overlay-aware resolution kicks in.
 */
export function peekDefaultRegistry(): ModelRegistry | undefined {
  return globalRegistry;
}

function buildDefaultRegistry(): ModelRegistry {
  const overlay = loadManifestOverlay();
  const snapshot = loadModelsDevSnapshot();
  const generated = loadGeneratedRegistryEntries();
  const inTree = buildInTreeEntries();
  const options: ModelRegistryOptions = { inTreeEntries: inTree };
  if (overlay.status === 'loaded' && overlay.entries.length > 0) {
    (options as { manifestEntries?: readonly ModelEntry[] }).manifestEntries = overlay.entries;
  }
  if (snapshot.status === 'loaded' && snapshot.entries.length > 0) {
    (options as { modelsDevEntries?: readonly ModelEntry[] }).modelsDevEntries = snapshot.entries;
  }
  if (generated.status === 'loaded' && generated.entries.length > 0) {
    (options as { generatedEntries?: readonly ModelEntry[] }).generatedEntries = generated.entries;
  }
  return new ModelRegistry(options);
}

/** Replace the global registry. Reserved for tests + bootstrap. */
export function setDefaultRegistry(registry: ModelRegistry | undefined): void {
  globalRegistry = registry;
}

/**
 * Hot-reload the global model registry WITHOUT a process restart (#3185).
 *
 * Re-runs {@link buildDefaultRegistry} — which re-reads the operator/user
 * manifest overlays, the models.dev snapshot, and the generated catalog from
 * disk — and reassigns the singleton, so overlay edits made after startup
 * (e.g. an updated `NEXUS_MODELS_OVERLAY_PATH`) propagate to every consumer
 * that reads through `getDefaultRegistry()`.
 *
 * ATOMIC DUAL-SINGLETON RESET (vote condition 2): the model registry and the
 * `UnifiedAdapterRegistry` are two independent singletons; the latter resolves
 * routing through the former. Refreshing only the model registry would leave
 * the adapter registry's cached default-model strings stale. This is the ONE
 * reload entry point — it resets BOTH together so there is never a state where
 * one is fresh and the other stale. The adapter-registry reset is a dynamic
 * import to avoid a static import cycle
 * (unified-registry → model-config-helpers → model-registry).
 *
 * The overlay loader is fail-closed (never throws on a missing / malformed
 * manifest — vote condition 3); a bad re-read degrades to the in-tree floor
 * rather than throwing, exactly as first construction does.
 */
export async function reloadDefaultRegistry(): Promise<ModelRegistry> {
  globalRegistry = buildDefaultRegistry();
  // Reset the adapter-registry singleton so its routing (re-resolved on read
  // since #3185) and any cached adapters pick up the new model registry.
  // Dynamic import breaks the static cycle.
  const { resetGlobalRegistry } = await import('../adapters/unified-registry.js');
  resetGlobalRegistry();
  return globalRegistry;
}
