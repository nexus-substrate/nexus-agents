/**
 * nexus-agents setup MCP configuration
 *
 * MCP snippet and configuration generation helpers.
 *
 * @module cli/setup-mcp
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import type { McpJsonConfig, McpServerEntry } from './setup-types.js';

/** MCP entry for nexus-agents */
export const NEXUS_AGENTS_MCP_ENTRY: McpServerEntry = {
  command: 'nexus-agents',
  args: ['--mode=server'],
};

/** MCP entry with npx for users who install globally */
export const NEXUS_AGENTS_MCP_NPX_ENTRY: McpServerEntry = {
  command: 'npx',
  args: ['-y', 'nexus-agents@latest', '--mode=server'],
};

/**
 * Generates MCP configuration snippet for user to paste.
 */
export function generateMcpSnippet(useNpx: boolean = false): string {
  const entry = useNpx ? NEXUS_AGENTS_MCP_NPX_ENTRY : NEXUS_AGENTS_MCP_ENTRY;
  const config: McpJsonConfig = {
    mcpServers: {
      'nexus-agents': entry,
    },
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Generates the full MCP JSON path based on scope.
 */
export function getMcpJsonPath(scope: 'user' | 'project', projectRoot: string): string {
  if (scope === 'project') {
    return join(projectRoot, '.mcp.json');
  }
  return join(homedir(), '.claude', 'mcp.json');
}
