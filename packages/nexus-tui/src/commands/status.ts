/**
 * nexus-tui — Status command
 *
 * Shows recent task outcomes and system status.
 *
 * @module commands/status
 */

import type { CommandHandler, CommandResult } from '../types.js';
import { formatHeader, formatTable } from '../formatter.js';
import { safeParseInt } from '../sanitize.js';

interface OutcomeRecord {
  readonly cli: string;
  readonly category: string;
  readonly success: boolean;
  readonly durationMs: number;
}

/** Create the status command handler. */
export function createStatusCommand(): CommandHandler {
  return {
    name: 'status',
    description: 'Show recent task outcomes and system status',
    usage: 'status [--limit=N]',
    async execute(args: readonly string[]): Promise<CommandResult> {
      try {
        const { getOutcomeStore } = await import('nexus-agents');
        const store = getOutcomeStore();
        const limit = extractLimit(args);
        const outcomes = store.query({}) as readonly OutcomeRecord[];
        const recent = outcomes.slice(-limit);
        return { output: formatStatus(recent, outcomes.length) };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Status check failed: ${msg}`, isError: true };
      }
    },
  };
}

function extractLimit(args: readonly string[]): number {
  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      return safeParseInt(arg.slice(8), 1, 1000) ?? 10;
    }
  }
  return 10;
}

function formatStatus(recent: readonly OutcomeRecord[], total: number): string {
  const lines = [formatHeader('Task Outcomes')];
  lines.push(`\n  Total: ${String(total)} outcomes recorded\n`);
  if (recent.length === 0) {
    lines.push('  No outcomes yet. Run some tasks first.');
    return lines.join('\n');
  }
  const rows: Array<readonly [string, string]> = recent.map((o) => [
    `${o.cli}/${o.category}`,
    `${o.success ? 'OK' : 'FAIL'} (${String(o.durationMs)}ms)`,
  ]);
  lines.push(formatTable(rows));
  return lines.join('\n');
}
