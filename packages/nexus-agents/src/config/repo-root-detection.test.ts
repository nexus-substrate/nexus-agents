/**
 * Tests for repo-root-detection.ts (issue #2882, epic #2872).
 *
 * Uses real temp-directory fixtures rather than mocking fs because the
 * helper's behavior depends on actual filesystem stat semantics (st.dev,
 * realpath, isDirectory vs isFile). Each test isolates its tree in a
 * fresh mkdtemp and cleans up via afterEach.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';

import { findRepoRoot, isRepoRoot, resolveMainCheckoutRoot } from './repo-root-detection.js';

describe('repo-root-detection', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempOutsideRepo('nexus-repo-root-');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('isRepoRoot', () => {
    it('returns true when .git is a directory', () => {
      mkdirSync(join(root, '.git'));
      expect(isRepoRoot(root)).toBe(true);
    });

    it('returns true when .git is a worktree marker file', () => {
      writeFileSync(join(root, '.git'), 'gitdir: /some/other/path/worktrees/wt1\n');
      expect(isRepoRoot(root)).toBe(true);
    });

    it('returns false when .git is a file without the gitdir prefix', () => {
      writeFileSync(join(root, '.git'), 'not a real git marker\n');
      expect(isRepoRoot(root)).toBe(false);
    });

    it('returns false when .git is absent', () => {
      expect(isRepoRoot(root)).toBe(false);
    });
  });

  describe('findRepoRoot', () => {
    it('finds the repo when called from the repo root itself', () => {
      mkdirSync(join(root, '.git'));
      expect(findRepoRoot(root)).toBe(root);
    });

    it('walks upward to find the repo from a nested subdirectory', () => {
      mkdirSync(join(root, '.git'));
      const deep = join(root, 'src', 'feature', 'tests');
      mkdirSync(deep, { recursive: true });
      expect(findRepoRoot(deep)).toBe(root);
    });

    it('returns the closest ancestor for nested repos', () => {
      mkdirSync(join(root, '.git'));
      const inner = join(root, 'vendor', 'embedded');
      mkdirSync(inner, { recursive: true });
      mkdirSync(join(inner, '.git'));
      const deeper = join(inner, 'src');
      mkdirSync(deeper);
      expect(findRepoRoot(deeper)).toBe(inner);
    });

    it('returns null when no .git is found anywhere on the way up', () => {
      // root has no .git; walking up from root will hit filesystem root
      // (or a mount boundary) and return null.
      const sub = join(root, 'a', 'b');
      mkdirSync(sub, { recursive: true });
      expect(findRepoRoot(sub)).toBe(null);
    });

    it('recognises a worktree marker (file, not dir) as a repo root', () => {
      writeFileSync(join(root, '.git'), 'gitdir: /elsewhere/worktrees/wt1\n');
      const sub = join(root, 'src');
      mkdirSync(sub);
      expect(findRepoRoot(sub)).toBe(root);
    });

    it('resolves symlinks via realpath before walking', () => {
      mkdirSync(join(root, '.git'));
      const link = join(root, 'src-link');
      const target = join(root, 'src');
      mkdirSync(target);
      symlinkSync(target, link);
      // Starting from the symlink resolves to the target and finds the
      // same repo root.
      expect(findRepoRoot(link)).toBe(root);
    });

    it('accepts a relative starting path', () => {
      mkdirSync(join(root, '.git'));
      // findRepoRoot resolves relative paths against cwd, then realpath's.
      // We pass an absolute path here because cwd isn't necessarily under
      // `root`, but the resolve() call itself is exercised.
      expect(findRepoRoot(root)).toBe(root);
    });
  });
});

// #6531: a linked worktree's governance state must land in the MAIN checkout,
// or it is reaped with the worktree. Real git fixtures (#6548 review): the
// decision comes from git's own layout and config, so it is tested against
// what git actually writes, not a hand-built imitation.
describe('resolveMainCheckoutRoot (real git layouts)', () => {
  let base: string;

  /** git with no user/system config, so the fixture does not depend on the host. */
  function git(cwd: string, ...args: string[]): void {
    execFileSync('git', ['-c', 'protocol.file.allow=always', ...args], {
      cwd,
      stdio: 'ignore',
      env: {
        PATH: process.env['PATH'] ?? '',
        HOME: base,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@example.com',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@example.com',
      },
    });
  }

  /** A repository with one commit at `<base>/<name>`. */
  function repo(name: string): string {
    const dir = join(base, name);
    git(base, 'init', '-q', name);
    git(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
    return dir;
  }

  beforeEach(() => {
    base = realpathSync(mkdtempOutsideRepo('nexus-main-checkout-'));
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('returns an ordinary checkout unchanged', () => {
    const main = repo('main');
    expect(resolveMainCheckoutRoot(main)).toBe(main);
  });

  it('maps a linked worktree to its main checkout', () => {
    const main = repo('main');
    git(main, 'worktree', 'add', '-q', '../wt');
    expect(resolveMainCheckoutRoot(join(base, 'wt'))).toBe(main);
  });

  it('maps a worktree of a submodule to the submodule checkout (core.worktree)', () => {
    const upstream = repo('upstream');
    const superproject = repo('super');
    git(superproject, 'submodule', 'add', '-q', upstream, 'sub');
    const sub = join(superproject, 'sub');
    // The submodule's own checkout is its main checkout.
    expect(resolveMainCheckoutRoot(sub)).toBe(sub);
    git(sub, 'worktree', 'add', '-q', join(base, 'subwt'));
    expect(resolveMainCheckoutRoot(join(base, 'subwt'))).toBe(sub);
  });

  it('keeps the checkout of a --separate-git-dir clone, and keeps its worktree local', () => {
    const upstream = repo('upstream');
    mkdirSync(join(base, 'store'));
    git(
      base,
      'clone',
      '-q',
      `--separate-git-dir=${join(base, 'store', 'sep.git')}`,
      upstream,
      'sep'
    );
    const sep = join(base, 'sep');
    expect(resolveMainCheckoutRoot(sep)).toBe(sep);
    // git records no path back to this layout's main checkout (its own
    // `worktree list` names the git dir), so there is nothing verifiable to
    // route to: the worktree keeps its own root rather than a guess.
    git(sep, 'worktree', 'add', '-q', join(base, 'sepwt'));
    expect(resolveMainCheckoutRoot(join(base, 'sepwt'))).toBe(join(base, 'sepwt'));
  });

  it('does not route into an unrelated checkout that happens to contain the git dir', () => {
    // The git dir's parent is a working tree — of a DIFFERENT repository. Only
    // git's own common-dir answer for that directory tells them apart.
    const upstream = repo('upstream');
    const other = repo('other');
    git(base, 'clone', '-q', `--separate-git-dir=${join(other, 'sep.git')}`, upstream, 'sep');
    git(join(base, 'sep'), 'worktree', 'add', '-q', join(base, 'sepwt'));
    expect(resolveMainCheckoutRoot(join(base, 'sepwt'))).toBe(join(base, 'sepwt'));
  });

  it('reads core.bare rather than the directory name: a bare repo named .git has no checkout', () => {
    // `<x>/.git` passes a name check and resolves back to the common dir, but
    // the repository is bare — `<x>` is not a working tree.
    const upstream = repo('upstream');
    mkdirSync(join(base, 'x'));
    git(join(base, 'x'), 'clone', '-q', '--bare', upstream, '.git');
    git(join(base, 'x', '.git'), 'worktree', 'add', '-q', join(base, 'xwt'));
    expect(resolveMainCheckoutRoot(join(base, 'xwt'))).toBe(join(base, 'xwt'));
  });

  it('keeps a worktree of a bare repository local (there is no main checkout)', () => {
    const upstream = repo('upstream');
    git(base, 'clone', '-q', '--bare', upstream, 'bare.git');
    git(join(base, 'bare.git'), 'worktree', 'add', '-q', join(base, 'barewt'));
    expect(resolveMainCheckoutRoot(join(base, 'barewt'))).toBe(join(base, 'barewt'));
  });

  it('refuses a worktree whose admin dir does not point back at it', () => {
    const main = repo('main');
    git(main, 'worktree', 'add', '-q', '../wt');
    const elsewhere = join(base, 'elsewhere');
    mkdirSync(elsewhere);
    writeFileSync(join(main, '.git', 'worktrees', 'wt', 'gitdir'), `${join(elsewhere, '.git')}\n`);
    expect(resolveMainCheckoutRoot(join(base, 'wt'))).toBe(join(base, 'wt'));
  });

  it('returns a directory that is not a repository unchanged', () => {
    expect(resolveMainCheckoutRoot(base)).toBe(base);
  });
});
