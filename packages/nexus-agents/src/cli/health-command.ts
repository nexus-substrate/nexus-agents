/**
 * nexus-agents/cli - Health Command
 *
 * Swarm health dashboard showing agent utilization, routing accuracy,
 * collaboration efficiency, and failure breakdown from weather report data.
 *
 * @module cli/health-command
 * (Source: Issue #1403)
 */

import type { ParsedCliArgs } from '../cli-types.js';
import { colors, symbols } from './ansi-output.js';
import { generateWeatherReport } from '../mcp/tools/weather-report.js';
import type {
  WeatherReportResponse,
  SwarmHealthMetrics,
  FailureBreakdownEntry,
} from '../mcp/tools/weather-report-types.js';

// ============================================================================
// Types
// ============================================================================

export interface HealthResult {
  readonly swarmHealth: SwarmHealthMetrics | undefined;
  readonly overallSuccessRate: number;
  readonly totalTasks: number;
  readonly failureBreakdown: readonly FailureBreakdownEntry[];
  readonly cliCount: number;
  readonly timestamp: string;
}

// ============================================================================
// Core Logic
// ============================================================================

/** Collects health data from weather report. Exported for testing. */
export function collectHealth(): HealthResult {
  const report: WeatherReportResponse = generateWeatherReport({});

  return {
    swarmHealth: report.swarmHealth,
    overallSuccessRate: report.overall.successRate,
    totalTasks: report.overall.totalTasks,
    failureBreakdown: report.failureBreakdown ?? [],
    cliCount: report.cliWeather.length,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Output Formatters
// ============================================================================

function renderMetricBar(value: number, max: number): string {
  const width = 20;
  const filled = Math.round((value / max) * width);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
  return bar;
}

function renderSwarmMetrics(w: (s: string) => boolean, health: SwarmHealthMetrics): void {
  const c = colors;
  const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

  w(`  ${c.bold}Swarm Health Metrics${c.reset}\n`);
  w(
    `  Agent Utilization:       ${renderMetricBar(health.agentUtilization, 1)} ${pct(health.agentUtilization)}\n`
  );
  w(
    `  Collaboration Efficiency:${renderMetricBar(health.collaborationEfficiency, 1)} ${pct(health.collaborationEfficiency)}\n`
  );
  w(
    `  Routing Accuracy:        ${renderMetricBar(health.routingAccuracy, 1)} ${pct(health.routingAccuracy)}\n`
  );
  w(`  Weekly Regret:           ${health.weeklyRegret.toFixed(3)}\n`);
  w(`  Adaptation Speed:        ${String(health.adaptationSpeed)} tasks\n`);
  w(`  Observed Categories:     ${String(health.observedCategories)}\n`);
  w(`  Observed Roles:          ${String(health.observedRoles)}\n`);
  w('\n');
}

function renderFailureBreakdown(
  w: (s: string) => boolean,
  entries: readonly FailureBreakdownEntry[]
): void {
  const c = colors;
  if (entries.length === 0) {
    w(`  ${c.green}No failures recorded${c.reset}\n\n`);
    return;
  }

  w(`  ${c.bold}Failure Breakdown${c.reset}\n`);
  for (const entry of entries) {
    const color = entry.category === 'unknown' ? c.yellow : c.dim;
    w(
      `  ${color}${entry.category.padEnd(22)}${c.reset} ${String(entry.count).padStart(4)}  (${String(entry.percentage)}%)\n`
    );
  }
  w('\n');
}

function renderTable(health: HealthResult): void {
  const c = colors;
  const s = symbols;
  const w = process.stdout.write.bind(process.stdout);

  w(`\n${c.bold}nexus-agents${c.reset}`);
  w(` ${c.dim}— Swarm Health Dashboard${c.reset}\n\n`);

  // Overall stats
  const rateColor =
    health.overallSuccessRate >= 0.8
      ? c.green
      : health.overallSuccessRate >= 0.6
        ? c.yellow
        : c.red;
  const rateSym = health.overallSuccessRate >= 0.8 ? s.check : s.warn;
  const pctStr = `${(health.overallSuccessRate * 100).toFixed(1)}%`;
  w(`  Success Rate:  ${rateColor}${pctStr}${c.reset}  ${rateSym}\n`);
  w(`  Total Tasks:   ${c.cyan}${String(health.totalTasks)}${c.reset}\n`);
  w(`  Active CLIs:   ${c.cyan}${String(health.cliCount)}${c.reset}\n\n`);

  // Swarm metrics
  if (health.swarmHealth !== undefined) {
    renderSwarmMetrics(w, health.swarmHealth);
  } else {
    w(`  ${c.dim}No swarm metrics available (requires task history)${c.reset}\n\n`);
  }

  // Failure breakdown
  renderFailureBreakdown(w, health.failureBreakdown);
}

function renderJson(health: HealthResult): void {
  process.stdout.write(JSON.stringify(health, null, 2) + '\n');
}

// ============================================================================
// Command Entry Point
// ============================================================================

/**
 * Handle the `nexus-agents health` CLI command.
 */
export function handleHealthCommand(args: ParsedCliArgs): void {
  const health = collectHealth();

  if (args.options.format === 'json') {
    renderJson(health);
  } else {
    renderTable(health);
  }
}
