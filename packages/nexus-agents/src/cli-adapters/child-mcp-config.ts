/**
 * nexus-agents/cli-adapters - Child CLI MCP Config Generator
 *
 * Generates MCP server configuration for child Claude CLI sessions so
 * spawned agents can call back into nexus-agents' MCP tools (memory,
 * research, etc.). Used by `pipeline/expert-bridge.ts` to give expert
 * agents tool access. Originally lived under `swe-bench/` (#1413);
 * relocated here in #2515 — the helper is generic CLI-spawn
 * infrastructure, not benchmark-specific.
 *
 * The generated config grants NO tool approvals. It only tells the child
 * where the nexus-agents MCP server is; whether an expert may actually call
 * one of its tools follows the host's Claude permission settings (for
 * example `defaultMode`). Measured 2026-09-24: in auto mode the calls run,
 * in default mode they are refused (#6784). An unused `allowedTools` list
 * that read like a guard but was never passed to the CLI was removed then.
 *
 * @module cli-adapters/child-mcp-config
 */

import { rm } from 'node:fs/promises';
import { rmSync, writeFileSync } from 'node:fs';
import { nexusMkdtempSync } from '../config/nexus-tmp-dir.js';
import { join } from 'node:path';
import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'swe-bench-mcp-config' });

// Async finally blocks cannot run after process.exit (#4631). One listener
// covers concurrent configs; SIGKILL cannot execute any in-process cleanup.
const activeMcpDirs = new Set<string>();

function cleanupOnExit(): void {
  for (const dir of activeMcpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error: unknown) {
      logger.debug('MCP-config exit cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * MCP server entry in Claude CLI config format.
 */
interface McpServerEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * MCP config file format for Claude CLI (--mcp-config).
 */
interface McpConfigFile {
  readonly mcpServers: Readonly<Record<string, McpServerEntry>>;
}

/**
 * Options for generating MCP config.
 */
export interface McpConfigOptions {
  /** Path to nexus-agents CLI entry point. */
  readonly cliPath?: string;
  /** Additional environment variables for the MCP server. */
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * Resolves the nexus-agents CLI path.
 * Uses the built dist/cli.js relative to this package.
 */
function resolveCliPath(override?: string): string {
  if (override !== undefined) return override;
  // Resolve relative to this file: src/swe-bench/ → dist/cli.js
  // At runtime we're in dist/swe-bench/, so go up one level
  const distDir = join(__dirname, '..');
  return join(distDir, 'cli.js');
}

/**
 * Env marker naming a child server (#6795). The child's stdio caller is an
 * expert CLI driven by a model, not the operator, so the child must not
 * measure it at tier 1; `connectTransport` reads this and records the caller
 * as unmeasured.
 */
const MCP_CHILD_ENV = 'NEXUS_MCP_CHILD';

/**
 * Builds the MCP config object for a nexus-agents server.
 */
function buildConfig(options?: McpConfigOptions): McpConfigFile {
  const cliPath = resolveCliPath(options?.cliPath);

  const entry: McpServerEntry = {
    command: 'node',
    args: [cliPath, '--mode=server'],
    // The child marker is applied LAST so caller-supplied env cannot unset it.
    env: { ...options?.env, [MCP_CHILD_ENV]: '1' },
  };

  return {
    mcpServers: {
      'nexus-agents': entry,
    },
  };
}

/**
 * Generated MCP config with path and cleanup function.
 */
export interface GeneratedMcpConfig {
  /** Path to the generated config file. */
  readonly configPath: string;
  /** Cleanup function to remove temp files. */
  readonly cleanup: () => Promise<void>;
}

/**
 * Generates an MCP config file for Claude CLI child sessions.
 *
 * Creates a temporary JSON file that can be passed to `claude --mcp-config`.
 * Returns the file path and a cleanup function.
 */
export async function generateMcpConfig(options?: McpConfigOptions): Promise<GeneratedMcpConfig> {
  const config = buildConfig(options);

  // Creation and exit registration must occur in one turn: async mkdtemp
  // can finish in its worker before JS can register cleanup (#4631).
  const tempDir = nexusMkdtempSync('nexus-mcp-');
  const configPath = join(tempDir, 'mcp-config.json');

  if (activeMcpDirs.size === 0) process.on('exit', cleanupOnExit);
  activeMcpDirs.add(tempDir);

  const cleanup = async (): Promise<void> => {
    try {
      await rm(tempDir, { recursive: true, force: true });
      activeMcpDirs.delete(tempDir);
      if (activeMcpDirs.size === 0) process.removeListener('exit', cleanupOnExit);
    } catch (e: unknown) {
      logger.debug('Best-effort cleanup failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  try {
    // An async open can create the file after exit cleanup lists an empty
    // directory, making its rmdir fail with ENOTEMPTY (#7121).
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { configPath, cleanup };
  } catch (error: unknown) {
    await cleanup();
    throw error;
  }
}
