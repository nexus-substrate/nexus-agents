/**
 * nexus-agents/cli-server — nested-MCP-server deadlock guard (#4033).
 *
 * When a nexus consensus voter shells out to a coding CLI (e.g. `opencode run
 * --format json`) and that CLI is itself configured to auto-start a
 * `nexus-agents --mode=server` MCP server, the nested server attaches to the
 * child's stdio and blocks the child's own MCP handshake — so the voter never
 * emits its JSON result and `consensus_vote` deadlocks (the whole tree sits at
 * 0% CPU until the per-voter timeout reaps it minutes later).
 *
 * `subprocess-env.buildChildEnv` stamps {@link NEXUS_SUBPROCESS_DEPTH_ENV} on
 * every spawned-CLI child; the marker is `NEXUS_`-prefixed so it survives the
 * env allowlist and reaches the grandchild server. {@link exitIfNestedSubprocessServer}
 * reads it at the top of the server bootstrap and exits cleanly when nested, so
 * the parent CLI proceeds WITHOUT this MCP server (it needs no nexus server to
 * answer a prompt). Mirrors the codex recursion guard (#3350); never fires for a
 * top-level launch (no marker → depth 0).
 *
 * @module cli-server-nesting-guard
 */

import type { ILogger } from './core/index.js';
import { EXIT_CODES } from './cli-types.js';
import { readSubprocessDepth, NEXUS_SUBPROCESS_DEPTH_ENV } from './cli-adapters/subprocess-env.js';

/**
 * Exit cleanly (without starting the server) when this process is a nested
 * nexus server spawned by a CLI that nexus itself launched (#4033). No-op at the
 * top level. Must be called BEFORE any slow startup work so the parent CLI's MCP
 * handshake is released promptly.
 */
export function exitIfNestedSubprocessServer(logger: ILogger): void {
  const depth = readSubprocessDepth();
  if (depth <= 0) return;
  logger.warn(
    `Refusing to start a nested nexus-agents MCP server ` +
      `(${NEXUS_SUBPROCESS_DEPTH_ENV}=${String(depth)}). This server was launched by a ` +
      'CLI that nexus itself spawned (e.g. a consensus voter); a nested server would ' +
      'deadlock the parent (#4033). If you configured that CLI to launch nexus-agents as ' +
      'an MCP server, remove that entry from its MCP config.'
  );
  process.exit(EXIT_CODES.SUCCESS);
}
