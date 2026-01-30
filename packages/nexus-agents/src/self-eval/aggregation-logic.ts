/**
 * Aggregation Logic for Self-Evaluation MVP
 *
 * Combines evaluator votes into final recommendations using tiered thresholds.
 * All outputs are RECOMMENDATIONS for human review, not decisions.
 *
 * @module self-eval/aggregation-logic
 * (Source: Issue #139, Multi-Agent Evaluation research)
 */

import type { EvaluationResult, Recommendation, EvaluatorRole } from './evaluation-agents.js';
import type { ILogger } from '../core/index.js';
import { createLogger, getTimeProvider } from '../core/index.js';
import type {
  ComponentCriticality,
  AuditEntry,
  AggregatedResult,
  AggregationConfig,
  OutputOptions,
} from './aggregation-types.js';
import {
  DEFAULT_SECURITY_PATTERNS,
  DEFAULT_CORE_PATTERNS,
  THRESHOLDS,
  RECOMMENDATION_PRIORITY,
} from './aggregation-types.js';
import { formatResults } from './aggregation-helpers.js';

// Re-export types for backward compatibility
export type {
  ComponentCriticality,
  AuditEntry,
  AggregatedResult,
  AggregationConfig,
  OutputOptions,
};

/**
 * Aggregates evaluation results from multiple evaluators.
 */
export class EvaluationAggregator {
  private readonly log: ILogger;
  private readonly criticalityOverrides: ReadonlyMap<string, ComponentCriticality>;
  private readonly securityPatterns: readonly RegExp[];
  private readonly corePatterns: readonly RegExp[];

  constructor(config?: AggregationConfig) {
    this.log = config?.logger ?? createLogger({ component: 'evaluation-aggregator' });
    this.criticalityOverrides = config?.criticalityOverrides ?? new Map();
    this.securityPatterns = config?.securityPatterns ?? DEFAULT_SECURITY_PATTERNS;
    this.corePatterns = config?.corePatterns ?? DEFAULT_CORE_PATTERNS;
  }

  /**
   * Aggregate evaluation results for a component.
   */
  aggregate(componentPath: string, evaluations: readonly EvaluationResult[]): AggregatedResult {
    if (evaluations.length === 0) {
      throw new Error('Cannot aggregate empty evaluations');
    }

    const criticality = this.determineCriticality(componentPath);
    const auditTrail = this.buildAuditTrail(componentPath, evaluations, criticality);
    const evidenceQuality = this.calculateEvidenceQuality(evaluations);

    const { recommendation, confidence, dissent } = this.vote(
      evaluations,
      criticality,
      evidenceQuality
    );

    this.finalizeAuditTrail(auditTrail, recommendation, confidence, evidenceQuality);
    this.logAggregationComplete({
      component: componentPath,
      criticality,
      recommendation,
      confidence,
      evidenceQuality,
      dissentCount: dissent.length,
    });

    return {
      component: componentPath,
      finalRecommendation: recommendation,
      confidence,
      votes: evaluations,
      dissent,
      auditTrail,
      evidenceQuality,
      isRecommendation: true,
      timestamp: new Date(getTimeProvider().now()),
    };
  }

  /**
   * Build the initial audit trail from evaluations.
   */
  private buildAuditTrail(
    componentPath: string,
    evaluations: readonly EvaluationResult[],
    criticality: ComponentCriticality
  ): AuditEntry[] {
    const auditTrail: AuditEntry[] = [];
    const timestamp = new Date(getTimeProvider().now());

    auditTrail.push({
      timestamp,
      agent: 'code-quality' as EvaluatorRole,
      claim: 'Aggregation started',
      evidence: `${String(evaluations.length)} evaluations received`,
      verified: true,
    });

    auditTrail.push({
      timestamp: new Date(getTimeProvider().now()),
      agent: 'code-quality' as EvaluatorRole,
      claim: `Component classified as ${criticality}`,
      evidence: componentPath,
      verified: true,
    });

    this.addEvaluationEntries(auditTrail, evaluations);
    return auditTrail;
  }

  /**
   * Add evaluation entries to audit trail.
   */
  private addEvaluationEntries(
    auditTrail: AuditEntry[],
    evaluations: readonly EvaluationResult[]
  ): void {
    for (const evaluation of evaluations) {
      for (const metric of evaluation.metrics) {
        auditTrail.push({
          timestamp: evaluation.timestamp,
          agent: evaluation.agent,
          claim: `Reported ${metric.metric}: ${String(metric.value)}`,
          evidence: `Source: ${metric.source}`,
          verified: true,
        });
      }

      for (const concern of evaluation.concerns) {
        auditTrail.push({
          timestamp: evaluation.timestamp,
          agent: evaluation.agent,
          claim: concern,
          evidence: null,
          verified: false,
        });
      }
    }
  }

  /**
   * Add final recommendation entry to audit trail.
   */
  private finalizeAuditTrail(
    auditTrail: AuditEntry[],
    recommendation: Recommendation,
    confidence: number,
    evidenceQuality: number
  ): void {
    auditTrail.push({
      timestamp: new Date(getTimeProvider().now()),
      agent: 'code-quality' as EvaluatorRole,
      claim: `Final recommendation: ${recommendation}`,
      evidence: `Confidence: ${confidence.toFixed(2)}, Evidence quality: ${evidenceQuality.toFixed(2)}`,
      verified: true,
    });
  }

  /**
   * Log aggregation completion.
   */
  private logAggregationComplete(context: {
    component: string;
    criticality: ComponentCriticality;
    recommendation: Recommendation;
    confidence: number;
    evidenceQuality: number;
    dissentCount: number;
  }): void {
    this.log.debug('Aggregation complete', context);
  }

  /**
   * Determine component criticality based on path patterns.
   */
  determineCriticality(componentPath: string): ComponentCriticality {
    // Check for overrides first
    const override = this.criticalityOverrides.get(componentPath);
    if (override !== undefined) {
      return override;
    }

    // Check security patterns
    for (const pattern of this.securityPatterns) {
      if (pattern.test(componentPath)) {
        return 'security-critical';
      }
    }

    // Check core patterns
    for (const pattern of this.corePatterns) {
      if (pattern.test(componentPath)) {
        return 'core';
      }
    }

    // Default to utility
    return 'utility';
  }

  /**
   * Calculate evidence quality score.
   * Higher score = more claims backed by metrics.
   */
  private calculateEvidenceQuality(evaluations: readonly EvaluationResult[]): number {
    let totalClaims = 0;
    let evidencedClaims = 0;

    for (const evaluation of evaluations) {
      // Each metric is an evidenced claim
      evidencedClaims += evaluation.metrics.length;
      totalClaims += evaluation.metrics.length;

      // Each concern without metric is an unevidenced claim
      totalClaims += evaluation.concerns.length;

      // Check if concerns have corresponding metrics
      for (const concern of evaluation.concerns) {
        const hasEvidence = evaluation.metrics.some((m) =>
          concern.toLowerCase().includes(m.metric.toLowerCase())
        );
        if (hasEvidence) {
          evidencedClaims += 1;
        }
      }
    }

    if (totalClaims === 0) {
      return 0;
    }

    return evidencedClaims / totalClaims;
  }

  /**
   * Vote on final recommendation using tiered thresholds.
   */
  private vote(
    evaluations: readonly EvaluationResult[],
    criticality: ComponentCriticality,
    evidenceQuality: number
  ): {
    recommendation: Recommendation;
    confidence: number;
    dissent: readonly EvaluationResult[];
  } {
    const { voteCounts, weightedVotes } = this.countVotes(evaluations, evidenceQuality);
    const threshold = THRESHOLDS[criticality];
    const recommendation = this.determineRecommendation(voteCounts, weightedVotes, threshold);
    const dissent = evaluations.filter((e) => e.recommendation !== recommendation);
    const confidence = this.calculateVoteConfidence(evaluations, recommendation, evidenceQuality);

    return { recommendation, confidence, dissent };
  }

  /**
   * Count and weight votes from evaluations.
   */
  private countVotes(
    evaluations: readonly EvaluationResult[],
    evidenceQuality: number
  ): {
    voteCounts: Record<Recommendation, number>;
    weightedVotes: Record<Recommendation, number>;
  } {
    const voteCounts: Record<Recommendation, number> = {
      retain: 0,
      review: 0,
      refactor: 0,
      deprecate: 0,
    };
    const weightedVotes: Record<Recommendation, number> = {
      retain: 0,
      review: 0,
      refactor: 0,
      deprecate: 0,
    };

    for (const evaluation of evaluations) {
      voteCounts[evaluation.recommendation] += 1;
      const weight = evaluation.confidence * (0.5 + 0.5 * evidenceQuality);
      weightedVotes[evaluation.recommendation] += weight;
    }

    return { voteCounts, weightedVotes };
  }

  /**
   * Determine final recommendation based on votes and thresholds.
   */
  private determineRecommendation(
    voteCounts: Record<Recommendation, number>,
    weightedVotes: Record<Recommendation, number>,
    threshold: { required: number; total: number }
  ): Recommendation {
    // Check thresholds in order of severity
    if (voteCounts.deprecate >= threshold.required) return 'deprecate';
    if (voteCounts.refactor >= threshold.required) return 'refactor';
    if (voteCounts.review >= threshold.required) return 'review';
    if (voteCounts.retain >= threshold.required) return 'retain';

    // No threshold met - use weighted voting (conservative: don't deprecate)
    const maxWeighted = Math.max(
      weightedVotes.retain,
      weightedVotes.review,
      weightedVotes.refactor
    );

    if (maxWeighted === weightedVotes.refactor) return 'refactor';
    if (maxWeighted === weightedVotes.review) return 'review';
    return 'retain';
  }

  /**
   * Calculate confidence based on agreement and evidence.
   */
  private calculateVoteConfidence(
    evaluations: readonly EvaluationResult[],
    recommendation: Recommendation,
    evidenceQuality: number
  ): number {
    const agreeingVotes = evaluations.filter((e) => e.recommendation === recommendation);
    const avgConfidence =
      agreeingVotes.length > 0
        ? agreeingVotes.reduce((sum, e) => sum + e.confidence, 0) / agreeingVotes.length
        : 0;
    const agreementRatio = agreeingVotes.length / evaluations.length;
    return Math.min(1, avgConfidence * agreementRatio * (0.5 + 0.5 * evidenceQuality));
  }

  /**
   * Format aggregated results for output.
   */
  format(results: readonly AggregatedResult[], options: OutputOptions = {}): string {
    return formatResults(results, options);
  }
}

/**
 * Create an evaluation aggregator with default configuration.
 */
export function createAggregator(config?: AggregationConfig): EvaluationAggregator {
  return new EvaluationAggregator(config);
}

/**
 * Aggregate a batch of component evaluations.
 */
export function aggregateResults(
  evaluationsByComponent: ReadonlyMap<string, readonly EvaluationResult[]>,
  config?: AggregationConfig
): readonly AggregatedResult[] {
  const aggregator = createAggregator(config);
  const results: AggregatedResult[] = [];

  for (const [component, evaluations] of evaluationsByComponent) {
    results.push(aggregator.aggregate(component, evaluations));
  }

  // Sort by recommendation severity (most severe first)
  return results.sort(
    (a, b) =>
      RECOMMENDATION_PRIORITY[b.finalRecommendation] -
      RECOMMENDATION_PRIORITY[a.finalRecommendation]
  );
}
