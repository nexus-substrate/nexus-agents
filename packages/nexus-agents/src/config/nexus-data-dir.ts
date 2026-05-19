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
 * 4. `<homedir>/.nexus-agents` (cross-repo state, plus everything when
 *    not in a git repo or when `NEXUS_REPO_PREFERRED=0`).
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

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

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
