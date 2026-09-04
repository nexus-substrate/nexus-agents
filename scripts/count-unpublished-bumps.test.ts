/**
 * Tests for the unpublished-bump counter (#5077).
 *
 * @module scripts/count-unpublished-bumps.test
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { PACKAGE_JSON_PATH, unpublishedBumpsAt } from './count-unpublished-bumps.js';

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A throwaway repo whose first-parent history is, oldest first:
 *
 *   1.0.0 → (feature, package.json untouched) → 1.1.0
 *         → (dependency change: package.json touched, version unchanged) → 1.2.0
 *
 * Two of the five commits are traps: the feature commit must not count as a
 * bump, and the dependency commit touches package.json without bumping it.
 */
function repoWithBumps(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bump-count-'));
  created.push(dir);
  const git = (...args: string[]): void => {
    execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });
  };
  const pkg = join(dir, PACKAGE_JSON_PATH);
  mkdirSync(join(dir, 'packages', 'nexus-agents'), { recursive: true });
  const writePkg = (version: string, extra: Record<string, unknown> = {}): void => {
    writeFileSync(pkg, JSON.stringify({ name: 'nexus-agents', version, ...extra }), 'utf-8');
  };
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  writePkg('1.0.0');
  git('add', '-A');
  git('commit', '-qm', 'chore(release): version packages');
  writeFileSync(join(dir, 'feature.txt'), 'x', 'utf-8');
  git('add', '-A');
  git('commit', '-qm', 'feat: something');
  writePkg('1.1.0');
  git('add', '-A');
  git('commit', '-qm', 'chore(release): version packages');
  writePkg('1.1.0', { dependencies: { zod: '4.0.0' } });
  git('add', '-A');
  git('commit', '-qm', 'chore(deps): bump zod');
  writePkg('1.2.0');
  git('add', '-A');
  git('commit', '-qm', 'chore(release): version packages');
  return dir;
}

/**
 * `repoWithBumps()` plus a side branch, merged `--no-ff` between the 1.1.0 and
 * 1.2.0 bumps, that carried an intermediate `1.1.0-side` version before being
 * set back to 1.1.0. Commit dates are explicit and increasing so that without
 * `--first-parent` git's date-ordered walk visits the side commits before the
 * 1.1.0 bump — the mutation that survived a linear fixture.
 */
function repoWithMergedSideBranch(): string {
  const dir = repoWithBumps();
  let tick = 1_700_000_000;
  const git = (...args: string[]): void => {
    tick += 60;
    const date = `${String(tick)} +0000`;
    execFileSync('git', ['-C', dir, ...args], {
      stdio: 'pipe',
      env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date },
    });
  };
  const pkg = join(dir, PACKAGE_JSON_PATH);
  // Rewind main to the 1.1.0 bump (HEAD~2), then build the side branch on it.
  git('branch', '-f', 'side', 'HEAD~2');
  git('checkout', '-q', 'side');
  writeFileSync(pkg, JSON.stringify({ name: 'nexus-agents', version: '1.1.0-side' }), 'utf-8');
  git('commit', '-qam', 'chore: side bump');
  writeFileSync(pkg, JSON.stringify({ name: 'nexus-agents', version: '1.1.0', side: true }), 'utf-8');
  git('commit', '-qam', 'chore: side back to 1.1.0');
  // Rebuild main's tail on top of the merge: 1.1.0 → merge(side) → deps → 1.2.0.
  git('checkout', '-q', '-B', 'main2', 'HEAD~2');
  git('merge', '-q', '--no-ff', '-m', 'merge side', 'side');
  writeFileSync(pkg, JSON.stringify({ name: 'nexus-agents', version: '1.1.0', side: true, dependencies: { zod: '4.0.0' } }), 'utf-8');
  git('commit', '-qam', 'chore(deps): bump zod');
  writeFileSync(pkg, JSON.stringify({ name: 'nexus-agents', version: '1.2.0' }), 'utf-8');
  git('commit', '-qam', 'chore(release): version packages');
  return dir;
}

describe('unpublishedBumpsAt', () => {
  it('reports no bumps when npm already has the head version', () => {
    const dir = repoWithBumps();
    expect(unpublishedBumpsAt(dir, 'HEAD', '1.2.0')).toEqual({ kind: 'measured', versions: [] });
  });

  it('reports the one version npm never received', () => {
    const dir = repoWithBumps();
    expect(unpublishedBumpsAt(dir, 'HEAD', '1.1.0')).toEqual({
      kind: 'measured',
      versions: ['1.2.0'],
    });
  });

  it('counts distinct versions, newest first, not commits that touch package.json', () => {
    // 1.0.0 → 1.2.0 spans four commits; two of them are bumps. The feature
    // commit and the dependency commit must not inflate the count.
    const dir = repoWithBumps();
    expect(unpublishedBumpsAt(dir, 'HEAD', '1.0.0')).toEqual({
      kind: 'measured',
      versions: ['1.2.0', '1.1.0'],
    });
  });

  it('is UNMEASURED, not zero, when the published version is not on the first-parent line', () => {
    // The panel condition for #5077: a walk that never finds npm's version must
    // not be read as "nothing unpublished" — that would licence the same silent
    // stand-down the counter exists to expose.
    const dir = repoWithBumps();
    const verdict = unpublishedBumpsAt(dir, 'HEAD', '0.9.0');
    expect(verdict.kind).toBe('unmeasured');
    if (verdict.kind === 'unmeasured') expect(verdict.reason).toContain('0.9.0');
  });

  it('is UNMEASURED when the walk bound is exhausted before the version is found', () => {
    const dir = repoWithBumps();
    const verdict = unpublishedBumpsAt(dir, 'HEAD', '1.0.0', { maxCommits: 2 });
    expect(verdict.kind).toBe('unmeasured');
    if (verdict.kind === 'unmeasured') expect(verdict.reason).toContain('2');
  });

  it('follows the first-parent line, ignoring versions a merged side branch passed through', () => {
    // Without --first-parent the walk visits the side branch's 1.1.0-side and
    // reports three unpublished versions where main only ever carried two.
    const dir = repoWithMergedSideBranch();
    expect(unpublishedBumpsAt(dir, 'HEAD', '1.0.0')).toEqual({
      kind: 'measured',
      versions: ['1.2.0', '1.1.0'],
    });
  });
});
