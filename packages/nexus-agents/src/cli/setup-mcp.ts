/**
 * nexus-agents setup MCP configuration
 *
 * MCP configuration helpers using Claude CLI's `claude mcp` commands.
 *
 * @module cli/setup-mcp
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 */

import { execSync, execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { McpJsonConfig, McpServerEntry } from './setup-types.js';
import { getErrorMessage } from '../core/index.js';

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
 * Maps scope option to Claude CLI `-s` flag value.
 */
function scopeToFlag(scope: 'user' | 'project'): string {
  return scope === 'project' ? 'local' : 'user';
}

/**
 * Removes existing MCP server configuration if present.
 */
function removeExistingMcpServer(scope: 'user' | 'project' = 'user'): void {
  try {
    execSync(`claude mcp remove nexus-agents -s ${scopeToFlag(scope)}`, {
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
function addMcpServer(useNpx: boolean, scope: 'user' | 'project' = 'user'): McpConfigResult {
  const entry = useNpx ? NEXUS_AGENTS_MCP_NPX_ENTRY : NEXUS_AGENTS_MCP_ENTRY;
  const jsonConfig = JSON.stringify(entry);
  const scopeLabel = scope === 'project' ? 'project' : 'global';

  try {
    execFileSync(
      'claude',
      ['mcp', 'add-json', 'nexus-agents', jsonConfig, '-s', scopeToFlag(scope)],
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    return {
      success: true,
      alreadyConfigured: false,
      message: `Added nexus-agents MCP server to Claude Code (${scopeLabel})`,
    };
  } catch (error) {
    const errorMsg = getErrorMessage(error);
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
 * @param scope - 'user' for global (~/.claude/mcp.json), 'project' for local (.mcp.json)
 */
export function configureMcpServer(
  useNpx: boolean = false,
  force: boolean = false,
  scope: 'user' | 'project' = 'user'
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
    removeExistingMcpServer(scope);
  }

  return addMcpServer(useNpx, scope);
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
 * Reads existing hooks from Claude CLI settings.
 * Returns parsed hooks object or undefined if no hooks exist or parse fails.
 */
export function getExistingHooks(): HookSettingsConfig['hooks'] | undefined {
  try {
    const result = execSync('claude config get hooks', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const trimmed = result.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
      return undefined;
    }
    return JSON.parse(trimmed) as HookSettingsConfig['hooks'];
  } catch {
    return undefined;
  }
}

/**
 * Merges two hook arrays, combining entries without duplicating nexus-agents hooks.
 */
function mergeHookArrays(
  existing: HookMatcherEntry[] | undefined,
  newHooks: HookMatcherEntry[]
): HookMatcherEntry[] {
  if (!existing || existing.length === 0) {
    return newHooks;
  }

  // Filter out any existing nexus-agents hooks to avoid duplicates
  const filteredExisting = existing.filter((entry) => {
    return !entry.hooks.some((h) => h.command.startsWith('nexus-agents'));
  });

  // Combine existing (non-nexus) hooks with new nexus-agents hooks
  return [...filteredExisting, ...newHooks];
}

/**
 * Merges nexus-agents hooks with existing hooks configuration.
 * Preserves existing user hooks while adding/updating nexus-agents hooks.
 */
export function mergeHookConfigs(
  existing: HookSettingsConfig['hooks'] | undefined,
  newConfig: HookSettingsConfig['hooks']
): HookSettingsConfig['hooks'] {
  if (!existing) {
    return newConfig;
  }

  const hookTypes = ['SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse', 'Stop'] as const;

  const merged: HookSettingsConfig['hooks'] = {};

  for (const hookType of hookTypes) {
    const existingHooks = existing[hookType];
    const newHooks = newConfig[hookType];

    if (newHooks) {
      merged[hookType] = mergeHookArrays(existingHooks, newHooks);
    } else if (existingHooks) {
      merged[hookType] = existingHooks;
    }
  }

  return merged;
}

/**
 * Configures hooks in Claude CLI settings.
 * Uses `claude config set hooks` to register hook commands.
 * Merges with existing hooks instead of overwriting them (Issue #420).
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

  const nexusHookConfig = generateHookConfig();

  try {
    // Read existing hooks first to merge (Issue #420)
    const existingHooks = getExistingHooks();
    const mergedHooks = mergeHookConfigs(existingHooks, nexusHookConfig.hooks);

    // Use claude config set with merged hooks
    const configJson = JSON.stringify(mergedHooks);
    execFileSync('claude', ['config', 'set', 'hooks', configJson], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return {
      success: true,
      alreadyConfigured: false,
      message: existingHooks
        ? 'Merged nexus-agents hooks with existing hooks in Claude Code settings'
        : 'Configured nexus-agents hooks in Claude Code settings',
    };
  } catch (error) {
    const errorMsg = getErrorMessage(error);
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
