/**
 * Nexus runtime data directory resolver (#2302, child of #2301).
 *
 * Returns the absolute path under which nexus-agents stores runtime state.
 * Two categories of state exist (epic #2872, vote #2876):
 *
 * - **Per-repo** state (sessions, checkpoints, traces, runs, audit,
 *   pipeline, tasks) — tied to the work happening in a specific codebase.
 *   When `NEXUS_REPO_PREFERRED=1` is set and the caller is inside a git
 *   repo, these resolve to `<repo-root>/.nexus-agents/<subdir>/`.
 * - **Cross-repo** state (learning, voting, memory, weather, research,
 *   auth, usage, models manifest) — accumulates across the operator's
 *   whole workflow. Always resolves to `~/.nexus-agents/<subdir>/` so the
 *   learning/routing feedback loop from #1389 / #1407 keeps working.
 *
 * Resolution order (first match wins):
 * 1. `NEXUS_DATA_DIR` env var if set + non-empty. Wins for both categories
 *    — the operator's explicit choice overrides the split.
 * 2. Sandbox-mode default (#2501): when `NEXUS_SANDBOX` is set, use
 *    `${NEXUS_SANDBOX_ROOT ?? '/'}/.nexus-agents`. Sandboxed deployments
 *    typically mount a multi-repo root; state goes there, shared across
 *    repo subfolders rather than buried inside one.
 * 3. Per-repo subdirs (when `findRepoRoot(cwd)` succeeds AND
 *    `NEXUS_REPO_PREFERRED` is not explicitly `'0'`):
 *    `<repo-root>/.nexus-agents/<subdir>/`. Auto-adds `.nexus-agents/`
 *    to the repo's `.gitignore` on first resolution (fail-closed).
 * 4. Cross-repo subdirs when `~/.nexus-agents/` is unwritable AND we're
 *    in a repo: per-repo fallback at `<repo-root>/.nexus-agents/<subdir>/`
 *    with one-time stderr announce. Issue #2888 — gives sandbox users
 *    a working `research/`, `memory/`, etc. without env-var wrangling
 *    while preserving the vote #2876 default for normal-machine users.
 * 5. `<homedir>/.nexus-agents` (cross-repo state on normal machines,
 *    plus everything when not in a git repo or when
 *    `NEXUS_REPO_PREFERRED=0`).
 *
 * `NEXUS_REPO_PREFERRED` defaults **ON** as of this release per vote
 * #2876. Escape hatches preserved:
 *   - `NEXUS_REPO_PREFERRED=0` — fully opt out (homedir for everything).
 *   - `NEXUS_DATA_DIR=~/.nexus-agents` — explicit override wins over
 *     the tier and the categorization both.
 *   - `nexus-agents migrate` (#2879) — relocate existing homedir state
 *     into `<repo>/.nexus-agents/` before flipping in production.
 *
 * @module config/nexus-data-dir
 */

import { accessSync, constants as fsConstants, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { detectSandbox } from './sandbox-detection.js';
import { findRepoRoot } from './repo-root-detection.js';
import { ensureGitignored } from './portable-mode.js';

/**
 * Subdirs scoped to a single repo's work (per the epic #2872 vote).
 * When `NEXUS_REPO_PREFERRED=1` and the caller is inside a git repo, these
 * route to `<repo-root>/.nexus-agents/`; otherwise homedir. The complement
 * (everything not in this set) always goes to homedir so cross-project
 * learning state stays intact.
 *
 * Source-of-truth for the categorization: vote #2876 conditions + audit
 * thread on epic #2872. Adding a new entry here is the appropriate way to
 * mark new state as per-repo — do that as a deliberate decision, not by
 * default.
 */
const PER_REPO_SUBDIRS: ReadonlySet<string> = new Set([
  'sessions',
  'checkpoints',
  'traces',
  'runs',
  'audit',
  'pipeline',
  'tasks',
]);

/** Returns the absolute path to the nexus-agents data directory. */
export function getNexusDataDir(): string {
  const fromEnv = process.env['NEXUS_DATA_DIR']?.trim();
  if (fromEnv !== undefined && fromEnv !== '') {
    return resolve(fromEnv);
  }
  const sandbox = detectSandbox();
  if (sandbox.active) {
    return resolve(sandbox.root ?? '/', '.nexus-agents');
  }
  return join(homedir(), '.nexus-agents');
}

/**
 * No-op kept for source-compatibility with consumers that called this
 * earlier in development. The resolver is no longer cached, so resetting
 * is unnecessary. Kept exported (rather than removed) to avoid breaking
 * imports in tests that may have already adopted it.
 */
export function resetNexusDataDirCache(): void {
  // intentionally empty — see module docstring
}

/**
 * Tracks per-process state for the auto-gitignore wiring: we only need
 * to (a) probe + append to `.gitignore` once per repo, and (b) bail
 * cleanly if the operator has explicitly silenced the auto-add via
 * `NEXUS_GITIGNORE_AUTO=0`. Reset in tests via the helper below.
 */
const gitignoredRoots = new Set<string>();

/** Test helper — clears the auto-gitignore "already did this" memo. */
export function _resetGitignoreMemoForTests(): void {
  gitignoredRoots.clear();
}

/**
 * Returns the repo-scoped `.nexus-agents/` directory if all of the
 * following hold: `NEXUS_REPO_PREFERRED` is NOT explicitly `'0'` (it
 * defaults ON as of vote #2876), `NEXUS_DATA_DIR` is not explicitly set
 * (explicit override always wins), no sandbox is active, and
 * `findRepoRoot(cwd)` finds an ancestor `.git`.
 *
 * Side effect: on the first successful resolution per process per repo,
 * appends `.nexus-agents/` to the repo's `.gitignore` if not already
 * present. The operator can silence this with `NEXUS_GITIGNORE_AUTO=0`
 * (e.g. on CI runners with a frozen working tree).
 *
 * Returns `null` when any precondition fails; callers fall back to
 * `getNexusDataDir()` (homedir).
 */
export function getNexusRepoDir(): string | null {
  if (process.env['NEXUS_REPO_PREFERRED'] === '0') return null;
  const fromEnv = process.env['NEXUS_DATA_DIR']?.trim();
  if (fromEnv !== undefined && fromEnv !== '') return null;
  if (detectSandbox().active) return null;
  const root = findRepoRoot(process.cwd());
  if (root === null) return null;
  maybeAutoGitignore(root);
  return join(root, '.nexus-agents');
}

/**
 * Best-effort fail-closed wiring: once per process per repo, ensure
 * `.nexus-agents/` is in `<repo>/.gitignore`. Silenced via
 * `NEXUS_GITIGNORE_AUTO=0`. Failures are non-fatal — the helper logs
 * to stderr and continues.
 */
function maybeAutoGitignore(repoRoot: string): void {
  if (process.env['NEXUS_GITIGNORE_AUTO'] === '0') return;
  if (gitignoredRoots.has(repoRoot)) return;
  gitignoredRoots.add(repoRoot);
  // Only attempt when the repo root looks real — avoid spamming stderr
  // from temp-dir test fixtures that race the lifecycle.
  if (!existsSync(repoRoot)) return;
  ensureGitignored(repoRoot, '.nexus-agents/');
}

/**
 * Per-process memo: was the homedir base directory found writable on first
 * probe? Used to short-circuit the sandbox-fallback decision in
 * `nexusDataPath()` without spending a syscall on every call.
 */
let homedirWritable: boolean | undefined;

/** Per-process memo: have we already announced a fallback for this subdir? */
const announcedFallbacks = new Set<string>();

/** Test helper — clears the homedir-writability + announcement memos. */
export function _resetWritabilityMemoForTests(): void {
  homedirWritable = undefined;
  announcedFallbacks.clear();
}

/**
 * Returns true if `getNexusDataDir()` resolves to a writable location. Probed
 * once per process and memo'd — flips the sandbox-fallback on/off for
 * cross-repo subdirs. `mkdirSync(recursive: true)` is the safest probe
 * because it both creates the dir if missing and surfaces ENOENT/EACCES
 * issues at the same point. Failures here are non-fatal — they just route
 * cross-repo state to the per-repo fallback (issue #2888).
 */
function isHomedirBaseWritable(): boolean {
  if (homedirWritable !== undefined) return homedirWritable;
  const base = getNexusDataDir();
  try {
    mkdirSync(base, { recursive: true });
    accessSync(base, fsConstants.W_OK);
    homedirWritable = true;
  } catch {
    homedirWritable = false;
  }
  return homedirWritable;
}

/**
 * Emit a one-time stderr warning when a cross-repo subdir falls back to
 * the per-repo location. Operators in sandboxes get a clear signal about
 * what happened without per-call noise.
 */
function announceCrossRepoFallback(subdir: string, repoPath: string): void {
  if (announcedFallbacks.has(subdir)) return;
  announcedFallbacks.add(subdir);
  process.stderr.write(
    `[nexus] ${subdir}: homedir ~/.nexus-agents is not writable; ` +
      `using per-repo fallback at ${repoPath}. See docs/guides/SANDBOXED-USAGE.md.\n`
  );
}

/**
 * Returns a path joined under the appropriate data directory for the
 * given subdir.
 *
 * Routing decision (first match wins):
 * 1. **Per-repo subdir + in a repo + `NEXUS_REPO_PREFERRED` not '0'** →
 *    `<repo>/.nexus-agents/<subdir>/...`. Standard behavior since #2884.
 * 2. **Cross-repo subdir + homedir unwritable + in a repo** →
 *    `<repo>/.nexus-agents/<subdir>/...` as a sandbox-friendly fallback
 *    (issue #2888). Emits a one-time stderr warning per subdir.
 * 3. **Otherwise** → `<homedir>/.nexus-agents/<subdir>/...`. If homedir
 *    is also unwritable, the actual write will surface the error.
 *
 * Existing callers don't need to change — the routing decision is driven
 * by the first segment, not by caller-declared intent.
 */
export function nexusDataPath(...segments: string[]): string {
  const first = segments[0];

  // Tier 1: per-repo subdir + repo-preferred default.
  if (first !== undefined && PER_REPO_SUBDIRS.has(first)) {
    const repoDir = getNexusRepoDir();
    if (repoDir !== null) {
      return join(repoDir, ...segments);
    }
  }

  // Tier 2: cross-repo subdir but homedir isn't reachable. Fall back to
  // the per-repo location if we're in a repo, so sandbox users get a
  // working `research/`, `memory/`, etc. without manual env-var setup.
  // Vote #2876 preserved: this only fires when homedir is physically
  // unreachable; normal-machine users see no change.
  if (first !== undefined && !isHomedirBaseWritable()) {
    const repoDir = getNexusRepoDir();
    if (repoDir !== null) {
      const fallbackPath = join(repoDir, ...segments);
      announceCrossRepoFallback(first, fallbackPath);
      return fallbackPath;
    }
    // No repo to fall back to AND homedir unreachable — return the
    // homedir path anyway. The caller's eventual write will surface
    // the underlying EACCES/ENOENT, which is the right error to show
    // because the environment is genuinely broken at that point.
  }

  return join(getNexusDataDir(), ...segments);
}

/**
 * Like `nexusDataPath()` but eagerly creates the parent directory so
 * callers don't have to remember `mkdirSync(dirname(p), { recursive: true })`
 * before every write. Issue #2890. Use when the returned path will be
 * written to immediately; for read-only resolution prefer `nexusDataPath()`.
 *
 * If the call resolves to a directory (single segment or no segments),
 * the target IS the resolved path. If it resolves to a file (multiple
 * segments), the target is its parent.
 */
export function nexusDataPathEnsure(...segments: string[]): string {
  const resolved = nexusDataPath(...segments);
  const target = segments.length > 1 ? dirname(resolved) : resolved;
  mkdirSync(target, { recursive: true });
  return resolved;
}

/**
 * Explicitly homedir-scoped path. Use this in code that handles
 * cross-project state (routing memory, model registry cache, auth,
 * research catalog) where you want a hard guarantee that the resolver
 * never routes per-repo, even if a new subdir gets accidentally added
 * to the `PER_REPO_SUBDIRS` allowlist later.
 */
export function nexusSharedPath(...segments: string[]): string {
  return join(getNexusDataDir(), ...segments);
}

/**
 * Returns the read-only categorization used by `nexusDataPath()`.
 * Exposed for tests and for tooling that wants to introspect which
 * subdirs are per-repo (e.g. the `nexus-agents migrate` command).
 */
export function getPerRepoSubdirs(): ReadonlySet<string> {
  return PER_REPO_SUBDIRS;
}
