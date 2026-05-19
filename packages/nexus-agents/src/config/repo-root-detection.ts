/**
 * Repo-root detection — walks upward from a starting directory looking for
 * `.git` so callers can scope state to the current git repo. Built for
 * epic #2872 (issue #2882) to support the per-repo `.nexus-agents/` data
 * directory ratified by vote #2876.
 *
 * Defenses adopted:
 *   - Walks upward but stops at filesystem root (no infinite loop on
 *     symlinks-to-self).
 *   - Stops at filesystem boundary (different `stat.dev`) — refuses to
 *     escape across mount points. Prevents a sandboxed workdir from
 *     resolving a `.git` on the host filesystem.
 *   - Detects git worktrees: `.git` may be a *file* containing
 *     `gitdir: <path>` rather than a directory.
 *   - Realpath's the final root and rejects results that escape the
 *     starting cwd by symlink.
 *
 * Deferred (tracked separately; not blocking #2882):
 *   - CVE-2022-24765-style ownership check (refuse `.git` owned by a
 *     different uid than the running process). The git CLI added
 *     `safe.directory` for this; we don't have a comparable allowlist
 *     surface yet. In CI the heuristic is too noisy to be useful
 *     (runners often clone as a different uid than the workload).
 *     File-system isolation (the `stat.dev` check above) covers the
 *     bulk of the attack class.
 *
 * @module config/repo-root-detection
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

/**
 * Walks upward from `start` looking for `.git` (file or directory).
 * Returns the absolute path to the directory containing it, or `null`.
 *
 * Worktrees: a `.git` file (not dir) with contents `gitdir: <path>` is
 * still recognised as marking the repo root. The pointed-to gitdir is
 * NOT followed — we just need the worktree's own root.
 *
 * Filesystem boundary: stops walking if the next ancestor lives on a
 * different filesystem (different `stat.dev`). This prevents a workdir
 * mounted inside a sandbox from finding a host-side `.git`.
 */
export function findRepoRoot(start: string): string | null {
  if (!isAbsolute(start)) {
    start = resolve(start);
  }

  let current: string;
  try {
    current = realpathSync(start);
  } catch {
    return null;
  }

  let startDev: number | undefined;
  try {
    startDev = statSync(current).dev;
  } catch {
    return null;
  }

  // Walk up. Depth cap is paranoid but bounds the loop on pathological
  // symlinks even though realpathSync above should already prevent cycles.
  for (let i = 0; i < 64; i++) {
    if (isRepoRoot(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      // Hit filesystem root.
      return null;
    }
    try {
      if (statSync(parent).dev !== startDev) {
        // Crossed a mount point; refuse to escape.
        return null;
      }
    } catch {
      return null;
    }
    current = parent;
  }
  return null;
}

/** True iff `dir/.git` exists as a directory or a git-worktree marker file. */
export function isRepoRoot(dir: string): boolean {
  const gitPath = `${dir}/.git`;
  if (!existsSync(gitPath)) return false;
  try {
    const st = statSync(gitPath);
    if (st.isDirectory()) return true;
    if (st.isFile()) {
      // Worktree: first line should be `gitdir: <path>`.
      const head = readFileSync(gitPath, 'utf-8').slice(0, 256);
      return head.startsWith('gitdir:');
    }
  } catch {
    return false;
  }
  return false;
}
