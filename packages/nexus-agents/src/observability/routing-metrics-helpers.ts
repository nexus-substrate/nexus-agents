/**
 * Routing Metrics Dashboard Helpers
 *
 * ASCII dashboard rendering utilities extracted from routing-metrics.ts.
 *
 * @module observability/routing-metrics-helpers
 */

import type { RoutingMetrics } from './routing-metrics-types.js';

// =============================================================================
// Text Formatting Helpers
// =============================================================================

/**
 * Center text within a box of given width.
 */
export function centerText(text: string, width: number): string {
  const padding = Math.max(0, width - text.length - 2);
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return '│' + ' '.repeat(left) + text + ' '.repeat(right) + '│';
}

/**
 * Pad text to fill width with trailing spaces.
 */
export function padText(text: string, width: number): string {
  const padding = Math.max(0, width - text.length - 1);
  return text + ' '.repeat(padding) + '│';
}

// =============================================================================
// Dashboard Section Renderers
// =============================================================================

/**
 * Render the model distribution section of the dashboard.
 */
export function renderModelDistribution(metrics: RoutingMetrics, w: number): string[] {
  const lines: string[] = [padText('│ Model Selection Distribution:', w)];

  if (metrics.modelMetrics.length === 0) {
    lines.push(padText('│   No routing data available', w));
    return lines;
  }

  for (const model of metrics.modelMetrics) {
    const barLength = Math.round(model.selectionPercent * 20);
    const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
    const pct = `${String(Math.round(model.selectionPercent * 100))}%`;
    const reward = `(avg reward: ${model.avgReward.toFixed(2)})`;
    lines.push(padText(`│   ${model.model.padEnd(7)} ${bar} ${pct.padStart(4)} ${reward}`, w));
  }

  return lines;
}

/**
 * Render the learning progress section of the dashboard.
 */
export function renderLearningProgress(
  metrics: RoutingMetrics,
  w: number,
  showTrends: boolean
): string[] {
  const lines: string[] = [padText('│ Learning Progress:', w)];

  const expRate = `${String(Math.round(metrics.explorationRate * 100))}%`;
  const expStatus =
    metrics.explorationRate >= 0.1 && metrics.explorationRate <= 0.2 ? '(healthy)' : '(adjust)';
  lines.push(padText(`│   Exploration rate: ${expRate} ${expStatus}`, w));

  if (showTrends) {
    const trendArrow = metrics.avgRewardTrend > 0 ? '↑' : metrics.avgRewardTrend < 0 ? '↓' : '→';
    const trendValue = metrics.avgRewardTrend >= 0 ? '+' : '';
    const trend = `${trendArrow} ${trendValue}${metrics.avgRewardTrend.toFixed(2)} vs last period`;
    lines.push(padText(`│   Avg reward trend: ${trend}`, w));
  }

  lines.push(padText(`│   Avg reward: ${metrics.avgReward.toFixed(2)}`, w));
  return lines;
}

/**
 * Render the performance section of the dashboard.
 */
export function renderPerformanceSection(metrics: RoutingMetrics, w: number): string[] {
  const lines: string[] = [padText('│ Performance:', w)];

  lines.push(
    padText(`│   Routing decisions: ${String(metrics.totalDecisions).toLocaleString()}`, w)
  );
  lines.push(padText(`│   Task outcomes: ${String(metrics.totalOutcomes).toLocaleString()}`, w));
  lines.push(padText(`│   Avg routing latency: ${String(metrics.avgRoutingLatencyMs)}ms`, w));

  const overallSuccess =
    metrics.modelMetrics.length > 0
      ? metrics.modelMetrics.reduce((sum, m) => sum + m.successRate * m.selectionCount, 0) /
        Math.max(metrics.totalDecisions, 1)
      : 0;
  lines.push(padText(`│   Task success rate: ${String(Math.round(overallSuccess * 100))}%`, w));

  return lines;
}
