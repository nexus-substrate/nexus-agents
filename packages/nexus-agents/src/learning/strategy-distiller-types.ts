/**
 * Type definitions for the Strategy Distiller.
 *
 * Defines the shape of distilled routing rules that are automatically
 * extracted from observed task outcomes. Rules capture patterns like
 * "CLI X fails on category Y" and translate them into routing score
 * adjustments.
 *
 * @module learning/strategy-distiller-types
 * (Source: Issue #999 - Automatic Strategy Distillation)
 */

import type { CliName } from '../cli-adapters/types.js';

/** Status lifecycle for a distilled rule. */
export type RuleStatus = 'draft' | 'active' | 'promoted' | 'expired';

/** The type of pattern detected from outcomes. */
export type PatternType = 'failure-rate' | 'success-rate' | 'latency-spike';

/** Action to take when a rule matches a routing candidate. */
export type StrategyAction = 'penalize' | 'boost' | 'avoid';

/**
 * A distilled routing rule extracted from outcome patterns.
 *
 * Rules are fingerprinted by `patternType:cli:category` to prevent
 * duplicates and cap total rules at a bounded maximum.
 */
export interface DistilledRule {
  /** Fingerprint: `${patternType}:${cli}:${category}` */
  readonly id: string;
  /** What kind of pattern triggered this rule */
  readonly patternType: PatternType;
  /** Which CLI this rule applies to */
  readonly cli: CliName;
  /** Task category this rule applies to */
  readonly category: string;
  /** What routing action to take */
  readonly action: StrategyAction;
  /**
   * Confidence 0-1 = `support × effect` (#5004 finding 3).
   *
   * This is the value `DistilledRuleStage.computeDelta` multiplies the base
   * delta by, so it must answer "how much should routing move" — not "how
   * many samples did we see". Before #5004 it was the sigmoid over
   * observations alone, and a rule at 62.5% failure penalised exactly as
   * hard as one at 100% given the same traffic.
   */
  readonly confidence: number;
  /** Sample support 0-1: `sigmoidConfidence(observationCount)` (center=30). */
  readonly support: number;
  /**
   * Effect size 0-1: how far `metric` sits past its detector threshold,
   * normalised over the remaining headroom — see `effectFor`. Persisted at
   * distill time because the threshold is config; recomputing it on load
   * would silently rescale old rules when the threshold changes.
   */
  readonly effect: number;
  /** Number of observations that informed this rule */
  readonly observationCount: number;
  /** The metric value (failure rate, success rate, or p90/median ratio) */
  readonly metric: number;
  /** Current lifecycle status */
  readonly status: RuleStatus;
  /** Epoch ms when rule was first created */
  readonly createdAt: number;
  /** Epoch ms when rule was last updated */
  readonly updatedAt: number;
  /** Security: tainted rules never promote to RoutingMemory */
  readonly tainted: boolean;
}

/** Configuration for the strategy distiller. */
export interface DistillerConfig {
  /** Distill every N outcomes (default: 50) */
  readonly triggerThreshold: number;
  /** Minimum observations before creating a draft rule (default: 3) */
  readonly minObservationsForDraft: number;
  /** Minimum observations before activating a rule (default: 5) */
  readonly minObservationsForActive: number;
  /**
   * Confidence threshold for promotion to RoutingMemory (default: 0.7).
   *
   * @deprecated Only read by `StrategyDistiller.promote()`, which has no
   * production caller — `DistilledRuleStage` is the single channel by which
   * distilled rules reach routing (#5004 finding 4). Removal is tracked in
   * #5467. The gate compares `confidence`, which is now `support × effect`.
   */
  readonly promotionConfidence: number;
  /** Failure rate above which a failure pattern is detected (default: 0.6) */
  readonly failureRateThreshold: number;
  /** Success rate above which a success pattern is detected (default: 0.8) */
  readonly successRateThreshold: number;
  /** p90/median ratio above which a latency spike is detected (default: 2.0) */
  readonly latencyRatioThreshold: number;
  /** Maximum number of rules to store (default: 90) */
  readonly maxRules: number;
  /** Rule expiry time in ms (default: 24h) */
  readonly ruleExpiryMs: number;
}

/** The detector thresholds `effectFor` normalises a metric against. */
export type EffectThresholds = Pick<
  DistillerConfig,
  'failureRateThreshold' | 'successRateThreshold' | 'latencyRatioThreshold'
>;

/** Default distiller configuration. */
export const DEFAULT_DISTILLER_CONFIG: DistillerConfig = {
  triggerThreshold: 50,
  minObservationsForDraft: 3,
  minObservationsForActive: 5,
  promotionConfidence: 0.7,
  failureRateThreshold: 0.6,
  successRateThreshold: 0.8,
  latencyRatioThreshold: 2.0,
  maxRules: 90,
  ruleExpiryMs: 24 * 60 * 60 * 1000,
};

/** Statistics returned by StrategyDistiller.getStats(). */
export interface DistillerStats {
  /** Number of rules in each status */
  readonly ruleCountByStatus: Readonly<Record<RuleStatus, number>>;
  /** Total number of rules */
  readonly totalRules: number;
  /** Epoch ms of last distillation run */
  readonly lastDistillAt: number | undefined;
  /** Number of outcomes processed since last distillation */
  readonly outcomesSinceLastDistill: number;
}
