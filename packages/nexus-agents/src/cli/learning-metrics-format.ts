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
import { formatBanditReconstruction } from './bandit-reconstruction-format.js';
import {
  BANDIT_INTERCEPT_NOTE,
  formatBanditFeatureLabel,
  isBanditInterceptFeature,
} from '../cli-adapters/linucb-math.js';

// =============================================================================
// ANSI Formatting Constants (from canonical source)
// =============================================================================

const ANSI = colors;

/** Rendered for a routing-sourced value when no routing was recorded (#7180). */
const UNMEASURED_NO_ROUTINGS = 'unmeasured (0 routings)';

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

/** Status glyph and text for the summary's Learning Status line. */
function formatLearningStatus(result: LearningMetricsResult): {
  statusEmoji: string;
  statusText: string;
} {
  // '?' for unmeasured, never the green ✓ (#5267). The ternary chain used to
  // fall through to '◎' for anything not exploring/exploiting, so a new state
  // would have been rendered as a normal phase; unmeasured is not a phase.
  const statusEmoji =
    result.summary.learningStatus === 'unmeasured'
      ? color('?', ANSI.dim)
      : result.summary.learningStatus === 'exploring'
        ? color('⚡', ANSI.yellow)
        : result.summary.learningStatus === 'exploiting'
          ? color('✓', ANSI.green)
          : color('◎', ANSI.blue);
  const statusText =
    result.summary.learningStatus === 'reconstructed' && result.banditReconstruction !== undefined
      ? `reconstructed (${String(result.banditReconstruction.empiricalOutcomesReplayed)} empirical outcomes)`
      : result.summary.learningStatus === 'unmeasured'
        ? result.banditReconstruction === undefined
          ? 'unmeasured (no routing decisions recorded)'
          : result.banditReconstruction.status === 'failed'
            ? 'unmeasured (reconstruction failed)'
            : 'unmeasured (no empirical replay)'
        : result.summary.learningStatus;
  return { statusEmoji, statusText };
}

/**
 * Formats the summary section.
 */
function formatSummary(result: LearningMetricsResult): string[] {
  const lines: string[] = [];
  lines.push(boxLine(color(' Summary:', ANSI.bold)));

  const { statusEmoji, statusText } = formatLearningStatus(result);
  lines.push(boxLine(`   ${statusEmoji} Learning Status: ${statusText}`));

  const routings = result.summary.totalRoutings.toLocaleString();
  lines.push(boxLine(`   Total Routings: ${routings}`));

  // Empty case, named (#7180): with zero routings both values below are the
  // `0` defaults of an absent source, so render them as unmeasured rather than
  // as a measured 0.0% / 0.000.
  const noRoutings = result.summary.totalRoutings === 0;
  const successRate = noRoutings
    ? UNMEASURED_NO_ROUTINGS
    : formatPercentage(result.summary.overallSuccessRate, 1);
  lines.push(boxLine(`   Success Rate: ${successRate}`));

  const avgReward = noRoutings ? UNMEASURED_NO_ROUTINGS : result.summary.avgReward.toFixed(3);
  lines.push(boxLine(`   Avg Reward: ${avgReward}`));

  lines.push(color('├' + horizontalLine() + '┤', ANSI.cyan));
  return lines;
}

// =============================================================================
// Model Statistics Section
// =============================================================================

/** Sample-count label: `12 pulls` for the bandit, `50 routings` for routing. */
function sampleLabel(source: 'bandit' | 'routing', count: number): string {
  return `${count.toLocaleString()} ${source === 'bandit' ? 'pulls' : 'routings'}`;
}

/** Selection share; routing-sourced, so unmeasured with no routing samples. */
function formatSelectionShare(model: ModelLearningStats): string {
  if (model.routingSelectionCount === 0) return UNMEASURED_NO_ROUTINGS;
  const barLength = Math.min(20, Math.max(0, Math.round(model.selectionPercent * 0.2)));
  const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
  return `${bar} ${model.selectionPercent.toFixed(1).padStart(5)}%`;
}

/**
 * Mean reward, labelled with its instrument. The bandit and the routing
 * collector are different sources, so a bandit reward beside a routing success
 * rate must say which is which (#7180). `pullCount` counts the reward's samples.
 */
function formatModelReward(model: ModelLearningStats): string {
  if (model.pullCount === 0) {
    return model.rewardSource === 'bandit' ? 'unmeasured (0 bandit pulls)' : UNMEASURED_NO_ROUTINGS;
  }
  return `${model.avgReward.toFixed(2)} (${model.rewardSource}, ${sampleLabel(model.rewardSource, model.pullCount)})`;
}

/** Success rate; always routing-sourced, so unmeasured with no routing samples. */
function formatModelSuccess(model: ModelLearningStats): string {
  if (model.routingSelectionCount === 0) return UNMEASURED_NO_ROUTINGS;
  return `${formatPercentage(model.successRate)} (routing, ${sampleLabel('routing', model.routingSelectionCount)})`;
}

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
    lines.push(boxLine(`   ${model.name.padEnd(10)} ${formatSelectionShare(model)}`));
    lines.push(
      boxLine(`     reward: ${formatModelReward(model)} | success: ${formatModelSuccess(model)}`)
    );
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
function formatBanditProgress(bandit: BanditProgress, unmeasured: boolean): string[] {
  const lines: string[] = [];
  lines.push(boxLine(color(' LinUCB Bandit Progress:', ANSI.bold)));

  const pulls = bandit.totalPulls.toLocaleString();
  lines.push(boxLine(`   Total Pulls: ${pulls}`));

  const expRatio = formatPercentage(bandit.explorationRatio, 1);
  const expStatus = unmeasured
    ? color('(unmeasured)', ANSI.dim)
    : bandit.explorationRatio >= 0.1 && bandit.explorationRatio <= 0.3
      ? color('(healthy)', ANSI.green)
      : color('(adjust)', ANSI.yellow);
  lines.push(boxLine(`   Exploration Ratio: ${expRatio} ${expStatus}`));

  // Arm distribution
  if (bandit.armDistribution.length > 0) {
    lines.push(boxLine('   Arm Distribution:'));
    for (const arm of bandit.armDistribution) {
      const armPct = arm.percent.toFixed(1);
      const armBar = '█'.repeat(Math.min(20, Math.max(0, Math.round(arm.percent * 0.2))));
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
    const label = formatBanditFeatureLabel(fi.feature);
    lines.push(boxLine(`   ${arrow} ${label.padEnd(20)} ${importance.padStart(6)}`));
  }
  if (features.some((fi) => isBanditInterceptFeature(fi.feature))) {
    lines.push(boxLine(`   ${BANDIT_INTERCEPT_NOTE}`));
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

  // Empty case, named (#7180): a rate over zero decisions is not 0%.
  const correlation =
    feedback.totalDecisions === 0
      ? 'unmeasured (0 decisions)'
      : formatPercentage(feedback.correlationRate, 1);
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
    ...(result.banditReconstruction === undefined
      ? []
      : formatBanditReconstruction(result.banditReconstruction)),
    ...formatHeader(result),
    ...formatSummary(result),
    ...formatModelStats(result.models),
  ];

  if (options.banditStats) {
    lines.push(
      ...formatBanditProgress(
        result.banditProgress,
        result.summary.learningStatus === 'unmeasured' ||
          result.summary.learningStatus === 'reconstructed'
      )
    );
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
  return JSON.stringify(
    {
      ...result,
      ...(result.banditReconstruction === undefined
        ? {}
        : {
            banditStateDescription: formatBanditReconstruction(result.banditReconstruction).join(
              ' '
            ),
          }),
    },
    null,
    2
  );
}
