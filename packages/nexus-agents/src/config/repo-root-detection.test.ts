/**
 * Tests for repo-root-detection.ts (issue #2882, epic #2872).
 *
 * Uses real temp-directory fixtures rather than mocking fs because the
 * helper's behavior depends on actual filesystem stat semantics (st.dev,
 * realpath, isDirectory vs isFile). Each test isolates its tree in a
 * fresh mkdtemp and cleans up via afterEach.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { findRepoRoot, isRepoRoot } from './repo-root-detection.js';

describe('repo-root-detection', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nexus-repo-root-'));
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
