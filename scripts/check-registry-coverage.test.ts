/**
 * Unit tests for check-registry-coverage.ts (#2406).
 *
 * Strategy:
 *   - isRegistryChanged + findMissingPeers are pure — test directly against
 *     synthetic registry/diff fixtures.
 *   - performCheck sits on top of git, fs, env. Test it via a temp-repo
 *     integration test similar to scripts/check-docops-skill.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { isRegistryChanged, findMissingPeers, getChangedFiles } from './check-registry-coverage.js';

// ============================================================================
// Pure-function tests
// ============================================================================

describe('isRegistryChanged', () => {
  const registry = {
    name: 'TEST_REG',
    source: 'src/foo.ts',
    marker: 'export const TEST_REG',
    peer_files: ['src/foo-types.ts'],
    rationale: 'test',
  };

  it('returns false when source file not in changed-files set', () => {
    expect(isRegistryChanged(registry, ['src/other.ts'], () => '')).toBe(false);
  });

  it('returns true when diff has + or - line containing the marker', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,3 +1,4 @@',
      '+export const TEST_REG: Foo[] = [',
      '+  { name: "new-entry" },',
      '+];',
    ].join('\n');
    const diffOf = (): string => diff;
    expect(isRegistryChanged(registry, ['src/foo.ts'], diffOf)).toBe(true);
  });

  it('returns false when source changed but marker line was not touched', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,3 +1,4 @@',
      '-import { Old } from "./old.js";',
      '+import { New } from "./new.js";',
    ].join('\n');
    const diffOf = (): string => diff;
    expect(isRegistryChanged(registry, ['src/foo.ts'], diffOf)).toBe(false);
  });
});

describe('findMissingPeers', () => {
  const registry = {
    name: 'TEST_REG',
    source: 'src/foo.ts',
    marker: 'TEST_REG',
    peer_files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
    rationale: 'test',
  };

  it('returns empty when all peers are in the changed-files set', () => {
    expect(findMissingPeers(registry, ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/foo.ts'])).toEqual(
      []
    );
  });

  it('returns the missing peers in declaration order', () => {
    expect(findMissingPeers(registry, ['src/a.ts', 'src/foo.ts'])).toEqual([
      'src/b.ts',
      'src/c.ts',
    ]);
  });

  it('returns all peers when none are in the changed-files set', () => {
    expect(findMissingPeers(registry, ['src/foo.ts'])).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ]);
  });
});

// ============================================================================
// Git-based getChangedFiles
// ============================================================================

interface RepoCtx {
  dir: string;
  origCwd: string;
  origBaseRef: string | undefined;
}

function git(repoDir: string, cmd: string): string {
  return execSync(`git -C "${repoDir}" ${cmd}`, { encoding: 'utf-8' });
}

function setupRepo(): RepoCtx {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-cov-test-'));
  const origCwd = process.cwd();
  const origBaseRef = process.env['GITHUB_BASE_REF'];

  git(dir, 'init -q -b main');
  git(dir, 'config user.email test@example.com');
  git(dir, 'config user.name Test');
  fs.writeFileSync(path.join(dir, 'README.md'), '# initial\n');
  git(dir, 'add README.md');
  git(dir, 'commit -q -m "initial commit"');

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

describe('getChangedFiles', () => {
  let ctx: RepoCtx;

  beforeEach(() => {
    ctx = setupRepo();
  });

  afterEach(() => {
    teardownRepo(ctx);
  });

  it('walks the PR commit range when GITHUB_BASE_REF is set', () => {
    git(ctx.dir, 'checkout -q -b feature');
    fs.writeFileSync(path.join(ctx.dir, 'src-foo.ts'), 'export const X = 1;\n');
    fs.writeFileSync(path.join(ctx.dir, 'src-bar.ts'), 'export const Y = 2;\n');
    git(ctx.dir, 'add .');
    git(ctx.dir, 'commit -q -m "add foo and bar"');

    git(ctx.dir, 'update-ref refs/remotes/origin/main main');
    process.env['GITHUB_BASE_REF'] = 'main';

    const changed = getChangedFiles(ctx.dir);
    expect(changed).toContain('src-foo.ts');
    expect(changed).toContain('src-bar.ts');
  });

  it('falls back to HEAD~1 when no base ref is set', () => {
    delete process.env['GITHUB_BASE_REF'];
    fs.writeFileSync(path.join(ctx.dir, 'note.txt'), 'one\n');
    git(ctx.dir, 'add note.txt');
    git(ctx.dir, 'commit -q -m "add note"');

    const changed = getChangedFiles(ctx.dir);
    expect(changed).toContain('note.txt');
  });
});
