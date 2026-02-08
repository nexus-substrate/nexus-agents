/**
 * nexus-tui — Watch command
 *
 * Continuously refreshes weather or outcomes data at a configurable
 * interval. Since the REPL is single-threaded, this performs a
 * one-shot snapshot and prints it; true continuous mode requires
 * the full TUI (Phase 3).
 *
 * @module commands/watch
 * (Source: Issue #873 — Observable dashboard)
 */

import type { CommandHandler, CommandResult } from '../types.js';
import { formatHeader, formatBarRow, formatTable } from '../formatter.js';

const DEFAULT_REFRESH_SEC = 5;
const VALID_TARGETS = ['weather', 'outcomes'] as const;
type WatchTarget = (typeof VALID_TARGETS)[number];

interface CliWeather {
  readonly cli: string;
  readonly totalTasks: number;
  readonly successRate: number;
}

interface WeatherReport {
  readonly cliWeather: readonly CliWeather[];
  readonly collectedAt: string;
}

/** Create the watch command handler. */
export function createWatchCommand(): CommandHandler {
  return {
    name: 'watch',
    description: 'Live snapshot of weather or outcomes (auto-refresh in Phase 3)',
    usage: 'watch <weather|outcomes> [--refresh=N]',
    async execute(args: readonly string[]): Promise<CommandResult> {
      const target = args[0];
      if (target === undefined || !isValidTarget(target)) {
        return {
          output: `Usage: watch <weather|outcomes>\nValid targets: ${VALID_TARGETS.join(', ')}`,
          isError: true,
        };
      }
      const flags = extractFlags(args);
      const refresh = parseInt(flags['refresh'] ?? String(DEFAULT_REFRESH_SEC), 10);
      try {
        const output =
          target === 'weather'
            ? await renderWeatherSnapshot(refresh)
            : await renderOutcomesSnapshot(refresh);
        return { output };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Watch failed: ${msg}`, isError: true };
      }
    },
  };
}

function isValidTarget(s: string): s is WatchTarget {
  return (VALID_TARGETS as readonly string[]).includes(s);
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

async function renderWeatherSnapshot(refresh: number): Promise<string> {
  const { generateWeatherReport } = await import('nexus-agents');
  const report = generateWeatherReport({ includeAdaptive: true }) as WeatherReport;
  const lines: string[] = [formatHeader(`Weather Snapshot (refresh: ${String(refresh)}s)`)];
  const ts = report.collectedAt;
  lines.push(`  Collected: ${ts}`);

  if (report.cliWeather.length === 0) {
    lines.push('', '  No data yet.');
    return lines.join('\n');
  }

  const maxLabel = Math.max(...report.cliWeather.map((w) => w.cli.length));
  lines.push('');
  for (const w of report.cliWeather) {
    const detail = `(${String(w.totalTasks)} tasks)`;
    lines.push(`${formatBarRow(w.cli, w.successRate, maxLabel)}  ${detail}`);
  }
  lines.push('', '  Tip: Full auto-refresh coming in Phase 3 TUI.');
  return lines.join('\n');
}

async function renderOutcomesSnapshot(refresh: number): Promise<string> {
  const { getOutcomeStore } = await import('nexus-agents');
  const store = getOutcomeStore();
  interface OutcomeRow {
    readonly cli: string;
    readonly success: boolean;
    readonly durationMs: number;
    readonly category: string;
    readonly model: string;
    readonly timestamp: string;
  }
  const all = store.query({}) as unknown as readonly OutcomeRow[];
  const lines: string[] = [formatHeader(`Outcomes Snapshot (refresh: ${String(refresh)}s)`)];
  lines.push(`  Total recorded: ${String(all.length)}`);

  if (all.length === 0) {
    lines.push('', '  No outcomes recorded yet.');
    return lines.join('\n');
  }

  // Last 5 outcomes
  const recent = all.slice(0, 5);
  lines.push('', formatHeader('Last 5 Outcomes'));
  const rows: Array<readonly [string, string]> = recent.map((o) => {
    const status = o.success ? 'OK' : 'FAIL';
    const dur = `${String(Math.round(o.durationMs))}ms`;
    return [`${o.cli}/${o.model}`, `${status} ${dur} [${o.category}]`] as const;
  });
  lines.push('', formatTable(rows));
  lines.push('', '  Tip: Full auto-refresh coming in Phase 3 TUI.');
  return lines.join('\n');
}
