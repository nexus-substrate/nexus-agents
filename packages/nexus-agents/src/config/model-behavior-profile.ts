/**
 * @deprecated Superseded by `ModelRegistry` in `model-registry.ts` (#2540).
 * This module will be deleted in PR 2 of #2540 — `lookupModelProfile`
 * callers migrate to `registry.getEntry(modelId)`. The behaviour fields
 * have moved into `ModelEntry`; the lookup chain (vendor → family →
 * default) is preserved inside `deriveEntry`.
 *
 * Per-model behaviour profiles (#2529).
 *
 * Once `resolveModelIdentity` has classified a served model, this
 * module looks up the behaviour profile that drives the
 * `AgenticAdapter` loop — parallel-vs-sequential tool execution,
 * prompt-caching opt-in, tool-format translation, JSON-strictness on
 * response parsing, recommended turn budget.
 *
 * Profiles are pattern-inherited:
 *
 *   `claude-opus`  ← `claude-*`  ← `anthropic-*`  ← `default`
 *
 * Adding a new model variant doesn't need a new profile — pattern
 * matching at `vendor + family` level covers any future
 * `claude-opus-5`, `gpt-5o`, etc.
 *
 * The active profile = layered overlay:
 *
 *   `modelHints` overrides → outcome-driven adjustments (future) →
 *   manifest overrides (future) → in-tree pattern-matched defaults
 *
 * For v1 only the in-tree defaults + modelHints are wired; the
 * other two layers land in PR C of the #2529 plan.
 *
 * @module config/model-behavior-profile
 */

import {
  resolveModelIdentitySync,
  type ResolvedModelIdentity,
  type ModelVendor,
} from './model-identity.js';

/**
 * Tool-definition format the model expects in `CompletionRequest.tools`.
 * Each `IModelAdapter` already translates from the canonical
 * `ToolDefinition` shape into the provider's native form, so this
 * field is informational for now — but lets us record cross-provider
 * differences explicitly.
 */
export type ToolDefinitionFormat = 'openai' | 'anthropic' | 'gemini';

/**
 * How aggressively the agentic adapter should opt into prompt
 * caching. `'none'` = never set caching markers. `'ephemeral'` =
 * mark tool definitions as `cache_control: ephemeral` (Anthropic
 * only; harmless on other providers because the canonical request
 * shape strips unsupported fields). `'aggressive'` = also cache the
 * system prompt + recent assistant turns. Reserved.
 */
export type PromptCachingMode = 'none' | 'ephemeral' | 'aggressive';

/**
 * Profile that parameterises the agent loop's behaviour.
 *
 * Every field has a sensible default in the `DEFAULT_PROFILE` constant
 * below; per-vendor and per-family profiles override only the fields
 * they care about (lookup merges with inheritance).
 */
export interface ModelBehaviorProfile {
  /**
   * Run multiple `tool_use` blocks from one assistant turn in parallel
   * (`Promise.all`) when true, sequentially when false. OpenAI tool
   * use is parallel-friendly; Anthropic batches but expects sequential
   * tool execution semantics. Defaults to `false` (safer everywhere).
   */
  readonly parallelToolCalls: boolean;
  /**
   * Prompt-caching opt-in level. `'none'` is safe everywhere;
   * `'ephemeral'` adds Anthropic-style markers that other providers
   * ignore.
   */
  readonly promptCaching: PromptCachingMode;
  /**
   * Provider-native tool-definition format. Informational at v1 (each
   * IModelAdapter already translates), but recorded so behaviour
   * differences are auditable in eval logs.
   */
  readonly toolDefinitionFormat: ToolDefinitionFormat;
  /** Soft recommendation; harnesses can override. */
  readonly maxRecommendedTurnBudget: number;
  /**
   * Strict JSON parsing on tool-call arguments. Some smaller models
   * emit single-quoted JSON or trailing commas; setting this to
   * `false` would enable a lenient parser. v1 always uses strict
   * JSON; the field exists so PR C's outcome-driven adjustment can
   * flip it without an API change.
   */
  readonly strictJson: boolean;
  /**
   * Free-form quirk hints applied to this profile — `'reasoning'`,
   * `'embedding'`, `'gateway-renamed'`, etc. Mostly informational at
   * v1 except `'embedding'` which the adapter uses to refuse to
   * construct (agent loop is meaningless on an embedding model).
   */
  readonly quirks: readonly string[];
  /** Profile id, useful for logs and observability. */
  readonly profileId: string;
}

/**
 * Default profile — applied when nothing more specific matches. Safe
 * everywhere: sequential tool calls, no caching, OpenAI-format tool
 * defs (de facto standard), strict JSON.
 */
export const DEFAULT_PROFILE: ModelBehaviorProfile = {
  parallelToolCalls: false,
  promptCaching: 'none',
  toolDefinitionFormat: 'openai',
  maxRecommendedTurnBudget: 10,
  strictJson: true,
  quirks: [],
  profileId: 'default',
};

// ============================================================================
// Per-vendor + per-family profiles (sparse — each row overrides only
// the fields it cares about; lookup merges with DEFAULT_PROFILE).
// ============================================================================

type ProfileOverride = Partial<Omit<ModelBehaviorProfile, 'profileId'>> & {
  readonly profileId: string;
};

const VENDOR_PROFILES: Partial<Record<ModelVendor, ProfileOverride>> = {
  anthropic: {
    profileId: 'anthropic-default',
    promptCaching: 'ephemeral',
    toolDefinitionFormat: 'anthropic',
    parallelToolCalls: true, // Claude 4.x supports parallel tool_use blocks
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
    toolDefinitionFormat: 'gemini',
    parallelToolCalls: true,
    maxRecommendedTurnBudget: 15,
  },
  meta: {
    profileId: 'meta-default',
    toolDefinitionFormat: 'openai',
    parallelToolCalls: false, // many open-weight Llamas struggle with parallel tools
    maxRecommendedTurnBudget: 8,
  },
  qwen: {
    profileId: 'qwen-default',
    toolDefinitionFormat: 'openai',
    parallelToolCalls: false,
    maxRecommendedTurnBudget: 8,
  },
  nvidia: {
    profileId: 'nvidia-nemotron-default',
    toolDefinitionFormat: 'openai',
    parallelToolCalls: false,
    maxRecommendedTurnBudget: 8,
  },
  mistral: {
    profileId: 'mistral-default',
    toolDefinitionFormat: 'openai',
    parallelToolCalls: false,
    maxRecommendedTurnBudget: 8,
  },
  cohere: {
    profileId: 'cohere-default',
    toolDefinitionFormat: 'openai',
    parallelToolCalls: false,
    maxRecommendedTurnBudget: 8,
  },
  deepseek: {
    profileId: 'deepseek-default',
    toolDefinitionFormat: 'openai',
    parallelToolCalls: false,
    maxRecommendedTurnBudget: 10,
  },
};

/** Family-level overrides — keyed `<family-name>` with `vendor` filter. */
interface FamilyProfileEntry {
  readonly vendor: ModelVendor;
  readonly family: string;
  readonly override: ProfileOverride;
}

const FAMILY_PROFILES: readonly FamilyProfileEntry[] = [
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
    override: {
      profileId: 'openai-o-reasoning',
      // o1-style reasoning models burn extra turns thinking; recommend
      // a higher budget. They also don't support `temperature`.
      maxRecommendedTurnBudget: 25,
    },
  },
  {
    vendor: 'google',
    family: 'gemini-flash',
    override: { profileId: 'gemini-flash', maxRecommendedTurnBudget: 8 },
  },
];

// ============================================================================
// Lookup
// ============================================================================

/**
 * Resolve a behaviour profile for a model identity.
 *
 * Inheritance order (least → most specific):
 *   `DEFAULT_PROFILE` → vendor profile → family profile → quirks overlay
 *
 * Quirks contribute small overrides:
 *   - `'embedding'` → flag `embedding` quirk on result, retain other
 *     fields; `AgenticAdapter` checks for this and refuses to construct
 *   - `'thinking'` → bump `maxRecommendedTurnBudget` by 1.5x
 */
export function lookupModelProfile(identity: ResolvedModelIdentity): ModelBehaviorProfile {
  let profile: ModelBehaviorProfile = { ...DEFAULT_PROFILE };

  const vendorOverride = VENDOR_PROFILES[identity.vendor];
  if (vendorOverride !== undefined) profile = mergeProfile(profile, vendorOverride);

  const familyOverride = FAMILY_PROFILES.find(
    (e) => e.vendor === identity.vendor && e.family === identity.family
  );
  if (familyOverride !== undefined) profile = mergeProfile(profile, familyOverride.override);

  profile = applyQuirkOverlay(profile, identity.quirks);

  return profile;
}

function mergeProfile(base: ModelBehaviorProfile, override: ProfileOverride): ModelBehaviorProfile {
  // Override always wins; profileId from override.
  return {
    ...base,
    ...override,
  };
}

function applyQuirkOverlay(
  profile: ModelBehaviorProfile,
  identityQuirks: readonly string[]
): ModelBehaviorProfile {
  if (identityQuirks.length === 0) return profile;
  const merged = new Set<string>([...profile.quirks, ...identityQuirks]);
  let maxBudget = profile.maxRecommendedTurnBudget;
  if (identityQuirks.includes('thinking')) {
    maxBudget = Math.ceil(maxBudget * 1.5);
  }
  return {
    ...profile,
    quirks: [...merged],
    maxRecommendedTurnBudget: maxBudget,
  };
}

/**
 * Convenience: skip the `ResolvedModelIdentity` round-trip when the
 * caller has a model id string and just wants a profile.
 */
export function lookupProfileFromModelId(modelId: string): ModelBehaviorProfile {
  return lookupModelProfile(resolveModelIdentitySync(modelId));
}
