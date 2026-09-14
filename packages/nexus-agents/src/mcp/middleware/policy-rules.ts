/**
 * nexus-agents/mcp - Policy Firewall Rules
 *
 * Default policy rules and constants for the authorization layer.
 *
 * (Source: OWASP ASVS 4.0, Authorization Controls)
 */

import type { PolicyContext, PolicyDecision, PolicyRule } from './policy-types.js';
import { isPathSafe, extractPathFromArgs } from './policy-helpers.js';
import { classifyRegisteredTool, type ToolExecutionClass } from '../tools/tool-manifest.js';

// =============================================================================
// Tool Classification Constants
// =============================================================================

/**
 * GENERIC agent/filesystem tool names that are write/mutation operations.
 *
 * Not nexus tools: a registered tool is classified by its manifest entry's
 * `readOnlyHint` (#5114), and a test keeps this set disjoint from the manifest
 * so no name has two answers. These names exist for callers that evaluate the
 * firewall against tools this server does not register (proxied or upstream).
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
]);

/**
 * GENERIC agent/filesystem tool names that are read-only operations. Same
 * scope rule as {@link MUTATION_TOOLS}: never a registered nexus tool.
 */
export const READ_ONLY_TOOLS = new Set([
  'read_file',
  'list_directory',
  'search_files',
  'get_status',
]);

// =============================================================================
// Tool Classification Functions
// =============================================================================

/**
 * Classifies a tool for the mutation rule: the manifest answers for every
 * registered tool, the generic sets answer for the handful of foreign names,
 * and anything else is reported as `unclassified` rather than guessed (#5114).
 */
function classifyToolExecution(toolName: string): ToolExecutionClass {
  const registered = classifyRegisteredTool(toolName);
  if (registered !== 'unclassified') return registered;
  if (MUTATION_TOOLS.has(toolName)) return 'mutation';
  if (READ_ONLY_TOOLS.has(toolName)) return 'read-only';
  return 'unclassified';
}

/**
 * Checks if a tool is a mutation operation. Fail-closed boolean view of
 * {@link classifyToolExecution}: an unclassified tool counts as a mutation.
 * The rule itself uses the three-way class so its verdict can say which.
 */
export function isMutationTool(toolName: string): boolean {
  return classifyToolExecution(toolName) !== 'read-only';
}

// =============================================================================
// Default Policy Rules
// =============================================================================

/**
 * Policy rule that denies mutation operations when mode is 'read-only'.
 *
 * This ensures that write operations are only allowed when explicitly
 * enabled via the 'read-write' mode. Two inputs: `ctx.mode` is the permission
 * the operator granted; the tool's class comes from the manifest (#5114). An
 * unclassified tool is denied too, but the verdict SAYS it was unclassified —
 * a rollout needs to tell "a write the mode forbids" from "nobody classified
 * this", and a boolean cannot.
 */
export const denyMutationsWithoutModeRule: PolicyRule = {
  name: 'deny-mutations-without-mode',
  description: 'Blocks write operations unless mode is read-write',
  check(ctx: PolicyContext): PolicyDecision {
    // If mode is read-write, allow all operations
    if (ctx.mode === 'read-write') {
      return { allowed: true, reason: 'Read-write mode enabled' };
    }

    switch (classifyToolExecution(ctx.toolName)) {
      case 'mutation':
        return {
          allowed: false,
          reason: `Tool '${ctx.toolName}' is a mutation operation but mode is '${ctx.mode}'. Set mode to 'read-write' to enable.`,
        };
      case 'unclassified':
        return {
          allowed: false,
          reason: `Tool '${ctx.toolName}' is unclassified (no TOOL_MANIFEST readOnlyHint and not a known generic tool); denied fail-closed because mode is '${ctx.mode}'. Classify it in tool-manifest.ts or set mode to 'read-write'.`,
        };
      case 'read-only':
        return { allowed: true, reason: 'Read-only operation allowed' };
    }
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
