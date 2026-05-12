/**
 * nexus-agents/config - Model Config Helpers
 *
 * Derived helper functions that read from the canonical ModelRegistry.
 * All model metadata consumers should import from here instead of
 * maintaining their own hardcoded tables.
 *
 * As of #2546 slice B, the internals read from
 * `getDefaultRegistry().getEntry()` / `.allEntries()` rather than
 * `DEFAULT_MODEL_CAPABILITIES.models.find()`. Public signatures
 * unchanged so downstream consumers see no diff.
 *
 * @module config/model-config-helpers
 * (Source: Issue #807; registry migration #2546)
 */

import { buildInTreeEntries } from './in-tree-entries.js';
import { DEFAULT_MODEL_CAPABILITIES, DEFAULT_MODEL_PER_CLI } from './model-capabilities.js';
import type {
  ModelId,
  ModelCapability,
  CliNameLiteral,
  Pricing,
  QualityScores,
} from './model-capabilities-types.js';
import { getDefaultRegistry, type ModelEntry } from './model-registry.js';

/**
 * Average latency estimates per CLI (ms). Returned by a function (not
 * a top-level const) to dodge TDZ in circular-load scenarios — module
 * loaders sometimes re-enter `model-config-helpers` mid-evaluation
 * via the `topsis-types → buildTopsisProfiles` chain, and function
 * declarations are hoisted while `const` declarations are not.
 */
function cliAvgLatency(): Record<CliNameLiteral, number> {
  return { claude: 800, gemini: 400, codex: 500, opencode: 600 };
}

// ---------------------------------------------------------------------------
// Single-Model Lookups
// ---------------------------------------------------------------------------

/**
 * Resolve a modelId to an in-tree entry via the global registry.
 * Returns undefined when no in-tree authoritative entry exists
 * (e.g. unknown id, gateway model). Routes through `getDefaultRegistry()`
 * so manifest-overlay + snapshot tiers can still influence runtime
 * behaviour. Used by single-model lookup helpers.
 */
function lookupInTree(modelId: string): ModelEntry | undefined {
  const entry = getDefaultRegistry().getEntry(modelId);
  return entry.source === 'in-tree' ? entry : undefined;
}

/**
 * Filesystem-free variant: builds an `id → entry` map from the
 * in-tree converter only. Used by bulk builders that run at
 * module-load time (e.g. `buildCliCapabilityProfiles`), where we
 * cannot afford to trigger `getDefaultRegistry()` because that
 * touches the filesystem (manifest-overlay, snapshot loader).
 */
function inTreeById(): Map<string, ModelEntry> {
  return new Map(buildInTreeEntries().map((e) => [e.id, e] as const));
}

/** Get pricing for a model, or undefined if not set. */
export function getModelPricing(modelId: ModelId): Pricing | undefined {
  return lookupInTree(modelId)?.pricing;
}

/** Get display name for a model. Falls back to the modelId string. */
export function getModelDisplayName(modelId: ModelId): string {
  return lookupInTree(modelId)?.displayName ?? modelId;
}

/**
 * Get context window for a model.
 *
 * Unknown ids fall through to the fail-closed 8 K default (#2177) instead
 * of the previous silent 200 K fall-through — the old value silently
 * masked routing-critical metadata for Bedrock / custom endpoints / new
 * vendor releases. Callers passing through the ModelId closed enum hit
 * the canonical T1 path; the 8 K branch fires only when a caller casts a
 * raw string to ModelId (type-lying), which is the same latent bug the
 * recent codex-5.2 `cliModelName` regression surfaced.
 *
 * Callers that need full tier resolution (T2 bundled, T3 overlay)
 * should call `CapabilityDiscovery.resolve(id)` directly — #2176.
 */
export function getModelContextWindow(modelId: ModelId): number {
  return lookupInTree(modelId)?.contextWindow ?? 8_192;
}

/** Get max output tokens for a model, or undefined if not set. */
export function getModelMaxOutput(modelId: ModelId): number | undefined {
  return lookupInTree(modelId)?.maxOutputTokens;
}

/** Get quality scores for a model, or undefined if not set. */
export function getModelQualityScores(modelId: ModelId): QualityScores | undefined {
  return lookupInTree(modelId)?.qualityScores;
}

/** Get the default (strongest) model for a given CLI tool. */
export function getDefaultModelForCli(cli: CliNameLiteral): ModelId {
  return DEFAULT_MODEL_PER_CLI[cli];
}

/** Get the model name the CLI binary expects (e.g., 'gemini-2.5-pro'). */
export function getCliModelName(modelId: ModelId): string {
  const entry = lookupInTree(modelId);
  return entry?.cliModelName ?? entry?.cliAlias ?? modelId;
}

/**
 * Resolve a CLI alias (e.g., 'opus') or legacy version-suffix name (e.g.,
 * 'claude-opus-4') to its canonical ModelId. Resolution order:
 *   1. cliAlias match ('opus' → claude-opus)
 *   2. id match ('claude-opus' → claude-opus)
 *   3. aliases[] membership (legacy version names — #2199 Child 5)
 */
export function resolveCliAlias(alias: string): ModelId | undefined {
  const match = getDefaultRegistry()
    .allEntries()
    .find(
      (e) =>
        e.source === 'in-tree' &&
        (e.cliAlias === alias || e.id === alias || (e.aliases?.includes(alias) ?? false))
    );
  return match?.id as ModelId | undefined;
}

// ---------------------------------------------------------------------------
// Bulk Builders — derive typed structures for downstream consumers
// ---------------------------------------------------------------------------

/**
 * Capability profile shape used by delegate-to-model and types-capability.
 * Matches the CapabilityProfile interface in both modules.
 */
interface CapabilityProfileShape {
  readonly reasoning: number;
  readonly contextWindow: number;
  readonly codeGeneration: number;
  readonly speed: number;
  readonly cost: number;
}

/**
 * Build capability profiles for all models (keyed by ModelId).
 * Used by delegate-to-model-types.ts to replace MODEL_CAPABILITIES.
 */
export function buildCapabilityProfiles(): Record<string, CapabilityProfileShape> {
  const result: Record<string, CapabilityProfileShape> = {};
  for (const entry of buildInTreeEntries()) {
    const q = entry.qualityScores;
    if (q !== undefined && entry.contextWindow !== undefined) {
      result[entry.id] = {
        reasoning: q.reasoning,
        contextWindow: entry.contextWindow,
        codeGeneration: q.codeGeneration,
        speed: q.speed,
        cost: q.cost,
      };
    }
  }
  return result;
}

/**
 * Build capability profiles keyed by CLI name (using default model per CLI).
 * Used by types-capability.ts to replace DEFAULT_CAPABILITIES.
 */
export function buildCliCapabilityProfiles(): Record<CliNameLiteral, CapabilityProfileShape> {
  const result = {} as Record<CliNameLiteral, CapabilityProfileShape>;
  const byId = inTreeById();
  for (const [cli, modelId] of Object.entries(DEFAULT_MODEL_PER_CLI) as Array<
    [CliNameLiteral, ModelId]
  >) {
    const entry = byId.get(modelId);
    const q = entry?.qualityScores;
    if (entry !== undefined && q !== undefined && entry.contextWindow !== undefined) {
      result[cli] = {
        reasoning: q.reasoning,
        contextWindow: entry.contextWindow,
        codeGeneration: q.codeGeneration,
        speed: q.speed,
        cost: q.cost,
      };
    }
  }
  return result;
}

/**
 * TOPSIS model profile shape matching TopsisModelProfile interface.
 */
interface TopsisProfileShape {
  readonly cliName: CliNameLiteral;
  readonly capabilities: CapabilityProfileShape;
  readonly costPerMillionInput: number;
  readonly costPerMillionOutput: number;
  readonly averageLatencyMs: number;
  readonly qualityScore: number;
}

/**
 * Build TOPSIS model profiles for the default model of each CLI.
 * Used by topsis-types.ts to replace DEFAULT_MODEL_PROFILES.
 */
export function buildTopsisProfiles(): readonly TopsisProfileShape[] {
  const profiles: TopsisProfileShape[] = [];
  const byId = inTreeById();
  for (const [cli, modelId] of Object.entries(DEFAULT_MODEL_PER_CLI) as Array<
    [CliNameLiteral, ModelId]
  >) {
    const entry = byId.get(modelId);
    const q = entry?.qualityScores;
    const p = entry?.pricing;
    if (entry === undefined || q === undefined || p === undefined) continue;
    if (entry.contextWindow === undefined) continue;
    profiles.push({
      cliName: cli,
      capabilities: {
        reasoning: q.reasoning,
        contextWindow: entry.contextWindow,
        codeGeneration: q.codeGeneration,
        speed: q.speed,
        cost: q.cost,
      },
      costPerMillionInput: p.inputPer1M,
      costPerMillionOutput: p.outputPer1M,
      averageLatencyMs: cliAvgLatency()[cli],
      qualityScore: (q.reasoning + q.codeGeneration) / 2,
    });
  }
  return profiles;
}

/**
 * ModelInfo shape matching the ModelInfo interface in types-capability.ts.
 */
export interface ModelInfoShape {
  readonly id: string;
  readonly name: string;
  readonly contextWindow: number;
  readonly maxOutput?: number;
  readonly costPerMillionInput?: number;
  readonly costPerMillionOutput?: number;
}

// ---------------------------------------------------------------------------
// CLI-Model Lookups — shared helpers for adapter getModelInfo()
// ---------------------------------------------------------------------------

/**
 * Search the canonical registry by CLI name + CLI model identifier.
 *
 * Matches against (in order):
 *   1. `cliModelName` ('gemini-2.5-pro', 'claude-opus-4-6')
 *   2. `cliAlias` ('opus', 'sonnet', 'haiku')
 *   3. `id` — registry identifier ('gemini-pro', 'claude-opus') (#2200 Child 2)
 *   4. `aliases[]` membership — legacy / version-suffix names that resolve
 *      to this entry (#2200 Child 1)
 *
 * Returns the legacy ModelCapability shape for backward compatibility
 * with adapter consumers; values are pulled from the registry's
 * authoritative in-tree entries.
 */
export function findCanonicalModel(
  cli: CliNameLiteral,
  cliModelName: string
): ModelCapability | undefined {
  const entry = getDefaultRegistry()
    .allEntries()
    .find(
      (e) =>
        e.source === 'in-tree' &&
        e.cliName === cli &&
        (e.cliModelName === cliModelName ||
          e.cliAlias === cliModelName ||
          e.id === cliModelName ||
          (e.aliases?.includes(cliModelName) ?? false))
    );
  return entry !== undefined ? entryToCapability(entry) : undefined;
}

/**
 * Project a ModelEntry back to the legacy ModelCapability shape for
 * adapter callers that still expect the old type. New callers should
 * read fields directly off `ModelEntry`.
 */
type Writable<T> = { -readonly [K in keyof T]: T[K] };

function applyOptionalCapabilityFields(entry: ModelEntry, target: Writable<ModelCapability>): void {
  if (entry.notes !== undefined) target.notes = entry.notes;
  if (entry.pricing !== undefined) target.pricing = entry.pricing;
  if (entry.qualityScores !== undefined) target.qualityScores = entry.qualityScores;
  if (entry.maxOutputTokens !== undefined) target.maxOutputTokens = entry.maxOutputTokens;
  if (entry.cliName !== undefined) target.cliName = entry.cliName as ModelCapability['cliName'];
  if (entry.cliAlias !== undefined) target.cliAlias = entry.cliAlias;
  if (entry.cliModelName !== undefined) target.cliModelName = entry.cliModelName;
  if (entry.aliases !== undefined) target.aliases = [...entry.aliases];
}

function entryToCapability(entry: ModelEntry): ModelCapability {
  const cap: ModelCapability = {
    id: entry.id as ModelId,
    displayName: entry.displayName ?? entry.id,
    provider: (entry.vendor === 'unknown' ? 'openai' : entry.vendor) as ModelCapability['provider'],
    contextWindow: entry.contextWindow ?? 0,
    outputModalities: [...(entry.outputModalities ?? ['text'])],
    inputModalities: [...(entry.inputModalities ?? ['text'])],
    toolCapabilities: [...(entry.toolCapabilities ?? [])],
    specialFeatures: [...(entry.specialFeatures ?? [])],
  };
  applyOptionalCapabilityFields(entry, cap);
  return cap;
}

/**
 * Build a ModelInfoShape from the canonical registry for a given CLI model name.
 * Returns undefined if the model is not in the registry.
 */
export function buildModelInfo(
  cli: CliNameLiteral,
  cliModelName: string
): ModelInfoShape | undefined {
  const cap = findCanonicalModel(cli, cliModelName);
  if (cap === undefined) return undefined;
  const info: ModelInfoShape = {
    id: cliModelName,
    name: cap.displayName,
    contextWindow: cap.contextWindow,
  };
  if (cap.maxOutputTokens !== undefined) {
    (info as { maxOutput: number }).maxOutput = cap.maxOutputTokens;
  }
  if (cap.pricing !== undefined) {
    (info as { costPerMillionInput: number }).costPerMillionInput = cap.pricing.inputPer1M;
    (info as { costPerMillionOutput: number }).costPerMillionOutput = cap.pricing.outputPer1M;
  }
  return info;
}

/**
 * Build mock model info for each CLI (using default model per CLI).
 * Used by testing/adapters/mock-adapter-helpers.ts to replace MODEL_INFO_BY_NAME.
 */
/**
 * Project the registry's in-tree entries back to the legacy
 * `ModelCapabilitiesMatrix` shape. Lets CLI commands and other
 * consumers iterate in-tree models via the registry without
 * importing `DEFAULT_MODEL_CAPABILITIES` directly (#2546 slice C1).
 *
 * Matrix-level metadata (`version`, `updatedAt`) is still read
 * from `DEFAULT_MODEL_CAPABILITIES` because the registry doesn't
 * carry it — slice E closes that gap when the legacy module is
 * deleted entirely.
 */
export function getInTreeCapabilitiesMatrix(): {
  readonly version: number;
  readonly updatedAt: string;
  readonly models: readonly ModelCapability[];
} {
  return {
    version: DEFAULT_MODEL_CAPABILITIES.version,
    updatedAt: DEFAULT_MODEL_CAPABILITIES.updatedAt,
    models: buildInTreeEntries().map(entryToCapability),
  };
}

/**
 * Single-model lookup that mirrors `getModelCapabilities` but reads
 * via the registry. Returns the legacy `ModelCapability` shape so
 * call sites that haven't migrated to `ModelEntry` yet still work.
 */
export function lookupInTreeCapability(modelId: string): ModelCapability | undefined {
  const entry = lookupInTree(modelId);
  return entry !== undefined ? entryToCapability(entry) : undefined;
}

export function buildMockModelInfo(): Record<CliNameLiteral, ModelInfoShape> {
  const result = {} as Record<CliNameLiteral, ModelInfoShape>;
  const byId = inTreeById();
  for (const [cli, modelId] of Object.entries(DEFAULT_MODEL_PER_CLI) as Array<
    [CliNameLiteral, ModelId]
  >) {
    const entry = byId.get(modelId);
    if (entry?.contextWindow === undefined) continue;
    const info: ModelInfoShape = {
      id: entry.id,
      name: entry.displayName ?? entry.id,
      contextWindow: entry.contextWindow,
    };
    if (entry.maxOutputTokens !== undefined) {
      (info as { maxOutput: number }).maxOutput = entry.maxOutputTokens;
    }
    if (entry.pricing !== undefined) {
      (info as { costPerMillionInput: number }).costPerMillionInput = entry.pricing.inputPer1M;
      (info as { costPerMillionOutput: number }).costPerMillionOutput = entry.pricing.outputPer1M;
    }
    result[cli] = info;
  }
  return result;
}
