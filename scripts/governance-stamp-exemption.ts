/**
 * The stamp-only exemption for the governor-path ratification gate (#5944).
 *
 * A sibling module rather than an addition to either gate script: the two
 * scripts that need it are already at or over their line caps, and the
 * classifier is a pure decision worth reading on its own. Ratified 6-1 at
 * `supermajority` with `errorPolicy: absolute_quorum`.
 *
 * @module scripts/governance-stamp-exemption
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * The two files the governance injector generates. Nothing else is ever
 * eligible for the stamp-only exemption (#5944), however its content compares.
 */
export const GENERATED_GOVERNANCE_FILES: readonly string[] = ['CLAUDE.md', 'AGENTS.md'];

/**
 * The stamp line `scripts/inject-governance.ts` rewrites on every regeneration.
 * Anchored, and the date shape is fixed — a hand-edited or reworded stamp does
 * not match, so it is not exempt.
 */
const GOVERNANCE_STAMP_LINE = /^_Governance Version: \d{4}-\d{2}-\d{2}_$/;

/** Replaces a well-formed stamp line with a constant, leaving everything else. */
function normalizeStamp(text: string): string {
  return text
    .split('\n')
    .map((line) => (GOVERNANCE_STAMP_LINE.test(line) ? '_Governance Version: <stamp>_' : line))
    .join('\n');
}

/**
 * True when `before` and `after` differ ONLY in the generated governance stamp
 * (#5944, ratified 6-1 with `absolute_quorum`).
 *
 * The gate used to fire on every PR touching any of the four
 * `GOVERNANCE_STAMP_SOURCES`, because regenerating the derived stamp puts
 * CLAUDE.md and AGENTS.md in the diff. #5940 was a parameter rename. That
 * trains a reviewer to wave through CLAUDE.md diffs, which is the one file
 * where waving through is fatal.
 *
 * Deliberately NOT a diff parser. The panel's rejecting voter attacked that
 * surface — `.gitattributes` overrides, custom diff drivers, unified-diff edge
 * cases — and proving the ABSENCE of other changes through a parser is the hard
 * direction. Whole texts are compared with the stamp normalised, so "nothing
 * else changed" is a byte equality rather than an inference, and there is no
 * truncation mode to fail closed against.
 *
 * FAILS CLOSED in every ambiguous case: unreadable content on either side, and
 * identical content (a file the changed-list named but whose text did not move
 * means the gate's two inputs disagree — a rename, a mode change or a bad read,
 * none of which is evidence of a stamp-only change).
 */
export function isStampOnlyChange(before: string | undefined, after: string | undefined): boolean {
  if (before === undefined || after === undefined) return false;
  if (before === after) return false;
  return normalizeStamp(before) === normalizeStamp(after);
}

/**
 * The subset of `changedFiles` that may skip ratification because the only
 * thing that moved in them is the generated stamp.
 *
 * Readers are injected so the decision stays a pure function of file text —
 * the caller does the I/O, and passes `undefined` for anything it could not
 * read, which {@link isStampOnlyChange} treats as not-exempt.
 */
export function stampOnlyExemptFiles(
  changedFiles: readonly string[],
  readAtBase: (path: string) => string | undefined,
  readAtHead: (path: string) => string | undefined
): string[] {
  return changedFiles
    .filter((f) => GENERATED_GOVERNANCE_FILES.includes(f))
    .filter((f) => isStampOnlyChange(readAtBase(f), readAtHead(f)));
}

/**
 * Reads a governed file as of the PR's base commit, for the stamp-only
 * exemption (#5944).
 *
 * Returns `undefined` for anything it cannot read — a missing base sha, a file
 * absent at base, a git failure — which `stampOnlyExemptFiles` treats as NOT
 * exempt. The exemption can therefore only ever be granted on evidence, never
 * on the absence of it.
 *
 * `git show` is invoked with a fixed argument array and never a shell, and the
 * path is one of the two hardcoded entries in `GENERATED_GOVERNANCE_FILES`
 * (ratification condition 4), so nothing here interpolates untrusted input.
 */
export function readAtBase(baseSha: string | undefined): (path: string) => string | undefined {
  return (path) => {
    if (baseSha === undefined || !/^[0-9a-f]{40}$/.test(baseSha)) return undefined;
    const result = spawnSync('git', ['show', `${baseSha}:${path}`], {
      cwd: ROOT,
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.status !== 0 || typeof result.stdout !== 'string') return undefined;
    return result.stdout;
  };
}

/** Reads a governed file as it stands in the checkout (the PR head). */
export function readAtHead(path: string): string | undefined {
  try {
    return readFileSync(join(ROOT, path), 'utf-8');
  } catch {
    return undefined;
  }
}
