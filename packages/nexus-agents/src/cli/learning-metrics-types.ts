/**
 * nexus-agents/cli - Learning Metrics Dashboard Types
 *
 * Type definitions for the learning metrics CLI command.
 * Aggregates data from LinUCB bandit, routing metrics, and feedback integration.
 *
 * (Source: Issue #284 - Learning metrics dashboard)
 */

/**
 * Options for the learning-metrics CLI command.
 */
export interface LearningMetricsOptions {
  /** Time period for metrics (hours). Default: 24 */
  readonly period: number;
  /** Output format. Default: 'ascii' */
  readonly format: 'ascii' | 'json';
  /** Include detailed bandit statistics. Default: false */
  readonly banditStats: boolean;
  /** Include trend analysis. Default: true */
  readonly showTrends: boolean;
  /** Export to file path (JSON only) */
  readonly exportPath?: string;
}

/**
 * Per-model learning statistics.
 */
export interface ModelLearningStats {
  readonly name: string;
  readonly pullCount: number;
  readonly avgReward: number;
  readonly cumulativeReward: number;
  readonly successRate: number;
  readonly avgLatencyMs: number;
  readonly avgQuality: number;
  readonly selectionPercent: number;
}

/**
 * Feature importance from LinUCB bandit.
 */
export interface FeatureImportance {
  readonly feature: string;
  readonly importance: number;
  readonly direction: 'positive' | 'negative';
}

/**
 * Bandit learning progress metrics.
 */
export interface BanditProgress {
  readonly totalPulls: number;
  readonly explorationRatio: number;
  readonly armDistribution: ReadonlyArray<{
    readonly name: string;
    readonly percent: number;
  }>;
  readonly topFeatures: ReadonlyArray<FeatureImportance>;
}

/**
 * Reward trend analysis.
 */
export interface RewardTrend {
  readonly current: number;
  readonly previous: number;
  readonly direction: 'improving' | 'declining' | 'stable';
  readonly changePercent: number;
}

/**
 * Feedback loop statistics.
 */
export interface FeedbackLoopStats {
  readonly totalDecisions: number;
  readonly totalOutcomes: number;
  readonly correlationRate: number;
  readonly avgReward: number;
  readonly outcomeDistribution: {
    readonly success: number;
    readonly partial: number;
    readonly failure: number;
  };
}

/**
 * Complete learning metrics result.
 */
export interface LearningMetricsResult {
  readonly timestamp: string;
  readonly periodHours: number;
  readonly models: ReadonlyArray<ModelLearningStats>;
  readonly banditProgress: BanditProgress;
  readonly rewardTrend: RewardTrend;
  readonly feedbackLoop: FeedbackLoopStats;
  readonly summary: {
    readonly totalRoutings: number;
    readonly overallSuccessRate: number;
    readonly avgReward: number;
    /**
     * Bandit learning phase, or `'unmeasured'` when nothing was recorded
     * (#5267).
     *
     * This was a three-value union, and the empty case fell into
     * `'exploiting'` because the fallback `explorationRatio` of `0` is `< 0.3`
     * — so the CLI rendered a green ✓ asserting convergence over a bandit that
     * had never been consulted. `'unmeasured'` is not a phase; it means no
     * phase could be determined.
     */
    readonly learningStatus: 'exploring' | 'exploiting' | 'balanced' | 'unmeasured';
  };
}
