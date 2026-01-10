/**
 * nexus-agents/security/sandbox - Command Allowlist
 *
 * Validates commands against an allowlist to prevent arbitrary execution.
 *
 * @module security/sandbox/command-allowlist
 * (Source: Issue #162, Alignment Roadmap Phase 4)
 */

import type { PolicyViolation } from './sandbox-types.js';

/**
 * Categories of allowed commands.
 */
export const COMMAND_CATEGORIES = {
  /** Package manager commands. */
  packageManagers: ['pnpm', 'npm', 'npx', 'yarn', 'bun'],

  /** Version control commands. */
  versionControl: ['git'],

  /** GitHub CLI. */
  github: ['gh'],

  /** Node.js runtime. */
  node: ['node', 'tsx', 'ts-node'],

  /** Build tools. */
  buildTools: ['tsc', 'esbuild', 'vite', 'turbo'],

  /** Testing tools. */
  testing: ['vitest', 'jest', 'playwright'],

  /** Linting tools. */
  linting: ['eslint', 'prettier', 'biome'],

  /** Documentation tools. */
  docs: ['typedoc'],

  /** Shell utilities (restricted). */
  shellUtils: ['echo', 'cat', 'ls', 'pwd', 'which', 'date', 'env'],
} as const;

/**
 * Flat list of all allowed commands.
 */
export const ALLOWED_COMMANDS: readonly string[] = Object.values(COMMAND_CATEGORIES).flat();

/**
 * Commands that are always denied (even if in allowlist).
 */
export const DENIED_COMMANDS: readonly string[] = [
  'rm',
  'rmdir',
  'mv',
  'cp',
  'chmod',
  'chown',
  'sudo',
  'su',
  'curl',
  'wget',
  'ssh',
  'scp',
  'rsync',
  'nc',
  'netcat',
  'ncat',
  'dd',
  'mount',
  'umount',
  'kill',
  'killall',
  'pkill',
  'reboot',
  'shutdown',
  'halt',
  'poweroff',
  'init',
  'systemctl',
  'service',
];

/**
 * Command argument patterns that are denied.
 */
export const DENIED_ARG_PATTERNS: readonly RegExp[] = [
  // Prevent command chaining
  /[;&|`$()]/,
  // Prevent redirection
  /[<>]/,
  // Prevent backgrounding
  /&$/,
  // Prevent shell expansion
  /\$\{/,
  /\$\(/,
  // Prevent here-doc/string
  /<<</,
];

/**
 * Validates a command name against the allowlist.
 */
export function validateCommand(
  command: string,
  allowedCommands: readonly string[]
): PolicyViolation | null {
  // Normalize command (remove path)
  const normalizedCommand = extractCommandName(command);

  // Check deny list first
  if (DENIED_COMMANDS.includes(normalizedCommand)) {
    return {
      type: 'command',
      denied: command,
      reason: `Command '${normalizedCommand}' is explicitly denied for security reasons`,
    };
  }

  // Check if command contains path separators (prevent ./malicious)
  if (command.includes('/') || command.includes('\\')) {
    return {
      type: 'command',
      denied: command,
      reason: 'Commands with path separators are not allowed',
    };
  }

  // Check allowlist
  const effectiveAllowlist = allowedCommands.length > 0 ? allowedCommands : ALLOWED_COMMANDS;
  if (!effectiveAllowlist.includes(normalizedCommand)) {
    return {
      type: 'command',
      denied: command,
      reason: `Command '${normalizedCommand}' is not in the allowlist`,
    };
  }

  return null;
}

/**
 * Validates command arguments for dangerous patterns.
 */
export function validateArgs(args: readonly string[]): PolicyViolation | null {
  for (const arg of args) {
    for (const pattern of DENIED_ARG_PATTERNS) {
      if (pattern.test(arg)) {
        return {
          type: 'command',
          denied: arg,
          reason: `Argument contains denied pattern: ${pattern.source}`,
        };
      }
    }
  }

  return null;
}

/**
 * Extract command name from a potentially qualified path.
 */
function extractCommandName(command: string): string {
  // Get basename
  const parts = command.split(/[/\\]/);
  const basename = parts[parts.length - 1];
  // Remove common extensions
  return basename?.replace(/\.(exe|cmd|bat|sh|bash)$/i, '') ?? command;
}

/**
 * Check if a command is in a specific category.
 */
export function isCommandInCategory(
  command: string,
  category: keyof typeof COMMAND_CATEGORIES
): boolean {
  const normalizedCommand = extractCommandName(command);
  const categoryCommands = COMMAND_CATEGORIES[category] as readonly string[];
  return categoryCommands.includes(normalizedCommand);
}

/**
 * Get the category of a command.
 */
export function getCommandCategory(command: string): keyof typeof COMMAND_CATEGORIES | null {
  const normalizedCommand = extractCommandName(command);

  for (const [category, commands] of Object.entries(COMMAND_CATEGORIES)) {
    if ((commands as readonly string[]).includes(normalizedCommand)) {
      return category as keyof typeof COMMAND_CATEGORIES;
    }
  }

  return null;
}
