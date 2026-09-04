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
});
