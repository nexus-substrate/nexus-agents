/**
 * nexus-tui — Output formatter
 *
 * Formats command results for human-readable or JSON output.
 *
 * @module formatter
 */

import type { CommandResult } from './types.js';

/** Format a command result for display. */
export function formatResult(result: CommandResult, jsonMode: boolean): string {
  if (jsonMode) {
    return JSON.stringify({ output: result.output, isError: result.isError ?? false });
  }
  if (result.isError === true) {
    return `Error: ${result.output}`;
  }
  return result.output;
}

/** Format a section header. */
export function formatHeader(title: string): string {
  const line = '-'.repeat(title.length + 4);
  return `${line}\n  ${title}\n${line}`;
}

/** Format a key-value table. */
export function formatTable(rows: ReadonlyArray<readonly [string, string]>): string {
  if (rows.length === 0) return '(empty)';
  const maxKey = Math.max(...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `  ${k.padEnd(maxKey)}  ${v}`).join('\n');
}

const BAR_WIDTH = 20;
const BAR_FILL = '#';
const BAR_EMPTY = '-';

/** Format an ASCII progress bar for a percentage (0-1). */
export function formatBar(ratio: number, width: number = BAR_WIDTH): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  const pct = `${String(Math.round(clamped * 100))}%`;
  return `[${BAR_FILL.repeat(filled)}${BAR_EMPTY.repeat(width - filled)}] ${pct}`;
}

/** Format a labeled bar chart row. */
export function formatBarRow(label: string, ratio: number, maxLabel: number): string {
  return `  ${label.padEnd(maxLabel)}  ${formatBar(ratio)}`;
}
