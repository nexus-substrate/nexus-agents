/* eslint-disable no-console */
/**
 * Changeset-presence gate.
 *
 * Fails a PR that changes shippable source without adding a changeset.
 * Changeset debt is the root cause of the release-race incidents: `feat`/
 * `fix` PRs merge without a changeset, the "Version Packages" PR balloons
 * and goes stale, and the npm/repo version skew follows (see
 * docs/ops/release-changeset-race.md).
 *
 * A PR needs a changeset when it touches `packages/nexus-agents/src/**`
 * (excluding tests + `.d.ts`). Escape hatch: `pnpm changeset --empty` for
 * a change with genuinely no release impact — rare for src changes, where
 * a real changeset is almost always correct.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-changeset.ts [base-ref]   # base defaults to origin/main
 *
 * @module scripts/check-changeset
 * (Source: release-cycle hardening)
 */

import { execSync } from 'node:child_process';

const SHIPPABLE = /^packages\/nexus-agents\/src\/.+\.tsx?$/;

/** True for test files, which never need their own changeset. */
function isTestFile(file: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(file) || file.includes('/__tests__/');
}

export interface ChangesetClassification {
  /** Shippable source files the PR touches (drives the requirement). */
  shippable: string[];
  /** Whether the PR adds at least one `.changeset/*.md` file. */
  hasChangeset: boolean;
}

/** Classify a changed-file list into shippable-source + changeset-presence. */
export function classifyChange(files: string[]): ChangesetClassification {
  const shippable = files.filter(
    (f) => SHIPPABLE.test(f) && !isTestFile(f) && !f.endsWith('.d.ts')
  );
  const hasChangeset = files.some(
    (f) => /^\.changeset\/.+\.md$/.test(f) && !f.endsWith('README.md')
  );
  return { shippable, hasChangeset };
}

/** List files changed since `base` (three-dot diff = since merge-base). */
function changedFiles(base: string): string[] {
  const out = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf-8' });
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function main(): number {
  const base = process.argv[2] ?? 'origin/main';
  let files: string[];
  try {
    files = changedFiles(base);
  } catch (err) {
    // A git-diff failure (shallow clone, missing ref) must not block CI —
    // the gate is advisory infrastructure, not a correctness check.
    console.warn(
      `check-changeset: could not diff against ${base} — ` +
        `${err instanceof Error ? err.message : String(err)}. Skipping.`
    );
    return 0;
  }

  const { shippable, hasChangeset } = classifyChange(files);
  if (shippable.length === 0) {
    console.log('No shippable source changed — changeset not required.');
    return 0;
  }
  if (hasChangeset) {
    console.log(
      `Shippable source changed (${String(shippable.length)} file(s)) and a changeset is present — OK.`
    );
    return 0;
  }

  console.error('Missing changeset.');
  console.error(
    `This PR changes ${String(shippable.length)} shippable source file(s) but adds no changeset:`
  );
  for (const f of shippable.slice(0, 10)) console.error('  - ' + f);
  if (shippable.length > 10) console.error(`  ... and ${String(shippable.length - 10)} more`);
  console.error('');
  console.error('Run `pnpm changeset` to describe the change (or `pnpm changeset --empty` if it');
  console.error('genuinely has no release impact). Changeset debt is what caused the release-race');
  console.error('incidents — see docs/ops/release-changeset-race.md.');
  return 1;
}

// Guard the CLI so the test file can import `classifyChange` without a run.
if (process.argv[1]?.endsWith('check-changeset.ts') === true) {
  process.exit(main());
}
