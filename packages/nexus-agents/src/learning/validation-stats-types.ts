/**
 * Validation Statistics Types
 *
 * Type definitions for statistical analysis in the learning validation dashboard.
 * Supports confidence intervals, hypothesis testing, and A/B test comparisons.
 *
 * @module learning/validation-stats-types
 * (Source: Issue #273 - Learning Validation Dashboard)
 */

/**
 * Confidence interval result with bounds and metadata.
 */
export interface ConfidenceInterval {
  /** Lower bound of the interval */
  readonly lower: number;
  /** Upper bound of the interval */
  readonly upper: number;
  /** Point estimate (center of interval) */
  readonly estimate: number;
  /** Confidence level (e.g., 0.95 for 95% CI) */
  readonly confidence: number;
  /** Sample size used */
  readonly n: number;
  /** Standard error */
  readonly standardError: number;
}

/**
 * Result of a two-sample comparison test.
 */
export interface ComparisonResult {
  /** P-value from the test */
  readonly pValue: number;
  /** Whether result is significant at alpha level */
  readonly significant: boolean;
  /** Alpha level used for significance */
  readonly alpha: number;
  /** Difference in success rates (group1 - group2) */
  readonly difference: number;
  /** Confidence interval for the difference */
  readonly differenceCI: ConfidenceInterval;
  /** Effect size (Cohen's h for proportions) */
  readonly effectSize: number;
  /** Sample sizes */
  readonly n1: number;
  readonly n2: number;
}

/**
 * Descriptive statistics for a distribution.
 */
export interface DistributionStats {
  readonly mean: number;
  readonly median: number;
  readonly stdDev: number;
  readonly variance: number;
  readonly min: number;
  readonly max: number;
  readonly n: number;
  /** Percentiles: p5, p25, p50, p75, p95 */
  readonly percentiles: {
    readonly p5: number;
    readonly p25: number;
    readonly p50: number;
    readonly p75: number;
    readonly p95: number;
  };
}

/**
 * Regret analysis result comparing actual vs optimal decisions.
 */
export interface RegretAnalysis {
  /**
   * Total cumulative regret, or `null` when no decision was comparable (#5255).
   *
   * These three were plain `number` and returned `0`/`0`/`1` for an empty
   * decision set — which the dashboard rendered as "Cumulative Regret: 0.00"
   * and "Optimal Decision Rate: 100.0%" with a full progress bar. A perfect
   * routing record asserted over nothing is an absent measurement wearing a
   * good score, and the primary consumer of these numbers is the learning loop
   * itself, which has no way to consult a sibling flag.
   *
   * `null` means UNMEASURED — no comparable decision existed. It does not mean
   * zero regret; that is `0`, and the two are now distinguishable.
   */
  readonly cumulativeRegret: number | null;
  /** Average regret per decision, or `null` when unmeasured — see above. */
  readonly avgRegret: number | null;
  /** Number of decisions analyzed. Stays numeric: 0 is the true count. */
  readonly totalDecisions: number;
  /** Number of suboptimal decisions. Stays numeric: 0 is the true count. */
  readonly suboptimalDecisions: number;
  /** Share of optimal decisions, or `null` when unmeasured — see above. */
  readonly optimalRate: number | null;
  /** Regret per model (how much worse each model performed vs best) */
  readonly regretPerModel: Record<string, number>;
}

/**
 * Win/loss analysis comparing routing choices.
 */
export interface WinLossAnalysis {
  /** Model name */
  readonly model: string;
  /** Number of times this model won (best outcome) */
  readonly wins: number;
  /** Number of times this model lost (not best outcome) */
  readonly losses: number;
  /** Number of ties */
  readonly ties: number;
  /** Win rate */
  readonly winRate: number;
  /** Confidence interval for win rate */
  readonly winRateCI: ConfidenceInterval;
}

/**
 * Variant result summary for experiment results.
 */
export interface VariantResultSummary {
  readonly name: string;
  readonly n: number;
  readonly successRate: number;
  readonly avgReward: number;
  readonly successRateCI: ConfidenceInterval;
}

/**
 * A/B test experiment result.
 */
export interface ExperimentResult {
  /** Experiment identifier */
  readonly experimentId: string;
  /** Control group statistics */
  readonly control: VariantResultSummary;
  /** Treatment group statistics */
  readonly treatment: VariantResultSummary;
  /** Comparison between groups */
  readonly comparison: ComparisonResult;
  /** Relative improvement (treatment vs control) */
  readonly relativeImprovement: number;
  /** Whether experiment has enough data for valid conclusions */
  readonly hasMinimumSampleSize: boolean;
  /** Minimum recommended sample size per group */
  readonly recommendedSampleSize: number;
}

/**
 * Model performance matrix entry (model × task type).
 */
export interface PerformanceMatrixEntry {
  readonly model: string;
  readonly taskType: string;
  readonly n: number;
  readonly successRate: number;
  readonly avgReward: number;
  readonly avgLatencyMs: number;
  readonly successRateCI: ConfidenceInterval;
}

/**
 * Options for statistical calculations.
 */
export interface StatisticalOptions {
  /** Confidence level for intervals (default: 0.95) */
  readonly confidence?: number;
  /** Alpha level for significance testing (default: 0.05) */
  readonly alpha?: number;
  /** Minimum sample size for valid inference (default: 30) */
  readonly minSampleSize?: number;
  /** Use continuity correction for proportions (default: true) */
  readonly useContinuityCorrection?: boolean;
}

/**
 * Default statistical options.
 */
export const DEFAULT_STATISTICAL_OPTIONS: Required<StatisticalOptions> = {
  confidence: 0.95,
  alpha: 0.05,
  minSampleSize: 30,
  useContinuityCorrection: true,
};
