/**
 * Typo-tolerant "did you mean?" suggestions for unknown top-level CLI
 * subcommands (#3211).
 *
 * When a user mistypes a command (`nexus-agents reviw`), the dispatcher in
 * `cli.ts` calls `formatUnknownCommandMessage` to surface the closest known
 * command(s) alongside the usual usage hint, then exits INVALID_ARGS. If
 * nothing is close, the suggestion line is omitted and behavior is unchanged.
 *
 * The matcher is a small pure helper (`suggestCommand`) over Levenshtein edit
 * distance — no new dependency.
 *
 * @module cli-command-suggester
 */

import { COMMAND_CATALOG } from './cli-command-catalog.js';
import { levenshtein } from './string-distance.js';

/** Maximum number of suggestions surfaced for one unknown command. */
const MAX_SUGGESTIONS = 3;

/**
 * Absolute edit-distance ceiling. A correction more than this many edits away
 * is almost certainly not what the user meant, so we stay silent rather than
 * guess. Two edits covers the common typo classes (a transposition, a double
 * fat-finger) without dredging up unrelated commands.
 */
const MAX_ABSOLUTE_DISTANCE = 2;

/**
 * Relative ceiling: the edit distance must also be within ~40% of the input
 * length. This keeps short inputs honest — `x` is distance 1 from no real
 * command but should never map to a 6-letter command, and a 2-letter typo
 * shouldn't reach across half the alphabet. For longer inputs the absolute cap
 * dominates.
 */
const RELATIVE_DISTANCE_RATIO = 0.4;

/** A candidate command with its distance from the input, for ranking. */
interface ScoredCandidate {
  readonly name: string;
  readonly distance: number;
}

/**
 * Returns up to {@link MAX_SUGGESTIONS} command names closest to `input`,
 * ranked nearest-first, within both the absolute and relative distance
 * thresholds. An exact match returns `[]` (nothing useful to suggest). Input
 * is lower-cased for matching; `names` are returned as given.
 *
 * Pure and dependency-free — unit-tested in `cli-command-suggester.test.ts`.
 */
export function suggestCommand(input: string, names: readonly string[]): string[] {
  const needle = input.trim().toLowerCase();
  if (needle.length === 0) return [];

  const ceiling = Math.min(
    MAX_ABSOLUTE_DISTANCE,
    Math.floor(needle.length * RELATIVE_DISTANCE_RATIO)
  );
  if (ceiling < 1) return [];

  const scored: ScoredCandidate[] = [];
  for (const name of names) {
    const distance = levenshtein(needle, name.toLowerCase());
    if (distance === 0) continue; // exact match — don't suggest what was typed
    if (distance <= ceiling) {
      scored.push({ name, distance });
    }
  }

  scored.sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name));

  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of scored) {
    if (seen.has(candidate.name)) continue;
    seen.add(candidate.name);
    result.push(candidate.name);
    if (result.length >= MAX_SUGGESTIONS) break;
  }
  return result;
}

/**
 * Real top-level command names from the catalog, excluding the `(default)`
 * placeholder (which has no handler and isn't something a user types).
 * Internal/maintainer commands stay in — they're still valid invocations, so a
 * typo toward them should resolve.
 */
export function catalogCommandNames(): string[] {
  return COMMAND_CATALOG.map((e) => e.command).filter((c) => c !== '(default)');
}

/**
 * Builds the message printed for an unknown top-level command. Always includes
 * the `Unknown command '<input>'.` line and the usage hint; inserts a
 * `Did you mean: ...?` line only when there is at least one close match.
 */
export function formatUnknownCommandMessage(input: string, names: readonly string[]): string {
  const suggestions = suggestCommand(input, names);
  const lines = [`Unknown command '${input}'.`];
  if (suggestions.length > 0) {
    lines.push(`Did you mean: ${suggestions.join(', ')}?`);
  }
  lines.push('Run "nexus-agents --help" for usage information.');
  return lines.join('\n');
}
