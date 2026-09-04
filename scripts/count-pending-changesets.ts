/**
 * Counts NON-EMPTY pending changesets at a git ref (#4646).
 *
 * ## Why this exists
 *
 * `release.yml`'s `#2382` publish-race fallback used to count `.changeset/*.md`
 * files. `changesets/action` counts *releases*:
 *
 * ```ts
 * const hasNonEmptyChangesets = changesets.some((c) => c.releases.length > 0);
 * case hasChangesets && !hasNonEmptyChangesets:
 *   core.info("All changesets are empty; not creating PR");
 *   return;
 * ```
 *
 * An empty changeset is one file and zero releases, so the two disagreed about
 * the same directory. When a version PR merged while an empty changeset sat on
 * `main`, the action published nothing *and opened no PR*, while the fallback
 * stood down logging "the next release-PR merge should close the loop" — a
 * premise that was false, because no such PR existed. The release stalled
 * silently with both components green.
 *
 * This repo makes that reachable rather than exotic: `CLAUDE.md` prescribes
 * `pnpm changeset --empty` for genuinely no-release-impact PRs.
 *
 * ## Parity, not reimplementation
 *
 * It calls `@changesets/read` — the same library `changesets/action` uses via
 * its own `readChangesetState` — so the two cannot drift on what counts as
 * empty. Re-deriving the predicate in bash is what caused the divergence; doing
 * it again in TypeScript would only move the seam (compare #4640, where two
 * copies of one list sat on opposite sides of the same gate).
 *
 * ## Reading the commit, not the tree
 *
 * `#4625` hardened the fallback to derive its verdict from the commit object,
 * because `changesets/action` leaves an uncommitted version bump in the working
 * tree and that once made the fallback force-publish on every feature merge
 * (#4487, #2696). `@changesets/read` only reads a directory, so this
 * materialises the ref's `.changeset/` into a temp dir first and reads that.
 * The immutable-input property is preserved.
 *
 * @module scripts/count-pending-changesets
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { readChangesets } from '@changesets/read';

/** Runs git in `repoDir` and returns stdout. */
function git(repoDir: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf-8' });
}

/**
 * Ids of the changesets at `ref` that declare at least one release, sorted.
 *
 * Empty changesets, `README.md` and `config.json` are all excluded — the first
 * because it declares no release, the others because they are not changesets.
 * An id is the filename without `.md`, which is what `@changesets/read`
 * parses; callers print `.changeset/<id>.md`.
 *
 * Exists so the release.yml stand-down can NAME what blocks it (#5077): a
 * stale version PR is the usual cause, and "2 pending" left the operator to
 * work out which two.
 */
export async function listNonEmptyChangesetsAt(
  repoDir: string,
  ref: string
): Promise<readonly string[]> {
  const staging = mkdtempSync(join(tmpdir(), 'changeset-count-'));
  try {
    const changesetDir = join(staging, '.changeset');
    mkdirSync(changesetDir, { recursive: true });

    // `git ls-tree` on a missing path exits 0 with empty output, so a repo with
    // no .changeset/ at that ref reports zero rather than failing.
    const listed = git(repoDir, ['ls-tree', '--name-only', ref, '.changeset/'])
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');

    for (const path of listed) {
      const name = basename(path);
      if (!name.endsWith('.md') && name !== 'config.json') continue;
      writeFileSync(join(changesetDir, name), git(repoDir, ['show', `${ref}:${path}`]), 'utf-8');
    }

    // readChangesets needs a config.json present; synthesize a minimal one if
    // the ref did not carry one, so a missing config cannot be read as "no
    // pending changesets" and licence a force-publish.
    const hasConfig = listed.some((p) => basename(p) === 'config.json');
    if (!hasConfig) {
      writeFileSync(
        join(changesetDir, 'config.json'),
        JSON.stringify({ changelog: false }),
        'utf-8'
      );
    }

    const changesets = await readChangesets(staging);
    return changesets
      .filter((changeset) => changeset.releases.length > 0)
      .map((changeset) => changeset.id)
      .sort();
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Number of changesets at `ref` that declare at least one release. */
export async function countNonEmptyChangesetsAt(repoDir: string, ref: string): Promise<number> {
  return (await listNonEmptyChangesetsAt(repoDir, ref)).length;
}

if (process.argv[1]?.endsWith('count-pending-changesets.ts') === true) {
  // `--names` prints one id per line instead of the count, so release.yml can
  // say WHICH changesets its stand-down is waiting on. Nothing at all is
  // printed for zero pending, so `grep -c .` over the output is the count.
  const names = process.argv.includes('--names');
  const ref = process.argv.find((arg, i) => i >= 2 && !arg.startsWith('--')) ?? 'HEAD';
  listNonEmptyChangesetsAt(process.cwd(), ref)
    .then((ids) => {
      process.stdout.write(names ? ids.map((id) => `${id}\n`).join('') : `${String(ids.length)}\n`);
    })
    .catch((error: unknown) => {
      // Fail loud rather than printing 0 — a swallowed error here would read as
      // "nothing pending" and licence a force-publish.
      process.stderr.write(`count-pending-changesets failed: ${String(error)}\n`);
      process.exit(1);
    });
}
