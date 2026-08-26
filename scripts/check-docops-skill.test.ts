/**
 * Unit tests for the DocOps skill-sync escape-hatch fix (#2411).
 *
 * The bug: `git log -1 --pretty=%B` reads only the latest commit message,
 * which on GitHub Actions PR runs is the auto-generated merge-commit
 * subject, NOT the developer's commit message. The fix walks the full
 * PR commit range when GITHUB_BASE_REF is set so [skip-docops] in any
 * commit on the branch is honored.
 *
 * Strategy: build a tiny throwaway git repo per test, set up a base ref
 * and a feature branch, and assert getCommitMessagesForEscapeHatch returns
 * the right text under each environment configuration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  getCommitMessagesForEscapeHatch,
  isMechanicalActionBumpDiff,
} from './check-docops-skill.js';

interface RepoCtx {
  dir: string;
  origCwd: string;
  origBaseRef: string | undefined;
}

function git(repoDir: string, cmd: string): string {
  return execSync(`git -C "${repoDir}" ${cmd}`, { encoding: 'utf-8' });
}

function setupRepo(): RepoCtx {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docops-test-'));
  const origCwd = process.cwd();
  const origBaseRef = process.env['GITHUB_BASE_REF'];

  git(dir, 'init -q -b main');
  git(dir, 'config user.email test@example.com');
  git(dir, 'config user.name Test');
  git(dir, 'commit --allow-empty -q -m "initial commit on main"');

  process.chdir(dir);
  return { dir, origCwd, origBaseRef };
}

function teardownRepo(ctx: RepoCtx): void {
  process.chdir(ctx.origCwd);
  if (ctx.origBaseRef === undefined) {
    delete process.env['GITHUB_BASE_REF'];
  } else {
    process.env['GITHUB_BASE_REF'] = ctx.origBaseRef;
  }
  fs.rmSync(ctx.dir, { recursive: true, force: true });
}

describe('getCommitMessagesForEscapeHatch (#2411)', () => {
  let ctx: RepoCtx;

  beforeEach(() => {
    ctx = setupRepo();
  });

  afterEach(() => {
    teardownRepo(ctx);
  });

  it('finds [skip-docops] in the latest commit when no PR base ref is set', () => {
    delete process.env['GITHUB_BASE_REF'];
    git(ctx.dir, 'commit --allow-empty -q -m "feat: change [skip-docops]"');

    const out = getCommitMessagesForEscapeHatch(ctx.dir);

    expect(out).toContain('[skip-docops]');
  });

  it('walks the PR commit range when GITHUB_BASE_REF is set, honoring branch tokens', () => {
    git(ctx.dir, 'checkout -q -b feature');
    git(ctx.dir, 'commit --allow-empty -q -m "feat: real change [skip-docops]"');
    git(ctx.dir, 'commit --allow-empty -q -m "chore: lint fix"');

    git(ctx.dir, 'update-ref refs/remotes/origin/main main');
    process.env['GITHUB_BASE_REF'] = 'main';

    const out = getCommitMessagesForEscapeHatch(ctx.dir);

    expect(out).toContain('[skip-docops]');
    expect(out).toContain('chore: lint fix');
  });

  it('does NOT inherit [skip-docops] from a commit already on the base branch (#5028)', () => {
    // The range was `origin/main...HEAD` — symmetric — so commits on the base
    // branch but NOT on the PR branch were searched too. Six `[skip-docops]`
    // commits are on main today, so any branch whose merge-base predates one
    // of them skipped the whole gate regardless of what it changed.
    git(ctx.dir, 'checkout -q -b feature');
    git(ctx.dir, 'commit --allow-empty -q -m "feat: an honest change"');

    // main moves ahead with a bypass commit the feature branch never contains.
    git(ctx.dir, 'checkout -q main');
    git(ctx.dir, 'commit --allow-empty -q -m "chore: unrelated [skip-docops]"');
    git(ctx.dir, 'update-ref refs/remotes/origin/main main');
    git(ctx.dir, 'checkout -q feature');
    process.env['GITHUB_BASE_REF'] = 'main';

    const out = getCommitMessagesForEscapeHatch(ctx.dir);

    expect(out).not.toContain('[skip-docops]');
    expect(out).toContain('feat: an honest change');
  });

  it('does NOT see [skip-docops] when only the merge-commit message has it (the original bug)', () => {
    git(ctx.dir, 'checkout -q -b feature');
    git(ctx.dir, 'commit --allow-empty -q -m "feat: real change without bypass token"');

    git(ctx.dir, 'update-ref refs/remotes/origin/main main');
    process.env['GITHUB_BASE_REF'] = 'main';

    const out = getCommitMessagesForEscapeHatch(ctx.dir);

    expect(out).not.toContain('[skip-docops]');
    expect(out).toContain('feat: real change without bypass token');
  });

  it('falls back to HEAD-only when GITHUB_BASE_REF points at a non-existent ref', () => {
    git(ctx.dir, 'commit --allow-empty -q -m "feat: head-only message [skip-docops]"');
    process.env['GITHUB_BASE_REF'] = 'nonexistent-base-ref-xyz';

    const out = getCommitMessagesForEscapeHatch(ctx.dir);

    expect(out).toContain('[skip-docops]');
  });
});

describe('isMechanicalActionBumpDiff (#3363)', () => {
  it('treats a pure actions/checkout version bump as mechanical', () => {
    const diff = [
      'diff --git a/.github/workflows/docs-check.yml b/.github/workflows/docs-check.yml',
      '--- a/.github/workflows/docs-check.yml',
      '+++ b/.github/workflows/docs-check.yml',
      '@@ -10,7 +10,7 @@ jobs:',
      '       - uses: actions/checkout@aaaaaaa # v6.0.2',
      '+      - uses: actions/checkout@bbbbbbb # v6.0.3',
      '-      - uses: actions/checkout@aaaaaaa # v6.0.2',
    ].join('\n');
    // Reconstruct a realistic +/- pair (context line above is unchanged).
    const realistic = [
      '@@ -10,7 +10,7 @@',
      '-      - uses: actions/checkout@aaaaaaa # v6.0.2',
      '+      - uses: actions/checkout@bbbbbbb # v6.0.3',
    ].join('\n');
    expect(isMechanicalActionBumpDiff(diff)).toBe(true);
    expect(isMechanicalActionBumpDiff(realistic)).toBe(true);
  });

  it('handles multiple action bumps in one file', () => {
    const diff = [
      '-      - uses: actions/checkout@aaa # v6.0.2',
      '+      - uses: actions/checkout@bbb # v6.0.3',
      '-      - uses: actions/setup-node@ccc # v5.0.0',
      '+      - uses: actions/setup-node@ddd # v5.0.1',
    ].join('\n');
    expect(isMechanicalActionBumpDiff(diff)).toBe(true);
  });

  it('is NOT mechanical when a non-uses line changes (real pipeline edit)', () => {
    const diff = [
      '-      - uses: actions/checkout@aaa # v6.0.2',
      '+      - uses: actions/checkout@bbb # v6.0.3',
      '+        with:',
      '+          fetch-depth: 0',
    ].join('\n');
    expect(isMechanicalActionBumpDiff(diff)).toBe(false);
  });

  it('is NOT mechanical when a run step changes', () => {
    const diff = [
      '-          npx tsx scripts/check-docops-skill.ts',
      '+          npx tsx scripts/check-docops-skill.ts --verbose',
    ].join('\n');
    expect(isMechanicalActionBumpDiff(diff)).toBe(false);
  });

  it('returns false for an empty diff (no detectable change)', () => {
    expect(isMechanicalActionBumpDiff('')).toBe(false);
  });
});
