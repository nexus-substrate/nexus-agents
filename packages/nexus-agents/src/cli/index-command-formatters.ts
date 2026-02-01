/**
 * nexus-agents/cli - Index Command Formatters
 *
 * CLI output formatting helpers for the index command.
 *
 * @module cli/index-command-formatters
 * (Source: Issue #240, extracted from index-command.ts for #272)
 */

import type { IndexCommandResult } from './index-command-types.js';
import { colors } from './ansi-output.js';

// =============================================================================
// ANSI Formatting
// =============================================================================

/** ANSI escape codes for terminal coloring - alias for backward compatibility. */
export const ANSI = colors;

// =============================================================================
// Formatting Functions
// =============================================================================

/** Formats a file list with a prefix marker, truncated to 10 items. */
export function formatFileList(
  files: readonly string[],
  label: string,
  marker: string,
  lines: string[]
): void {
  if (files.length === 0) return;
  lines.push('');
  lines.push(`  ${ANSI.yellow}${label}:${ANSI.reset}`);
  for (const file of files.slice(0, 10)) {
    lines.push(`    ${marker} ${file}`);
  }
  if (files.length > 10) {
    lines.push(`    ... and ${String(files.length - 10)} more`);
  }
}

/** Formats validation result details. */
export function formatValidationResult(
  v: NonNullable<IndexCommandResult['data']>['validationResult'],
  lines: string[]
): void {
  if (v === undefined) return;
  formatFileList(v.missingFiles, 'Missing files (in codebase but not in index)', '+', lines);
  formatFileList(v.extraFiles, 'Extra files (in index but not in codebase)', '-', lines);
  formatFileList(v.modifiedFiles, 'Modified files (line count changed)', '~', lines);
}

/**
 * Formats the command result for CLI output.
 */
export function formatIndexResult(result: IndexCommandResult): string {
  const lines: string[] = [];
  const status = result.success
    ? `${ANSI.green}${ANSI.bold}SUCCESS`
    : `${ANSI.red}${ANSI.bold}FAILED`;
  lines.push(`${status}${ANSI.reset} ${result.message}`);

  if (result.data !== undefined) {
    lines.push('');
    const d = result.data;
    if (d.filesIndexed !== undefined)
      lines.push(`  ${ANSI.cyan}Files indexed:${ANSI.reset} ${String(d.filesIndexed)}`);
    if (d.modulesFound !== undefined)
      lines.push(`  ${ANSI.cyan}Modules found:${ANSI.reset} ${String(d.modulesFound)}`);
    if (d.outputPath !== undefined)
      lines.push(`  ${ANSI.cyan}Output:${ANSI.reset} ${d.outputPath}`);
    formatValidationResult(d.validationResult, lines);
  }

  return lines.join('\n');
}
