/**
 * Validation Dashboard Types
 *
 * Type definitions for the learning validation dashboard.
 *
 * @module observability/validation-dashboard-types
 * (Source: Issue #273 - Learning Validation Dashboard)
 */

import type { ConfidenceInterval, DistributionStats } from '../learning/validation-stats-types.js';

/**
 * Time period for aggregation.
 */
export type TimePeriod = '1h' | '24h' | '7d' | '30d' | 'all';

/**
 * Model performance summary with confidence intervals.
 */
export interface ModelPerformanceSummary {
  /** Model/CLI name */
  readonly model: string;
  /** Number of routing decisions */
  readonly n: number;
  /** Success rate with confidence interval */
  readonly successRate: number;
  readonly successRateCI: ConfidenceInterval;
  /** Average reward with distribution stats */
  readonly avgReward: number;
  readonly rewardStats: DistributionStats;
  /** Average latency in milliseconds */
  readonly avgLatencyMs: number;
  /** Win rate vs other models */
  readonly winRate: number;
  readonly winRateCI: ConfidenceInterval;
  /** Cost efficiency (reward per token) */
  readonly costEfficiency: number;
}

/**
 * Task type performance breakdown.
 */
export interface TaskTypePerformance {
  /** Task type */
  readonly taskType: string;
  /** Performance per model for this task type */
  readonly modelPerformance: readonly ModelPerformanceSummary[];
  /** Best performing model */
  readonly bestModel: string;
  /** Worst performing model */
  readonly worstModel: string;
}

/**
 * Learning progress metrics.
 */
export interface LearningProgress {
  /** LinUCB exploration rate over time */
  readonly explorationRate: number;
  readonly explorationRateTrend: number; // positive = increasing exploration
  /** Cumulative regret */
  readonly cumulativeRegret: number;
  readonly avgRegret: number;
  /** Optimal decision rate */
  readonly optimalRate: number;
  /** Feature importance ranking */
  readonly featureImportance: readonly {
    readonly feature: string;
    readonly importance: number;
  }[];
  /** Learning convergence metric (0-1, 1 = converged) */
  readonly convergenceScore: number;
}

/**
 * Dashboard summary.
 */
export interface DashboardSummary {
  /** Period covered */
  readonly period: TimePeriod;
  readonly periodStart: string;
  readonly periodEnd: string;
  /** Total decisions in period */
  readonly totalDecisions: number;
  /** Total outcomes recorded */
  readonly totalOutcomes: number;
  /** Overall success rate */
  readonly overallSuccessRate: number;
  readonly overallSuccessRateCI: ConfidenceInterval;
  /** Overall average reward */
  readonly overallAvgReward: number;
  /** Model performance summaries */
  readonly modelPerformance: readonly ModelPerformanceSummary[];
  /** Task type breakdown */
  readonly taskTypePerformance: readonly TaskTypePerformance[];
  /** Learning progress metrics */
  readonly learningProgress: LearningProgress;
  /** Health indicators */
  readonly healthIndicators: DashboardHealthIndicators;
}

/**
 * Dashboard health indicators.
 */
export interface DashboardHealthIndicators {
  /** Whether we have enough data for statistical inference */
  readonly hasMinimumData: boolean;
  /** Whether learning is progressing (regret decreasing) */
  readonly isLearning: boolean;
  /** Whether exploration rate is in healthy range (10-20%) */
  readonly healthyExploration: boolean;
  /** Whether any model is significantly underperforming */
  readonly noUnderperformers: boolean;
  /** Overall health score (0-1) */
  readonly healthScore: number;
  /** Warning messages */
  readonly warnings: readonly string[];
}

/**
 * Dashboard filter options.
 */
export interface DashboardFilter {
  /** Time period */
  readonly period?: TimePeriod;
  /** Filter to specific models */
  readonly models?: readonly string[];
  /** Filter to specific task types */
  readonly taskTypes?: readonly string[];
  /** Minimum sample size for inclusion */
  readonly minSampleSize?: number;
}

/**
 * ASCII dashboard render options.
 */
export interface DashboardRenderOptions {
  /** Show confidence intervals */
  readonly showConfidenceIntervals?: boolean;
  /** Show task type breakdown */
  readonly showTaskTypes?: boolean;
  /** Show learning progress */
  readonly showLearningProgress?: boolean;
  /** Show feature importance */
  readonly showFeatureImportance?: boolean;
  /** Maximum width in characters */
  readonly maxWidth?: number;
}

/**
 * Default dashboard render options.
 */
export const DEFAULT_DASHBOARD_RENDER_OPTIONS: Required<DashboardRenderOptions> = {
  showConfidenceIntervals: true,
  showTaskTypes: true,
  showLearningProgress: true,
  showFeatureImportance: true,
  maxWidth: 100,
};
