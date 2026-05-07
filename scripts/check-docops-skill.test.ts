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

import { getCommitMessagesForEscapeHatch } from './check-docops-skill.js';

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
