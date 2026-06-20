/**
 * Workspace-root resolution from MCP client `roots` (#3991).
 *
 * A globally-installed nexus-agents MCP server runs with `process.cwd()`
 * OUTSIDE the repo the user is actually working in (it's launched from the
 * npm global bin, not the project). That breaks the per-repo data resolver
 * (`config/nexus-data-dir.ts`), which walks up from cwd to find the repo
 * root — so per-repo `.nexus-agents/` state (governance vote-records,
 * checkpoints, audit, sessions, …) lands in `~/.nexus-agents/` instead of
 * `<repo>/.nexus-agents/`.
 *
 * The fix uses the MCP standard rather than a bespoke env var: clients that
 * declare the `roots` capability (MCP spec — Claude Code and other editors
 * do) advertise their workspace folder(s). After the initialize handshake the
 * server asks for them via `roots/list`, derives a single repo root, and hands
 * it to `setActiveWorkspaceRoot()` so the resolver bases per-repo subdirs
 * there. When the client declares no roots (or the lookup fails) the resolver
 * silently keeps its existing `findRepoRoot(cwd)` → homedir fallback, so this
 * is purely additive: no regression for clients without roots support.
 *
 * @module mcp/workspace-roots
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { setActiveWorkspaceRoot } from '../config/nexus-data-dir.js';
import type { ILogger } from '../core/index.js';

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

/**
 * Asks the connected MCP client for its workspace roots and records the
 * resulting repo root for the data-dir resolver. Best-effort and fail-soft:
 * any missing capability, transport error, or invalid path leaves the
 * resolver on its existing cwd/homedir fallback. Intended to be wired to the
 * server's `oninitialized` hook so it runs once the handshake completes and
 * client capabilities are known.
 *
 * NOTE on ordering (#3991): roots are fetched at the earliest available point
 * (post-`initialized`), but the lookup is async, so a tool call that writes
 * per-repo state in the brief window before the response arrives would still
 * fall back to cwd/homedir. The resolved root is logged once so any such split
 * is observable; tightening this into a pre-dispatch barrier is tracked
 * separately rather than gating every tool handler on an async resolve.
 */
export async function resolveWorkspaceRootFromClient(
  server: McpServer,
  logger: ILogger
): Promise<void> {
  const capabilities = server.server.getClientCapabilities();
  if (capabilities?.roots === undefined) {
    logger.debug('MCP client did not declare the roots capability; using cwd/homedir for data dir');
    return;
  }
  try {
    const result = await server.server.listRoots();
    const root = deriveWorkspaceRootFromRoots(result.roots);
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
  } catch (error) {
    logger.debug('roots/list request failed; using cwd/homedir for data dir', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
