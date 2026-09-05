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
  /**
   * Win rate vs other models, over the {@link comparableN} outcomes that carried
   * counterfactual rewards. Unmeasured — `comparableN === 0` — reads `0` here
   * for compatibility; check `comparableN` before treating it as a defeat (#5650).
   */
  readonly winRate: number;
  readonly winRateCI: ConfidenceInterval;
  /** Number of outcomes the win rate was computed over; 0 means unmeasured (#5650). */
  readonly comparableN: number;
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
  /**
   * LinUCB exploration rate, or `null` when nothing was recorded (#5255).
   *
   * `0` was the empty-case value and rendered as "0.0%" — indistinguishable
   * from a real fully-greedy policy, which is a legitimate 0.0%. `null` means
   * UNMEASURED; `0` means measured-and-zero.
   */
  readonly explorationRate: number | null;
  readonly explorationRateTrend: number; // positive = increasing exploration
  /** Cumulative regret, or `null` when no decision was comparable. */
  readonly cumulativeRegret: number | null;
  /** Average regret per decision, or `null` when unmeasured. */
  readonly avgRegret: number | null;
  /** Optimal decision rate, or `null` when unmeasured. */
  readonly optimalRate: number | null;
  /** Feature importance ranking */
  readonly featureImportance: readonly {
    readonly feature: string;
    readonly importance: number;
  }[];
  /** Learning convergence metric (0-1, 1 = converged) */
  /**
   * Convergence score, or `null` when no feature weights were recorded (#5255).
   *
   * The empty case returned `0`, which reads as WORST-possible convergence —
   * `Math.exp(-variance)` only approaches 0 and never reaches it, so a literal
   * 0% could not have been a real reading.
   */
  readonly convergenceScore: number | null;
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
  /**
   * Whether learning is progressing, or `null` when unmeasured (#5255).
   *
   * This was `boolean` and computed from `avgRegret`/`optimalRate`, whose empty
   * case returned `0`/`1` — so it answered "yes" on the strength of no data.
   * #4714 spotted that and guarded only the aggregate `healthScore`; the guard
   * keys on total outcomes, which is a DIFFERENT collection from the one these
   * metrics read, so on a live system it passed and the fabricated verdict
   * flowed through anyway.
   */
  readonly isLearning: boolean | null;
  /**
   * Whether exploration is in the healthy 10-20% range, or `null` when nothing
   * was recorded (#5255).
   *
   * Previously rendered `✗ Healthy Exploration` over ZERO samples — asserting a
   * health *failure* from absence — while the warning that would have explained
   * it was gated behind `explorationHistory.length > 10`, so the one disclosing
   * line was exactly the suppressed one.
   */
  readonly healthyExploration: boolean | null;
  /** Whether any model is significantly underperforming */
  readonly noUnderperformers: boolean;
  /** Overall health score (0-1) */
  /**
   * Overall health, or `null` when there is not enough data to score (#4714).
   *
   * `null` is not zero and not a bad score — it means the indicators would be
   * defaults rather than measurements. Render it as "unmeasured"; do not
   * coerce it to a number.
   */
  readonly healthScore: number | null;
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

/**
 * Outcome record for dashboard aggregation.
 */
export interface DashboardOutcome {
  readonly model: string;
  readonly taskType: string;
  readonly success: boolean;
  readonly reward: number;
  readonly latencyMs: number;
  readonly tokensUsed: number;
  readonly timestamp: number;
  readonly allModelRewards?: Record<string, number>;
}
