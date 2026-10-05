/**
 * Workspace-root resolution from Claude Code's environment or MCP roots.
 *
 * A globally-installed nexus-agents MCP server runs with `process.cwd()`
 * OUTSIDE the repo the user is actually working in (it's launched from the
 * npm global bin, not the project). That breaks the per-repo data resolver
 * (`config/nexus-data-dir.ts`), which walks up from cwd to find the repo
 * root — so per-repo `.nexus-agents/` state (governance vote-records,
 * checkpoints, audit, sessions, …) lands in `~/.nexus-agents/` instead of
 * `<repo>/.nexus-agents/`.
 *
 * Claude Code's validated `CLAUDE_PROJECT_DIR` supplies a synchronous git
 * workspace root before transport opens (#7044). Otherwise, clients that
 * declare the `roots` capability advertise their workspace folder(s). After
 * the initialize handshake the server asks via `roots/list` and hands the
 * result to `setActiveWorkspaceRoot()` so per-repo subdirs resolve there.
 * Neither source changes explicit `NEXUS_DATA_DIR` precedence.
 * When the client declares no roots (or the lookup fails) the resolver
 * keeps its existing cwd/homedir fallback. Tool dispatch waits for readiness
 * with a bounded timeout; a timeout pins the fallback for the session and
 * every call using it logs its root and effective data directories.
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
import { getErrorMessage } from '../core/errors.js';

/** A single entry from an MCP `roots/list` response. */
export interface McpRoot {
  readonly uri: string;
  readonly name?: string | undefined;
}

/**
 * Picks the single repo root to use from the client's declared roots.
 *
 * Only `file://` roots are usable (the MCP spec currently restricts roots to
 * file URIs anyway). With more than one root — VS Code and other editors
 * support multi-root workspaces — prefer the first whose directory actually
 * contains a `.git`, since that is the repo whose `.nexus-agents/` we want;
 * otherwise fall back to the first usable root. Returns `null` when no usable
 * root is present (caller then leaves the resolver on its cwd/homedir path).
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
  readonly fromClaudeProjectDir: boolean;
  settled: boolean;
  timedOut: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

let resolution: RootResolution | undefined;

/** Resolve Claude Code's startup source, logging invalid values once per startup. */
function resolveClaudeProjectRoot(logger: ILogger): string | null {
  // Claude Code injects CLAUDE_PROJECT_DIR into spawned stdio MCP servers:
  // the stable project root, unchanged by adding/removing working directories.
  // https://code.claude.com/docs/en/mcp#option-3-add-a-local-stdio-server
  const candidate = process.env['CLAUDE_PROJECT_DIR'];
  if (candidate === undefined) return null;
  try {
    if (isAbsolute(candidate)) {
      const canonical = realpathSync(candidate);
      const root = statSync(canonical).isDirectory() ? findRepoRoot(canonical) : null;
      if (root !== null && setActiveWorkspaceRoot(root)) return root;
    }
  } catch {
    // Missing/inaccessible paths and broken symlinks join the invalid-value fallback.
  }
  logger.warn('Invalid CLAUDE_PROJECT_DIR; falling back to MCP client roots');
  return null;
}

/** Prepare before transport opens; a valid Claude Code root settles synchronously. */
export function beginWorkspaceRootResolution(logger: ILogger): void {
  if (resolution?.timer !== undefined) clearTimeout(resolution.timer);
  let resolveReady!: () => void;
  workspaceRootReady = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const root = resolveClaudeProjectRoot(logger);
  resolution = {
    logger,
    fallbackRoot: findRepoRoot(process.cwd()) ?? homedir(),
    resolve: resolveReady,
    fromClaudeProjectDir: root !== null,
    settled: false,
    timedOut: false,
  };
  if (root !== null) {
    logger.info('Resolved workspace root from CLAUDE_PROJECT_DIR', { workspaceRoot: root });
    finishResolution(resolution);
  }
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

/** Apply a usable client root; empty/unusable roots explicitly retain fallback. */
function applyWorkspaceRoots(roots: readonly McpRoot[], logger: ILogger): void {
  const root = deriveWorkspaceRootFromRoots(roots);
  if (root === null) {
    logger.debug('MCP client returned no usable file:// roots; using cwd/homedir for data dir');
    return;
  }
  if (setActiveWorkspaceRoot(root)) {
    logger.info('Resolved workspace root from MCP client roots', { workspaceRoot: root });
  } else {
    logger.warn('MCP client root failed validation; using cwd/homedir for data dir', {
      candidate: root,
    });
  }
}

/**
 * Resolve roots after initialized unless the startup source already settled.
 * Release dispatch on success,
 * absent capability, empty/unusable roots, or error. A timed-out session keeps
 * its pinned fallback: a late response must never split per-repo state.
 */
export async function resolveWorkspaceRootFromClient(
  server: McpServer,
  logger: ILogger
): Promise<void> {
  if (resolution === undefined) beginWorkspaceRootResolution(logger);
  const state = resolution;
  if (state?.fromClaudeProjectDir === true) return;
  await requestWorkspaceRoots(server, logger, state);
}

/** Request client roots and settle the existing readiness barrier on every outcome. */
async function requestWorkspaceRoots(
  server: McpServer,
  logger: ILogger,
  state: RootResolution | undefined
): Promise<void> {
  try {
    if (server.server.getClientCapabilities()?.roots === undefined) {
      logger.debug(
        'MCP client did not declare the roots capability; using cwd/homedir for data dir'
      );
      return;
    }
    const result = await server.server.listRoots();
    if (state?.settled === true || state !== resolution) return;
    applyWorkspaceRoots(result.roots, logger);
  } catch (error) {
    logger.debug('roots/list request failed; using cwd/homedir for data dir', {
      error: getErrorMessage(error),
    });
  } finally {
    if (state !== undefined && !state.settled) finishResolution(state);
  }
}
