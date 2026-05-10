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
 * @module cli-adapters/child-mcp-config
 */

import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'swe-bench-mcp-config' });

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
  /** Custom allowed tools (default: read-only subset). */
  readonly allowedTools?: readonly string[];
}

/** Default read-only tools available to SWE-bench child sessions. */
const DEFAULT_ALLOWED_TOOLS: readonly string[] = [
  'memory_query',
  'memory_stats',
  'research_query',
  'research_discover',
  'weather_report',
  'delegate_to_model',
];

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
 * Builds the MCP config object for a nexus-agents server.
 */
function buildConfig(options?: McpConfigOptions): McpConfigFile {
  const cliPath = resolveCliPath(options?.cliPath);
  const tools = options?.allowedTools ?? DEFAULT_ALLOWED_TOOLS;

  const entry: McpServerEntry = {
    command: 'node',
    args: [cliPath, '--mode=server'],
    ...(options?.env !== undefined ? { env: options.env } : {}),
  };

  return {
    mcpServers: {
      'nexus-agents': entry,
    },
  };

  // Note: tool allowlisting is handled by Claude CLI's --allowedTools flag,
  // not in the MCP config itself. The caller should pass tools separately.
  void tools;
}

/**
 * Generated MCP config with path and cleanup function.
 */
export interface GeneratedMcpConfig {
  /** Path to the generated config file. */
  readonly configPath: string;
  /** Cleanup function to remove temp files. */
  readonly cleanup: () => Promise<void>;
  /** Allowed tools list for --allowedTools flag. */
  readonly allowedTools: readonly string[];
}

/**
 * Generates an MCP config file for Claude CLI child sessions.
 *
 * Creates a temporary JSON file that can be passed to `claude --mcp-config`.
 * Returns the file path and a cleanup function.
 */
export async function generateMcpConfig(options?: McpConfigOptions): Promise<GeneratedMcpConfig> {
  const config = buildConfig(options);
  const tools = options?.allowedTools ?? DEFAULT_ALLOWED_TOOLS;

  const tempDir = await mkdtemp(join(tmpdir(), 'nexus-mcp-'));
  const configPath = join(tempDir, 'mcp-config.json');

  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

  const cleanup = async (): Promise<void> => {
    await rm(tempDir, { recursive: true, force: true }).catch((e: unknown) => {
      logger.debug('Best-effort cleanup failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    });
  };

  return { configPath, cleanup, allowedTools: tools };
}

/**
 * Gets the default allowed tools for SWE-bench MCP sessions.
 */
export function getDefaultAllowedTools(): readonly string[] {
  return DEFAULT_ALLOWED_TOOLS;
}
