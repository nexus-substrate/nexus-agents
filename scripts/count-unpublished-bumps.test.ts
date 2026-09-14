/**
 * Tests for the unpublished-bump counter (#5077, #5463).
 *
 * The registry's version list is an argument, so no test reaches npm.
 *
 * @module scripts/count-unpublished-bumps.test
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PACKAGE_JSON_PATH,
  parseRegistryVersions,
  unpublishedBumpsAt,
} from './count-unpublished-bumps.js';

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
  writeFileSync(
    pkg,
    JSON.stringify({ name: 'nexus-agents', version: '1.1.0', side: true }),
    'utf-8'
  );
  git('commit', '-qam', 'chore: side back to 1.1.0');
  // Rebuild main's tail on top of the merge: 1.1.0 → merge(side) → deps → 1.2.0.
  git('checkout', '-q', '-B', 'main2', 'HEAD~2');
  git('merge', '-q', '--no-ff', '-m', 'merge side', 'side');
  writeFileSync(
    pkg,
    JSON.stringify({
      name: 'nexus-agents',
      version: '1.1.0',
      side: true,
      dependencies: { zod: '4.0.0' },
    }),
    'utf-8'
  );
  git('commit', '-qam', 'chore(deps): bump zod');
  writeFileSync(pkg, JSON.stringify({ name: 'nexus-agents', version: '1.2.0' }), 'utf-8');
  git('commit', '-qam', 'chore(release): version packages');
  return dir;
}

/**
 * The issue's reverted-bump fixture (#5463): `repoWithBumps()` continued with a
 * revert of the 1.2.0 bump back to 1.1.0, then a 1.3.0 bump. With npm at
 * 1.2.0 the walk passes a version npm already has (1.1.0) on its way.
 */
function repoWithRevertedBump(): string {
  const dir = repoWithBumps();
  const git = (...args: string[]): void => {
    execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });
  };
  const pkg = join(dir, PACKAGE_JSON_PATH);
  writeFileSync(pkg, JSON.stringify({ name: 'nexus-agents', version: '1.1.0' }), 'utf-8');
  git('commit', '-qam', 'revert: chore(release): version packages');
  writeFileSync(pkg, JSON.stringify({ name: 'nexus-agents', version: '1.3.0' }), 'utf-8');
  git('commit', '-qam', 'chore(release): version packages');
  return dir;
}

/** Every version `repoWithBumps()` carries, as npm would list them. */
const ALL = ['1.0.0', '1.1.0', '1.2.0'] as const;

describe('unpublishedBumpsAt', () => {
  it('reports nothing pending, published or skipped when npm has every version and latest is HEAD', () => {
    const dir = repoWithBumps();
    expect(unpublishedBumpsAt(dir, 'HEAD', '1.2.0', ALL)).toEqual({
      kind: 'measured',
      pending: [],
      published: [],
      skipped: [],
    });
  });

  it('reports the one version npm never received as pending', () => {
    const dir = repoWithBumps();
    expect(unpublishedBumpsAt(dir, 'HEAD', '1.1.0', ['1.0.0', '1.1.0'])).toEqual({
      kind: 'measured',
      pending: ['1.2.0'],
      published: [],
      skipped: [],
    });
  });

  it('counts distinct versions, newest first, not commits that touch package.json', () => {
    // 1.0.0 → 1.2.0 spans four commits; two of them are bumps. The feature
    // commit and the dependency commit must not inflate the count.
    const dir = repoWithBumps();
    expect(unpublishedBumpsAt(dir, 'HEAD', '1.0.0', ['1.0.0'])).toEqual({
      kind: 'measured',
      pending: ['1.2.0', '1.1.0'],
      published: [],
      skipped: [],
    });
  });

  it('classifies versions npm already has after a dist-tag rollback as published, not pending (#5463)', () => {
    // `npm dist-tag add nexus-agents@1.0.0 latest` after 1.2.0 shipped: both
    // 1.2.0 and 1.1.0 sit after `latest` on the walk, and npm has them. A
    // `latest`-only walk reports 2 pending and fails the release as stalled.
    const dir = repoWithBumps();
    expect(unpublishedBumpsAt(dir, 'HEAD', '1.0.0', ALL)).toEqual({
      kind: 'measured',
      pending: [],
      published: ['1.2.0', '1.1.0'],
      skipped: [],
    });
  });

  it('counts a reverted bump once: the version npm already has is published, the new one pending (#5463)', () => {
    // 1.2.0 → revert to 1.1.0 → 1.3.0, npm at 1.2.0. Only 1.3.0 is unpublished.
    const dir = repoWithRevertedBump();
    expect(unpublishedBumpsAt(dir, 'HEAD', '1.2.0', ALL)).toEqual({
      kind: 'measured',
      pending: ['1.3.0'],
      published: ['1.1.0'],
      skipped: [],
    });
  });

  it('reports a version older than latest that npm never received as skipped, not pending (#5463)', () => {
    // 2026-09-14: main went 8.58.10 → 8.59.0 → 8.59.1; the 8.59.0 version PR
    // merged with an unconsumed changeset, so npm skipped it and published
    // 8.59.1. With latest = HEAD the old walk reported 0 and the skew was
    // invisible. 1.1.0 here plays 8.59.0: it will never publish (superseded),
    // so it must not count toward the stall verdict, but it must be reported.
    const dir = repoWithBumps();
    expect(unpublishedBumpsAt(dir, 'HEAD', '1.2.0', ['1.0.0', '1.2.0'])).toEqual({
      kind: 'measured',
      pending: [],
      published: [],
      skipped: ['1.1.0'],
    });
  });

  it('walks back to the published predecessor of latest for skipped versions, and stops there', () => {
    // History: 1.0.0 → 1.1.0 → 1.2.0 → 1.1.0 → 1.3.0; npm has 1.0.0 and 1.3.0.
    // 1.0.0 is on npm, so the skipped walk ends at it: 1.0.0 is neither
    // skipped nor published-after-latest.
    const dir = repoWithRevertedBump();
    expect(unpublishedBumpsAt(dir, 'HEAD', '1.3.0', ['1.0.0', '1.3.0'])).toEqual({
      kind: 'measured',
      pending: [],
      published: [],
      skipped: ['1.1.0', '1.2.0'],
    });
  });

  it('is still MEASURED when history ends before a published predecessor of latest is found', () => {
    // A package whose first published version is latest has no predecessor;
    // the pending count is fully determined once latest is found, so this is
    // not the unmeasured case. Everything older is skipped.
    const dir = repoWithBumps();
    expect(unpublishedBumpsAt(dir, 'HEAD', '1.2.0', ['1.2.0'])).toEqual({
      kind: 'measured',
      pending: [],
      published: [],
      skipped: ['1.1.0', '1.0.0'],
    });
  });

  it('is UNMEASURED, not zero, when the published version is not on the first-parent line', () => {
    // The panel condition for #5077: a walk that never finds npm's version must
    // not be read as "nothing unpublished" — that would licence the same silent
    // stand-down the counter exists to expose.
    const dir = repoWithBumps();
    const verdict = unpublishedBumpsAt(dir, 'HEAD', '0.9.0', ['0.9.0']);
    expect(verdict.kind).toBe('unmeasured');
    if (verdict.kind === 'unmeasured') expect(verdict.reason).toContain('0.9.0');
  });

  it('is UNMEASURED when the walk bound is exhausted before the version is found', () => {
    const dir = repoWithBumps();
    const verdict = unpublishedBumpsAt(dir, 'HEAD', '1.0.0', ['1.0.0'], { maxCommits: 2 });
    expect(verdict.kind).toBe('unmeasured');
    if (verdict.kind === 'unmeasured') expect(verdict.reason).toContain('2');
  });

  it('is UNMEASURED when the registry list does not contain latest (two npm answers disagree)', () => {
    // `npm view version` and `npm view versions` are two registry reads; a list
    // without latest is not a snapshot to classify against. The empty list is
    // the named empty case: it would otherwise make every version pending.
    const dir = repoWithBumps();
    for (const registry of [[], ['1.0.0', '1.1.0']]) {
      const verdict = unpublishedBumpsAt(dir, 'HEAD', '1.2.0', registry);
      expect(verdict.kind).toBe('unmeasured');
      if (verdict.kind === 'unmeasured') expect(verdict.reason).toContain('1.2.0');
    }
  });

  it('follows the first-parent line, ignoring versions a merged side branch passed through', () => {
    // Without --first-parent the walk visits the side branch's 1.1.0-side and
    // reports three unpublished versions where main only ever carried two.
    const dir = repoWithMergedSideBranch();
    expect(unpublishedBumpsAt(dir, 'HEAD', '1.0.0', ['1.0.0'])).toEqual({
      kind: 'measured',
      pending: ['1.2.0', '1.1.0'],
      published: [],
      skipped: [],
    });
  });
});

describe('parseRegistryVersions', () => {
  it('parses the JSON array `npm view <pkg> versions --json` prints', () => {
    expect(parseRegistryVersions('["1.0.0","1.1.0"]\n')).toEqual(['1.0.0', '1.1.0']);
  });

  it('accepts the bare string npm prints for a package with exactly one version', () => {
    expect(parseRegistryVersions('"1.0.0"\n')).toEqual(['1.0.0']);
  });

  it('throws on anything else rather than classifying against a guessed list', () => {
    for (const raw of ['', '{}', '[1, 2]', 'null', 'not json']) {
      expect(() => parseRegistryVersions(raw)).toThrow(/versions/);
    }
  });
});
