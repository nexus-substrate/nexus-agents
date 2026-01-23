/**
 * nexus-agents setup output formatting
 *
 * Output formatting helpers for setup command.
 *
 * @module cli/setup-formatting
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 */

/** ANSI color codes */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

/** Platform-appropriate symbols */
const symbols = {
  check: process.platform === 'win32' ? '√' : '✓',
  cross: process.platform === 'win32' ? '×' : '✗',
  warn: process.platform === 'win32' ? '!' : '⚠',
  arrow: process.platform === 'win32' ? '->' : '→',
};

/**
 * Formats a status indicator.
 */
export function formatStatus(status: 'success' | 'failed' | 'skipped' | 'pending'): string {
  switch (status) {
    case 'success':
      return `${colors.green}${symbols.check}${colors.reset}`;
    case 'failed':
      return `${colors.red}${symbols.cross}${colors.reset}`;
    case 'skipped':
      return `${colors.yellow}${symbols.warn}${colors.reset}`;
    case 'pending':
      return `${colors.dim}○${colors.reset}`;
  }
}

/**
 * Formats a section header.
 */
export function formatHeader(text: string): string {
  return `${colors.bold}${text}${colors.reset}`;
}

/**
 * Formats a code block for terminal output.
 */
export function formatCodeBlock(code: string): string {
  const lines = code.split('\n');
  return lines.map((line) => `  ${colors.dim}${line}${colors.reset}`).join('\n');
}

/**
 * Checks if running in interactive mode.
 */
export function isInteractive(): boolean {
  if (!process.stdout.isTTY) return false;
  if (process.env['CI'] === 'true') return false;
  if (process.env['CONTINUOUS_INTEGRATION'] !== undefined) return false;
  return true;
}
