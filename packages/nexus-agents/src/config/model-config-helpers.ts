/**
 * nexus-agents/config - Model Config Helpers
 *
 * Derived helper functions that read from the canonical model registry.
 * All model metadata consumers should import from here instead of
 * maintaining their own hardcoded tables.
 *
 * @module config/model-config-helpers
 * (Source: Issue #807)
 */

import {
  DEFAULT_MODEL_CAPABILITIES,
  DEFAULT_MODEL_PER_CLI,
  getModelCapabilities,
} from './model-capabilities.js';
import type {
  ModelId,
  ModelCapability,
  CliNameLiteral,
  Pricing,
  QualityScores,
} from './model-capabilities-types.js';

// ---------------------------------------------------------------------------
// Single-Model Lookups
// ---------------------------------------------------------------------------

/** Get pricing for a model, or undefined if not set. */
export function getModelPricing(modelId: ModelId): Pricing | undefined {
  return getModelCapabilities(modelId)?.pricing;
}

/** Get display name for a model. Falls back to the modelId string. */
export function getModelDisplayName(modelId: ModelId): string {
  return getModelCapabilities(modelId)?.displayName ?? modelId;
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
  return getModelCapabilities(modelId)?.contextWindow ?? 8_192;
}

/** Get max output tokens for a model, or undefined if not set. */
export function getModelMaxOutput(modelId: ModelId): number | undefined {
  return getModelCapabilities(modelId)?.maxOutputTokens;
}

/** Get quality scores for a model, or undefined if not set. */
export function getModelQualityScores(modelId: ModelId): QualityScores | undefined {
  return getModelCapabilities(modelId)?.qualityScores;
}

/** Get the default (strongest) model for a given CLI tool. */
export function getDefaultModelForCli(cli: CliNameLiteral): ModelId {
  return DEFAULT_MODEL_PER_CLI[cli];
}

/** Get the model name the CLI binary expects (e.g., 'gemini-2.5-pro'). */
export function getCliModelName(modelId: ModelId): string {
  const cap = getModelCapabilities(modelId);
  return cap?.cliModelName ?? cap?.cliAlias ?? modelId;
}

/** Resolve a CLI alias (e.g., 'opus') to its canonical ModelId. */
export function resolveCliAlias(alias: string): ModelId | undefined {
  return DEFAULT_MODEL_CAPABILITIES.models.find((m) => m.cliAlias === alias || m.id === alias)?.id;
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
  for (const model of DEFAULT_MODEL_CAPABILITIES.models) {
    const q = model.qualityScores;
    if (q !== undefined) {
      result[model.id] = {
        reasoning: q.reasoning,
        contextWindow: model.contextWindow,
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
  for (const [cli, modelId] of Object.entries(DEFAULT_MODEL_PER_CLI) as Array<
    [CliNameLiteral, ModelId]
  >) {
    const model = getModelCapabilities(modelId);
    const q = model?.qualityScores;
    if (model !== undefined && q !== undefined) {
      result[cli] = {
        reasoning: q.reasoning,
        contextWindow: model.contextWindow,
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

/** Average latency estimates per CLI (ms). */
const CLI_AVG_LATENCY: Record<CliNameLiteral, number> = {
  claude: 800,
  gemini: 400,
  codex: 500,
  opencode: 600,
};

/**
 * Build TOPSIS model profiles for the default model of each CLI.
 * Used by topsis-types.ts to replace DEFAULT_MODEL_PROFILES.
 */
export function buildTopsisProfiles(): readonly TopsisProfileShape[] {
  const profiles: TopsisProfileShape[] = [];
  for (const [cli, modelId] of Object.entries(DEFAULT_MODEL_PER_CLI) as Array<
    [CliNameLiteral, ModelId]
  >) {
    const model = getModelCapabilities(modelId);
    const q = model?.qualityScores;
    const p = model?.pricing;
    if (model === undefined || q === undefined || p === undefined) continue;
    profiles.push({
      cliName: cli,
      capabilities: {
        reasoning: q.reasoning,
        contextWindow: model.contextWindow,
        codeGeneration: q.codeGeneration,
        speed: q.speed,
        cost: q.cost,
      },
      costPerMillionInput: p.inputPer1M,
      costPerMillionOutput: p.outputPer1M,
      averageLatencyMs: CLI_AVG_LATENCY[cli],
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
 * Matches against both cliModelName (e.g., 'o3', 'gemini-2.5-pro')
 * and cliAlias (e.g., 'opus', 'sonnet') for CLI tools that use aliases.
 */
export function findCanonicalModel(
  cli: CliNameLiteral,
  cliModelName: string
): ModelCapability | undefined {
  return DEFAULT_MODEL_CAPABILITIES.models.find(
    (m) => m.cliName === cli && (m.cliModelName === cliModelName || m.cliAlias === cliModelName)
  );
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
export function buildMockModelInfo(): Record<CliNameLiteral, ModelInfoShape> {
  const result = {} as Record<CliNameLiteral, ModelInfoShape>;
  for (const [cli, modelId] of Object.entries(DEFAULT_MODEL_PER_CLI) as Array<
    [CliNameLiteral, ModelId]
  >) {
    const model = getModelCapabilities(modelId);
    if (model === undefined) continue;
    const info: ModelInfoShape = {
      id: model.id,
      name: model.displayName,
      contextWindow: model.contextWindow,
    };
    // Only set optional properties when values exist (exactOptionalPropertyTypes)
    if (model.maxOutputTokens !== undefined) {
      (info as { maxOutput: number }).maxOutput = model.maxOutputTokens;
    }
    if (model.pricing !== undefined) {
      (info as { costPerMillionInput: number }).costPerMillionInput = model.pricing.inputPer1M;
      (info as { costPerMillionOutput: number }).costPerMillionOutput = model.pricing.outputPer1M;
    }
    result[cli] = info;
  }
  return result;
}
