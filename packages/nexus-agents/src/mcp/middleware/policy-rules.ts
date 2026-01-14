/**
 * nexus-agents/mcp - Policy Firewall Rules
 *
 * Default policy rules and constants for the authorization layer.
 *
 * (Source: OWASP ASVS 4.0, Authorization Controls)
 */

import type { PolicyContext, PolicyDecision, PolicyRule } from './policy-types.js';
import { isPathSafe, extractPathFromArgs } from './policy-helpers.js';

// =============================================================================
// Tool Classification Constants
// =============================================================================

/**
 * Tools that are considered write/mutation operations.
 */
export const MUTATION_TOOLS = new Set([
  'write_file',
  'edit_file',
  'delete_file',
  'create_directory',
  'remove_directory',
  'execute_command',
  'run_shell',
  'bash',
  'create_expert',
  'run_workflow',
]);

/**
 * Tools that are considered read-only operations.
 */
export const READ_ONLY_TOOLS = new Set([
  'read_file',
  'list_directory',
  'search_files',
  'get_status',
  'orchestrate',
  'delegate_to_model',
]);

// =============================================================================
// Tool Classification Functions
// =============================================================================

/**
 * Checks if a tool is a mutation operation.
 */
export function isMutationTool(toolName: string): boolean {
  // Check explicit mutation tools
  if (MUTATION_TOOLS.has(toolName)) {
    return true;
  }

  // Check explicit read-only tools
  if (READ_ONLY_TOOLS.has(toolName)) {
    return false;
  }

  // Default to treating unknown tools as mutations (safe default)
  return true;
}

// =============================================================================
// Default Policy Rules
// =============================================================================

/**
 * Policy rule that denies mutation operations when mode is 'read-only'.
 *
 * This ensures that write operations are only allowed when explicitly
 * enabled via the 'read-write' mode.
 */
export const denyMutationsWithoutModeRule: PolicyRule = {
  name: 'deny-mutations-without-mode',
  description: 'Blocks write operations unless mode is read-write',
  check(ctx: PolicyContext): PolicyDecision {
    // If mode is read-write, allow all operations
    if (ctx.mode === 'read-write') {
      return { allowed: true, reason: 'Read-write mode enabled' };
    }

    // Check if this is a mutation tool
    if (isMutationTool(ctx.toolName)) {
      return {
        allowed: false,
        reason: `Tool '${ctx.toolName}' is a mutation operation but mode is '${ctx.mode}'. Set mode to 'read-write' to enable.`,
      };
    }

    // Read-only tool in read-only mode is allowed
    return { allowed: true, reason: 'Read-only operation allowed' };
  },
};

/**
 * Policy rule that validates paths against allowed roots.
 *
 * Prevents path traversal attacks by ensuring all file operations
 * target paths within configured allowed directories.
 */
export const safePathsRule: PolicyRule = {
  name: 'safe-paths',
  description: 'Validates paths against allowed root directories',
  check(ctx: PolicyContext): PolicyDecision {
    // Extract path from arguments
    const targetPath = extractPathFromArgs(ctx.args);

    // If no path in args, allow (not a file operation)
    if (targetPath === undefined) {
      return { allowed: true, reason: 'No path argument found' };
    }

    // Check for obvious path traversal attempts
    if (targetPath.includes('..')) {
      return {
        allowed: false,
        reason: `Path contains '..' which may indicate path traversal: ${targetPath}`,
      };
    }

    // Get allowed paths from context or use default
    const allowedPaths = ctx.allowedPaths ?? ['./'];

    // Validate path is within allowed roots
    if (!isPathSafe(targetPath, allowedPaths)) {
      return {
        allowed: false,
        reason: `Path '${targetPath}' is outside allowed directories: ${allowedPaths.join(', ')}`,
      };
    }

    return { allowed: true, reason: 'Path is within allowed directories' };
  },
};
