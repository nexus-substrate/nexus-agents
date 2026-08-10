/**
 * nexus-agents/config - Antigravity (`agy`) model-slug mapping
 *
 * Maps canonical registry model ids onto the model slugs the `agy` CLI accepts
 * (#4346).
 *
 * WHY THIS IS SEPARATE FROM `cliModelName`. The obvious move — repointing the
 * gemini entries' `cliModelName` at agy slugs — is wrong: that field is ALSO
 * read by the API-based `GeminiAdapter` via `GEMINI_MODELS`
 * (`adapters/gemini-types.ts:21-23`), which calls the Google API directly and
 * needs real API ids like `gemini-2.5-flash`. agy's slugs (`gemini-3.6-flash-low`)
 * are meaningless to that API. One field cannot serve both surfaces, so the
 * CLI-transport naming lives here.
 *
 * Lives under `config/` because `scripts/check-model-string-drift.ts` blocks
 * version-bearing model-id literals outside this directory, and enforces it in
 * CI and pre-push.
 *
 * Verified against `agy models` on v1.1.9 (2026-08-09).
 *
 * @module config/agy-model-map
 */

import { findCanonicalModel } from './model-config-helpers.js';

/**
 * The model slugs `agy` accepts, as reported by `agy models`.
 *
 * agy bakes reasoning effort into the slug (`-high`/`-medium`/`-low`) rather
 * than taking it as a separate axis. A `--effort` flag also exists; the slug
 * suffix is used here because it is what `agy models` enumerates, making it the
 * machine-readable contract.
 *
 * agy is multi-model — it also fronts `claude-sonnet-4-6`,
 * `claude-opus-4-6-thinking` and `gpt-oss-120b-medium`. Those are deliberately
 * NOT mapped: the `gemini` routing arm means "Gemini-family models", and this
 * repo already routes Claude through the claude adapter and GPT-OSS through
 * openrouter arms. Adding duplicate routes here would give the router redundant
 * arms to disambiguate with no consumer asking for them (#4346, 7/0 vote).
 */
export const AGY_MODEL_SLUGS = [
  'gemini-3.6-flash-high',
  'gemini-3.6-flash-medium',
  'gemini-3.6-flash-low',
  'gemini-3.5-flash-high',
  'gemini-3.5-flash-medium',
  'gemini-3.5-flash-low',
  'gemini-3.1-pro-high',
  'gemini-3.1-pro-low',
] as const;

export type AgyModelSlug = (typeof AGY_MODEL_SLUGS)[number];

/**
 * Canonical registry model id → agy slug.
 *
 * Mapped by TIER SEMANTICS, not by version-string similarity, because agy's
 * generations do not line up with the registry's. The registry's quality
 * profile is the guide: the two `pro` entries take the pro slugs (higher
 * reasoning gets `-high`), and the three flash entries take flash slugs
 * descending by the cost/quality trade-off each entry records.
 *
 * `gemini-pro` and `gemini-flash` are registry entries for the 2.5 generation,
 * which agy does not serve at all; they map to the nearest surviving tier rather
 * than being dropped, so routing that already selects them keeps working.
 */
const CANONICAL_TO_AGY: Readonly<Record<string, AgyModelSlug>> = {
  // reasoning 10 — the strongest entry takes the strongest pro tier
  'gemini-3-pro': 'gemini-3.1-pro-high',
  // reasoning 9, 2.5-generation — nearest surviving pro tier
  'gemini-pro': 'gemini-3.1-pro-low',
  // speed 10 / quality 8
  'gemini-3.5-flash': 'gemini-3.5-flash-medium',
  // speed 10 / quality 8, cheaper than the above
  'gemini-3-flash': 'gemini-3.5-flash-low',
  // cheapest entry, quality 7, 2.5-generation
  'gemini-flash': 'gemini-3.6-flash-low',
};

/**
 * agy slug → canonical registry id. Derived from {@link CANONICAL_TO_AGY} so the
 * two directions cannot drift (#4395).
 *
 * Needed because the forward map alone left the arm unable to describe what it
 * actually ran: `getModelInfo()` reported the registry's `cliModelName` (a
 * Google API id agy does not accept) while `getCommand()` spawned the slug. That
 * mismatch reached `TaskOutcome.model`, so the routing loop was told the wrong
 * model produced each outcome, and pricing could not resolve the slug at all.
 */
const AGY_TO_CANONICAL: ReadonlyMap<string, string> = new Map(
  Object.entries(CANONICAL_TO_AGY).map(([canonical, slug]) => [slug, canonical])
);

/**
 * Resolve an agy slug back to the canonical registry id, or null when the slug
 * is one agy serves but the registry has no entry for.
 *
 * Null rather than a guess: several registry entries map onto the same slug
 * where agy's generations do not line up with ours, so a reverse lookup is
 * lossy by construction. Callers should fall back to the raw slug rather than
 * inventing an entry.
 */
export function fromAgyModelSlug(slug: string): string | null {
  return AGY_TO_CANONICAL.get(slug) ?? null;
}

/** The slug used when a caller names a model agy cannot serve. */
export const DEFAULT_AGY_MODEL: AgyModelSlug = 'gemini-3.1-pro-high';

/** Whether a string is a slug `agy` will accept. */
export function isAgyModelSlug(value: string): value is AgyModelSlug {
  return (AGY_MODEL_SLUGS as readonly string[]).includes(value);
}

/**
 * Resolve a model identifier to a slug `agy` accepts.
 *
 * Accepts an already-valid agy slug unchanged (so callers can pin one
 * directly), then a canonical registry id, and otherwise falls back to
 * {@link DEFAULT_AGY_MODEL}.
 *
 * The fallback is deliberate rather than an error: an unmapped id reaching agy
 * produces `{"status":"ERROR","error":"invalid model selection ..."}` **with
 * exit code 0**, which is a far worse failure than quietly running a valid
 * model. The substitution is logged by the caller.
 */
export function toAgyModelSlug(model: string): AgyModelSlug {
  if (isAgyModelSlug(model)) return model;
  const direct = CANONICAL_TO_AGY[model];
  if (direct !== undefined) return direct;
  // #4395: callers legitimately pin a registry `cliModelName` (a Google API id
  // like `gemini-2.5-pro`) rather than the canonical entry id. Resolve it to the
  // canonical entry before mapping, so a pinned model is honoured instead of
  // silently falling through to the default.
  const canonical = findCanonicalModel('gemini', model)?.id;
  if (canonical !== undefined) {
    const viaCanonical = CANONICAL_TO_AGY[canonical];
    if (viaCanonical !== undefined) return viaCanonical;
  }
  return DEFAULT_AGY_MODEL;
}
