/**
 * nexus-agents setup MCP configuration
 *
 * MCP configuration helpers using Claude CLI's `claude mcp` commands.
 *
 * @module cli/setup-mcp
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 */

import { execSync } from 'node:child_process';
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
 * Result of MCP configuration attempt.
 */
export interface McpConfigResult {
  success: boolean;
  alreadyConfigured: boolean;
  message: string;
}

/**
 * Checks if nexus-agents MCP server is already configured in Claude CLI.
 */
export function isMcpServerConfigured(): boolean {
  try {
    const result = execSync('claude mcp get nexus-agents', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.includes('nexus-agents');
  } catch {
    return false;
  }
}

/**
 * Removes existing MCP server configuration if present.
 */
function removeExistingMcpServer(): void {
  try {
    execSync('claude mcp remove nexus-agents -s local', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // Ignore removal errors
  }
}

/**
 * Adds MCP server to Claude CLI.
 */
function addMcpServer(useNpx: boolean): McpConfigResult {
  const entry = useNpx ? NEXUS_AGENTS_MCP_NPX_ENTRY : NEXUS_AGENTS_MCP_ENTRY;
  const jsonConfig = JSON.stringify(entry);

  try {
    execSync(`claude mcp add-json nexus-agents '${jsonConfig}'`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return {
      success: true,
      alreadyConfigured: false,
      message: 'Added nexus-agents MCP server to Claude Code',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      alreadyConfigured: false,
      message: `Failed to add MCP server: ${errorMsg}`,
    };
  }
}

/**
 * Configures nexus-agents MCP server using Claude CLI.
 *
 * Uses `claude mcp add-json` to register the server.
 */
export function configureMcpServer(
  useNpx: boolean = false,
  force: boolean = false
): McpConfigResult {
  const isConfigured = isMcpServerConfigured();

  // Check if already configured
  if (!force && isConfigured) {
    return {
      success: true,
      alreadyConfigured: true,
      message: 'nexus-agents MCP server already configured (use --force to reconfigure)',
    };
  }

  // Remove existing if forcing
  if (force && isConfigured) {
    removeExistingMcpServer();
  }

  return addMcpServer(useNpx);
}

/**
 * Generates MCP configuration snippet for manual setup (fallback).
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
 * Generates the full MCP JSON path based on scope (legacy, for reference).
 */
export function getMcpJsonPath(scope: 'user' | 'project', projectRoot: string): string {
  if (scope === 'project') {
    return join(projectRoot, '.mcp.json');
  }
  return join(homedir(), '.claude', 'mcp.json');
}

// ============================================================================
// Hook Configuration (Issue #411, #416)
// ============================================================================

/**
 * Generates hook configuration for Claude CLI settings.json.
 * (Source: Issue #411 - Claude CLI Hook Integration)
 */
export function generateHookConfig(): HookSettingsConfig {
  return {
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              command: 'nexus-agents hooks session-start',
            },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: 'nexus-agents hooks pre-tool --tool Bash --validate',
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: 'nexus-agents hooks post-tool --track-metrics',
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command: 'nexus-agents hooks stop --check-tasks',
            },
          ],
        },
      ],
    },
  };
}

/**
 * Hook command entry structure.
 */
interface HookCommandEntry {
  type: 'command';
  command: string;
}

/**
 * Hook matcher entry structure.
 */
interface HookMatcherEntry {
  matcher?: string;
  hooks: HookCommandEntry[];
}

/**
 * Hook settings configuration structure.
 */
export interface HookSettingsConfig {
  hooks: {
    SessionStart?: HookMatcherEntry[];
    SessionEnd?: HookMatcherEntry[];
    PreToolUse?: HookMatcherEntry[];
    PostToolUse?: HookMatcherEntry[];
    Stop?: HookMatcherEntry[];
  };
}

/**
 * Result of hook configuration attempt.
 */
export interface HookConfigResult {
  success: boolean;
  alreadyConfigured: boolean;
  message: string;
}

/**
 * Checks if hooks are already configured in Claude CLI settings.
 */
export function areHooksConfigured(): boolean {
  try {
    const result = execSync('claude config get hooks', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // If we get output that includes nexus-agents, hooks are configured
    return result.includes('nexus-agents');
  } catch {
    return false;
  }
}

/**
 * Configures hooks in Claude CLI settings.
 * Uses `claude config set hooks` to register hook commands.
 */
export function configureHooks(force: boolean = false): HookConfigResult {
  const isConfigured = areHooksConfigured();

  if (!force && isConfigured) {
    return {
      success: true,
      alreadyConfigured: true,
      message: 'Hooks already configured (use --force to reconfigure)',
    };
  }

  const hookConfig = generateHookConfig();

  try {
    // Use claude config set to add hooks
    const configJson = JSON.stringify(hookConfig.hooks);
    execSync(`claude config set hooks '${configJson}'`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return {
      success: true,
      alreadyConfigured: false,
      message: 'Configured nexus-agents hooks in Claude Code settings',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      alreadyConfigured: false,
      message: `Failed to configure hooks: ${errorMsg}`,
    };
  }
}

/**
 * Generates hook configuration snippet for manual setup.
 */
export function generateHookSnippet(): string {
  const config = generateHookConfig();
  return JSON.stringify(config, null, 2);
}
