/**
 * nexus-tui — Weather command
 *
 * Surfaces CLI performance data via the weather report module.
 *
 * @module commands/weather
 */

import type { CommandHandler, CommandResult } from '../types.js';
import { formatHeader, formatTable } from '../formatter.js';

interface CliWeatherSummary {
  readonly cli: string;
  readonly totalTasks: number;
  readonly successRate: number;
}

interface WeatherSummary {
  readonly cliWeather: readonly CliWeatherSummary[];
}

/** Create the weather command handler. */
export function createWeatherCommand(): CommandHandler {
  return {
    name: 'weather',
    description: 'Show CLI weather report (success rates, routing data)',
    usage: 'weather [--cli=claude|codex|gemini] [--category=X]',
    async execute(args: readonly string[]): Promise<CommandResult> {
      try {
        const { generateWeatherReport } = await import('nexus-agents');
        const flags = extractFlags(args);
        const report = generateWeatherReport({
          ...(flags.cli !== undefined && { cli: flags.cli }),
          ...(flags.category !== undefined && { category: flags.category }),
          includeAdaptive: true,
        }) as WeatherSummary;
        return { output: formatWeather(report) };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Weather report failed: ${msg}`, isError: true };
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

function formatWeather(report: WeatherSummary): string {
  const lines: string[] = [formatHeader('CLI Weather Report')];
  if (report.cliWeather.length === 0) {
    lines.push('\n  No outcome data yet. Run some tasks first.');
    return lines.join('\n');
  }
  const rows: Array<readonly [string, string]> = report.cliWeather.map((w) => {
    const rate = `${String(Math.round(w.successRate * 100))}%`;
    return [w.cli, `${rate} success (${String(w.totalTasks)} tasks)`] as const;
  });
  lines.push('', formatTable(rows));
  return lines.join('\n');
}
