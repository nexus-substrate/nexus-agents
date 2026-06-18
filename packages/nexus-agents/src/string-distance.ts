/**
 * Pure string-distance helpers shared across the CLI surface.
 *
 * Currently exposes standard Levenshtein edit distance, used for typo-tolerant
 * suggestions: unknown NEXUS_* env vars (`config/env-schema.ts`) and unknown
 * top-level CLI subcommands (`cli-command-suggester.ts`, #3211).
 *
 * @module string-distance
 */

/** Safe array accessor — indices are always in-bounds by construction. */
function at(arr: number[], i: number): number {
  return arr[i] ?? 0;
}

/**
 * Standard Levenshtein edit distance between two strings.
 *
 * Counts the minimum number of single-character insertions, deletions, and
 * substitutions needed to turn `a` into `b`. Symmetric. O(len(a) * len(b))
 * time, O(len(b)) space via the rolling two-row table.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(at(prev, j) + 1, at(curr, j - 1) + 1, at(prev, j - 1) + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return at(prev, n);
}
