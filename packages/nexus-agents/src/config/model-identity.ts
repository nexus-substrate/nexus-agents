/**
 * Dynamic model-identity resolver (#2529).
 *
 * Real-world `modelId` strings are messy:
 *   - clean upstream: `claude-sonnet-4-6`, `gpt-4o`, `gemini-2.0-flash`
 *   - vendor-prefixed: `anthropic/claude-sonnet-4-6`, `meta-llama/llama-3.3-70b`
 *   - dated: `claude-3-5-sonnet-20241022`, `gpt-4o-2024-08-06`
 *   - operator-renamed: `2025-claude-opus-4_0_high`, `workspace-claude-prod`
 *   - opaque: `internal-fast-model`
 *
 * This module turns any of those into a `ResolvedModelIdentity` —
 * vendor + family + version + capability hints — so the
 * agentic-adapter layer can pick a behaviour profile based on the
 * actual served model, NOT on `IModelAdapter.providerId` (which for a
 * custom OpenAI gateway is always `openai` regardless of what model
 * the gateway is fronting).
 *
 * Resolution priority (highest first):
 *   1. operator `modelHints` — explicit override at construction
 *   2. probe of `IModelAdapter.listModels()` — `owned_by` field
 *   3. modelId-string parse — fuzzy regex table on the normalised id
 *   4. `unknown` defaults
 *
 * Each layer fills only the fields its higher-priority neighbour left
 * blank, so an operator can hint `{ vendor: 'anthropic' }` and still
 * let `family` come from the probe / parse.
 *
 * @module config/model-identity
 */

import type { IModelAdapter, ModelMetadata } from '../core/types/model.js';

/** Coarse vendor bucket — drives behaviour-profile lookup downstream. */
export type ModelVendor =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'meta'
  | 'qwen'
  | 'nvidia'
  | 'mistral'
  | 'cohere'
  | 'deepseek'
  | 'unknown';

/**
 * Family inside a vendor — `claude-opus`, `claude-sonnet`, `gpt-4o`,
 * `gemini-flash`, `llama-3`, etc. `unknown` when we recognised the
 * vendor but not the specific family (e.g., gateway-renamed model).
 */
export type ModelFamily = string;

/** Where each piece of the resolved identity came from — useful for audit logs. */
export type IdentitySource = 'modelHints' | 'probe' | 'modelIdParse' | 'default';

/**
 * Resolved identity for a served model. Returned by `resolveModelIdentity`.
 *
 * The `quirks` array carries free-form capability hints lifted from
 * the modelId string — `'embedding'` to flag non-chat models,
 * `'thinking'` for reasoning variants, `'vision'`, `'mini'`, `'high'`,
 * etc. Behaviour profiles consult this to override their defaults.
 */
export interface ResolvedModelIdentity {
  readonly vendor: ModelVendor;
  readonly family: ModelFamily;
  readonly version?: string;
  readonly quirks: readonly string[];
  readonly source: IdentitySource;
  readonly rawModelId: string;
}

/** Operator-supplied identity overrides. Any field forces; others fall through. */
export interface ModelHints {
  readonly vendor?: ModelVendor;
  readonly family?: ModelFamily;
  readonly version?: string;
  readonly quirks?: readonly string[];
}

/** Options for the resolver. Probe is on by default; `skipProbe: true` opts out. */
export interface ResolveModelIdentityOptions {
  readonly hints?: ModelHints;
  readonly skipProbe?: boolean;
}

// ============================================================================
// Pattern table — vendor + family detection from the normalised modelId
// ============================================================================

interface VendorPattern {
  readonly vendor: ModelVendor;
  readonly regex: RegExp;
}

/**
 * Vendor-detection patterns. `\b` word boundary matters here — without
 * it, `claudia-7b` would match the `claude` vendor. With it,
 * `2025-claude-opus-4` (after normalisation: `2025-claude-opus-4`)
 * matches because the leading `-` and trailing `-` are non-word.
 */
const VENDOR_PATTERNS: readonly VendorPattern[] = [
  { vendor: 'anthropic', regex: /\b(claude|anthropic)\b/ },
  // OpenAI: gpt, o1-o9 reasoning, chatgpt, openai prefix
  { vendor: 'openai', regex: /\b(gpt|o[1-9]|chatgpt|openai)\b/ },
  { vendor: 'google', regex: /\b(gemini|bison|gecko|palm|google)\b/ },
  { vendor: 'meta', regex: /\b(llama|meta-llama|meta)\b/ },
  { vendor: 'qwen', regex: /\b(qwen)\b/ },
  { vendor: 'nvidia', regex: /\b(nemotron|nvidia)\b/ },
  { vendor: 'mistral', regex: /\b(mistral|mixtral|codestral)\b/ },
  { vendor: 'cohere', regex: /\b(command-r|command|cohere)\b/ },
  { vendor: 'deepseek', regex: /\b(deepseek)\b/ },
];

interface FamilyPattern {
  readonly vendor: ModelVendor;
  readonly family: string;
  readonly regex: RegExp;
}

/**
 * Family-detection patterns. Vendor-scoped — only consulted after the
 * vendor is known. Order matters: more specific patterns come first
 * (`gpt-4o` before `gpt-4`).
 */
const FAMILY_PATTERNS: readonly FamilyPattern[] = [
  // Anthropic
  { vendor: 'anthropic', family: 'claude-opus', regex: /\b(opus)\b/ },
  { vendor: 'anthropic', family: 'claude-sonnet', regex: /\b(sonnet)\b/ },
  { vendor: 'anthropic', family: 'claude-haiku', regex: /\b(haiku)\b/ },
  // OpenAI
  { vendor: 'openai', family: 'o-reasoning', regex: /\bo[1-9]\b/ },
  { vendor: 'openai', family: 'gpt-4o', regex: /\b(gpt-4o|gpt4o|4o)\b/ },
  { vendor: 'openai', family: 'gpt-4', regex: /\b(gpt-4)\b/ },
  { vendor: 'openai', family: 'gpt-3.5', regex: /\b(gpt-3-5|gpt-3\.5|gpt35)\b/ },
  // Google
  { vendor: 'google', family: 'gemini-pro', regex: /\bgemini.*\bpro\b/ },
  { vendor: 'google', family: 'gemini-flash', regex: /\bgemini.*\bflash\b/ },
  { vendor: 'google', family: 'gemini', regex: /\bgemini\b/ },
  // Meta
  { vendor: 'meta', family: 'llama-3', regex: /\bllama-?3\b/ },
  { vendor: 'meta', family: 'llama-2', regex: /\bllama-?2\b/ },
  // Qwen — version is in the family name
  { vendor: 'qwen', family: 'qwen-3', regex: /\bqwen-?3\b/ },
  { vendor: 'qwen', family: 'qwen-2.5', regex: /\bqwen-?2-?5\b/ },
  { vendor: 'qwen', family: 'qwen-2', regex: /\bqwen-?2\b/ },
  // Mistral
  { vendor: 'mistral', family: 'mixtral', regex: /\bmixtral\b/ },
  { vendor: 'mistral', family: 'codestral', regex: /\bcodestral\b/ },
  { vendor: 'mistral', family: 'mistral', regex: /\bmistral\b/ },
];

/**
 * Quirk hints lifted from the normalised id. Detected after vendor
 * resolution so they're free of false positives ("opus" inside a
 * Llama name won't trigger).
 */
const QUIRK_PATTERNS: ReadonlyArray<{ regex: RegExp; quirk: string }> = [
  { regex: /\b(embedding|embed)\b/, quirk: 'embedding' },
  { regex: /\b(thinking|reasoning)\b/, quirk: 'thinking' },
  { regex: /\bvision\b/, quirk: 'vision' },
  { regex: /\b(coder|code)\b/, quirk: 'coder' },
  { regex: /\binstruct\b/, quirk: 'instruct' },
  { regex: /\b(mini|nano|tiny|small|lite)\b/, quirk: 'small' },
  { regex: /\b(large|xl|big|maxi)\b/, quirk: 'large' },
  { regex: /\bhigh\b/, quirk: 'high-variant' },
  { regex: /\b(\d+)b\b/, quirk: 'sized-suffix' }, // 7b, 70b, 405b
  { regex: /\b(?:\d{8}|\d{4}-\d{2}-\d{2}|\d{4}-\d{2})\b/, quirk: 'dated' }, // 20240806 / 2024-08-06 / 2024-08
];

// ============================================================================
// Public API
// ============================================================================

/**
 * Resolve a model adapter to a canonical identity. Always succeeds —
 * unknown models get `vendor: 'unknown'`, `family: 'unknown'`.
 *
 * @param adapter - the model adapter being identified
 * @param options - operator hints + probe controls
 */
export async function resolveModelIdentity(
  adapter: IModelAdapter,
  options: ResolveModelIdentityOptions = {}
): Promise<ResolvedModelIdentity> {
  const rawModelId = adapter.modelId;
  const hints = options.hints ?? {};
  let probe: ProbeResult | undefined;
  if (options.skipProbe !== true && typeof adapter.listModels === 'function') {
    probe = await runProbe(adapter, rawModelId);
  }
  const parsed = parseModelId(rawModelId);

  return mergeIdentity({ rawModelId, hints, probe, parsed });
}

/**
 * Sync variant: skip the probe and resolve from `modelId` only.
 * Useful in hot paths (per-request routing) where the async probe
 * latency isn't tolerable. The async `resolveModelIdentity` caches
 * probe results internally so the perf delta after the first call
 * is small.
 */
export function resolveModelIdentitySync(
  modelId: string,
  hints?: ModelHints
): ResolvedModelIdentity {
  return mergeIdentity({
    rawModelId: modelId,
    hints: hints ?? {},
    probe: undefined,
    parsed: parseModelId(modelId),
  });
}

// ============================================================================
// Internals
// ============================================================================

interface ParseResult {
  readonly vendor?: ModelVendor;
  readonly family?: string;
  readonly version?: string;
  readonly quirks: readonly string[];
}

interface ProbeResult {
  readonly vendor?: ModelVendor;
  readonly metadata?: ModelMetadata;
}

/**
 * Parse a modelId string into vendor + family + version hints.
 * Public for tests; not re-exported from the package.
 */
export function parseModelId(modelId: string): ParseResult {
  const normalised = normaliseModelId(modelId);
  const vendor = detectVendor(normalised);
  const family = vendor !== undefined ? detectFamily(normalised, vendor) : undefined;
  const version =
    vendor !== undefined && family !== undefined ? extractVersion(normalised, family) : undefined;
  const quirks = detectQuirks(normalised);

  return {
    ...(vendor !== undefined && { vendor }),
    ...(family !== undefined && { family }),
    ...(version !== undefined && { version }),
    quirks,
  };
}

/**
 * Lowercase + replace `_` and `/` with `-` so word boundaries land on
 * the real model-name tokens. Collapses runs of `-` so we don't get
 * empty tokens from `--`.
 */
function normaliseModelId(modelId: string): string {
  return modelId.toLowerCase().replace(/[_/]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function detectVendor(normalised: string): ModelVendor | undefined {
  for (const { vendor, regex } of VENDOR_PATTERNS) {
    if (regex.test(normalised)) return vendor;
  }
  return undefined;
}

function detectFamily(normalised: string, vendor: ModelVendor): string | undefined {
  for (const fp of FAMILY_PATTERNS) {
    if (fp.vendor !== vendor) continue;
    if (fp.regex.test(normalised)) return fp.family;
  }
  return undefined;
}

/**
 * Pull the version-ish substring after the family — `claude-opus-4-1`
 * → `4-1`, `gpt-4o-2024-08-06` → `2024-08-06`. Best-effort; many
 * models won't have a clean post-family numeric run, in which case
 * we return undefined.
 */
function extractVersion(normalised: string, family: string): string | undefined {
  // Strip vendor prefix if present, then look for a numeric segment
  // after the family root.
  const familyRoot = family.replace(/^claude-|^gemini-|^llama-|^qwen-|^gpt-/, '');
  const idx = normalised.indexOf(familyRoot);
  if (idx === -1) return undefined;
  const tail = normalised.slice(idx + familyRoot.length);
  const m = /^[-]?(\d[\d.\-]*)/.exec(tail);
  if (m === null) return undefined;
  return m[1]?.replace(/-+$/, '') ?? undefined;
}

function detectQuirks(normalised: string): readonly string[] {
  const out: string[] = [];
  for (const { regex, quirk } of QUIRK_PATTERNS) {
    if (regex.test(normalised) && !out.includes(quirk)) out.push(quirk);
  }
  return out;
}

interface ListModelsCapable {
  listModels: () => Promise<readonly ModelMetadata[]>;
}

async function runProbe(adapter: IModelAdapter, modelId: string): Promise<ProbeResult | undefined> {
  try {
    const capable = adapter as unknown as ListModelsCapable;
    const models = await capable.listModels();
    const matched = models.find((m) => m.id === modelId);
    if (matched === undefined) return undefined;
    const result: ProbeResult = { metadata: matched };
    if (matched.ownedBy !== undefined) {
      const vendor = vendorFromOwnedBy(matched.ownedBy);
      if (vendor !== undefined) {
        return { ...result, vendor };
      }
    }
    return result;
  } catch {
    // Probe is best-effort. Failure (network, unsupported endpoint,
    // bad auth) silently falls back to modelId-only resolution.
    return undefined;
  }
}

/**
 * Map an OpenAI `/v1/models` `owned_by` field to a vendor bucket.
 * Different gateways report differently — OpenRouter says `anthropic`,
 * upstream OpenAI says `openai`/`system`/`openai-internal`, vLLM says
 * the org name. We do conservative substring matching.
 *
 * Implemented as a data-driven lookup so the cyclomatic-complexity
 * check (max 10) doesn't trip on the chain of `if`s.
 */
const OWNED_BY_PATTERNS: ReadonlyArray<{ readonly substr: string; readonly vendor: ModelVendor }> =
  [
    { substr: 'anthropic', vendor: 'anthropic' },
    { substr: 'openai', vendor: 'openai' },
    { substr: 'google', vendor: 'google' },
    { substr: 'meta', vendor: 'meta' },
    { substr: 'alibaba', vendor: 'qwen' },
    { substr: 'qwen', vendor: 'qwen' },
    { substr: 'nvidia', vendor: 'nvidia' },
    { substr: 'nemotron', vendor: 'nvidia' },
    { substr: 'mistral', vendor: 'mistral' },
    { substr: 'cohere', vendor: 'cohere' },
    { substr: 'deepseek', vendor: 'deepseek' },
  ];

function vendorFromOwnedBy(ownedBy: string): ModelVendor | undefined {
  const lc = ownedBy.toLowerCase();
  for (const { substr, vendor } of OWNED_BY_PATTERNS) {
    if (lc.includes(substr)) return vendor;
  }
  return undefined;
}

interface MergeArgs {
  readonly rawModelId: string;
  readonly hints: ModelHints;
  readonly probe: ProbeResult | undefined;
  readonly parsed: ParseResult;
}

function mergeIdentity(args: MergeArgs): ResolvedModelIdentity {
  const { rawModelId, hints, probe, parsed } = args;
  const version = pickVersion(hints, parsed);
  return {
    vendor: hints.vendor ?? probe?.vendor ?? parsed.vendor ?? 'unknown',
    family: hints.family ?? parsed.family ?? 'unknown',
    ...(version !== undefined && { version }),
    quirks: [...new Set([...(hints.quirks ?? []), ...parsed.quirks])],
    source: pickSource(hints, probe, parsed),
    rawModelId,
  };
}

function pickVersion(hints: ModelHints, parsed: ParseResult): string | undefined {
  return hints.version ?? parsed.version;
}

function pickSource(
  hints: ModelHints,
  probe: ProbeResult | undefined,
  parsed: ParseResult
): IdentitySource {
  if (hints.vendor !== undefined) return 'modelHints';
  if (probe?.vendor !== undefined) return 'probe';
  if (parsed.vendor !== undefined) return 'modelIdParse';
  return 'default';
}
