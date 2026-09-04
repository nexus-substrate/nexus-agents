/**
 * Counts the `package.json` versions on `main` that npm never received (#5077).
 *
 * ## Why this exists
 *
 * `release.yml`'s publish-race fallback (#2382) stands down — `::warning::`,
 * exit 0 — when `package.json` is ahead of npm AND non-empty changesets are
 * pending, on the premise that the next version-PR merge closes the loop. Under
 * sustained merge activity it never does: each version-PR merge bumps
 * `package.json`, the run finds a changeset a feature PR landed meanwhile,
 * stands down, and a fresh version PR opens. On 2026-08-26 npm went
 * 4.23.0 → 4.26.1 with four versions never published while six consecutive
 * runs reported success. The step had no memory of prior stand-downs, so it
 * could only ever say "the next merge will fix it" — a check that reports a
 * default as a measurement.
 *
 * ## The measurement, and why it comes from git
 *
 * The quantity that matters is not "how many runs stood down" but "how many
 * versions did npm never receive". Version bumps on `main` arrive only through
 * version-PR merges, so walking first-parent history from the release commit
 * back to the commit whose `package.json` equals npm's published version, and
 * collecting the distinct versions passed on the way, counts the missed
 * publishes exactly. Decided by a 3-voter panel on #5077 (3-0 for this over
 * counting stand-down runs via the Actions API): commit objects are immutable
 * inputs — the property #4487 established for this step's decision — and the
 * walk is testable offline, where run retention, pagination and cancelled runs
 * are not.
 *
 * ## What is actually measured
 *
 * "Distinct versions on main's first-parent line after the one npm reports as
 * `latest`", which equals "versions npm never received" for every version in
 * this repo's history (707 first-parent bumps checked, 2026-09-04) but not in
 * general: a `dist-tag` rollback of `latest`, or a reverted bump, both put
 * versions npm already has after `latest` on the walk. The workflow message
 * says "since npm's latest", not "never received", for that reason; #5463
 * tracks intersecting with `npm view versions --json` if either case occurs.
 *
 * ## Named empty case
 *
 * A walk that never finds the published version returns `unmeasured`, never an
 * empty list. Reading "not found" as "nothing unpublished" would licence the
 * same silent stand-down this exists to expose. The published version is an
 * argument, so the function is pure over (repo, ref, version); the `npm view`
 * call stays in the workflow.
 *
 * @module scripts/count-unpublished-bumps
 */

import { execFileSync } from 'node:child_process';

/** Repo-relative path of the published package's manifest. */
export const PACKAGE_JSON_PATH = 'packages/nexus-agents/package.json';

/**
 * Upper bound on first-parent commits (touching `package.json`) inspected
 * before the walk gives up. Every release touches the file once, so 500 is
 * years of history; exhausting it means the published version is not on this
 * line at all.
 */
export const DEFAULT_MAX_COMMITS = 500;

export type UnpublishedBumpsVerdict =
  | {
      readonly kind: 'measured';
      /** Distinct versions after `publishedVersion` on the walk, newest first. */
      readonly versions: readonly string[];
    }
  | { readonly kind: 'unmeasured'; readonly reason: string };

/** Runs git in `repoDir` and returns stdout. */
function git(repoDir: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf-8' });
}

function versionAt(repoDir: string, sha: string): string | undefined {
  const raw = git(repoDir, ['show', `${sha}:${PACKAGE_JSON_PATH}`]);
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const version = (parsed as Record<string, unknown>)['version'];
  return typeof version === 'string' ? version : undefined;
}

/**
 * Versions of `PACKAGE_JSON_PATH` on the first-parent line from `ref` that
 * come after `publishedVersion`, newest first.
 */
export function unpublishedBumpsAt(
  repoDir: string,
  ref: string,
  publishedVersion: string,
  options: { readonly maxCommits?: number } = {}
): UnpublishedBumpsVerdict {
  const maxCommits = options.maxCommits ?? DEFAULT_MAX_COMMITS;
  const shas = git(repoDir, [
    'log',
    '--first-parent',
    '--format=%H',
    `-n${String(maxCommits)}`,
    ref,
    '--',
    PACKAGE_JSON_PATH,
  ])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  const versions: string[] = [];
  for (const sha of shas) {
    const version = versionAt(repoDir, sha);
    if (version === undefined) {
      return { kind: 'unmeasured', reason: `${PACKAGE_JSON_PATH} at ${sha} has no string version` };
    }
    if (version === publishedVersion) return { kind: 'measured', versions };
    if (!versions.includes(version)) versions.push(version);
  }
  return {
    kind: 'unmeasured',
    reason:
      `published version ${publishedVersion} not found in the last ${String(shas.length)} ` +
      `first-parent commit(s) touching ${PACKAGE_JSON_PATH} from ${ref} (bound ${String(maxCommits)})`,
  };
}

if (process.argv[1]?.endsWith('count-unpublished-bumps.ts') === true) {
  const [ref, publishedVersion] = process.argv.slice(2);
  if (ref === undefined || publishedVersion === undefined) {
    process.stderr.write('usage: count-unpublished-bumps.ts <ref> <published-version>\n');
    process.exit(1);
  }
  try {
    const verdict = unpublishedBumpsAt(process.cwd(), ref, publishedVersion);
    if (verdict.kind === 'unmeasured') {
      // Exit 2, distinct from a crash: the workflow treats "cannot measure" as
      // its own failure, never as zero.
      process.stderr.write(`count-unpublished-bumps: unmeasured — ${verdict.reason}\n`);
      process.exit(2);
    }
    // One version per line, nothing for zero: `grep -c .` over stdout is the
    // count, mirroring count-pending-changesets.ts --names.
    process.stdout.write(verdict.versions.map((v) => `${v}\n`).join(''));
  } catch (error: unknown) {
    process.stderr.write(`count-unpublished-bumps failed: ${String(error)}\n`);
    process.exit(1);
  }
}
