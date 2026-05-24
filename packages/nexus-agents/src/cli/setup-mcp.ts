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
 * Generates the full MCP config path based on scope.
 *
 * Claude Code uses:
 * - Project scope: `.mcp.json` in project root
 * - User scope: `~/.claude.json` (stores MCP config under `projects` key)
 */
export function getMcpJsonPath(scope: 'user' | 'project', projectRoot: string): string {
  if (scope === 'project') {
    return join(projectRoot, '.mcp.json');
  }
  return join(homedir(), '.claude.json');
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
 * Detailed result of reading existing hooks. Distinguishes "no hooks set" from
 * "the claude CLI returned content we couldn't parse" — they look the same to
 * `getExistingHooks()` (both undefined) but mean very different things to the
 * caller. Closes #2975: collapsing both into undefined caused `configureHooks`
 * to silently overwrite the user's existing hooks when the claude CLI's JSON
 * shape drifted (regressed #420 on the parse-failure path).
 */
export type ReadHooksResult =
  | { kind: 'absent' }
  | { kind: 'present'; hooks: HookSettingsConfig['hooks'] }
  | { kind: 'unreadable'; reason: string }
  | { kind: 'parse_failed'; reason: string; raw: string };

/**
 * Reads existing hooks from Claude CLI settings with full result detail.
 * Callers should branch on `kind` before deciding whether to merge or abort.
 */
export function readExistingHooks(): ReadHooksResult {
  let raw: string;
  try {
    raw = execSync('claude config get hooks', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    return { kind: 'unreadable', reason: getErrorMessage(error) };
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
    return { kind: 'absent' };
  }
  try {
    return { kind: 'present', hooks: JSON.parse(trimmed) as HookSettingsConfig['hooks'] };
  } catch (error) {
    return { kind: 'parse_failed', reason: getErrorMessage(error), raw: trimmed };
  }
}

/**
 * Reads existing hooks from Claude CLI settings.
 *
 * Returns parsed hooks object or undefined if no hooks exist, the CLI call
 * fails, or the response cannot be parsed. Loses the distinction between
 * those cases — for the merge-vs-abort decision in `configureHooks` use
 * `readExistingHooks()` directly. Kept for backward compatibility.
 */
export function getExistingHooks(): HookSettingsConfig['hooks'] | undefined {
  const result = readExistingHooks();
  return result.kind === 'present' ? result.hooks : undefined;
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

  // Read existing hooks first to merge (Issue #420). Closes #2975: on
  // parse_failed we MUST NOT proceed — silently overwriting an unparseable
  // response is exactly how user hooks got wiped after claude-cli JSON-shape
  // drifts. Surface the problem so the operator can fix the underlying
  // condition (or pass --force after backing up their hooks).
  const existing = readExistingHooks();
  if (existing.kind === 'parse_failed') {
    return {
      success: false,
      alreadyConfigured: false,
      message:
        'Refusing to configure hooks: existing hooks could not be parsed. ' +
        'Overwriting would wipe your current settings. ' +
        `Inspect with \`claude config get hooks\` and resolve manually. (parse error: ${existing.reason})`,
    };
  }
  const existingHooks = existing.kind === 'present' ? existing.hooks : undefined;

  try {
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
