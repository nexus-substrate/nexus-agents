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
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

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

/** Upper bound on a git metadata file read; real ones are one short line. */
const MAX_GIT_METADATA_BYTES = 4096;

/** First line of a small file, trimmed; undefined when absent, oversized or empty. */
function readGitMetadataLine(path: string): string | undefined {
  try {
    if (!statSync(path).isFile() || statSync(path).size > MAX_GIT_METADATA_BYTES) return undefined;
    const line = readFileSync(path, 'utf-8').split('\n')[0]?.trim();
    return line === undefined || line === '' ? undefined : line;
  } catch {
    return undefined;
  }
}

/** realpath, or undefined when the path does not resolve. */
function realpathOrUndefined(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

/**
 * The MAIN checkout that a linked worktree belongs to, or `repoRoot` itself
 * (#6531).
 *
 * `findRepoRoot` deliberately stops at a worktree's own root; this is the one
 * extra hop for state that must outlive the worktree. `repoRoot/.git` of a
 * linked worktree is a file `gitdir: <admin>`; `<admin>/commondir` names the
 * shared `.git`, and `dirname` of that is the main checkout.
 *
 * The marker file is content under the worktree owner's control, and following
 * it redirects writes into whatever repository it names — possibly across a
 * mount boundary, which `findRepoRoot` otherwise refuses (a worktree under
 * `/tmp` of a repo under `/home` is the common case). So every hop is checked
 * the way git itself links them, and any mismatch keeps `repoRoot`:
 *  - `<admin>/gitdir` points BACK at this worktree's `.git` file (written by
 *    git in the main repository, not by the worktree);
 *  - `<admin>` sits at `<common>/worktrees/<name>`;
 *  - `<common>` is named `.git` and is the `.git` directory of its parent (a
 *    bare common dir has no checkout to route to).
 */
export function resolveMainCheckoutRoot(repoRoot: string): string {
  const adminDir = backReferencedAdminDir(repoRoot);
  if (adminDir === undefined) return repoRoot;
  const commonDir = commonDirOf(adminDir);
  if (commonDir === undefined) return repoRoot;
  return checkoutOfCommonDir(commonDir) ?? repoRoot;
}

/** Resolve a git metadata path the way git does: relative to `base`, then realpath. */
function resolveGitPath(base: string, value: string): string | undefined {
  return realpathOrUndefined(isAbsolute(value) ? value : resolve(base, value));
}

/**
 * The admin dir a worktree's `.git` marker names, only when that admin dir's
 * `gitdir` file points back at the same marker; undefined otherwise.
 */
function backReferencedAdminDir(repoRoot: string): string | undefined {
  const dotGit = join(repoRoot, '.git');
  const target = readGitMetadataLine(dotGit)
    ?.match(/^gitdir:\s*(.+)$/)?.[1]
    ?.trim();
  if (target === undefined) return undefined;
  const adminDir = resolveGitPath(repoRoot, target);
  if (adminDir === undefined) return undefined;
  const backRef = readGitMetadataLine(join(adminDir, 'gitdir'));
  if (backRef === undefined) return undefined;
  const pointsBack = resolveGitPath(adminDir, backRef) === realpathOrUndefined(dotGit);
  return pointsBack ? adminDir : undefined;
}

/** `<admin>/commondir`, only when `<admin>` sits at `<common>/worktrees/<name>`. */
function commonDirOf(adminDir: string): string | undefined {
  const commonRel = readGitMetadataLine(join(adminDir, 'commondir'));
  if (commonRel === undefined) return undefined;
  const commonDir = resolveGitPath(adminDir, commonRel);
  if (commonDir === undefined) return undefined;
  return dirname(adminDir) === join(commonDir, 'worktrees') ? commonDir : undefined;
}

/** The checkout whose `.git` directory is `commonDir`; undefined for a bare repository. */
function checkoutOfCommonDir(commonDir: string): string | undefined {
  if (basename(commonDir) !== '.git') return undefined;
  const mainRoot = dirname(commonDir);
  if (realpathOrUndefined(join(mainRoot, '.git')) !== commonDir) return undefined;
  try {
    return statSync(commonDir).isDirectory() ? mainRoot : undefined;
  } catch {
    return undefined;
  }
}
