/**
 * Stuck-release detector (#4500).
 *
 * `changesets/action` opens the "Version Packages" PR after bumping versions.
 * Its PR-creation call has 502'd repeatedly, and when it does the run ends RED
 * but blocks nothing and alerts no one — so `main` accumulates changesets with
 * no version PR while merging continues. It went unnoticed for several merges.
 *
 * ## Why the predicate is durable state, not run outcome
 *
 * Keying on the release run's conclusion is insufficient in both directions: a
 * run can go green and still produce no PR, and a red run may be red for an
 * unrelated reason. The condition that actually matters is
 * **changesets present on `main` AND no open version PR**, which is a property
 * of the repo, not of any one run.
 *
 * ## Why it does not block PRs, and does not retry
 *
 * Decided by a 3-voter panel on #4500 (2-1 for this shape, unanimous on both
 * exclusions):
 *
 *  - **Not a required check.** Merging to `main` is the only path that has ever
 *    recovered this state; a merge-blocking detector would deadlock its own
 *    remedy. That is a design error, not a tradeoff.
 *  - **No auto re-dispatch.** Re-running the failed run has never recovered it,
 *    so an automatic retry against a flaking API is a retry storm with no
 *    demonstrated payoff. The detector reports; a human decides.
 *  - **Files an issue, not just a red run.** A red scheduled run would
 *    reproduce the exact "reported but unconsumed" failure this exists to fix.
 *    The issue is the consumable artifact; it is deduplicated by a marker so
 *    repeated detection updates one issue rather than spamming.
 *
 * ## Why there is a grace period (#6215)
 *
 * Repo state at one instant cannot tell a stall from a healthy pipeline
 * mid-cycle: between a squash-merge landing a changeset and `release.yml`
 * opening the version PR, the predicate above is true. On 2026-09-14 the 03:59Z
 * run filed #6196 in exactly that window; the PR appeared moments later. So the
 * verdict is keyed on the age of the NEWEST unconsumed changeset — the one
 * `release.yml` is still working on — and nothing is reported until that age
 * exceeds {@link DEFAULT_GRACE_SEC}. Age is the commit time of the commit that
 * last touched the file, never the checkout's mtime (which is "now" on a fresh
 * checkout), and a shallow clone is refused because every file in it would
 * report HEAD's time.
 *
 * @module scripts/check-release-stuck
 * (Source: Issue #4500)
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './script-paths.js';

/** Files that live in `.changeset/` but are not changesets. */
const SCAFFOLDING = new Set(['README.md', 'config.json']);

/** Where `main` writes the rendered issue body for the workflow to pick up. */
export const BODY_FILENAME = 'release-stall-body.md';

/** Hidden marker used to find and update the existing issue instead of filing a new one. */
export const STALL_ISSUE_MARKER = '<!-- nexus-release-stall-detector -->';

/**
 * How long the newest unconsumed changeset may sit on `main` with no version PR
 * before that reads as a stall (#6215).
 *
 * Measured 2026-09-14 over the 12 most recent releases (#6185..#6212): from the
 * push-triggered `release.yml` run's `createdAt` to the version PR's
 * `createdAt`, min 99 s, max 182 s. The bar is at least 3x the observed maximum
 * (546 s) with a floor of 30 minutes; the floor wins. The test pins both
 * conditions against the measured number.
 */
export const DEFAULT_GRACE_SEC = 30 * 60;

export interface PendingChangeset {
  readonly file: string;
  /** Seconds since the commit that last touched `.changeset/<file>`. */
  readonly ageSec: number;
}

export interface ReleaseStallInput {
  readonly pendingChangesets: readonly PendingChangeset[];
  readonly hasOpenVersionPr: boolean;
  /** Newest-changeset age at or below this is "release.yml may still be working", not a stall. */
  readonly graceSec: number;
}

export interface ReleaseStallVerdict {
  readonly stalled: boolean;
  readonly reason: string;
}

/** Filter a `.changeset/` listing down to actual changeset files. */
export function pendingChangesets(entries: readonly string[]): string[] {
  return entries.filter((e) => e.endsWith('.md') && !SCAFFOLDING.has(e));
}

/**
 * Decide whether the release is stalled.
 *
 * An open version PR clears the verdict regardless of how many changesets are
 * queued — the PR is what consumes them, so its existence means the release is
 * moving. With no PR, the verdict is keyed on the NEWEST changeset: while it is
 * inside the grace period `release.yml` may still be opening the PR (#6215).
 */
export function assessReleaseStall(input: ReleaseStallInput): ReleaseStallVerdict {
  const count = input.pendingChangesets.length;

  // Named empty case, guarded before the reduce below: Math.min over no ages
  // is Infinity, which would read as older than any grace and report a stall
  // over an empty directory.
  if (count === 0) {
    return { stalled: false, reason: 'No unconsumed changesets on main — nothing to report.' };
  }
  if (input.hasOpenVersionPr) {
    return {
      stalled: false,
      reason: `${String(count)} changeset(s) queued and a version PR is open — release is moving.`,
    };
  }
  const youngestSec = input.pendingChangesets.reduce(
    (min, c) => Math.min(min, c.ageSec),
    Number.POSITIVE_INFINITY
  );
  if (youngestSec <= input.graceSec) {
    return {
      stalled: false,
      reason: `${String(count)} changeset(s) queued with no version PR, but the newest is ${String(youngestSec)}s old, inside the ${String(input.graceSec)}s grace period — release.yml may still be opening it.`,
    };
  }
  return {
    stalled: true,
    reason: `${String(count)} unconsumed changeset(s) on main with no open "chore(release): version packages" PR; the newest is ${String(youngestSec)}s old, past the ${String(input.graceSec)}s grace period.`,
  };
}

/** Runs git in `repoDir` and returns stdout. */
function git(repoDir: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf-8' });
}

/**
 * Seconds between `nowSec` and the commit that last touched `.changeset/<file>`.
 *
 * Commit time (`%ct`), not mtime: a fresh checkout stamps every file with the
 * checkout moment, which would make every changeset look brand new and the
 * grace period suppress every report. Throws on a shallow clone, where
 * `git log -- <path>` stops at the graft boundary and reports HEAD's time for
 * every file (the same silent suppression), and on a file with no commit,
 * because an unmeasured age must not be reported as either fresh or ancient.
 */
export function changesetAgeSec(repoDir: string, file: string, nowSec: number): number {
  if (git(repoDir, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    throw new Error(
      `${repoDir} is a shallow clone; changeset ages need the full history (fetch-depth: 0).`
    );
  }
  const out = git(repoDir, ['log', '-1', '--format=%ct', '--', `.changeset/${file}`]).trim();
  if (!/^\d+$/.test(out)) {
    throw new Error(`.changeset/${file} has no commit on this ref; cannot measure its age.`);
  }
  return nowSec - Number(out);
}

/** The issue body, carrying the dedupe marker and the actionable detail. */
export function stallIssueBody(pending: readonly string[]): string {
  const list = pending.map((f) => `- \`.changeset/${f}\``).join('\n');
  return `${STALL_ISSUE_MARKER}

The release is stalled: \`main\` carries unconsumed changesets but no
\`chore(release): version packages\` PR is open.

Pending changesets:

${list}

**Why this is reported here rather than as a red workflow run:** a failed
\`release.yml\` blocks nothing and is not a required check, so it is easy to
merge past for days. This issue is the durable surface (#4500).

**Diagnosis notes.** The condition is keyed on repo state, not on a run's
outcome — a release run can finish green and still produce no PR. When the
observed \`changesets/action\` 502 causes it, \`changeset-release/main\` is left
byte-identical to \`main\` with **no version bump**, so the PR cannot simply be
opened by hand; the version script has to run again.

**Recovery.** A fresh push to \`main\` re-triggers \`release.yml\`, which is the
path that has actually cleared this before. Re-running the failed run has not.
See [docs/ops/release-changeset-race.md](../blob/main/docs/ops/release-changeset-race.md).

This issue is updated in place by the detector; it will not file duplicates.
It is safe to close once a version PR is open — the detector reopens the
report if the condition recurs.`;
}

/** Read `.changeset/` from the repo, returning [] when the directory is absent. */
function readChangesetDir(): string[] {
  const dir = join(ROOT, '.changeset');
  if (!existsSync(dir)) return [];
  return readdirSync(dir);
}

/* eslint-disable no-console */
function main(): void {
  const files = pendingChangesets(readChangesetDir());
  const nowSec = Math.floor(Date.now() / 1000);
  const pending: PendingChangeset[] = files.map((file) => ({
    file,
    ageSec: changesetAgeSec(ROOT, file, nowSec),
  }));
  // The workflow supplies the PR presence; keeping the API call out of here
  // leaves the predicate pure and unit-testable.
  const hasOpenVersionPr = process.env['HAS_OPEN_VERSION_PR'] === 'true';
  const verdict = assessReleaseStall({
    pendingChangesets: pending,
    hasOpenVersionPr,
    graceSec: DEFAULT_GRACE_SEC,
  });

  console.log(verdict.reason);

  if (!verdict.stalled) {
    console.log('::notice::Release pipeline is not stalled.');
    return;
  }

  console.log(`::error::${verdict.reason}`);

  // Write the issue body here rather than letting the workflow re-import this
  // module inline: `pnpm exec tsx -e` does not resolve relative imports, so that
  // shape fails at runtime. Keeping it in the script also honours the
  // "YAML stays a thin shell" condition from the #4500 panel.
  writeFileSync(join(ROOT, BODY_FILENAME), stallIssueBody(files), 'utf8');

  const out = process.env['GITHUB_OUTPUT'];
  if (out !== undefined && out !== '') {
    appendFileSync(out, `stalled=true\n`);
  }
  process.exitCode = 1;
}

if (process.argv[1]?.endsWith('check-release-stuck.ts') === true) {
  main();
}
