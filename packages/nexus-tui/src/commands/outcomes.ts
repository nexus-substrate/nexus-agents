/**
 * nexus-tui — Outcomes command
 *
 * Shows task outcome history with optional filters.
 * Displays recent outcomes and aggregated performance summary.
 *
 * @module commands/outcomes
 * (Source: Issue #873 — Observable dashboard)
 */

import type { CommandHandler, CommandResult } from '../types.js';
import { formatHeader, formatTable, formatBarRow } from '../formatter.js';

/** Minimal shape of a task outcome for display. */
interface OutcomeEntry {
  readonly cli: string;
  readonly category: string;
  readonly model: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly timestamp: string;
  readonly source: string;
}

/** Aggregated stats for a group. */
interface GroupStat {
  readonly count: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
}

/** Performance summary from outcome store. */
interface PerfSummary {
  readonly totalTasks: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
  readonly byCli: ReadonlyMap<string, GroupStat>;
  readonly byCategory: ReadonlyMap<string, GroupStat>;
}

/** Create the outcomes command handler. */
export function createOutcomesCommand(): CommandHandler {
  return {
    name: 'outcomes',
    description: 'Show task outcome history and performance summary',
    usage: 'outcomes [--cli=X] [--category=Y] [--limit=N]',
    async execute(args: readonly string[]): Promise<CommandResult> {
      try {
        const { getOutcomeStore } = await import('nexus-agents');
        const store = getOutcomeStore();
        const flags = extractFlags(args);
        const query = buildQuery(flags);
        const outcomes = store.query(query) as readonly OutcomeEntry[];
        const summary = store.summarize(query) as PerfSummary;
        return { output: formatOutcomes(outcomes, summary) };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Outcomes failed: ${msg}`, isError: true };
      }
    },
  };
}

function extractFlags(args: readonly string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 0) flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    }
  }
  return flags;
}

function buildQuery(flags: Record<string, string>): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  if (flags['cli'] !== undefined) query['cli'] = flags['cli'];
  if (flags['category'] !== undefined) query['category'] = flags['category'];
  if (flags['limit'] !== undefined) query['limit'] = parseInt(flags['limit'], 10);
  return query;
}

function formatOutcomes(outcomes: readonly OutcomeEntry[], summary: PerfSummary): string {
  const lines: string[] = [formatHeader('Task Outcomes')];

  if (summary.totalTasks === 0) {
    lines.push('\n  No outcomes recorded yet. Run some tasks first.');
    return lines.join('\n');
  }

  // Summary stats
  const rate = `${String(Math.round(summary.successRate * 100))}%`;
  const avgMs = `${String(Math.round(summary.avgDurationMs))}ms`;
  lines.push(
    '',
    formatTable([
      ['Total tasks', String(summary.totalTasks)],
      ['Success rate', rate],
      ['Avg duration', avgMs],
    ])
  );

  // Per-CLI breakdown with bar charts
  if (summary.byCli.size > 0) {
    lines.push('', formatHeader('By CLI'));
    const maxLabel = Math.max(...[...summary.byCli.keys()].map((k) => k.length));
    for (const [cli, stats] of summary.byCli) {
      lines.push(formatBarRow(cli, stats.successRate, maxLabel));
    }
  }

  // Per-category breakdown
  if (summary.byCategory.size > 0) {
    lines.push('', formatHeader('By Category'));
    const maxCat = Math.max(...[...summary.byCategory.keys()].map((k) => k.length));
    for (const [cat, stats] of summary.byCategory) {
      lines.push(formatBarRow(cat, stats.successRate, maxCat));
    }
  }

  // Recent outcomes (last 10)
  const recent = outcomes.slice(0, 10);
  if (recent.length > 0) {
    lines.push('', formatHeader('Recent Outcomes'));
    const rows: Array<readonly [string, string]> = recent.map((o) => {
      const status = o.success ? 'OK' : 'FAIL';
      const dur = `${String(Math.round(o.durationMs))}ms`;
      return [`${o.cli}/${o.model}`, `${status} ${dur} [${o.category}]`] as const;
    });
    lines.push('', formatTable(rows));
  }

  return lines.join('\n');
}
