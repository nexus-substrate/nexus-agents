/**
 * Config Command Formatting
 *
 * Output formatting functions for config CLI commands.
 *
 * @module cli/config-command-formatting
 * (Source: Issue #360 - CLI Config Management)
 */

import { colors, writeLine, writeEmptyLine } from './ansi-output.js';

// Re-export for backward compatibility
export { colors, writeLine, writeEmptyLine };

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Formats a source label with color.
 */
export function formatSource(source: string): string {
  switch (source) {
    case 'package':
      return `${colors.dim}(default)${colors.reset}`;
    case 'env':
      return `${colors.cyan}(env)${colors.reset}`;
    case 'session':
      return `${colors.yellow}(session)${colors.reset}`;
    case 'cli':
      return `${colors.magenta}(cli)${colors.reset}`;
    case 'user_file':
      return `${colors.green}(file)${colors.reset}`;
    default:
      return `(${source})`;
  }
}

/**
 * Formats a config value for display.
 */
export function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (typeof value === 'number') {
    // Format large numbers with underscores for readability
    if (value >= 1000) {
      return value.toLocaleString('en-US');
    }
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? `${colors.green}true${colors.reset}` : `${colors.red}false${colors.reset}`;
  }
  return JSON.stringify(value);
}

/**
 * Formats a header with styling.
 */
export function formatHeader(text: string): string {
  return `${colors.bold}${text}${colors.reset}`;
}
