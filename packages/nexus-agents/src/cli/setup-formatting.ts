/**
 * nexus-agents setup output formatting
 *
 * Output formatting helpers for setup command.
 * Re-exports from consolidated ansi-output.ts for backward compatibility.
 *
 * @module cli/setup-formatting
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 */

// Re-export consolidated formatters from ansi-output.ts
export { formatStatus, formatHeader, formatCodeBlock, colors, symbols } from './ansi-output.js';

/**
 * Checks if running in interactive mode.
 */
export function isInteractive(): boolean {
  if (!process.stdout.isTTY) return false;
  if (process.env['CI'] === 'true') return false;
  if (process.env['CONTINUOUS_INTEGRATION'] !== undefined) return false;
  return true;
}
