/**
 * Identity-index helpers for the ModelRegistry's normalized/identity
 * resolution tier (#4164).
 *
 * OpenAI-compatible gateways frequently expose vendor models under
 * decorated names (`Claude_Opus_4.8_hardened`, `2025-claude-opus-4_0_high`).
 * An exact registry lookup misses those, which used to drop the request to
 * bare derivation — losing pricing/metadata the registry actually has for
 * the underlying model. This module supplies the second-chance machinery:
 *
 *   - a load-time `vendor|family|version` index over loaded entries (built
 *     once, never per-request O(N) scans),
 *   - tier-ordered candidate selection (manifest/in-tree before
 *     models-dev/generated) with effective-duplicate dedupe, failing CLOSED
 *     when more than one distinct candidate survives,
 *   - dated-decoration tolerance (#4183): ONE trailing snapshot-date
 *     segment on the decorated side is stripped when the canonical's
 *     version is date-free — snapshot-style dated canonicals still require
 *     full equality,
 *   - a sub-SKU guard (#4183): a size/tier quirk (`-mini`, `-lite`, `70b`)
 *     on the decorated id that the canonical lacks fails CLOSED instead of
 *     inheriting the parent SKU's pricing.
 *
 * The registry itself (model-registry.ts) owns the merge semantics —
 * matched entries grant PRICING/METADATA ONLY; behaviour fields still come
 * from derivation for the original decorated id.
 *
 * @module config/model-fuzzy-resolution
 */

import { normaliseModelId, resolveModelIdentitySync } from './model-identity.js';
import type { ResolvedModelIdentity } from './model-identity.js';
import type { ModelEntry } from './model-registry.js';
import type { Pricing } from './model-capabilities-types.js';

/**
 * Ids longer than this skip the fuzzy tier entirely (straight to
 * derivation). Guards the normalizer/regex parses against pathological
 * inputs; checked BEFORE normalization.
 */
export const MAX_FUZZY_ID_LENGTH = 256;

/** Breadth catalog tiers — searched only when no authoritative tier matches. */
const BREADTH_SOURCES: ReadonlySet<ModelEntry['source']> = new Set(['models-dev', 'generated']);

/**
 * Explicit tier priority (lower = higher). The registry's entry maps
 * iterate in LOAD order, which is lowest-priority-FIRST (generated →
 * models-dev → in-tree → manifest), so candidate selection must rank by
 * source explicitly — never rely on map insertion order.
 */
const SOURCE_RANK: Record<ModelEntry['source'], number> = {
  manifest: 0,
  'in-tree': 1,
  'models-dev': 2,
  generated: 3,
  derived: 4,
};

function byTierPriority(a: ModelEntry, b: ModelEntry): number {
  return SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
}

/**
 * Canonical comparison key for version strings. Reuses `normaliseModelId`,
 * additionally unifying `.` with `-` so a decorated `4.8` compares equal to
 * the canonical Anthropic-style `4-8`. This is a version-KEY canonicalizer
 * only — id normalization stays `normaliseModelId` verbatim.
 */
function versionKey(version: string): string {
  return normaliseModelId(version).replace(/\./g, '-');
}

/** Entry-side version: the stored field, else best-effort parse of the id. */
function entryVersion(entry: ModelEntry): string | undefined {
  return entry.version ?? resolveModelIdentitySync(entry.id).version;
}

/**
 * `vendor|family|version` index key, or undefined when the identity cannot
 * participate in identity matching: version is REQUIRED on both sides, and
 * the `unknown` vendor/family sentinels never match anything.
 */
export function identityKeyFor(
  identity: Pick<ResolvedModelIdentity, 'vendor' | 'family' | 'version'>
): string | undefined {
  if (identity.vendor === 'unknown' || identity.family === 'unknown') return undefined;
  if (identity.version === undefined) return undefined;
  return `${identity.vendor}|${identity.family}|${versionKey(identity.version)}`;
}

/**
 * Build the identity index over loaded entries. Called ONCE (lazily, on the
 * first fuzzy lookup) — the registry's entry maps are immutable after
 * construction, so the index never goes stale.
 */
export function buildIdentityIndex(entries: Iterable<ModelEntry>): Map<string, ModelEntry[]> {
  const index = new Map<string, ModelEntry[]>();
  for (const entry of entries) {
    const version = entryVersion(entry);
    if (version === undefined) continue;
    const key = identityKeyFor({ vendor: entry.vendor, family: entry.family, version });
    if (key === undefined) continue;
    const bucket = index.get(key);
    if (bucket === undefined) index.set(key, [entry]);
    else bucket.push(entry);
  }
  return index;
}

function samePricing(a: Pricing, b: Pricing): boolean {
  return a.inputPer1M === b.inputPer1M && a.outputPer1M === b.outputPer1M;
}

/**
 * Two candidates are "effectively the same model" when their ids normalize
 * to the same canonical id, or when their pricing AND capability envelope
 * (contextWindow, maxOutputTokens) are all identical — LiteLLM catalogs
 * list the same model under many provider prefixes. Identical pricing
 * ALONE is not sufficient: a GA/preview pair can share a price while
 * differing on routing-relevant data like the context window.
 */
function isEffectivelySameModel(a: ModelEntry, b: ModelEntry): boolean {
  if (normaliseModelId(a.id) === normaliseModelId(b.id)) return true;
  if (a.pricing === undefined || b.pricing === undefined) return false;
  return (
    samePricing(a.pricing, b.pricing) &&
    a.contextWindow === b.contextWindow &&
    a.maxOutputTokens === b.maxOutputTokens
  );
}

/**
 * Keep the first of each effective-duplicate group. Callers pass candidates
 * already ranked by tier priority, so "first" is the highest-priority
 * representative of the group.
 */
function dedupeEffectiveDuplicates(candidates: readonly ModelEntry[]): readonly ModelEntry[] {
  const kept: ModelEntry[] = [];
  for (const candidate of candidates) {
    if (!kept.some((k) => isEffectivelySameModel(k, candidate))) kept.push(candidate);
  }
  return kept;
}

/** Unique candidate from one tier bucket, or undefined (fail closed on >1). */
function uniqueCandidate(candidates: readonly ModelEntry[]): ModelEntry | undefined {
  const distinct = dedupeEffectiveDuplicates(candidates);
  return distinct.length === 1 ? distinct[0] : undefined;
}

/**
 * Tier-ordered uniqueness: manifest/in-tree candidates are considered
 * first; only when that bucket is EMPTY do the breadth tiers
 * (models-dev/generated) get a look. Within a bucket, effective duplicates
 * are collapsed before ambiguity is declared; if more than one distinct
 * candidate survives, fail closed (no match) rather than guess.
 */
export function selectIdentityCandidate(
  candidates: readonly ModelEntry[] | undefined
): ModelEntry | undefined {
  if (candidates === undefined) return undefined;
  // Rank by tier priority first (stable sort keeps within-tier load order)
  // so dedupe keeps the highest-priority representative of each group.
  const ranked = [...candidates].sort(byTierPriority);
  const authoritative = ranked.filter((e) => !BREADTH_SOURCES.has(e.source));
  if (authoritative.length > 0) return uniqueCandidate(authoritative);
  return uniqueCandidate(ranked.filter((e) => BREADTH_SOURCES.has(e.source)));
}

// ============================================================================
// #4183 — dated-decoration matching + sub-SKU fail-closed guard
// ============================================================================

/**
 * ONE trailing snapshot-date segment on a version KEY — `4-8-20250514`
 * ends in a strippable `-20250514`. Mirrors `parseClaudeMajorMinor`'s
 * date-tolerant parse (model-parameter-support.ts): 6–8 digits covers
 * `202505`/`20250514` while a short numeric segment (`-8`, `-70`) stays
 * version-significant. Applied AFTER normalization, so `_`/`.` separators
 * have already become `-`.
 */
const TRAILING_DATE_SEGMENT = /-\d{6,8}$/;

/**
 * Any date-LIKE segment inside a version key (`20250514`, `2024-08`,
 * `2024-08-06`). Detects snapshot-style versions where the date IS (part
 * of) the version — those require full equality and never participate in
 * date-stripped matching, on either side.
 */
const DATE_SEGMENT = /(?:^|-)(?:\d{6,8}|\d{4}-\d{2}(?:-\d{2})?)(?:-|$)/;

/**
 * Size/tier quirk markers from model-identity.ts's QUIRK_PATTERNS (#4183).
 * These denote a DIFFERENT SKU with its own pricing, not a variant of the
 * matched model:
 *   - 'small' (mini|nano|tiny|small|lite) and 'large' (large|xl|big|maxi)
 *     are distinct size tiers sold at their own price points;
 *   - 'sized-suffix' (7b/70b/405b) is a parameter-count SKU marker.
 * Deliberately EXCLUDED: 'thinking', 'high-variant', 'vision', 'coder',
 * 'instruct' (mode/feature variants of the same SKU, same price sheet),
 * 'embedding' (never reaches identity matching with a matching family),
 * and 'dated' (handled by the date-stripping rule above).
 */
const SIZE_TIER_QUIRKS: ReadonlySet<string> = new Set(['small', 'large', 'sized-suffix']);

/**
 * Full identity-match for a decorated id (#4164 + #4183): primary exact
 * version-key lookup, then a date-stripped fallback for dated decorations,
 * then the sub-SKU guard. Fails closed at every step.
 */
export function matchIdentityCandidate(
  index: ReadonlyMap<string, ModelEntry[]>,
  identity: ResolvedModelIdentity
): ModelEntry | undefined {
  const key = identityKeyFor(identity);
  if (key === undefined || identity.version === undefined) return undefined;
  const matched =
    selectIdentityCandidate(index.get(key)) ??
    selectDateStripped(index, identity, identity.version);
  if (matched === undefined) return undefined;
  return blockedBySizeQuirk(identity, matched) ? undefined : matched;
}

/** Date-stripped fallback lookup, scoped to the identity's vendor|family. */
function selectDateStripped(
  index: ReadonlyMap<string, ModelEntry[]>,
  identity: Pick<ResolvedModelIdentity, 'vendor' | 'family'>,
  version: string
): ModelEntry | undefined {
  const vk = versionKey(version);
  if (!TRAILING_DATE_SEGMENT.test(vk)) return undefined;
  const stripped = vk.replace(TRAILING_DATE_SEGMENT, '');
  // FAIL-CLOSED guard: index buckets are keyed by the canonical side's
  // versionKey, so requiring the stripped key to be date-FREE guarantees
  // every candidate's own version carries no date segment. Snapshot-style
  // canonicals (dated gpt-4o ids, version = the date) stay reachable only
  // through full equality on the primary key.
  if (stripped.length === 0 || DATE_SEGMENT.test(stripped)) return undefined;
  const strippedKey = identityKeyFor({
    vendor: identity.vendor,
    family: identity.family,
    version: stripped,
  });
  if (strippedKey === undefined) return undefined;
  return selectIdentityCandidate(index.get(strippedKey));
}

/**
 * Sub-SKU guard (#4183): a size/tier quirk on the DECORATED id that is
 * absent from the canonical candidate's identity means the decoration names
 * a different SKU (`claude-opus-4-8-mini` is not Opus 4.8) — fail closed
 * rather than grant the parent's pricing. Quirks present on BOTH sides
 * (`…-lite-hardened` matching a canonical `…-lite`) do not block.
 */
function blockedBySizeQuirk(identity: ResolvedModelIdentity, matched: ModelEntry): boolean {
  const sizeQuirks = identity.quirks.filter((q) => SIZE_TIER_QUIRKS.has(q));
  if (sizeQuirks.length === 0) return false;
  const canonicalQuirks = resolveModelIdentitySync(matched.id).quirks;
  return sizeQuirks.some((q) => !canonicalQuirks.includes(q));
}
