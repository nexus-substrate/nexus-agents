/**
 * Routing Audit Formatting
 *
 * Output formatting functions for the routing-audit CLI command.
 *
 * @module cli/routing-audit-format
 * (Source: Issue #170, Alignment Roadmap Phase 1)
 */

import { summarizeTaskProfile, formatPercentage } from '../core/index.js';
import type { TopsisScore } from '../cli-adapters/topsis-types.js';
import type {
  RoutingAuditOptions,
  RoutingAuditResult,
  BanditStats,
} from './routing-audit-types.js';
import { ANSI, color, BOX_WIDTH, horizontalLine, boxLine } from './routing-audit-types.js';

// =============================================================================
// Header & Task Analysis Formatting
// =============================================================================

/**
 * Formats the audit header section.
 */
export function formatHeader(result: RoutingAuditResult): string[] {
  const lines: string[] = [];
  lines.push(color('╭' + horizontalLine() + '╮', ANSI.cyan));
  const title = `Routing Audit: "${result.task.slice(0, 35)}${result.task.length > 35 ? '...' : ''}"`;
  lines.push(color('│', ANSI.cyan) + ` ${title.padEnd(BOX_WIDTH - 3)}` + color('│', ANSI.cyan));
  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

/**
 * Formats the task analysis section.
 */
/**
 * Pack `a | b | c` segments into lines no wider than `width` (#4913).
 *
 * `summarizeTaskProfile` returns a single pipe-joined string that reached 78
 * display columns in a 63-column box. ANSI-aware padding cannot help there —
 * the content genuinely does not fit — so the caller splits it, which is the
 * one honest option that neither truncates nor spills.
 *
 * A single segment longer than `width` is emitted on its own line rather than
 * broken mid-word; it will still overflow, and that is visible rather than
 * silently cut.
 */
function wrapPipeSeparated(text: string, width: number): string[] {
  const segments = text.split(' | ');
  const lines: string[] = [];
  let current = '';
  for (const segment of segments) {
    const candidate = current === '' ? segment : `${current} | ${segment}`;
    if (current !== '' && candidate.length > width) {
      lines.push(current);
      current = segment;
    } else {
      current = candidate;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

export function formatTaskAnalysis(result: RoutingAuditResult): string[] {
  const lines: string[] = [];
  lines.push(boxLine(color(' Task Analysis:', ANSI.bold)));
  const profileSummary = summarizeTaskProfile(result.taskProfile);
  for (const segment of wrapPipeSeparated(profileSummary, BOX_WIDTH - 5)) {
    lines.push(boxLine(`   ${segment}`));
  }
  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

// =============================================================================
// Budget & TOPSIS Formatting
// =============================================================================

/**
 * Formats the budget filter section.
 */
export function formatBudgetFilter(result: RoutingAuditResult): string[] {
  const lines: string[] = [];
  const passCount = result.budgetResults.filter((r) => r.withinBudget).length;
  const total = result.budgetResults.length;
  // #4843: `simulateBudgetFilter` passes every CLI unconditionally — no cost
  // estimate, no token count, no config read. The source is candid about that
  // (the function name, its JSDoc, the call-site comment), but none of it
  // reached the terminal, so this stage rendered identically to the TOPSIS and
  // LinUCB stages beside it, which construct real routers. Say it here, where
  // the reader is.
  // Two lines, not one: `boxLine` pads to BOX_WIDTH - 2 = 63 and `padEnd`
  // silently no-ops past that, so the 82-character single line this started as
  // pushed the right border off the box on every render.
  lines.push(
    boxLine(color(` Budget Filter (${String(passCount)}/${String(total)} pass):`, ANSI.bold))
  );
  lines.push(boxLine(color('   [simulated — not evaluated against cost or config]', ANSI.dim)));
  for (const br of result.budgetResults) {
    const status = br.withinBudget ? color('✓', ANSI.green) : color('✗', ANSI.red);
    lines.push(boxLine(`   ${status} ${br.cliName.padEnd(8)} - ${br.reason}`));
  }
  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

/**
 * Formats the TOPSIS ranking section.
 */
export function formatTopsisRanking(result: RoutingAuditResult): string[] {
  const lines: string[] = [];
  lines.push(boxLine(color(' TOPSIS Ranking:', ANSI.bold)));
  result.topsisResult.scores.forEach((score: TopsisScore, idx: number) => {
    const rank = idx + 1;
    const pct = formatPercentage(score.closenessScore, 1);
    const q = ((score.rawValues['quality'] ?? 0) * 10).toFixed(1);
    const c = ((1 - (score.rawValues['cost'] ?? 0)) * 10).toFixed(1);
    const l = ((1 - (score.rawValues['latency'] ?? 0)) * 10).toFixed(1);
    lines.push(
      boxLine(`   ${String(rank)}. ${score.cliName.padEnd(8)} (${pct}) q=${q} c=${c} l=${l}`)
    );
  });
  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

// =============================================================================
// LinUCB Selection Formatting
// =============================================================================

/**
 * Formats the LinUCB selection section.
 */
export function formatLinUCBSelection(result: RoutingAuditResult): string[] {
  const lines: string[] = [];
  lines.push(boxLine(color(' LinUCB Selection:', ANSI.bold)));
  for (const arm of result.linucbDetails) {
    const marker =
      arm.cliName === result.selectedCli
        ? arm.isExploration
          ? color('← explore', ANSI.yellow)
          : color('← exploit', ANSI.green)
        : '';
    const ucb = arm.ucbScore.toFixed(2);
    const pulls = String(arm.pullCount);
    const content = `   ${arm.cliName.padEnd(8)} UCB: ${ucb.padStart(5)} pulls: ${pulls.padStart(3)} ${marker}`;
    lines.push(boxLine(content));
  }
  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

/**
 * Formats the final selection section.
 */
export function formatFinalSelection(result: RoutingAuditResult, explain: boolean): string[] {
  const lines: string[] = [];
  const selectionText = color(` Final Selection: ${result.selectedCli}`, ANSI.bold + ANSI.green);
  lines.push(boxLine(selectionText));
  lines.push(boxLine(`   Reason: ${result.selectionReason}`));
  lines.push(color('╰' + horizontalLine() + '╯', ANSI.cyan));

  if (explain) {
    lines.push('');
    lines.push(color('Explanation:', ANSI.bold));
    lines.push('  1. Task analyzed for complexity, code generation needs, and context size');
    lines.push('  2. All CLIs checked against budget constraints (tokens, cost, latency)');
    lines.push('  3. TOPSIS ranks CLIs by weighted criteria (quality 50%, cost 30%, latency 20%)');
    lines.push('  4. LinUCB balances exploitation (best known) vs exploration (uncertain)');
    lines.push(`  5. Final selection: ${result.selectedCli} via ${result.selectionReason}`);
  }

  return lines;
}

// =============================================================================
// Bandit Stats Formatting (Issue #174)
// =============================================================================

/**
 * Formats bandit stats header.
 */
function formatBanditStatsHeader(): string[] {
  return [
    '',
    color('╭' + horizontalLine() + '╮', ANSI.yellow),
    boxLine(color(' LinUCB Detailed Statistics (--bandit-stats)', ANSI.bold), ANSI.yellow),
    color('├' + horizontalLine() + '┤', ANSI.yellow),
  ];
}

/**
 * Formats exploration stats section.
 */
function formatExplorationSection(stats: BanditStats): string[] {
  const lines: string[] = [];
  const ratio = formatPercentage(stats.exploration.explorationRatio, 1);
  const pulls = String(stats.exploration.totalPulls);

  lines.push(
    color('│', ANSI.yellow) +
      ` Exploration: ${ratio} ratio, ${pulls} total pulls`.padEnd(BOX_WIDTH - 2) +
      color('│', ANSI.yellow)
  );

  lines.push(
    color('│', ANSI.yellow) + ' Arm Distribution:'.padEnd(BOX_WIDTH - 2) + color('│', ANSI.yellow)
  );

  for (const arm of stats.exploration.armDistribution) {
    const pct = formatPercentage(arm.proportion, 1);
    const bar = '█'.repeat(Math.round(arm.proportion * 20));
    lines.push(
      color('│', ANSI.yellow) +
        `   ${arm.name.padEnd(8)} ${pct.padStart(6)} ${bar}`.padEnd(BOX_WIDTH - 2) +
        color('│', ANSI.yellow)
    );
  }

  lines.push(color('├' + horizontalLine() + '┤', ANSI.yellow));
  return lines;
}

/**
 * Formats feature importance section.
 */
function formatFeatureImportanceSection(stats: BanditStats): string[] {
  const lines: string[] = [];

  lines.push(boxLine(color(' Feature Importance by Arm:', ANSI.bold), ANSI.yellow));

  for (const arm of stats.detailedArms) {
    lines.push(boxLine(`   ${color(arm.cliName, ANSI.cyan)}:`, ANSI.yellow));
    const top3 = arm.featureImportance.slice(0, 3);
    for (const fi of top3) {
      const pct = formatPercentage(fi.importance, 1);
      lines.push(
        color('│', ANSI.yellow) +
          `     ${fi.feature.padEnd(18)} ${pct.padStart(6)}`.padEnd(BOX_WIDTH - 2) +
          color('│', ANSI.yellow)
      );
    }
  }

  lines.push(color('╰' + horizontalLine() + '╯', ANSI.yellow));
  return lines;
}

/**
 * Formats bandit statistics for detailed ML observability (Issue #174).
 */
export function formatBanditStats(result: RoutingAuditResult): string[] {
  if (result.banditStats === undefined) return [];

  return [
    ...formatBanditStatsHeader(),
    ...formatExplorationSection(result.banditStats),
    ...formatFeatureImportanceSection(result.banditStats),
  ];
}

// =============================================================================
// Output Formatters
// =============================================================================

/**
 * Formats the complete ASCII output.
 */
export function formatAsciiOutput(
  result: RoutingAuditResult,
  options: RoutingAuditOptions
): string {
  const lines: string[] = [
    ...formatHeader(result),
    ...formatTaskAnalysis(result),
    ...formatBudgetFilter(result),
    ...formatTopsisRanking(result),
    ...formatLinUCBSelection(result),
    ...formatFinalSelection(result, options.explain === true),
    ...formatBanditStats(result),
  ];
  return lines.join('\n');
}

/**
 * Formats the JSON output.
 */
export function formatJsonOutput(result: RoutingAuditResult): string {
  return JSON.stringify(result, null, 2);
}
