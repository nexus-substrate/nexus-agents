/**
 * nexus-agents setup output formatting
 *
 * Output formatting helpers for setup command.
 *
 * @module cli/setup-formatting
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 */

import { colors, symbols } from './ansi-output.js';

/**
 * Formats a status indicator.
 */
export function formatStatus(
  status: 'success' | 'failed' | 'skipped' | 'pending' | 'warning'
): string {
  switch (status) {
    case 'success':
      return `${colors.green}${symbols.check}${colors.reset}`;
    case 'failed':
      return `${colors.red}${symbols.cross}${colors.reset}`;
    case 'skipped':
    case 'warning':
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
