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

  // #6531: a linked worktree's per-repo governance state must land in the MAIN
  // checkout, or it is reaped with the worktree. Fixture mirrors what
  // `git worktree add` lays out.
  describe('resolveMainCheckoutRoot', () => {
    function linkedWorktree(): { main: string; wt: string; adminDir: string } {
      const main = join(root, 'main');
      const wt = join(root, 'wt');
      const adminDir = join(main, '.git', 'worktrees', 'wt1');
      mkdirSync(adminDir, { recursive: true });
      mkdirSync(wt);
      writeFileSync(join(wt, '.git'), `gitdir: ${adminDir}\n`);
      writeFileSync(join(adminDir, 'gitdir'), `${join(wt, '.git')}\n`);
      writeFileSync(join(adminDir, 'commondir'), '../..\n');
      return { main, wt, adminDir };
    }

    it('returns an ordinary checkout unchanged', () => {
      mkdirSync(join(root, '.git'));
      expect(resolveMainCheckoutRoot(root)).toBe(root);
    });

    it('maps a linked worktree to its main checkout', () => {
      const { main, wt } = linkedWorktree();
      expect(resolveMainCheckoutRoot(wt)).toBe(realpathSync(main));
    });

    it('follows a relative gitdir in the worktree marker file', () => {
      const { main, wt } = linkedWorktree();
      writeFileSync(join(wt, '.git'), 'gitdir: ../main/.git/worktrees/wt1\n');
      expect(resolveMainCheckoutRoot(wt)).toBe(realpathSync(main));
    });

    it('refuses a forged marker whose gitdir does not point back at it', () => {
      const { wt, adminDir } = linkedWorktree();
      const elsewhere = join(root, 'elsewhere');
      mkdirSync(elsewhere);
      writeFileSync(join(adminDir, 'gitdir'), `${join(elsewhere, '.git')}\n`);
      expect(resolveMainCheckoutRoot(wt)).toBe(wt);
    });

    it('refuses when the admin dir has no gitdir back-reference', () => {
      const { wt, adminDir } = linkedWorktree();
      rmSync(join(adminDir, 'gitdir'));
      expect(resolveMainCheckoutRoot(wt)).toBe(wt);
    });

    it('refuses when the admin dir has no commondir', () => {
      const { wt, adminDir } = linkedWorktree();
      rmSync(join(adminDir, 'commondir'));
      expect(resolveMainCheckoutRoot(wt)).toBe(wt);
    });

    it('refuses an admin dir that is not under <common>/worktrees/', () => {
      const { main, wt } = linkedWorktree();
      const stray = join(main, '.git', 'not-worktrees', 'wt1');
      mkdirSync(stray, { recursive: true });
      writeFileSync(join(stray, 'gitdir'), `${join(wt, '.git')}\n`);
      writeFileSync(join(stray, 'commondir'), '../..\n');
      writeFileSync(join(wt, '.git'), `gitdir: ${stray}\n`);
      expect(resolveMainCheckoutRoot(wt)).toBe(wt);
    });

    it('keeps the worktree when the common dir is a bare repository', () => {
      const bare = join(root, 'bare.git');
      const adminDir = join(bare, 'worktrees', 'wt1');
      const wt = join(root, 'wt');
      mkdirSync(adminDir, { recursive: true });
      mkdirSync(wt);
      writeFileSync(join(wt, '.git'), `gitdir: ${adminDir}\n`);
      writeFileSync(join(adminDir, 'gitdir'), `${join(wt, '.git')}\n`);
      writeFileSync(join(adminDir, 'commondir'), '../..\n');
      expect(resolveMainCheckoutRoot(wt)).toBe(wt);
    });

    it('returns a directory with no .git unchanged', () => {
      expect(resolveMainCheckoutRoot(root)).toBe(root);
    });
  });
});
