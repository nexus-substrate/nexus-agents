/**
 * nexus-agents data directory initialization
 *
 * Pre-creates ~/.nexus-agents/ directory structure with proper permissions.
 * Used by `nexus-agents setup` to ensure data directories exist before first use.
 *
 * @module cli/setup-data-dir
 * (Source: Issue #1249 - Developer experience improvements)
 */

import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_SUBDIRECTORIES } from './doctor.js';
import { getNexusDataDir } from '../config/nexus-data-dir.js';

/**
 * Root data directory path.
 *
 * Resolves to `$NEXUS_DATA_DIR` when set, else `<homedir>/.nexus-agents`.
 * See `src/config/nexus-data-dir.ts` for resolution rules (#2302).
 *
 * Evaluated at module-import time. Tests that mutate `NEXUS_DATA_DIR`
 * mid-process should call `resetNexusDataDirCache()` and re-import, or
 * call `getNexusDataDir()` directly.
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
 * Creates the ~/.nexus-agents/ directory structure.
 * Sets restrictive permissions (0o700) on auth/ directory.
 *
 * @param dryRun - If true, reports what would be created without creating.
 * @returns Result of initialization.
 */
export function initDataDirectories(dryRun: boolean = false): DataDirInitResult {
  const created: string[] = [];
  const alreadyExisted: string[] = [];

  try {
    ensureDir(NEXUS_DATA_DIR, dryRun, created, alreadyExisted);

    for (const subdir of DATA_SUBDIRECTORIES) {
      const mode = RESTRICTED_DIRS.has(subdir) ? 0o700 : undefined;
      ensureDir(join(NEXUS_DATA_DIR, subdir), dryRun, created, alreadyExisted, mode);
    }

    return { success: true, rootPath: NEXUS_DATA_DIR, created, alreadyExisted, error: null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, rootPath: NEXUS_DATA_DIR, created, alreadyExisted, error: msg };
  }
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
