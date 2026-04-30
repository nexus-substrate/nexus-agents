/**
 * Nexus runtime data directory resolver (#2302, child of #2301).
 *
 * Returns the absolute path under which nexus-agents stores all runtime
 * state — memory, learning, audit, voting, sessions, checkpoints, traces,
 * model registry. Single source of truth so portable / sandbox / CI
 * deployments can redirect state to a workspace-local folder via the
 * `NEXUS_DATA_DIR` environment variable.
 *
 * Resolution order (first match wins):
 * 1. `NEXUS_DATA_DIR` env var if set + non-empty (resolved against `cwd`).
 * 2. `<homedir>/.nexus-agents` (zero-breakage fallback).
 *
 * No caching, no filesystem walks, no discovery. The contrarian-narrowed
 * scope (#2301 vote) explicitly defers ancestor-walking to a separate
 * child with a security design pass per CVE-2022-24765. Recomputing the
 * trivial env-or-homedir lookup on each call is ~100ns and avoids cache
 * coordination issues with tests that mock `homedir()`.
 *
 * @module config/nexus-data-dir
 */

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Returns the absolute path to the nexus-agents data directory. */
export function getNexusDataDir(): string {
  const fromEnv = process.env['NEXUS_DATA_DIR']?.trim();
  if (fromEnv !== undefined && fromEnv !== '') {
    return resolve(fromEnv);
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

/** Returns a path joined under the resolved data directory. */
export function nexusDataPath(...segments: string[]): string {
  return join(getNexusDataDir(), ...segments);
}
