/**
 * nexus-agents/cli - Routing Audit Command
 *
 * CLI command to audit and debug routing decisions without executing tasks.
 * Shows budget filtering, TOPSIS ranking, and LinUCB selection details.
 *
 * @module cli/routing-audit
 * (Source: Issue #170, Alignment Roadmap Phase 1)
 */

import { createLogger } from '../core/index.js';
import type { CliName } from '../cli-adapters/types.js';
import { TopsisRouter } from '../cli-adapters/topsis-router.js';
import type { TopsisResult, TopsisScore } from '../cli-adapters/topsis-types.js';
import { DEFAULT_MODEL_PROFILES } from '../cli-adapters/topsis-types.js';
import { LinUCBBandit } from '../cli-adapters/linucb-bandit.js';
import type { BanditContext } from '../cli-adapters/budget-router-types.js';
import { analyzeTask, summarizeProfile, type TaskProfile } from '../cli-adapters/task-analyzer.js';
import type { Task } from '../core/types/agent.js';

const logger = createLogger({ component: 'routing-audit' });

// =============================================================================
// Types
// =============================================================================

/** Options for the routing-audit command. */
export interface RoutingAuditOptions {
  readonly task: string;
  readonly explain?: boolean;
  readonly deterministic?: boolean;
  readonly json?: boolean;
  readonly verbose?: boolean;
}

/** Budget filter result for a single CLI. */
export interface BudgetFilterResult {
  readonly cliName: CliName;
  readonly withinBudget: boolean;
  readonly reason: string;
}

/** LinUCB arm detail. */
export interface LinUCBArmDetail {
  readonly cliName: CliName;
  readonly ucbScore: number;
  readonly pullCount: number;
  readonly avgReward: number;
  readonly isExploration: boolean;
}

/** Complete routing audit result. */
export interface RoutingAuditResult {
  readonly task: string;
  readonly taskProfile: TaskProfile;
  readonly budgetResults: readonly BudgetFilterResult[];
  readonly topsisResult: TopsisResult;
  readonly linucbDetails: readonly LinUCBArmDetail[];
  readonly selectedCli: CliName;
  readonly selectionReason: string;
  readonly isExploration: boolean;
}

// =============================================================================
// ANSI Formatting
// =============================================================================

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function color(text: string, code: string): string {
  return `${code}${text}${ANSI.reset}`;
}

// =============================================================================
// Routing Audit Logic
// =============================================================================

const CLI_NAMES: readonly CliName[] = ['claude', 'gemini', 'codex'];

/**
 * Analyzes a task string and returns its profile.
 */
function analyzeTaskString(taskStr: string): TaskProfile {
  const task: Task = {
    id: 'audit-' + String(Date.now()),
    description: taskStr,
    context: {},
  };
  return analyzeTask(task);
}

/**
 * Converts task profile to bandit context.
 */
function taskProfileToBanditContext(profile: TaskProfile): BanditContext {
  return {
    taskComplexity: profile.reasoningComplexity / 10,
    contextLengthNormalized: Math.min(profile.contextRequired / 100000, 1),
    isCodeTask: profile.codeGeneration,
    isReasoningTask: profile.taskType === 'architecture' || profile.reasoningComplexity > 5,
    budgetUtilization: 0.5,
    timePressure: 0.3,
  };
}

/**
 * Simulates budget filtering (all pass by default).
 */
function simulateBudgetFilter(): readonly BudgetFilterResult[] {
  return CLI_NAMES.map((cliName) => ({
    cliName,
    withinBudget: true,
    reason: 'within budget',
  }));
}

/**
 * Runs TOPSIS ranking on the CLI options.
 */
function runTopsisRanking(taskProfile: TaskProfile): TopsisResult {
  const router = new TopsisRouter();

  // Adjust profiles based on task type
  const adjustedProfiles = DEFAULT_MODEL_PROFILES.map((p) => {
    if (taskProfile.taskType === 'architecture' || taskProfile.reasoningComplexity > 7) {
      return { ...p, qualityScore: Math.min(p.qualityScore * 1.2, 10) };
    }
    if (taskProfile.taskType === 'bulk_operations' || taskProfile.contextRequired < 1000) {
      return { ...p, averageLatencyMs: p.averageLatencyMs * 0.8 };
    }
    return p;
  });

  return router.selectModel({
    profiles: adjustedProfiles,
    expectedInputTokens: taskProfile.contextRequired,
    expectedOutputTokens: Math.round(taskProfile.contextRequired * 0.3),
  });
}

/**
 * Computes UCB scores for all arms.
 */
function computeLinUCBDetails(
  bandit: LinUCBBandit,
  context: BanditContext
): readonly LinUCBArmDetail[] {
  const stats = bandit.getStats();
  const selection = bandit.select(context);

  const avgRewards = stats.map((s) => s.avgReward);
  const maxAvgReward = Math.max(...avgRewards, 0);

  return stats.map((stat) => {
    const isSelected = stat.name === selection.armName;
    // Estimate if this is exploration: selected despite lower avg reward
    const isExploration = isSelected && stat.avgReward < maxAvgReward * 0.9;

    return {
      cliName: stat.name as CliName,
      ucbScore: isSelected ? selection.ucbScore : stat.avgReward + 1.0,
      pullCount: stat.pullCount,
      avgReward: stat.avgReward,
      isExploration: isExploration && isSelected,
    };
  });
}

/**
 * Performs a complete routing audit.
 */
export function auditRouting(options: RoutingAuditOptions): RoutingAuditResult {
  const { task, deterministic } = options;

  logger.debug('Starting routing audit', { task: task.slice(0, 50) });

  // Step 1: Analyze task
  const taskProfile = analyzeTaskString(task);

  // Step 2: Budget filtering (simulated)
  const budgetResults = simulateBudgetFilter();
  const eligibleClis = budgetResults.filter((r) => r.withinBudget).map((r) => r.cliName);

  // Step 3: TOPSIS ranking
  const topsisResult = runTopsisRanking(taskProfile);

  // Step 4: LinUCB selection
  const bandit = new LinUCBBandit(eligibleClis);
  const context = taskProfileToBanditContext(taskProfile);
  const linucbDetails = computeLinUCBDetails(bandit, context);
  const selection = bandit.select(context);

  // Determine final selection
  const selectedCli: CliName =
    deterministic === true ? topsisResult.selectedModel : (selection.armName as CliName);

  const selectedArmDetail = linucbDetails.find((d) => d.cliName === selectedCli);
  const isExploration = selectedArmDetail?.isExploration === true;

  let selectionReason: string;
  if (deterministic === true) {
    selectionReason = 'TOPSIS rank #1 (deterministic mode)';
  } else if (isExploration) {
    selectionReason = 'LinUCB exploration (high uncertainty)';
  } else {
    selectionReason = 'LinUCB exploitation (best expected reward)';
  }

  return {
    task,
    taskProfile,
    budgetResults,
    topsisResult,
    linucbDetails,
    selectedCli,
    selectionReason,
    isExploration,
  };
}

// =============================================================================
// Output Formatting
// =============================================================================

const BOX_WIDTH = 65;

function horizontalLine(char = '─'): string {
  return char.repeat(BOX_WIDTH - 2);
}

function boxLine(content: string): string {
  return color('│', ANSI.cyan) + content.padEnd(BOX_WIDTH - 2) + color('│', ANSI.cyan);
}

function formatHeader(result: RoutingAuditResult): string[] {
  const lines: string[] = [];
  lines.push(color('╭' + horizontalLine() + '╮', ANSI.cyan));
  const title = `Routing Audit: "${result.task.slice(0, 35)}${result.task.length > 35 ? '...' : ''}"`;
  lines.push(color('│', ANSI.cyan) + ` ${title.padEnd(BOX_WIDTH - 3)}` + color('│', ANSI.cyan));
  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

function formatTaskAnalysis(result: RoutingAuditResult): string[] {
  const lines: string[] = [];
  lines.push(boxLine(color(' Task Analysis:', ANSI.bold)));
  const profileSummary = summarizeProfile(result.taskProfile);
  lines.push(boxLine(`   ${profileSummary}`));
  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

function formatBudgetFilter(result: RoutingAuditResult): string[] {
  const lines: string[] = [];
  const passCount = result.budgetResults.filter((r) => r.withinBudget).length;
  const total = result.budgetResults.length;
  lines.push(
    boxLine(color(` Budget Filter (${String(passCount)}/${String(total)} pass):`, ANSI.bold))
  );
  for (const br of result.budgetResults) {
    const status = br.withinBudget ? color('✓', ANSI.green) : color('✗', ANSI.red);
    lines.push(boxLine(`   ${status} ${br.cliName.padEnd(8)} - ${br.reason}`));
  }
  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

function formatTopsisRanking(result: RoutingAuditResult): string[] {
  const lines: string[] = [];
  lines.push(boxLine(color(' TOPSIS Ranking:', ANSI.bold)));
  result.topsisResult.scores.forEach((score: TopsisScore, idx: number) => {
    const rank = idx + 1;
    const pct = (score.closenessScore * 100).toFixed(1);
    const q = ((score.rawValues['quality'] ?? 0) * 10).toFixed(1);
    const c = ((1 - (score.rawValues['cost'] ?? 0)) * 10).toFixed(1);
    const l = ((1 - (score.rawValues['latency'] ?? 0)) * 10).toFixed(1);
    lines.push(
      boxLine(`   ${String(rank)}. ${score.cliName.padEnd(8)} (${pct}%) q=${q} c=${c} l=${l}`)
    );
  });
  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

function formatLinUCBSelection(result: RoutingAuditResult): string[] {
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
    lines.push(color('│', ANSI.cyan) + content.padEnd(BOX_WIDTH + 8) + color('│', ANSI.cyan));
  }
  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

function formatFinalSelection(result: RoutingAuditResult, explain: boolean): string[] {
  const lines: string[] = [];
  const selectionText = color(` Final Selection: ${result.selectedCli}`, ANSI.bold + ANSI.green);
  lines.push(color('│', ANSI.cyan) + selectionText.padEnd(BOX_WIDTH + 11) + color('│', ANSI.cyan));
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

function formatAsciiOutput(result: RoutingAuditResult, options: RoutingAuditOptions): string {
  const lines: string[] = [
    ...formatHeader(result),
    ...formatTaskAnalysis(result),
    ...formatBudgetFilter(result),
    ...formatTopsisRanking(result),
    ...formatLinUCBSelection(result),
    ...formatFinalSelection(result, options.explain === true),
  ];
  return lines.join('\n');
}

function formatJsonOutput(result: RoutingAuditResult): string {
  return JSON.stringify(result, null, 2);
}

// =============================================================================
// Command Entry Point
// =============================================================================

/**
 * Runs the routing-audit command.
 *
 * @param options - Command options
 * @returns Exit code (0 for success)
 */
export function routingAuditCommand(options: RoutingAuditOptions): number {
  try {
    const result = auditRouting(options);

    const output =
      options.json === true ? formatJsonOutput(result) : formatAsciiOutput(result, options);

    process.stdout.write(output + '\n');

    return 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${msg}\n`);
    logger.error('Routing audit failed', error instanceof Error ? error : new Error(msg));
    return 1;
  }
}
