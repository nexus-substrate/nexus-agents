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

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

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

/** Bound on each git call; a hung git must not hang data-dir resolution. */
const GIT_TIMEOUT_MS = 5_000;

/**
 * Run git and return trimmed stdout, or undefined on any failure (git absent,
 * not a repository, unset config key, timeout). `GIT_*` variables are dropped
 * so an inherited `GIT_DIR`/`GIT_WORK_TREE` cannot answer for a different
 * repository than the one asked about.
 */
function gitOutput(args: readonly string[]): string | undefined {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  );
  try {
    const out = execFileSync('git', [...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS,
      env,
    }).trim();
    return out === '' ? undefined : out;
  } catch {
    return undefined;
  }
}

/** git's common dir for the repository at `dir`, realpath'd. */
function gitCommonDir(dir: string): string | undefined {
  const common = gitOutput(['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir']);
  return common === undefined ? undefined : realpathOrUndefined(common);
}

/**
 * The MAIN checkout that a linked worktree belongs to, or `repoRoot` itself
 * (#6531).
 *
 * `findRepoRoot` deliberately stops at a worktree's own root; this is the one
 * extra hop for state that must outlive the worktree. Every decision is git's
 * own answer (#6548 review), not a name heuristic:
 *
 *  1. Only a LINKED worktree moves: `repoRoot/.git` is a file whose admin dir
 *     sits at `<common>/worktrees/<name>` and whose `gitdir` file points BACK
 *     at this worktree (git writes it inside the main repository, not the
 *     worktree — the guard against a forged marker redirecting writes, possibly
 *     across a mount boundary). A submodule or `--separate-git-dir` checkout
 *     also has a `.git` file, but no back-reference: it is a main checkout.
 *  2. `<common>` is `git rev-parse --git-common-dir`.
 *  3. `core.bare` in `<common>/config` → no main checkout; keep `repoRoot`.
 *  4. `core.worktree` set → that is the main checkout (a submodule: its common
 *     dir is `<super>/.git/modules/<name>`). Otherwise the candidate is
 *     `<common>`'s parent (the standard layout).
 *  5. The candidate is accepted only if git, run there, reports the same common
 *     dir AND the candidate as its top level. A `--separate-git-dir` clone
 *     records no path back to its checkout (git's own `worktree list` names the
 *     git dir), so its worktrees fail here and keep their own root.
 */
export function resolveMainCheckoutRoot(repoRoot: string): string {
  const adminDir = backReferencedAdminDir(repoRoot);
  if (adminDir === undefined) return repoRoot;
  const commonDir = gitCommonDir(repoRoot);
  if (commonDir === undefined || dirname(adminDir) !== join(commonDir, 'worktrees')) {
    return repoRoot;
  }
  return mainCheckoutOf(commonDir) ?? repoRoot;
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

/** Resolve a git metadata path the way git does: relative to `base`, then realpath. */
function resolveGitPath(base: string, value: string): string | undefined {
  return realpathOrUndefined(isAbsolute(value) ? value : resolve(base, value));
}

/** The checkout whose git dir is `commonDir`, per git; undefined when there is none. */
function mainCheckoutOf(commonDir: string): string | undefined {
  const config = join(commonDir, 'config');
  if (gitOutput(['config', '--file', config, '--bool', '--get', 'core.bare']) === 'true') {
    return undefined;
  }
  const worktree = gitOutput(['config', '--file', config, '--get', 'core.worktree']);
  const candidate = realpathOrUndefined(
    worktree === undefined ? dirname(commonDir) : resolveUnder(commonDir, worktree)
  );
  if (candidate === undefined || gitCommonDir(candidate) !== commonDir) return undefined;
  const topLevel = gitOutput(['-C', candidate, 'rev-parse', '--show-toplevel']);
  if (topLevel === undefined || realpathOrUndefined(topLevel) !== candidate) return undefined;
  return candidate;
}

/** `value` resolved against `base` unless already absolute (core.worktree semantics). */
function resolveUnder(base: string, value: string): string {
  return isAbsolute(value) ? value : resolve(base, value);
}
