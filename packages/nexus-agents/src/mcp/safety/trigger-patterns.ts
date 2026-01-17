/**
 * nexus-agents/mcp/safety - Trigger Patterns
 *
 * Pre-defined trigger patterns for unsafe control action detection.
 * These patterns identify dangerous input patterns that could trigger hazards.
 */

import type { TriggerPattern } from './stpa-types.js';
import { ToolCategory } from './tool-categories.js';

// =============================================================================
// Path-Related Trigger Patterns
// =============================================================================

/**
 * Common trigger patterns for path-related unsafe control actions.
 */
export const PATH_TRIGGER_PATTERNS: readonly TriggerPattern[] = [
  {
    parameter: 'path',
    matchType: 'contains',
    pattern: '..',
    reason: 'Path traversal sequence detected',
  },
  {
    parameter: 'path',
    matchType: 'startsWith',
    pattern: '/etc',
    reason: 'Access to system configuration directory',
  },
  {
    parameter: 'path',
    matchType: 'startsWith',
    pattern: '/proc',
    reason: 'Access to process information pseudo-filesystem',
  },
  {
    parameter: 'path',
    matchType: 'startsWith',
    pattern: '/dev',
    reason: 'Access to device files',
  },
  {
    parameter: 'path',
    matchType: 'startsWith',
    pattern: '/root',
    reason: 'Access to root user home directory',
  },
  {
    parameter: 'file_path',
    matchType: 'contains',
    pattern: '..',
    reason: 'Path traversal sequence detected',
  },
  {
    parameter: 'filePath',
    matchType: 'contains',
    pattern: '..',
    reason: 'Path traversal sequence detected',
  },
];

// =============================================================================
// Shell-Related Trigger Patterns
// =============================================================================

/**
 * Common trigger patterns for shell-related unsafe control actions.
 */
export const SHELL_TRIGGER_PATTERNS: readonly TriggerPattern[] = [
  {
    parameter: 'command',
    matchType: 'contains',
    pattern: ';',
    reason: 'Command chaining character detected',
  },
  {
    parameter: 'command',
    matchType: 'contains',
    pattern: '|',
    reason: 'Pipe character allows command chaining',
  },
  {
    parameter: 'command',
    matchType: 'contains',
    pattern: '`',
    reason: 'Backtick allows command substitution',
  },
  {
    parameter: 'command',
    matchType: 'contains',
    pattern: '$(',
    reason: 'Command substitution syntax detected',
  },
  {
    parameter: 'command',
    matchType: 'regex',
    pattern: '\\brm\\s+-rf\\b',
    reason: 'Recursive force delete command',
  },
  {
    parameter: 'command',
    matchType: 'regex',
    pattern: '\\bsudo\\b',
    reason: 'Privilege escalation command',
  },
  {
    parameter: 'command',
    matchType: 'regex',
    pattern: '\\bcurl\\b.*\\|.*\\bsh\\b',
    reason: 'Curl to shell pipe pattern (remote code execution)',
  },
];

// =============================================================================
// Network-Related Trigger Patterns
// =============================================================================

/**
 * Common trigger patterns for network-related unsafe control actions.
 */
export const NETWORK_TRIGGER_PATTERNS: readonly TriggerPattern[] = [
  {
    parameter: 'url',
    matchType: 'startsWith',
    pattern: 'file://',
    reason: 'File protocol can access local filesystem',
  },
  {
    parameter: 'url',
    matchType: 'contains',
    pattern: '169.254.169.254',
    reason: 'AWS/cloud metadata endpoint access',
  },
  {
    parameter: 'url',
    matchType: 'contains',
    pattern: 'localhost',
    reason: 'Local service access (potential SSRF)',
  },
  {
    parameter: 'url',
    matchType: 'contains',
    pattern: '127.0.0.1',
    reason: 'Loopback address (potential SSRF)',
  },
  {
    parameter: 'url',
    matchType: 'regex',
    pattern: '^https?://10\\.',
    reason: 'Private network access (10.x.x.x)',
  },
  {
    parameter: 'url',
    matchType: 'regex',
    pattern: '^https?://192\\.168\\.',
    reason: 'Private network access (192.168.x.x)',
  },
];

// =============================================================================
// Pattern Lookup
// =============================================================================

/**
 * Gets trigger patterns applicable to a tool category.
 */
export function getTriggerPatternsForCategory(category: ToolCategory): readonly TriggerPattern[] {
  switch (category) {
    case ToolCategory.FILE_READ:
    case ToolCategory.FILE_WRITE:
    case ToolCategory.FILE_DELETE:
      return PATH_TRIGGER_PATTERNS;
    case ToolCategory.SHELL_EXECUTE:
      return SHELL_TRIGGER_PATTERNS;
    case ToolCategory.NETWORK_REQUEST:
      return NETWORK_TRIGGER_PATTERNS;
    default:
      return [];
  }
}
