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
 * ## Classification against the registry (#5463)
 *
 * "After `latest` on the walk" is not "npm never received": a `dist-tag`
 * rollback of `latest`, or a reverted bump, both put versions npm already has
 * after `latest`, and the walk then fails a release that is not stalled. So
 * every walked version is intersected with `npm view <pkg> versions --json`
 * (a version on npm is published whatever `latest` says) and classified:
 *
 * - `pending`   — after `latest` on the line, not on npm. The stall count the
 *                 workflow acts on: these are the bumps the loop has missed.
 * - `published` — after `latest` on the line, on npm. Rollback or revert;
 *                 npm has them, so they are not missed publishes.
 * - `skipped`   — between `latest` and its published predecessor on the line,
 *                 not on npm. Superseded: `changeset publish` only ever
 *                 publishes HEAD's version, so these will never publish and
 *                 must not count toward the stall verdict — but they are the
 *                 skew, and a walk that stopped at `latest` could not see them.
 *                 On 2026-09-14 main went 8.58.10 → 8.59.0 → 8.59.1 with 8.59.0
 *                 never on npm; with `latest` = 8.59.1 the old walk reported 0.
 *
 * "After" and "before" are positions on main's first-parent line, not semver
 * comparisons: the line IS the order the stall measurement is defined over,
 * and `semver` is not resolvable from `scripts/`.
 *
 * ## Named empty cases
 *
 * A walk that never finds `latest` returns `unmeasured`, never an empty list.
 * Reading "not found" as "nothing unpublished" would licence the same silent
 * stand-down this exists to expose. A registry list that does not contain
 * `latest` (the empty list included — it would make every version pending) is
 * two registry answers that disagree, and is `unmeasured` for the same reason.
 * Running out of history while looking for `latest`'s published predecessor is
 * NOT unmeasured: the pending count is fully determined once `latest` is
 * found, and the older versions are simply all skipped.
 *
 * The published version and the registry list are arguments, so the function
 * is pure over (repo, ref, version, list); the `npm view` calls live in the
 * CLI entry and the workflow, never in a test.
 *
 * @module scripts/count-unpublished-bumps
 */

import { execFileSync } from 'node:child_process';

/** Repo-relative path of the published package's manifest. */
export const PACKAGE_JSON_PATH = 'packages/nexus-agents/package.json';

/** The npm package whose version list the CLI entry fetches. */
export const PACKAGE_NAME = 'nexus-agents';

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
      /** After `publishedVersion` on the walk and not on npm, newest first. */
      readonly pending: readonly string[];
      /** After `publishedVersion` on the walk but on npm (rollback, revert), newest first. */
      readonly published: readonly string[];
      /**
       * Before `publishedVersion` on the walk, up to its published predecessor
       * (exclusive), and not on npm — superseded, will never publish. Newest first.
       */
      readonly skipped: readonly string[];
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
 * Parses `npm view <pkg> versions --json` output. npm prints a JSON array, or
 * a bare JSON string when the package has exactly one version. Anything else
 * throws: classifying against a guessed list would be the intersection
 * silently degrading to the `latest`-only walk this replaces.
 */
export function parseRegistryVersions(raw: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    throw new Error(`npm versions output is not JSON: ${String(error)}`);
  }
  if (typeof parsed === 'string') return [parsed];
  if (Array.isArray(parsed) && parsed.every((v): v is string => typeof v === 'string')) {
    return parsed;
  }
  throw new Error(`npm versions output is neither a string array nor a string: ${raw.trim()}`);
}

/**
 * Versions of `PACKAGE_JSON_PATH` on the first-parent line from `ref`,
 * classified against `publishedVersion` (npm's `latest`) and
 * `registryVersions` (every version npm has). See the module doc for the
 * three classes and the named empty cases.
 */
export function unpublishedBumpsAt(
  repoDir: string,
  ref: string,
  publishedVersion: string,
  registryVersions: readonly string[],
  options: { readonly maxCommits?: number } = {}
): UnpublishedBumpsVerdict {
  const onNpm = new Set(registryVersions);
  if (!onNpm.has(publishedVersion)) {
    return {
      kind: 'unmeasured',
      reason:
        `latest ${publishedVersion} is not in the registry's version list ` +
        `(${String(registryVersions.length)} version(s)); the two npm answers disagree`,
    };
  }
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

  const verdict = classifyWalk(repoDir, shas, publishedVersion, onNpm);
  if (verdict !== undefined) return verdict;
  return {
    kind: 'unmeasured',
    reason:
      `published version ${publishedVersion} not found in the last ${String(shas.length)} ` +
      `first-parent commit(s) touching ${PACKAGE_JSON_PATH} from ${ref} (bound ${String(maxCommits)})`,
  };
}

function pushDistinct(bucket: string[], version: string): void {
  if (!bucket.includes(version)) bucket.push(version);
}

/**
 * Walks `shas` (newest first) and classifies the versions found. Returns
 * `undefined` when `publishedVersion` is never reached — the caller names that
 * as unmeasured with the walk's bound — and an unmeasured verdict of its own
 * for a manifest without a string version.
 */
function classifyWalk(
  repoDir: string,
  shas: readonly string[],
  publishedVersion: string,
  onNpm: ReadonlySet<string>
): UnpublishedBumpsVerdict | undefined {
  const pending: string[] = [];
  const published: string[] = [];
  const skipped: string[] = [];
  let latestSeen = false;
  for (const sha of shas) {
    const version = versionAt(repoDir, sha);
    if (version === undefined) {
      return { kind: 'unmeasured', reason: `${PACKAGE_JSON_PATH} at ${sha} has no string version` };
    }
    if (version === publishedVersion) {
      latestSeen = true;
    } else if (!latestSeen) {
      pushDistinct(onNpm.has(version) ? published : pending, version);
    } else if (onNpm.has(version)) {
      // Past latest, at its published predecessor: the skipped walk ends here
      // (history running out ends it too).
      break;
    } else {
      pushDistinct(skipped, version);
    }
  }
  return latestSeen ? { kind: 'measured', pending, published, skipped } : undefined;
}

/** Fetches every version npm has for `PACKAGE_NAME`. Network; CLI entry only. */
function fetchRegistryVersions(): readonly string[] {
  const raw = execFileSync('npm', ['view', PACKAGE_NAME, 'versions', '--json'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return parseRegistryVersions(raw);
}

const csv = (versions: readonly string[]): string =>
  versions.length === 0 ? '-' : versions.join(',');

if (process.argv[1]?.endsWith('count-unpublished-bumps.ts') === true) {
  const [ref, publishedVersion] = process.argv.slice(2);
  if (ref === undefined || publishedVersion === undefined) {
    process.stderr.write('usage: count-unpublished-bumps.ts <ref> <published-version>\n');
    process.exit(1);
  }
  try {
    const verdict = unpublishedBumpsAt(
      process.cwd(),
      ref,
      publishedVersion,
      fetchRegistryVersions()
    );
    if (verdict.kind === 'unmeasured') {
      // Exit 2, distinct from a crash: the workflow treats "cannot measure" as
      // its own failure, never as zero.
      process.stderr.write(`count-unpublished-bumps: unmeasured — ${verdict.reason}\n`);
      process.exit(2);
    }
    // The full classification goes to stderr so the run log carries the skew
    // even when the verdict is clean; stdout stays the workflow's contract.
    process.stderr.write(
      `count-unpublished-bumps: latest=${publishedVersion} pending=${String(verdict.pending.length)} ` +
        `(${csv(verdict.pending)}) published-after-latest=${String(verdict.published.length)} ` +
        `(${csv(verdict.published)}) skipped=${String(verdict.skipped.length)} (${csv(verdict.skipped)})\n`
    );
    // One PENDING version per line, nothing for zero: `grep -c .` over stdout
    // is the count the workflow's stall verdict reads, mirroring
    // count-pending-changesets.ts --names.
    process.stdout.write(verdict.pending.map((v) => `${v}\n`).join(''));
  } catch (error: unknown) {
    process.stderr.write(`count-unpublished-bumps failed: ${String(error)}\n`);
    process.exit(1);
  }
}
