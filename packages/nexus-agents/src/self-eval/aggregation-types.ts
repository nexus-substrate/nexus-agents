/**
 * Aggregation Types for Self-Evaluation
 *
 * Type definitions and constants for evaluation aggregation.
 *
 * @module self-eval/aggregation-types
 */

import type { EvaluatorRole, Recommendation } from './evaluation-agents.js';

/**
 * Component criticality levels for threshold selection.
 */
export type ComponentCriticality = 'security-critical' | 'core' | 'utility';

/**
 * Audit trail entry for transparency.
 */
export interface AuditEntry {
  /** Entry timestamp */
  readonly timestamp: Date;
  /** Agent that made the claim */
  readonly agent: EvaluatorRole;
  /** The claim or action */
  readonly claim: string;
  /** Supporting evidence (metric citation) */
  readonly evidence: string | null;
  /** Whether evidence was verified */
  readonly verified: boolean;
}

/**
 * Aggregated result combining all evaluator votes.
 * This is a RECOMMENDATION for human review.
 */
export interface AggregatedResult {
  /** Component path */
  readonly component: string;
  /** Final aggregated recommendation */
  readonly finalRecommendation: Recommendation;
  /** Overall confidence (0-1) */
  readonly confidence: number;
  /** All evaluator votes */
  readonly votes: readonly import('./evaluation-agents.js').EvaluationResult[];
  /** Dissenting opinions (different from final recommendation) */
  readonly dissent: readonly import('./evaluation-agents.js').EvaluationResult[];
  /** Complete audit trail */
  readonly auditTrail: readonly AuditEntry[];
  /** Evidence quality score (0-1) */
  readonly evidenceQuality: number;
  /** Explicit flag: this is a recommendation, not a decision */
  readonly isRecommendation: true;
  /** Aggregation timestamp */
  readonly timestamp: Date;
}

/**
 * Configuration for aggregation.
 */
export interface AggregationConfig {
  /** Logger instance */
  readonly logger?: import('../core/index.js').ILogger;
  /** Override criticality detection */
  readonly criticalityOverrides?: ReadonlyMap<string, ComponentCriticality>;
  /** Patterns to identify security-critical components */
  readonly securityPatterns?: readonly RegExp[];
  /** Patterns to identify core components */
  readonly corePatterns?: readonly RegExp[];
}

/**
 * Output options for formatting results.
 */
export interface OutputOptions {
  /** Verbose output with full details */
  readonly verbose?: boolean;
  /** Include audit trail in output */
  readonly includeAuditTrail?: boolean;
}

/** Default patterns for security-critical components */
export const DEFAULT_SECURITY_PATTERNS: readonly RegExp[] = [
  /auth/i,
  /security/i,
  /crypto/i,
  /secret/i,
  /password/i,
  /token/i,
  /permission/i,
  /access[-_]?control/i,
] as const;

/** Default patterns for core components */
export const DEFAULT_CORE_PATTERNS: readonly RegExp[] = [
  /^core\//,
  /\/core\//,
  /index\.ts$/,
  /^src\/index/,
  /engine/i,
  /adapter/i,
  /provider/i,
] as const;

/** Threshold definitions by criticality */
export const THRESHOLDS: Record<ComponentCriticality, { required: number; total: number }> = {
  'security-critical': { required: 3, total: 3 }, // Unanimous
  core: { required: 3, total: 3 }, // Supermajority (all 3)
  utility: { required: 2, total: 3 }, // Simple majority
} as const;

/** Recommendation priority (higher = more severe) */
export const RECOMMENDATION_PRIORITY: Record<Recommendation, number> = {
  retain: 0,
  review: 1,
  refactor: 2,
  deprecate: 3,
} as const;
