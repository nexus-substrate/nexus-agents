/**
 * Workspace-root resolution from explicit server configuration, Claude Code's
 * environment, or process.cwd() git-root discovery (#5166).
 *
 * Migrated off the deprecated MCP client `roots` capability (roots/list and
 * notifications/roots/list_changed, deprecated in MCP 2026-07-28).
 *
 * Synchronous replacement channels (in precedence order):
 * 1. Explicit `NEXUS_PROJECT_DIR` env var (validated absolute git repo).
 * 2. Validated `CLAUDE_PROJECT_DIR` from Claude Code (#7044).
 * 3. `process.cwd()` git-root discovery via `findRepoRoot(process.cwd())`.
 * 4. Deterministic fallback to `homedir()`.
 *
 * Explicit `NEXUS_DATA_DIR` always keeps its precedence over the per-repo
 * split. Tool-level `repoPath` parameters (e.g. `pr_review`) allow call-time
 * override.
 *
 * Resolution is synchronous before transport opens, eliminating the async
 * pre-resolution race (#4002).
 *
 * @module mcp/workspace-roots
 */

import { existsSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  setActiveWorkspaceRoot,
  getActiveWorkspaceRoot,
  getNexusRepoDir,
  getNexusDataDir,
} from '../config/nexus-data-dir.js';
import { findRepoRoot } from '../config/repo-root-detection.js';
import type { ILogger } from '../core/index.js';

/**
 * A single entry from an MCP roots/list response.
 * Historical type kept for backwards compatibility (#5166).
 */
export interface McpRoot {
  readonly uri: string;
  readonly name?: string | undefined;
}

/**
 * Picks the single repo root to use from declared roots.
 * Historical helper kept for backwards compatibility (#5166).
 */
export function deriveWorkspaceRootFromRoots(roots: readonly McpRoot[]): string | null {
  let first: string | null = null;
  let gitRoot: string | null = null;
  for (const root of roots) {
    if (typeof root.uri !== 'string' || !root.uri.startsWith('file://')) continue;
    let path: string;
    try {
      path = fileURLToPath(root.uri);
    } catch {
      // Malformed file URI — skip it rather than fail the whole resolution.
      continue;
    }
    first ??= path;
    if (gitRoot === null && existsSync(join(path, '.git'))) gitRoot = path;
  }
  return gitRoot ?? first;
}

/** Maximum startup wait before tool dispatch pins the session fallback. */
export const WORKSPACE_ROOT_READY_TIMEOUT_MS = 1_000;

/** One process-wide barrier, matching the synchronous active-root resolver. */
export let workspaceRootReady: Promise<void> = Promise.resolve();

interface RootResolution {
  readonly logger: ILogger;
  readonly fallbackRoot: string;
  readonly resolve: () => void;
  settled: boolean;
  timedOut: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

let resolution: RootResolution | undefined;

/** Validates that a path is absolute, an existing directory, and inside a git repo. */
function validateProjectRoot(candidate: string | undefined): string | null {
  if (candidate === undefined || candidate.trim() === '') return null;
  const trimmed = candidate.trim();
  try {
    if (isAbsolute(trimmed)) {
      const canonical = realpathSync(trimmed);
      if (statSync(canonical).isDirectory()) {
        const root = findRepoRoot(canonical);
        if (root !== null && setActiveWorkspaceRoot(root)) return root;
      }
    }
  } catch {
    // Missing/inaccessible paths and broken symlinks join the invalid-value fallback.
  }
  return null;
}

/** Resolve explicit NEXUS_PROJECT_DIR from environment. */
function resolveNexusProjectRoot(logger: ILogger): string | null {
  const candidate = process.env['NEXUS_PROJECT_DIR'];
  if (candidate === undefined) return null;
  const root = validateProjectRoot(candidate);
  if (root !== null) {
    logger.info('Resolved workspace root from NEXUS_PROJECT_DIR', { workspaceRoot: root });
    return root;
  }
  logger.warn('Invalid NEXUS_PROJECT_DIR; falling back to alternative project root channels');
  return null;
}

/** Resolve Claude Code's startup source, logging invalid values once per startup. */
function resolveClaudeProjectRoot(logger: ILogger): string | null {
  const candidate = process.env['CLAUDE_PROJECT_DIR'];
  if (candidate === undefined) return null;
  const root = validateProjectRoot(candidate);
  if (root !== null) {
    logger.info('Resolved workspace root from CLAUDE_PROJECT_DIR', { workspaceRoot: root });
    return root;
  }
  logger.warn('Invalid CLAUDE_PROJECT_DIR; falling back to process.cwd() repo discovery');
  return null;
}

/** Resolve git repo root from process.cwd() when no explicit project dir is set. */
function resolveCwdProjectRoot(logger: ILogger): string | null {
  const root = findRepoRoot(process.cwd());
  if (root !== null && setActiveWorkspaceRoot(root)) {
    logger.info('Resolved workspace root from process.cwd()', { workspaceRoot: root });
    return root;
  }
  logger.debug('No git repo root found from process.cwd(); using homedir for data dir');
  return null;
}

/** Prepare before transport opens; settles synchronously from replacement channels (#5166). */
export function beginWorkspaceRootResolution(logger: ILogger): void {
  if (resolution?.timer !== undefined) clearTimeout(resolution.timer);
  let resolveReady!: () => void;
  workspaceRootReady = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const root =
    resolveNexusProjectRoot(logger) ??
    resolveClaudeProjectRoot(logger) ??
    resolveCwdProjectRoot(logger);

  if (root === null) {
    setActiveWorkspaceRoot(null);
  }

  resolution = {
    logger,
    fallbackRoot: root ?? findRepoRoot(process.cwd()) ?? homedir(),
    resolve: resolveReady,
    settled: true,
    timedOut: false,
  };

  resolveReady();
}

function finishResolution(state: RootResolution): void {
  if (state.timer !== undefined) clearTimeout(state.timer);
  state.settled = true;
  state.resolve();
}

/** Start the shared bounded wait when the first tool reaches dispatch. */
export function startWorkspaceRootReadyTimeout(timeoutMs: number): void {
  const state = resolution;
  if (state === undefined || state.settled) return;
  state.timer ??= setTimeout(() => {
    setActiveWorkspaceRoot(state.fallbackRoot);
    state.timedOut = true;
    finishResolution(state);
  }, timeoutMs);
}

/** Record the root and effective data directories of each timed-out call. */
export function logWorkspaceRootFallback(toolName: string): void {
  const state = resolution;
  if (state?.timedOut !== true) return;
  state.logger.warn('Tool dispatch using workspace root fallback', {
    toolName,
    reason: 'timeout',
    timeoutMs: WORKSPACE_ROOT_READY_TIMEOUT_MS,
    workspaceRoot: getActiveWorkspaceRoot() ?? state.fallbackRoot,
    dataDir: getNexusRepoDir() ?? getNexusDataDir(),
    governanceDataDir: getNexusRepoDir({ mainCheckout: true }) ?? getNexusDataDir(),
  });
}

/**
 * Historical helper kept for backwards compatibility (#5166).
 * MCP client roots capability was deprecated in MCP 2026-07-28 and retired in #5166.
 * Resolves synchronously without querying roots/list.
 */
export async function resolveWorkspaceRootFromClient(
  _server: McpServer,
  logger: ILogger
): Promise<void> {
  if (resolution === undefined) beginWorkspaceRootResolution(logger);
  logger.debug('MCP client roots capability is retired; workspace root is resolved synchronously');
  await Promise.resolve();
}
