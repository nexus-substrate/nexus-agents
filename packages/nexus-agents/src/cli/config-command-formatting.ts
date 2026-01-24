/**
 * Config Command Formatting
 *
 * ANSI colors and output formatting functions for config CLI commands.
 *
 * @module cli/config-command-formatting
 * (Source: Issue #360 - CLI Config Management)
 */

// ============================================================================
// ANSI Colors
// ============================================================================

/** ANSI color codes for terminal output. */
export const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  magenta: '\x1b[35m',
} as const;

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
 * Writes a line to stdout.
 */
export function writeLine(text: string): void {
  process.stdout.write(text + '\n');
}

/**
 * Writes an empty line.
 */
export function writeEmptyLine(): void {
  process.stdout.write('\n');
}

/**
 * Formats a header with styling.
 */
export function formatHeader(text: string): string {
  return `${colors.bold}${text}${colors.reset}`;
}
