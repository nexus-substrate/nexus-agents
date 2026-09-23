/**
 * Refuse to publish a stale `.publish-stage/` (#6488, item 3).
 *
 * `pnpm release` and the release workflow rebuild the stage immediately before
 * publishing. A direct `pnpm publish` or `pnpm -r publish` does not: it follows
 * `publishConfig.directory` to whatever stage is on disk, which may come from
 * an older commit, a different working tree, or a staging run that failed
 * halfway. `stage-publish.ts` writes {@link STAGE_MARKER} as its LAST step,
 * naming the commit, version and working-tree state it staged from; this
 * script, run from the source manifest's `prepublishOnly`, refuses any
 * mismatch.
 *
 * The marker does not hash `dist/`: `prepublishOnly` rebuilds `dist/` after
 * staging, so a dist hash would only ever compare two builds. The working-tree
 * fingerprint covers what the build reads — every tracked edit and untracked,
 * non-ignored file in the checkout.
 *
 * The marker is not published: the staged manifest's `files` list does not
 * name it, and neither npm nor pnpm packs a dotfile outside `files` (measured).
 *
 * Usage (from packages/nexus-agents, as pnpm runs lifecycle scripts):
 *   pnpm exec tsx ../../scripts/check-publish-stage.ts
 *
 * @module scripts/check-publish-stage
 * (Source: Issue #6488)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './script-paths.js';

/** Must equal `publishConfig.directory` in the package manifest. */
export const STAGE_DIRNAME = '.publish-stage';

/** Written into the stage by `stage-publish.ts`; must match at publish time. */
export const STAGE_MARKER = '.stage-commit';

export interface StageMarker {
  /** `git rev-parse HEAD` when the stage was built. */
  readonly commit: string;
  /** The SOURCE manifest's version. */
  readonly version: string;
  /** {@link treeFingerprint} of the checkout. */
  readonly tree: string;
}

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/**
 * A digest of the checkout's uncommitted state: the diff of tracked files
 * against HEAD plus the name and content of every untracked, non-ignored file.
 * Equal for a clean tree at any time; changes on any edit that could reach the
 * build or the stage.
 */
export function treeFingerprint(root: string): string {
  const hash = createHash('sha256');
  hash.update(git(root, ['diff', 'HEAD', '--binary']));
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter((path) => path !== '')
    .sort();
  for (const path of untracked) {
    hash.update(`\0untracked\0${path}\0`);
    hash.update(readFileSync(join(root, path)));
  }
  return hash.digest('hex');
}

/** The marker the checkout at `root` would produce for `packageDir` now. */
export function currentMarker(root: string, packageDir: string): StageMarker {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    version?: unknown;
  };
  if (typeof manifest.version !== 'string') {
    throw new Error(`${join(packageDir, 'package.json')} has no version`);
  }
  return {
    commit: git(root, ['rev-parse', 'HEAD']).trim(),
    version: manifest.version,
    tree: treeFingerprint(root),
  };
}

export function writeStageMarker(stageDir: string, marker: StageMarker): void {
  writeFileSync(join(stageDir, STAGE_MARKER), `${JSON.stringify(marker, null, 2)}\n`);
}

function readMarker(stageDir: string): StageMarker | string {
  const path = join(stageDir, STAGE_MARKER);
  if (!existsSync(path)) {
    return `no ${STAGE_MARKER} in the stage — it was never finished (a failed or interrupted staging run)`;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const { commit, version, tree } = parsed;
    if (typeof commit === 'string' && typeof version === 'string' && typeof tree === 'string') {
      return { commit, version, tree };
    }
  } catch {
    // Falls through to the unreadable report below.
  }
  return `${STAGE_MARKER} is unreadable (not a {commit, version, tree} JSON object)`;
}

function stagedVersion(stageDir: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(stageDir, 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    return typeof manifest.version === 'string' ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every reason the stage at `stageDir` must not be published as `expected`.
 * Empty means the stage was built from this exact checkout state.
 */
export function stageMismatches(stageDir: string, expected: StageMarker): string[] {
  if (!existsSync(stageDir)) return [`no stage at ${stageDir}`];
  const marker = readMarker(stageDir);
  if (typeof marker === 'string') return [marker];
  const reasons: string[] = [];
  if (marker.commit !== expected.commit) {
    reasons.push(`staged from commit ${marker.commit}, but HEAD is ${expected.commit}`);
  }
  if (marker.version !== expected.version) {
    reasons.push(
      `staged at version ${marker.version}, but the source manifest is ${expected.version}`
    );
  }
  if (marker.tree !== expected.tree) {
    reasons.push(
      'the working tree changed since staging (tracked edits or untracked files differ)'
    );
  }
  const staged = stagedVersion(stageDir);
  if (staged !== expected.version) {
    reasons.push(
      `the staged package.json is at version ${staged ?? '<unreadable>'}, not ${expected.version}`
    );
  }
  return reasons;
}

function main(): void {
  const packageDir = join(ROOT, 'packages/nexus-agents');
  const stageDir = join(packageDir, STAGE_DIRNAME);
  const reasons = stageMismatches(stageDir, currentMarker(ROOT, packageDir));
  if (reasons.length > 0) {
    console.error(
      `Refusing to publish ${stageDir}:\n  ${reasons.join('\n  ')}\n` +
        'Publish with `pnpm release`, which rebuilds the stage, or run ' +
        '`pnpm exec tsx scripts/stage-publish.ts` at this commit first (#6488).'
    );
    process.exit(1);
  }
  console.log(`publish stage matches HEAD ${stageDir}`);
}

if (process.argv[1]?.endsWith('check-publish-stage.ts') === true) {
  main();
}
