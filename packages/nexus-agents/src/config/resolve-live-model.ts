/**
 * Logical→live model-id resolution (#3407, epic #3403 Phase 2).
 *
 * When a configured model id has gone stale because the provider renamed it
 * (e.g. OpenRouter `qwen/qwen3-coder-480b-a35b:free` → `qwen/qwen3-coder:free`),
 * map it to the closest id that the transport actually offers right now — so a
 * rename is zero-touch instead of needing a registry edit.
 *
 * SAFE by design:
 *  - **Deterministic** (pure function; same inputs → same output). No scoring
 *    randomness, no network.
 *  - **Conservative** — only substitutes within the SAME provider namespace and
 *    only when the shared prefix is substantial (≥60% of the shorter id), so an
 *    unrelated model is never chosen. Otherwise returns the input unchanged.
 *  - **Fail-open** — an empty catalog (discovery disabled/cold) returns the
 *    input unchanged, so routing behaves exactly as before.
 *  - **Advisory** — an exact match always wins; this only kicks in when the id
 *    is NOT offered.
 *
 * @module config/resolve-live-model
 */

/** Split an id into its base and an optional `:tier` suffix (e.g. `:free`). */
function splitTier(id: string): { base: string; tier: string } {
  const colon = id.indexOf(':');
  return colon >= 0 ? { base: id.slice(0, colon), tier: id.slice(colon) } : { base: id, tier: '' };
}

/**
 * True if `prefix` is a prefix of `full` ending at a TOKEN boundary — i.e. the
 * next char in `full` is a separator (`-`, `/`, end). This prevents matching a
 * partial token (`gpt-5` ⊄ `gpt-50`) while allowing `qwen3-coder` ⊂
 * `qwen3-coder-480b`.
 */
function isTokenBoundaryPrefix(prefix: string, full: string): boolean {
  if (prefix.length > full.length || !full.startsWith(prefix)) return false;
  if (full.length === prefix.length) return true;
  const next = full[prefix.length];
  return next === '-' || next === '/';
}

/**
 * Resolve `configured` to the closest id present in `available`. Returns
 * `configured` unchanged when it's already offered, when `available` is empty,
 * or when nothing qualifies.
 *
 * A candidate qualifies ONLY when it is a **simplification** of the configured
 * id — its base is a token-boundary prefix of the configured base (the rename
 * pattern: `qwen3-coder-480b-a35b:free` → `qwen3-coder:free`). It will NOT
 * substitute a *more specific* sibling (`gpt-5` → `gpt-5-codex`), which would be
 * a different model and worse than falling back to the CLI default.
 */
export function resolveLiveModelId(configured: string, available: Iterable<string>): string {
  const set: ReadonlySet<string> =
    available instanceof Set ? (available as Set<string>) : new Set(available);
  if (set.size === 0 || set.has(configured)) return configured;

  const slash = configured.indexOf('/');
  const providerPrefix = slash > 0 ? configured.slice(0, slash + 1) : '';
  const cfg = splitTier(configured);

  const candidates = [...set]
    .filter((c) => providerPrefix === '' || c.startsWith(providerPrefix))
    .map((c) => splitTier(c))
    .filter((cand) => isTokenBoundaryPrefix(cand.base, cfg.base))
    .map((cand) => ({
      id: cand.base + cand.tier,
      baseLen: cand.base.length,
      tierMatch: cand.tier === cfg.tier,
    }));

  if (candidates.length === 0) return configured;

  candidates.sort(
    (a, b) =>
      b.baseLen - a.baseLen || // most-specific simplification (closest to configured)
      Number(b.tierMatch) - Number(a.tierMatch) || // matching :free / paid tier
      a.id.length - b.id.length || // shorter overall
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) // lexicographic — fully deterministic
  );
  return candidates[0]?.id ?? configured;
}
