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
import { formatPercentage } from '../core/index.js';
import { colors, color } from './ansi-output.js';
import { horizontalLine, boxLine, centerText } from './box-drawing.js';

// =============================================================================
// ANSI Formatting Constants (from canonical source)
// =============================================================================

const ANSI = colors;

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

  const successRate = formatPercentage(result.summary.overallSuccessRate, 1);
  lines.push(boxLine(`   Success Rate: ${successRate}`));

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
    const success = formatPercentage(model.successRate);
    lines.push(boxLine(`     reward: ${reward.padStart(5)} | success: ${success.padStart(4)}`));
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

  const expRatio = formatPercentage(bandit.explorationRatio, 1);
  const expStatus =
    bandit.explorationRatio >= 0.1 && bandit.explorationRatio <= 0.3
      ? color('(healthy)', ANSI.green)
      : color('(adjust)', ANSI.yellow);
  lines.push(boxLine(`   Exploration Ratio: ${expRatio} ${expStatus}`));

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
    const importance = formatPercentage(fi.importance, 1);
    const arrow = fi.direction === 'positive' ? color('↑', ANSI.green) : color('↓', ANSI.red);
    lines.push(boxLine(`   ${arrow} ${fi.feature.padEnd(20)} ${importance.padStart(6)}`));
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

  const correlation = formatPercentage(feedback.correlationRate, 1);
  lines.push(boxLine(`   Correlation Rate: ${correlation}`));

  // Outcome distribution
  const dist = feedback.outcomeDistribution;
  const total = dist.success + dist.partial + dist.failure;
  if (total > 0) {
    const successPct = formatPercentage(dist.success / total);
    const partialPct = formatPercentage(dist.partial / total);
    const failurePct = formatPercentage(dist.failure / total);
    lines.push(
      boxLine(
        `   Outcomes: ${color(successPct, ANSI.green)} ✓ | ` +
          `${color(partialPct, ANSI.yellow)} ~ | ` +
          `${color(failurePct, ANSI.red)} ✗`
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
