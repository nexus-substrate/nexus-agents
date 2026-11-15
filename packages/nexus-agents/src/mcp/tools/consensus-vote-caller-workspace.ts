/**
 * The working directory a caller asks a consensus panel's seats to inspect (#7751).
 *
 * A panel run by a long-lived MCP server used to be pinned to `process.cwd()`:
 * a host serving several repositories could not point a vote at one of them, and
 * `artifactPath` was bounded by the same directory, so the only remedy was the
 * process-wide `NEXUS_PROJECT_DIR`. This resolves the caller's request to a
 * repository root so the seats and the artifact root agree, and it refuses an
 * unusable path up front — a seat handed the wrong directory returns
 * `unverifiable`, which the caller cannot distinguish from a broken sandbox.
 *
 * @module mcp/tools/consensus-vote-caller-workspace
 */

import { statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { findRepoRoot } from '../../config/repo-root-detection.js';

/** Either the directory every seat is handed, or why the caller's path is unusable. */
export type CallerWorkspaceResolution =
  { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: string };

/**
 * Resolve `workspace` to the repository root the panel will use.
 *
 * Omitted means the server cwd, unchanged from before this option existed. A
 * relative path is resolved against the cwd. The supplied directory must exist,
 * be a directory and sit inside a git repository; the repository root wins so a
 * subdirectory and its root name the same panel.
 */
export function resolveCallerWorkspace(
  requested: string | undefined,
  cwd: string = process.cwd()
): CallerWorkspaceResolution {
  if (requested === undefined) return { ok: true, value: cwd };
  const absolute = isAbsolute(requested) ? requested : resolve(cwd, requested);
  let isDirectory: boolean;
  try {
    isDirectory = statSync(absolute).isDirectory();
  } catch {
    return { ok: false, reason: `workspace does not exist: ${requested}` };
  }
  if (!isDirectory) return { ok: false, reason: `workspace is not a directory: ${requested}` };
  const root = findRepoRoot(absolute);
  if (root === null) {
    return {
      ok: false,
      reason: `workspace is not inside a repository root (no .git found): ${requested}`,
    };
  }
  return { ok: true, value: root };
}
