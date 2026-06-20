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
 * 3. Per-repo subdirs (when a repo root is known AND `NEXUS_REPO_PREFERRED`
 *    is not explicitly `'0'`): `<repo-root>/.nexus-agents/<subdir>/`. The
 *    repo root is the active workspace root when one has been set via
 *    `setActiveWorkspaceRoot()` (the MCP server derives it from the client's
 *    declared `roots`, MCP spec — see #3991), otherwise `findRepoRoot(cwd)`.
 *    The active-root path exists because a globally-installed MCP server runs
 *    with `process.cwd()` outside the repo, so cwd-based detection would
 *    wrongly route per-repo state to homedir. Auto-adds `.nexus-agents/` to
 *    the repo's `.gitignore` on first resolution (fail-closed).
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

import {
  accessSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  mkdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

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
  // Async-mode job results (#3042 / epic #2631). Tied to work happening
  // in a specific codebase — a job dispatched on repo A shouldn't be
  // polled-against on repo B, which would happen if jobs/ were homedir-scoped.
  'jobs',
  // CI health-check events (#3076 / #3084). Per-repo because outages
  // reported via `ci_health_check({ repo })` are repo-correlated; a wedge
  // on repo A's queue does not predict repo B's health.
  'ci-health',
  // Governance artifacts — the runtime authentic-vote-record ledger
  // (`governance/vote-records.jsonl`, #3897/#3927/#3991). Per-repo because a
  // promotion proposal is scoped to the codebase being changed; with
  // `NEXUS_REPO_PREFERRED=1` (default) these route to
  // `<repo>/.nexus-agents/governance/` (gitignored), and to
  // `~/.nexus-agents/governance/` otherwise (global / non-repo install). This
  // is DISTINCT from the committed `<repo>/governance/vote-records.jsonl`
  // ledger the promotion gate reads — that artifact is reached only via the
  // explicit `NEXUS_VOTE_RECORDS_PATH` override (#3991).
  'governance',
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
 * Active workspace root, when known from a source more authoritative than
 * `process.cwd()`. Set by the MCP server (#3991) from the client's declared
 * `roots` (MCP spec) once the initialize handshake completes, because a
 * globally-installed server runs with cwd OUTSIDE the repo being worked on —
 * so cwd-based repo detection would route per-repo `.nexus-agents` state to
 * homedir instead of `<repo>/.nexus-agents/`. CLI / in-repo callers never set
 * this, so they keep resolving via `findRepoRoot(cwd)` exactly as before.
 */
let activeWorkspaceRoot: string | undefined;

/**
 * Records the active workspace root for repo-scoped data resolution. The
 * value is cross-trust-boundary input (it arrives over the MCP transport from
 * the client), so it is validated before use: resolved to an absolute path,
 * canonicalized via `realpathSync` (defeats symlink games), and required to
 * be an existing directory. Returns `true` when accepted, `false` when the
 * value is empty/invalid (in which case the previous root is left untouched).
 * Passing `null`/empty explicitly clears any previously-set root.
 */
export function setActiveWorkspaceRoot(root: string | null | undefined): boolean {
  const trimmed = root?.trim();
  if (trimmed === undefined || trimmed === '') {
    activeWorkspaceRoot = undefined;
    return false;
  }
  try {
    const canonical = realpathSync(resolve(trimmed));
    if (!isAbsolute(canonical) || !statSync(canonical).isDirectory()) return false;
    activeWorkspaceRoot = canonical;
    return true;
  } catch {
    // Nonexistent path, permission error, or broken symlink — reject and keep
    // whatever was set before so a bad late signal can't corrupt resolution.
    return false;
  }
}

/** Returns the active workspace root if one has been set, else `undefined`. */
export function getActiveWorkspaceRoot(): string | undefined {
  return activeWorkspaceRoot;
}

/** Test helper — clears the active workspace root memo. */
export function _resetActiveWorkspaceRootForTests(): void {
  activeWorkspaceRoot = undefined;
}

/**
 * Returns the repo-scoped `.nexus-agents/` directory if all of the
 * following hold: `NEXUS_REPO_PREFERRED` is NOT explicitly `'0'` (it
 * defaults ON as of vote #2876), `NEXUS_DATA_DIR` is not explicitly set
 * (explicit override always wins), no sandbox is active, and a repo root is
 * known — either the active workspace root (set via
 * `setActiveWorkspaceRoot()`) or an ancestor `.git` found by
 * `findRepoRoot(cwd)`.
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
  // Prefer the MCP-client-declared workspace root (#3991) when the server has
  // set it; fall back to walking up from cwd for CLI / in-repo callers.
  const root = activeWorkspaceRoot ?? findRepoRoot(process.cwd());
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

/** Per-process memo — the legacy session-DB relocation runs at most once. */
let legacySessionsDbMigrated = false;

/** Test helper — clears the session-DB migration "already did this" memo. */
export function _resetSessionsDbMigrationMemoForTests(): void {
  legacySessionsDbMigrated = false;
}

/** SQLite sidecar suffixes that must travel with the main DB file. */
const SQLITE_SIDECAR_SUFFIXES = ['', '-wal', '-shm', '-journal'] as const;

/**
 * Resolves the session-database path, performing a one-time relocation
 * of any pre-#2902 database on the first call per process.
 *
 * The session DB is per-repo episodic state and belongs in the
 * `sessions/` bucket alongside the session journals — vote #2876
 * categorized `sessions/` as per-repo, and issue #2902 (consensus
 * 3/3) extended that to the DB. Before #2902 the DB resolved via
 * `nexusDataPath('sessions.db')`; because `sessions.db` is not a
 * per-repo first segment, that landed cross-repo at
 * `~/.nexus-agents/sessions.db`, so a DB started in one repo leaked
 * into every other repo.
 *
 * If a legacy DB exists at the old location and none exists at the
 * new one, the legacy file (and any SQLite sidecars) is moved so
 * existing session history is preserved rather than silently
 * orphaned. The move is best-effort: a failure leaves the legacy DB
 * untouched for manual recovery and the caller gets a fresh DB at the
 * new path. `NEXUS_DATA_DIR` / `NEXUS_REPO_PREFERRED` / the
 * `NEXUS_SESSIONS_DB` override all sit upstream of this resolver.
 */
export function sessionsDbPath(): string {
  const target = nexusDataPath('sessions', 'sessions.db');
  if (!legacySessionsDbMigrated) {
    legacySessionsDbMigrated = true;
    migrateLegacySessionsDb(target);
  }
  return target;
}

/** One-time relocation of a pre-#2902 session DB. Best-effort — see `sessionsDbPath`. */
function migrateLegacySessionsDb(target: string): void {
  const legacy = nexusDataPath('sessions.db'); // pre-#2902 resolution
  if (legacy === target || !existsSync(legacy) || existsSync(target)) return;
  try {
    mkdirSync(dirname(target), { recursive: true });
    for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
      const from = `${legacy}${suffix}`;
      if (existsSync(from)) moveFile(from, `${target}${suffix}`);
    }
  } catch {
    // Best-effort — a migration failure must never break session storage.
  }
}

/** Moves a file, falling back to copy+unlink across a filesystem boundary. */
function moveFile(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    copyFileSync(from, to);
    unlinkSync(from);
  }
}
