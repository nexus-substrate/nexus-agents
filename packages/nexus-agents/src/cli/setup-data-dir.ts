/**
 * nexus-agents data directory initialization
 *
 * Pre-creates the nexus-agents data directory structure (per-repo +
 * cross-repo roots per epic #2872) with proper permissions.
 * Used by `nexus-agents setup` to ensure data directories exist before first use.
 *
 * @module cli/setup-data-dir
 * (Source: Issue #1249 - Developer experience improvements)
 */

import { mkdirSync, existsSync } from 'node:fs';
import { DATA_SUBDIRECTORIES } from './doctor.js';
import { getNexusDataDir, nexusDataPath } from '../config/nexus-data-dir.js';

/**
 * Homedir/cross-repo root data directory path.
 *
 * Resolves to `$NEXUS_DATA_DIR` when set, else `<homedir>/.nexus-agents`.
 * See `src/config/nexus-data-dir.ts` for resolution rules (#2302).
 *
 * Evaluated at module-import time. Tests that mutate `NEXUS_DATA_DIR`
 * mid-process should call `resetNexusDataDirCache()` and re-import, or
 * call `getNexusDataDir()` directly.
 *
 * NOTE: this is the cross-repo root ONLY. Per-repo subdirs (sessions,
 * checkpoints, audit, …) resolve to `<repo>/.nexus-agents/`;
 * `initDataDirectories()` routes each subdir through `nexusDataPath()`
 * so the per-repo split from epic #2872 is honored. Issue #2889.
 */
export const NEXUS_DATA_DIR = getNexusDataDir();

/** Subdirectories requiring restricted permissions (owner-only). */
const RESTRICTED_DIRS = new Set(['auth']);

/**
 * Result of data directory initialization.
 */
export interface DataDirInitResult {
  readonly success: boolean;
  readonly rootPath: string;
  readonly created: readonly string[];
  readonly alreadyExisted: readonly string[];
  readonly error: string | null;
}

/**
 * Creates the nexus-agents data directory structure. Each subdir is
 * routed through `nexusDataPath()` — per-repo subdirs land in
 * `<repo>/.nexus-agents/`, cross-repo subdirs in `~/.nexus-agents/`.
 * Sets restrictive permissions (0o700) on auth/ directory.
 *
 * @param dryRun - If true, reports what would be created without creating.
 * @returns Result of initialization.
 */
export function initDataDirectories(dryRun: boolean = false): DataDirInitResult {
  const created: string[] = [];
  const alreadyExisted: string[] = [];
  const failures: string[] = [];

  // No explicit root ensureDir: recursive mkdir of each subdir creates
  // its parent root. Crucially, NOT creating the homedir root up-front
  // means a read-only-homedir sandbox doesn't abort here before the
  // per-repo subdirs (which ARE writable) get a chance. Issue #2895.
  for (const subdir of DATA_SUBDIRECTORIES) {
    const mode = RESTRICTED_DIRS.has(subdir) ? 0o700 : undefined;
    // Route through nexusDataPath() so per-repo subdirs (sessions,
    // checkpoints, audit, …) land in `<repo>/.nexus-agents/`, cross-repo
    // subdirs in homedir, and cross-repo subdirs fall back per-repo when
    // homedir is unwritable (#2888). Split on '/' so the routing key is
    // the true first segment (e.g. 'memory/beliefs' → 'memory').
    const target = nexusDataPath(...subdir.split('/'));
    // Per-subdir failure is non-fatal: one unwritable location must not
    // abort the others. Genuinely-broken environments surface as a
    // non-empty `failures` list rather than a thrown exception.
    try {
      ensureDir(target, dryRun, created, alreadyExisted, mode);
    } catch (error: unknown) {
      failures.push(`${target}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    return {
      success: false,
      rootPath: NEXUS_DATA_DIR,
      created,
      alreadyExisted,
      error: `Failed to create ${String(failures.length)} dir(s): ${failures.join('; ')}`,
    };
  }
  return { success: true, rootPath: NEXUS_DATA_DIR, created, alreadyExisted, error: null };
}

/** Creates a single directory if it doesn't exist, tracking the result. */
function ensureDir(
  dirPath: string,
  dryRun: boolean,
  created: string[],
  alreadyExisted: string[],
  mode?: number
): void {
  if (existsSync(dirPath)) {
    alreadyExisted.push(dirPath);
    return;
  }
  if (!dryRun) {
    mkdirSync(dirPath, { recursive: true, ...(mode !== undefined ? { mode } : {}) });
  }
  created.push(dirPath);
}

/** What `doctor --fix` should report after asking setup to create data dirs. */
export interface DataDirFixOutcome {
  /** Operator-facing line. */
  readonly line: string;
  /** Whether this counts toward "N issue(s) fixed". */
  readonly counted: boolean;
}

/**
 * Turn a data-directory init result into an honest `doctor --fix` report (#4851).
 *
 * `doctor --fix` runs this step when a subdirectory is missing OR not writable,
 * then printed "✓ Created missing data directories" and incremented the fix
 * count on `success` alone. But `ensureDir` returns early for a path that
 * already exists and never checks writability, so an existing-but-unwritable
 * directory lands in `alreadyExisted`, `failures` stays empty, and `success` is
 * true — doctor claimed a fix for precisely the condition that triggered it,
 * having created nothing.
 *
 * `created.length` is the only thing that distinguishes the two, and it was
 * already on the result.
 */
export function describeDataDirFix(result: DataDirInitResult): DataDirFixOutcome {
  if (!result.success) {
    return {
      line: `✗ Could not create data directories: ${result.error ?? 'unknown error'}`,
      counted: false,
    };
  }
  if (result.created.length === 0) {
    return {
      line:
        '✗ Data directories already exist but are not writable — setup creates missing ' +
        'directories and cannot repair permissions. Fix them manually (chmod u+w).',
      counted: false,
    };
  }
  return {
    line: `✓ Created ${String(result.created.length)} missing data director${result.created.length === 1 ? 'y' : 'ies'}`,
    counted: true,
  };
}
