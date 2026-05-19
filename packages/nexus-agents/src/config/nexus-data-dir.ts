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
 * 3. Per-repo subdirs (when `NEXUS_REPO_PREFERRED=1` is set AND
 *    `findRepoRoot(cwd)` succeeds): `<repo-root>/.nexus-agents/<subdir>/`.
 * 4. `<homedir>/.nexus-agents` (default for both categories without
 *    NEXUS_REPO_PREFERRED, and cross-repo state always).
 *
 * `NEXUS_REPO_PREFERRED` defaults OFF in this release — the new tier is
 * opt-in so users with months of homedir state aren't silently orphaned.
 * `nexus-agents migrate` (#2879) is the explicit path to relocate state
 * before flipping the flag. A follow-up minor release will flip the
 * default per the vote ratification.
 *
 * @module config/nexus-data-dir
 */

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { detectSandbox } from './sandbox-detection.js';
import { findRepoRoot } from './repo-root-detection.js';

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
 * Returns the repo-scoped `.nexus-agents/` directory if all of the
 * following hold: `NEXUS_REPO_PREFERRED=1` is set, `NEXUS_DATA_DIR` is
 * NOT explicitly set (explicit override always wins), no sandbox is
 * active, and `findRepoRoot(cwd)` finds an ancestor `.git`.
 *
 * Otherwise returns `null` and callers should fall back to the homedir
 * resolution (i.e. `getNexusDataDir()`).
 */
export function getNexusRepoDir(): string | null {
  if (process.env['NEXUS_REPO_PREFERRED'] !== '1') return null;
  const fromEnv = process.env['NEXUS_DATA_DIR']?.trim();
  if (fromEnv !== undefined && fromEnv !== '') return null;
  if (detectSandbox().active) return null;
  const root = findRepoRoot(process.cwd());
  if (root === null) return null;
  return join(root, '.nexus-agents');
}

/**
 * Returns a path joined under the appropriate data directory for the
 * given subdir. If the first segment is in `PER_REPO_SUBDIRS` and
 * `getNexusRepoDir()` succeeds, the per-repo dir is used. Otherwise the
 * standard `getNexusDataDir()` (homedir) is used. Existing callers don't
 * need to change — the routing decision is driven by the first segment.
 */
export function nexusDataPath(...segments: string[]): string {
  const first = segments[0];
  if (first !== undefined && PER_REPO_SUBDIRS.has(first)) {
    const repoDir = getNexusRepoDir();
    if (repoDir !== null) {
      return join(repoDir, ...segments);
    }
  }
  return join(getNexusDataDir(), ...segments);
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
