/**
 * Target-project resolution for the voter panel (#6110).
 *
 * Every case builds a real directory tree under a temp root outside any git
 * repository, so the resolver is exercised against the files it actually reads
 * (`.git/config`, `package.json`) and never against a mocked reader.
 *
 * @module cli/voter-project.test
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import { resolveVoterProject, VOTER_PROJECT_PATTERN } from './voter-project.js';

let root: string;

beforeEach(() => {
  // The suite redirects TMPDIR into the repo (#4412); a fixture there would
  // inherit THIS repo's origin and the fall-through cases would invert.
  root = mkdtempOutsideRepo('nexus-6110-');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A repo root whose `.git/config` names `originUrl` (or has no origin at all). */
function makeRepo(originUrl: string | undefined, dir = root): string {
  mkdirSync(join(dir, '.git'), { recursive: true });
  const remote =
    originUrl === undefined
      ? ''
      : `[remote "origin"]\n\turl = ${originUrl}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;
  writeFileSync(
    join(dir, '.git', 'config'),
    `[core]\n\trepositoryformatversion = 0\n\tbare = false\n${remote}[branch "main"]\n\tremote = origin\n`
  );
  return dir;
}

function writePackageName(dir: string, name: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.0' }));
}

describe('resolveVoterProject (#6110)', () => {
  it('explicit input wins over a derivable origin', () => {
    makeRepo('git@github.com:someone/else.git');
    writePackageName(root, 'else-package');
    const resolved = resolveVoterProject({ input: 'acme/widgets', cwd: root });
    expect(resolved).toMatchObject({ name: 'acme/widgets', source: 'input' });
  });

  describe('derives owner/repo from every origin URL form', () => {
    it.each([
      ['scp-like ssh', 'git@github.com:acme/widgets.git'],
      ['scp-like ssh without .git', 'git@github.com:acme/widgets'],
      ['https', 'https://github.com/acme/widgets'],
      ['https with .git', 'https://github.com/acme/widgets.git'],
      ['https with trailing slash', 'https://github.com/acme/widgets/'],
      ['https with credentials', 'https://token@github.com/acme/widgets.git'],
      ['ssh://', 'ssh://git@github.com/acme/widgets'],
      ['ssh:// with .git and port', 'ssh://git@github.com:2222/acme/widgets.git'],
      ['git://', 'git://github.com/acme/widgets.git'],
    ])('%s: %s', (_label, url) => {
      makeRepo(url);
      const resolved = resolveVoterProject({ cwd: root });
      expect(resolved).toMatchObject({ name: 'acme/widgets', source: 'derived' });
    });

    it('takes the last two path segments of a nested host path', () => {
      makeRepo('https://gitlab.example.com/group/subgroup/widgets.git');
      expect(resolveVoterProject({ cwd: root })).toMatchObject({
        name: 'subgroup/widgets',
        source: 'derived',
      });
    });

    it('resolves from a subdirectory of the repo', () => {
      makeRepo('git@github.com:acme/widgets.git');
      const nested = join(root, 'packages', 'deep');
      mkdirSync(nested, { recursive: true });
      expect(resolveVoterProject({ cwd: nested })).toMatchObject({
        name: 'acme/widgets',
        source: 'derived',
      });
    });

    it('follows a worktree `.git` file to the shared config', () => {
      // Main checkout with the origin; a linked worktree whose `.git` is a
      // file pointing at `<main>/.git/worktrees/<name>`, which carries a
      // `commondir` back-reference — the layout `git worktree add` writes.
      const main = join(root, 'main');
      makeRepo('git@github.com:acme/widgets.git', main);
      const worktreeGitDir = join(main, '.git', 'worktrees', 'wt');
      mkdirSync(worktreeGitDir, { recursive: true });
      writeFileSync(join(worktreeGitDir, 'commondir'), '../..\n');
      const worktree = join(root, 'wt');
      mkdirSync(worktree, { recursive: true });
      writeFileSync(join(worktree, '.git'), `gitdir: ${worktreeGitDir}\n`);
      expect(resolveVoterProject({ cwd: worktree })).toMatchObject({
        name: 'acme/widgets',
        source: 'derived',
      });
    });
  });

  describe('falls back', () => {
    it('to the nearest package.json name when .git/config has no origin', () => {
      makeRepo(undefined);
      writePackageName(root, 'widgets-cli');
      expect(resolveVoterProject({ cwd: root })).toMatchObject({
        name: 'widgets-cli',
        source: 'derived',
      });
    });

    it('to the nearest package.json name when there is no repo at all', () => {
      writePackageName(root, '@acme/widgets');
      const nested = join(root, 'src', 'deep');
      mkdirSync(nested, { recursive: true });
      expect(resolveVoterProject({ cwd: nested })).toMatchObject({
        name: '@acme/widgets',
        source: 'derived',
      });
    });

    it('to the default when nothing derivable exists', () => {
      expect(resolveVoterProject({ cwd: root })).toEqual({
        name: 'nexus-agents',
        source: 'default',
        rejected: [],
      });
    });

    it('to the default when the origin URL has no owner/repo path', () => {
      makeRepo('https://github.com/widgets');
      const resolved = resolveVoterProject({ cwd: root });
      expect(resolved).toMatchObject({ name: 'nexus-agents', source: 'default' });
      expect(resolved.rejected).toHaveLength(1);
    });

    it('to the default when package.json is unparsable or has no string name', () => {
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, 'package.json'), '{ not json');
      expect(resolveVoterProject({ cwd: root })).toMatchObject({ source: 'default' });
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 42 }));
      expect(resolveVoterProject({ cwd: root })).toMatchObject({ source: 'default' });
    });
  });

  describe('validates every candidate before it can reach a prompt', () => {
    it('rejects an invalid explicit input and falls through to the derived name', () => {
      makeRepo('git@github.com:acme/widgets.git');
      const resolved = resolveVoterProject({ input: 'evil; rm -rf /', cwd: root });
      expect(resolved).toMatchObject({ name: 'acme/widgets', source: 'derived' });
      expect(resolved.rejected).toEqual([
        expect.objectContaining({ origin: 'input', candidate: 'evil; rm -rf /' }),
      ]);
      expect(resolved.rejected[0]?.reason).toMatch(/pattern/);
    });

    it('rejects an invalid derived origin name and falls through to package.json', () => {
      makeRepo('https://github.com/acme/wid gets');
      writePackageName(root, 'widgets');
      const resolved = resolveVoterProject({ cwd: root });
      expect(resolved).toMatchObject({ name: 'widgets', source: 'derived' });
      expect(resolved.rejected.map((r) => r.origin)).toEqual(['git-origin']);
    });

    it('rejects an invalid package.json name and falls through to the default', () => {
      writePackageName(root, 'has spaces and $(subshell)');
      const resolved = resolveVoterProject({ cwd: root });
      expect(resolved).toMatchObject({ name: 'nexus-agents', source: 'default' });
      expect(resolved.rejected.map((r) => r.origin)).toEqual(['package-name']);
    });

    it('rejects an over-long candidate', () => {
      const resolved = resolveVoterProject({ input: 'a'.repeat(201), cwd: root });
      expect(resolved).toMatchObject({ source: 'default' });
    });

    it('the pattern admits scoped npm names and owner/repo, and refuses shell metacharacters', () => {
      for (const ok of ['acme/widgets', '@acme/widgets', 'nexus-agents', 'a.b_c-d']) {
        expect(VOTER_PROJECT_PATTERN.test(ok)).toBe(true);
      }
      for (const bad of ['', 'a b', 'a;b', 'a`b`', 'a$(b)', 'a\nb', 'a"b', "a'b", 'a\\b']) {
        expect(VOTER_PROJECT_PATTERN.test(bad)).toBe(false);
      }
    });
  });
});
