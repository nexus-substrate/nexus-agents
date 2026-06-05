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

/** Length of the shared leading prefix of two strings. */
function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/** Minimum shared-prefix ratio (of the shorter id) to accept a substitution. */
const MIN_PREFIX_RATIO = 0.6;

/**
 * Resolve `configured` to the closest id present in `available`. Returns
 * `configured` unchanged when it's already offered, when nothing qualifies, or
 * when `available` is empty.
 */
export function resolveLiveModelId(configured: string, available: Iterable<string>): string {
  const set: ReadonlySet<string> =
    available instanceof Set ? (available as Set<string>) : new Set(available);
  if (set.size === 0 || set.has(configured)) return configured;

  const slash = configured.indexOf('/');
  const providerPrefix = slash > 0 ? configured.slice(0, slash + 1) : '';
  const wantsFree = configured.endsWith(':free');

  const candidates = [...set]
    .filter((c) => providerPrefix === '' || c.startsWith(providerPrefix))
    .map((c) => {
      const cp = commonPrefixLength(configured, c);
      const minLen = Math.min(configured.length, c.length);
      return {
        id: c,
        prefix: cp,
        ratio: minLen === 0 ? 0 : cp / minLen,
        freeMatch: c.endsWith(':free') === wantsFree,
      };
    })
    .filter((x) => x.ratio >= MIN_PREFIX_RATIO);

  if (candidates.length === 0) return configured;

  candidates.sort(
    (a, b) =>
      b.prefix - a.prefix || // longest shared prefix
      Number(b.freeMatch) - Number(a.freeMatch) || // matching :free / paid tier
      a.id.length - b.id.length || // prefer the shorter (base) id
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) // lexicographic, fully deterministic
  );
  return candidates[0]?.id ?? configured;
}
