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

/** A changed file entry with an optional Git diff status (e.g. 'A', 'M', 'D'). */
export interface ChangedFile {
  /** The repo-relative path of the changed file. */
  path: string;
  /** Git diff status code (e.g. 'A' for added, 'M' for modified, 'D' for deleted). */
  status?: string | undefined;
}

/** Accepted input element for file change classification: either a raw path string or a ChangedFile object. */
export type ChangeInput = string | ChangedFile;

export interface ChangesetClassification {
  /** Shippable source files the PR touches (drives the requirement). */
  shippable: string[];
  /** Whether the PR adds or retains at least one `.changeset/*.md` file (deleted changesets do not satisfy presence). */
  hasChangeset: boolean;
}

/** True if a file path represents a shippable source file requiring a changeset. */
function isShippableSource(file: string): boolean {
  return SHIPPABLE.test(file) && !isTestFile(file) && !file.endsWith('.d.ts');
}

/** True if a changed file entry represents an added or retained (non-deleted) changeset. */
function isPresentChangeset(entry: ChangedFile): boolean {
  const isChangesetPath =
    /^\.changeset\/.+\.md$/.test(entry.path) && !entry.path.endsWith('README.md');
  const isDeleted = entry.status === 'D' || entry.status?.startsWith('D') === true;
  return isChangesetPath && !isDeleted;
}

/**
 * Normalizes an input entry (either a string or a ChangedFile object) into a ChangedFile.
 * Supports lines formatted from `git diff --name-status` (e.g. "M\tpath" or "D\tpath")
 * as well as plain file paths.
 */
export function normalizeChangeEntry(entry: ChangeInput): ChangedFile {
  if (typeof entry === 'object') {
    return entry.status !== undefined
      ? { path: entry.path, status: entry.status }
      : { path: entry.path };
  }
  const tabIndex = entry.indexOf('\t');
  if (tabIndex !== -1) {
    const status = entry.slice(0, tabIndex).trim();
    const rest = entry.slice(tabIndex + 1).trim();
    const secondTab = rest.indexOf('\t');
    const path = secondTab === -1 ? rest : rest.slice(secondTab + 1).trim();
    return { status, path };
  }
  const match = entry.match(/^([A-Z])\d*\s+(.+)$/);
  if (match?.[2] !== undefined && (match[1] === 'D' || match[1] === 'A' || match[1] === 'M')) {
    return {
      status: match[1],
      path: match[2].trim(),
    };
  }
  return { path: entry.trim() };
}

/**
 * Classify a changed-file list into shippable-source + changeset-presence.
 *
 * A changeset is considered present only if at least one `.changeset/*.md` file
 * (excluding `README.md`) is added or retained (i.e. not deleted).
 * Deleted changesets (`status: 'D'`) do not satisfy changeset presence (#7448).
 */
export function classifyChange(files: readonly ChangeInput[]): ChangesetClassification {
  const normalized = files.map(normalizeChangeEntry);
  const shippable: string[] = [];
  let hasChangeset = false;

  for (const f of normalized) {
    if (isShippableSource(f.path) && !shippable.includes(f.path)) {
      shippable.push(f.path);
    }
    if (isPresentChangeset(f)) {
      hasChangeset = true;
    }
  }

  return { shippable, hasChangeset };
}

/** List files changed since `base` (three-dot diff = since merge-base) with diff status. */
function changedFiles(base: string, cwd?: string): ChangedFile[] {
  const out = execSync(`git diff --name-status --no-renames ${base}...HEAD`, {
    cwd,
    encoding: 'utf-8',
  });
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => normalizeChangeEntry(line));
}

/** Main CLI entry point for the changeset presence check. */
export function main(base = process.argv[2] ?? 'origin/main', cwd?: string): number {
  let files: ChangedFile[];
  try {
    files = changedFiles(base, cwd);
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
