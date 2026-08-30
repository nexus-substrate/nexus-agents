/**
 * Validation Dashboard Rendering Helpers
 *
 * ASCII rendering functions for validation dashboard output.
 *
 * @module observability/validation-dashboard-render
 * (Source: Issue #273 - Learning Validation Dashboard)
 */

import type {
  DashboardSummary,
  DashboardRenderOptions,
  DashboardHealthIndicators,
  LearningProgress,
  ModelPerformanceSummary,
  TaskTypePerformance,
} from './validation-dashboard-types.js';

/**
 * Render a progress bar.
 */
export function renderProgressBar(value: number, max: number, width: number = 20): string {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

/**
 * Render the dashboard header.
 */
export function renderHeader(summary: DashboardSummary, maxWidth: number): string {
  const title = '=== Learning Validation Dashboard ===';
  const padding = Math.max(0, Math.floor((maxWidth - title.length) / 2));
  return ' '.repeat(padding) + title;
}

/**
 * Render the overview section.
 */
export function renderOverview(summary: DashboardSummary): string {
  const periodStartDate = summary.periodStart.split('T')[0] ?? '';
  const periodEndDate = summary.periodEnd.split('T')[0] ?? '';
  const lines = [
    `Period: ${summary.period} (${periodStartDate} to ${periodEndDate})`,
    `Total Decisions: ${String(summary.totalDecisions)}`,
    `Success Rate: ${(summary.overallSuccessRate * 100).toFixed(1)}% ` +
      `(95% CI: ${(summary.overallSuccessRateCI.lower * 100).toFixed(1)}-${(summary.overallSuccessRateCI.upper * 100).toFixed(1)}%)`,
    `Average Reward: ${summary.overallAvgReward.toFixed(3)}`,
  ];
  return lines.join('\n');
}

/**
 * Render the model performance table.
 */
export function renderModelPerformance(
  models: readonly ModelPerformanceSummary[],
  options: DashboardRenderOptions
): string {
  if (models.length === 0) {
    return 'Model Performance: No data';
  }

  const lines = ['Model Performance:'];
  lines.push('-'.repeat(80));

  const showCI = options.showConfidenceIntervals === true;
  const header = showCI
    ? 'Model         | N      | Success Rate (95% CI)     | Avg Reward | Win Rate'
    : 'Model         | N      | Success Rate | Avg Reward | Win Rate';
  lines.push(header);
  lines.push('-'.repeat(80));

  for (const mp of models) {
    const successRateStr = showCI
      ? `${(mp.successRate * 100).toFixed(1)}% (${(mp.successRateCI.lower * 100).toFixed(0)}-${(mp.successRateCI.upper * 100).toFixed(0)}%)`
      : `${(mp.successRate * 100).toFixed(1)}%`;

    const row = [
      mp.model.padEnd(13),
      String(mp.n).padStart(6),
      successRateStr.padStart(showCI ? 25 : 12),
      mp.avgReward.toFixed(3).padStart(10),
      `${(mp.winRate * 100).toFixed(0)}%`.padStart(8),
    ].join(' | ');
    lines.push(row);
  }

  return lines.join('\n');
}

/**
 * Render the task type performance section.
 */
export function renderTaskTypePerformance(taskTypes: readonly TaskTypePerformance[]): string {
  const lines = ['Task Type Performance:'];
  lines.push('-'.repeat(60));

  for (const tt of taskTypes) {
    lines.push(`${tt.taskType}: Best=${tt.bestModel}, Worst=${tt.worstModel}`);
  }

  return lines.join('\n');
}

/**
 * Render the learning progress section.
 */
export function renderLearningProgress(
  progress: LearningProgress,
  options: DashboardRenderOptions
): string {
  const lines = ['Learning Progress:'];
  lines.push('-'.repeat(60));

  // #5255: absence renders as absence, following the #4714 precedent below.
  // A bar plus a percentage over an empty input read as a live measurement —
  // "Optimal Decision Rate: [████] 100.0%" was the worst of them.
  const pct = (label: string, value: number | null, barMax: number): string =>
    value === null
      ? `${label}: unmeasured (nothing recorded)`
      : `${label}: ${renderProgressBar(value, barMax)} ${(value * 100).toFixed(1)}%`;

  lines.push(pct('Exploration Rate', progress.explorationRate, 0.3));
  lines.push(pct('Optimal Decision Rate', progress.optimalRate, 1.0));
  lines.push(
    progress.cumulativeRegret === null
      ? 'Cumulative Regret: unmeasured (no comparable decision)'
      : `Cumulative Regret: ${progress.cumulativeRegret.toFixed(2)}`
  );
  lines.push(
    progress.convergenceScore === null
      ? 'Convergence Score: unmeasured (no feature weights recorded)'
      : `Convergence Score: ${(progress.convergenceScore * 100).toFixed(0)}%`
  );

  if (options.showFeatureImportance === true && progress.featureImportance.length > 0) {
    lines.push('');
    lines.push('Top Features:');
    for (const fi of progress.featureImportance.slice(0, 5)) {
      const bar = renderProgressBar(fi.importance, 1.0);
      lines.push(`  ${fi.feature.padEnd(20)} ${bar} ${fi.importance.toFixed(3)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Render the health indicators section.
 */
export function renderHealthIndicators(health: DashboardHealthIndicators): string {
  const lines = ['Health Indicators:'];
  lines.push('-'.repeat(60));

  // Tri-state (#5255): '?' is not a failure. Rendering '✗' for an unmeasured
  // indicator asserted a health failure from absence.
  const check = (ok: boolean | null): string => (ok === null ? '?' : ok ? '✓' : '✗');

  lines.push(`${check(health.hasMinimumData)} Minimum Data`);
  lines.push(`${check(health.isLearning)} Learning Progress${health.isLearning === null ? ' (unmeasured)' : ''}`);
  lines.push(`${check(health.healthyExploration)} Healthy Exploration${health.healthyExploration === null ? ' (unmeasured)' : ''}`);
  lines.push(`${check(health.noUnderperformers)} No Underperformers`);
  lines.push('');
  // #4714: absence renders as absence. A percentage here computed from
  // default indicators looked like a measurement and was always 80%.
  lines.push(
    health.healthScore === null
      ? 'Overall Health: unmeasured (not enough recorded outcomes to score)'
      : `Overall Health: ${(health.healthScore * 100).toFixed(0)}%`
  );

  if (health.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of health.warnings) {
      lines.push(`  ⚠ ${warning}`);
    }
  }

  return lines.join('\n');
}
