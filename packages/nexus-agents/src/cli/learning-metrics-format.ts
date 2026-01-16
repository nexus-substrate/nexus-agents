/**
 * nexus-agents/cli - Learning Metrics Dashboard Formatting
 *
 * ASCII rendering functions for the learning metrics dashboard.
 * Follows the same conventions as routing-audit-format.ts.
 *
 * (Source: Issue #284 - Learning metrics dashboard)
 */

import type {
  LearningMetricsResult,
  LearningMetricsOptions,
  ModelLearningStats,
  BanditProgress,
  RewardTrend,
  FeedbackLoopStats,
  FeatureImportance,
} from './learning-metrics-types.js';

// =============================================================================
// ANSI Formatting Constants
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
} as const;

function color(text: string, code: string): string {
  return `${code}${text}${ANSI.reset}`;
}

const BOX_WIDTH = 65;

function horizontalLine(char = '─'): string {
  return char.repeat(BOX_WIDTH - 2);
}

function boxLine(content: string, borderColor = ANSI.cyan): string {
  return color('│', borderColor) + content.padEnd(BOX_WIDTH - 2) + color('│', borderColor);
}

function centerText(text: string, borderColor = ANSI.cyan): string {
  const padding = Math.max(0, BOX_WIDTH - text.length - 2);
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return (
    color('│', borderColor) + ' '.repeat(left) + text + ' '.repeat(right) + color('│', borderColor)
  );
}

// =============================================================================
// Header Formatting
// =============================================================================

/**
 * Formats the dashboard header.
 */
function formatHeader(result: LearningMetricsResult): string[] {
  const lines: string[] = [];
  lines.push(color('╭' + horizontalLine() + '╮', ANSI.cyan));
  const title = `Learning Metrics Dashboard (last ${String(result.periodHours)}h)`;
  lines.push(centerText(title));
  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

// =============================================================================
// Summary Section
// =============================================================================

/**
 * Formats the summary section.
 */
function formatSummary(result: LearningMetricsResult): string[] {
  const lines: string[] = [];
  lines.push(boxLine(color(' Summary:', ANSI.bold)));

  const statusEmoji =
    result.summary.learningStatus === 'exploring'
      ? color('⚡', ANSI.yellow)
      : result.summary.learningStatus === 'exploiting'
        ? color('✓', ANSI.green)
        : color('◎', ANSI.blue);
  const status = `${statusEmoji} Learning Status: ${result.summary.learningStatus}`;
  lines.push(boxLine(`   ${status}`));

  const routings = result.summary.totalRoutings.toLocaleString();
  lines.push(boxLine(`   Total Routings: ${routings}`));

  const successRate = (result.summary.overallSuccessRate * 100).toFixed(1);
  lines.push(boxLine(`   Success Rate: ${successRate}%`));

  const avgReward = result.summary.avgReward.toFixed(3);
  lines.push(boxLine(`   Avg Reward: ${avgReward}`));

  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

// =============================================================================
// Model Statistics Section
// =============================================================================

/**
 * Formats the model statistics section.
 */
function formatModelStats(models: readonly ModelLearningStats[]): string[] {
  const lines: string[] = [];
  lines.push(boxLine(color(' Model Performance:', ANSI.bold)));

  if (models.length === 0) {
    lines.push(boxLine('   No model data available'));
    lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
    return lines;
  }

  for (const model of models) {
    const pct = model.selectionPercent.toFixed(1);
    const barLength = Math.round(model.selectionPercent * 0.2);
    const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
    lines.push(boxLine(`   ${model.name.padEnd(10)} ${bar} ${pct.padStart(5)}%`));

    const reward = model.avgReward.toFixed(2);
    const success = (model.successRate * 100).toFixed(0);
    lines.push(boxLine(`     reward: ${reward.padStart(5)} | success: ${success.padStart(3)}%`));
  }

  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

// =============================================================================
// Bandit Progress Section
// =============================================================================

/**
 * Formats the bandit progress section.
 */
function formatBanditProgress(bandit: BanditProgress): string[] {
  const lines: string[] = [];
  lines.push(boxLine(color(' LinUCB Bandit Progress:', ANSI.bold)));

  const pulls = bandit.totalPulls.toLocaleString();
  lines.push(boxLine(`   Total Pulls: ${pulls}`));

  const expRatio = (bandit.explorationRatio * 100).toFixed(1);
  const expStatus =
    bandit.explorationRatio >= 0.1 && bandit.explorationRatio <= 0.3
      ? color('(healthy)', ANSI.green)
      : color('(adjust)', ANSI.yellow);
  lines.push(boxLine(`   Exploration Ratio: ${expRatio}% ${expStatus}`));

  // Arm distribution
  if (bandit.armDistribution.length > 0) {
    lines.push(boxLine('   Arm Distribution:'));
    for (const arm of bandit.armDistribution) {
      const armPct = arm.percent.toFixed(1);
      const armBar = '█'.repeat(Math.round(arm.percent * 0.2));
      lines.push(boxLine(`     ${arm.name.padEnd(8)} ${armPct.padStart(5)}% ${armBar}`));
    }
  }

  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

// =============================================================================
// Feature Importance Section
// =============================================================================

/**
 * Formats the feature importance section.
 */
function formatFeatureImportance(features: readonly FeatureImportance[]): string[] {
  const lines: string[] = [];
  lines.push(boxLine(color(' Top Feature Importances:', ANSI.bold)));

  if (features.length === 0) {
    lines.push(boxLine('   No feature data available'));
    lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
    return lines;
  }

  for (const fi of features) {
    const importance = (fi.importance * 100).toFixed(1);
    const arrow = fi.direction === 'positive' ? color('↑', ANSI.green) : color('↓', ANSI.red);
    lines.push(boxLine(`   ${arrow} ${fi.feature.padEnd(20)} ${importance.padStart(5)}%`));
  }

  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

// =============================================================================
// Reward Trend Section
// =============================================================================

/**
 * Formats the reward trend section.
 */
function formatRewardTrend(trend: RewardTrend): string[] {
  const lines: string[] = [];
  lines.push(boxLine(color(' Reward Trend:', ANSI.bold)));

  const currentReward = trend.current.toFixed(3);
  const previousReward = trend.previous.toFixed(3);
  lines.push(boxLine(`   Current: ${currentReward} | Previous: ${previousReward}`));

  const changePct = trend.changePercent.toFixed(1);
  const trendArrow =
    trend.direction === 'improving'
      ? color('↑', ANSI.green)
      : trend.direction === 'declining'
        ? color('↓', ANSI.red)
        : color('→', ANSI.yellow);
  const changeSign = trend.changePercent >= 0 ? '+' : '';
  lines.push(boxLine(`   ${trendArrow} ${trend.direction} (${changeSign}${changePct}%)`));

  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

// =============================================================================
// Feedback Loop Section
// =============================================================================

/**
 * Formats the feedback loop statistics section.
 */
function formatFeedbackLoop(feedback: FeedbackLoopStats): string[] {
  const lines: string[] = [];
  lines.push(boxLine(color(' Feedback Loop:', ANSI.bold)));

  const decisions = feedback.totalDecisions.toLocaleString();
  const outcomes = feedback.totalOutcomes.toLocaleString();
  lines.push(boxLine(`   Decisions: ${decisions} | Outcomes: ${outcomes}`));

  const correlation = (feedback.correlationRate * 100).toFixed(1);
  lines.push(boxLine(`   Correlation Rate: ${correlation}%`));

  // Outcome distribution
  const dist = feedback.outcomeDistribution;
  const total = dist.success + dist.partial + dist.failure;
  if (total > 0) {
    const successPct = ((dist.success / total) * 100).toFixed(0);
    const partialPct = ((dist.partial / total) * 100).toFixed(0);
    const failurePct = ((dist.failure / total) * 100).toFixed(0);
    lines.push(
      boxLine(
        `   Outcomes: ${color(successPct + '%', ANSI.green)} ✓ | ` +
          `${color(partialPct + '%', ANSI.yellow)} ~ | ` +
          `${color(failurePct + '%', ANSI.red)} ✗`
      )
    );
  }

  lines.push(color('╰' + horizontalLine() + '╯', ANSI.cyan));
  return lines;
}

// =============================================================================
// Output Formatters
// =============================================================================

/**
 * Formats the complete ASCII output.
 */
export function formatAsciiOutput(
  result: LearningMetricsResult,
  options: LearningMetricsOptions
): string {
  const lines: string[] = [
    ...formatHeader(result),
    ...formatSummary(result),
    ...formatModelStats(result.models),
  ];

  if (options.banditStats) {
    lines.push(...formatBanditProgress(result.banditProgress));
    lines.push(...formatFeatureImportance(result.banditProgress.topFeatures));
  }

  if (options.showTrends) {
    lines.push(...formatRewardTrend(result.rewardTrend));
  }

  lines.push(...formatFeedbackLoop(result.feedbackLoop));

  return lines.join('\n');
}

/**
 * Formats the JSON output.
 */
export function formatJsonOutput(result: LearningMetricsResult): string {
  return JSON.stringify(result, null, 2);
}
