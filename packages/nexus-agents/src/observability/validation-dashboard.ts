/**
 * Validation Dashboard
 *
 * Aggregates learning metrics and provides ASCII/JSON visualization.
 *
 * @module observability/validation-dashboard
 * (Source: Issue #273 - Learning Validation Dashboard)
 */

import type {
  DashboardSummary,
  DashboardFilter,
  DashboardRenderOptions,
  DashboardHealthIndicators,
  LearningProgress,
  ModelPerformanceSummary,
  DashboardOutcome,
} from './validation-dashboard-types.js';
import { DEFAULT_DASHBOARD_RENDER_OPTIONS } from './validation-dashboard-types.js';

// Re-export DashboardOutcome for backward compatibility
export type { DashboardOutcome } from './validation-dashboard-types.js';
import { proportionConfidenceInterval } from '../learning/validation-stats.js';
import {
  renderHeader,
  renderOverview,
  renderModelPerformance,
  renderTaskTypePerformance,
  renderLearningProgress,
  renderHealthIndicators,
} from './validation-dashboard-render.js';
import {
  getPeriodBounds,
  getUniqueModels,
  getUniqueTaskTypes,
  calculateModelPerformance,
  calculateTaskTypePerformance,
  calculateLearningProgress,
  calculateAvgReward,
  computeHealthScore,
} from './validation-dashboard-calc.js';

/**
 * Validation Dashboard implementation.
 */
export class ValidationDashboard {
  private outcomes: DashboardOutcome[] = [];
  private explorationHistory: Array<{ timestamp: number; rate: number }> = [];
  private featureWeights: Record<string, number[]> = {};

  /** Record an outcome for dashboard aggregation. */
  recordOutcome(outcome: DashboardOutcome): void {
    this.outcomes.push(outcome);
  }

  /** Record exploration rate snapshot. */
  recordExplorationRate(rate: number): void {
    this.explorationHistory.push({ timestamp: Date.now(), rate });
    if (this.explorationHistory.length > 1000) {
      this.explorationHistory = this.explorationHistory.slice(-1000);
    }
  }

  /** Record feature weights for importance tracking. */
  recordFeatureWeights(weights: Record<string, number>): void {
    for (const [feature, weight] of Object.entries(weights)) {
      const existing = this.featureWeights[feature];
      if (existing === undefined) {
        this.featureWeights[feature] = [weight];
      } else {
        existing.push(weight);
        if (existing.length > 100) {
          this.featureWeights[feature] = existing.slice(-100);
        }
      }
    }
  }

  /** Get dashboard summary with all metrics. */
  getSummary(filter: DashboardFilter = {}): DashboardSummary {
    const filteredOutcomes = this.filterOutcomes(filter);
    const periodBounds = getPeriodBounds(filter.period ?? 'all');
    const minSampleSize = filter.minSampleSize ?? 10;

    const models = getUniqueModels(filteredOutcomes);
    const taskTypes = getUniqueTaskTypes(filteredOutcomes);

    const modelPerformance = models
      .map((model) => calculateModelPerformance(model, filteredOutcomes))
      .filter((mp) => mp.n >= minSampleSize);

    const taskTypePerformance = taskTypes
      .map((taskType) => calculateTaskTypePerformance(taskType, filteredOutcomes, minSampleSize))
      .filter((ttp) => ttp.modelPerformance.length > 0);

    const learningProgress = calculateLearningProgress(
      filteredOutcomes,
      this.explorationHistory,
      this.featureWeights
    );
    const totalSuccesses = filteredOutcomes.filter((o) => o.success).length;
    const overallSuccessRateCI = proportionConfidenceInterval(
      totalSuccesses,
      filteredOutcomes.length
    );

    const healthIndicators = this.calculateHealthIndicators(
      filteredOutcomes,
      modelPerformance,
      learningProgress
    );

    return {
      period: filter.period ?? 'all',
      periodStart: new Date(periodBounds.start).toISOString(),
      periodEnd: new Date(periodBounds.end).toISOString(),
      totalDecisions: filteredOutcomes.length,
      totalOutcomes: filteredOutcomes.length,
      overallSuccessRate: overallSuccessRateCI.estimate,
      overallSuccessRateCI,
      overallAvgReward: calculateAvgReward(filteredOutcomes),
      modelPerformance,
      taskTypePerformance,
      learningProgress,
      healthIndicators,
    };
  }

  /** Render dashboard as ASCII text. */
  renderDashboard(filter: DashboardFilter = {}, options: DashboardRenderOptions = {}): string {
    const opts = { ...DEFAULT_DASHBOARD_RENDER_OPTIONS, ...options };
    const summary = this.getSummary(filter);
    const lines: string[] = [];

    lines.push(renderHeader(summary, opts.maxWidth));
    lines.push('');
    lines.push(renderOverview(summary));
    lines.push('');
    lines.push(renderModelPerformance(summary.modelPerformance, opts));

    if (opts.showTaskTypes && summary.taskTypePerformance.length > 0) {
      lines.push('');
      lines.push(renderTaskTypePerformance(summary.taskTypePerformance));
    }

    if (opts.showLearningProgress) {
      lines.push('');
      lines.push(renderLearningProgress(summary.learningProgress, opts));
    }

    lines.push('');
    lines.push(renderHealthIndicators(summary.healthIndicators));

    return lines.join('\n');
  }

  /** Clear all recorded data. */
  clear(): void {
    this.outcomes = [];
    this.explorationHistory = [];
    this.featureWeights = {};
  }

  private filterOutcomes(filter: DashboardFilter): readonly DashboardOutcome[] {
    const periodBounds = getPeriodBounds(filter.period ?? 'all');

    return this.outcomes.filter((o) => {
      if (o.timestamp < periodBounds.start || o.timestamp > periodBounds.end) {
        return false;
      }
      if (filter.models !== undefined && !filter.models.includes(o.model)) {
        return false;
      }
      if (filter.taskTypes !== undefined && !filter.taskTypes.includes(o.taskType)) {
        return false;
      }
      return true;
    });
  }

  private calculateHealthIndicators(
    outcomes: readonly DashboardOutcome[],
    modelPerformance: readonly ModelPerformanceSummary[],
    learningProgress: LearningProgress
  ): DashboardHealthIndicators {
    const warnings: string[] = [];

    const hasMinimumData = outcomes.length >= 100;
    const isLearning = this.checkLearningProgress(learningProgress, outcomes.length, warnings);
    const healthyExploration = this.checkExplorationHealth(learningProgress, warnings);
    const noUnderperformers = this.checkUnderperformers(modelPerformance, warnings);

    if (!hasMinimumData) {
      warnings.push(`Insufficient data: ${String(outcomes.length)}/100 minimum outcomes`);
    }

    const healthScore = computeHealthScore(
      hasMinimumData,
      isLearning,
      healthyExploration,
      noUnderperformers
    );

    return {
      hasMinimumData,
      isLearning,
      healthyExploration,
      noUnderperformers,
      healthScore,
      warnings,
    };
  }

  private checkLearningProgress(
    progress: LearningProgress,
    outcomeCount: number,
    warnings: string[]
  ): boolean {
    const isLearning = progress.avgRegret < 0.3 || progress.optimalRate > 0.7;
    if (!isLearning && outcomeCount >= 100) {
      warnings.push('Learning not progressing: regret remains high');
    }
    return isLearning;
  }

  private checkExplorationHealth(progress: LearningProgress, warnings: string[]): boolean {
    const healthyExploration = progress.explorationRate >= 0.1 && progress.explorationRate <= 0.2;
    if (!healthyExploration && this.explorationHistory.length > 10) {
      const pct = (progress.explorationRate * 100).toFixed(1);
      warnings.push(`Exploration rate ${pct}% outside healthy range (10-20%)`);
    }
    return healthyExploration;
  }

  private checkUnderperformers(
    modelPerformance: readonly ModelPerformanceSummary[],
    warnings: string[]
  ): boolean {
    const bestSuccessRate = Math.max(...modelPerformance.map((mp) => mp.successRate), 0);
    const underperformers = modelPerformance.filter(
      (mp) => mp.successRate < bestSuccessRate * 0.5 && mp.n >= 30
    );
    const noUnderperformers = underperformers.length === 0;
    if (!noUnderperformers) {
      warnings.push(`Underperforming models: ${underperformers.map((u) => u.model).join(', ')}`);
    }
    return noUnderperformers;
  }
}

/** Create a validation dashboard instance. */
export function createValidationDashboard(): ValidationDashboard {
  return new ValidationDashboard();
}
