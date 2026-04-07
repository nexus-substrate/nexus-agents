/**
 * Outcome-Driven Tier Promotion Recommender
 *
 * Analyzes task outcome data to recommend tier changes for MCP tools.
 * Recommendations are advisory only — humans approve changes via config.
 *
 * Thresholds (from Issue #895):
 * - Promote: >30% failure rate at current tier → recommend next tier
 * - Demote:  >95% success rate over 50+ executions → eligible for demotion
 * - Minimum sample: 20 executions before any recommendation
 *
 * @module mcp/gateway/tier-recommender
 * (Source: Issue #895, Epic #888)
 */

import type { PerformanceSummary, GroupStats } from '../../orchestration/outcomes/outcome-types.js';
import { RequestTier, TOOL_TIER_MAP } from './tier-classifier.js';

/** Recommendation direction. */
export type TierDirection = 'promote' | 'demote';

/** A single tier change recommendation. */
export interface TierRecommendation {
  /** Category that triggered this recommendation. */
  category: string;
  /** Current tier for tools in this category. */
  currentTier: RequestTier;
  /** Recommended tier. */
  recommendedTier: RequestTier;
  /** Direction of the recommendation. */
  direction: TierDirection;
  /** Observed success rate (0-1). */
  successRate: number;
  /** Number of observations. */
  sampleCount: number;
  /** Human-readable reason. */
  reason: string;
}

/** Configuration for tier recommendation thresholds. */
export interface TierRecommenderConfig {
  /** Minimum executions before making any recommendation. */
  readonly minSamples: number;
  /** Failure rate threshold for promotion (0-1). */
  readonly promoteFailureRate: number;
  /** Success rate threshold for demotion (0-1). */
  readonly demoteSuccessRate: number;
  /** Minimum executions for demotion eligibility. */
  readonly demoteMinSamples: number;
}

/** Default configuration per issue spec. */
const DEFAULT_CONFIG: TierRecommenderConfig = {
  minSamples: 20,
  promoteFailureRate: 0.3,
  demoteSuccessRate: 0.95,
  demoteMinSamples: 50,
};

/** Maps categories to their typical tool tier (best effort). */
function getCategoryTier(category: string): RequestTier {
  // Tools that tend to be used for each category
  const categoryToolMap: Record<string, string> = {
    research: 'research_query',
    exploration: 'research_discover',
    code_generation: 'delegate_to_model',
    code_review: 'run_workflow',
    architecture: 'orchestrate',
    security_review: 'orchestrate',
    planning: 'orchestrate',
    documentation: 'run_workflow',
    testing: 'execute_expert',
    devops: 'delegate_to_model',
  };

  const tool = categoryToolMap[category];
  if (tool !== undefined) {
    return TOOL_TIER_MAP[tool] ?? RequestTier.ANALYZED;
  }
  return RequestTier.ANALYZED;
}

/**
 * Generates tier recommendations from outcome data.
 *
 * @param summary - Performance summary from OutcomeStore.summarize()
 * @param config - Optional threshold overrides
 * @returns Array of tier change recommendations (may be empty)
 */
export function generateTierRecommendations(
  summary: PerformanceSummary,
  config?: Partial<TierRecommenderConfig>
): TierRecommendation[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const recommendations: TierRecommendation[] = [];

  for (const [category, stats] of summary.byCategory) {
    const rec = evaluateCategory(category, stats, cfg);
    if (rec !== null) recommendations.push(rec);
  }

  return recommendations;
}

/** Evaluates a single category for promotion or demotion. */
function evaluateCategory(
  category: string,
  stats: GroupStats,
  cfg: TierRecommenderConfig
): TierRecommendation | null {
  if (stats.count < cfg.minSamples) return null;

  const currentTier = getCategoryTier(category);
  const failureRate = 1 - stats.successRate;

  // Check for promotion (too many failures at current tier)
  if (failureRate > cfg.promoteFailureRate && currentTier < RequestTier.ORCHESTRATED) {
    const recommendedTier = currentTier + 1;
    return {
      category,
      currentTier,
      recommendedTier,
      direction: 'promote',
      successRate: stats.successRate,
      sampleCount: stats.count,
      reason: `${category}: ${(failureRate * 100).toFixed(0)}% failure rate over ${String(stats.count)} tasks — recommend promoting to Tier ${String(recommendedTier)}`,
    };
  }

  // Check for demotion (consistently successful at current tier)
  if (
    stats.successRate > cfg.demoteSuccessRate &&
    stats.count >= cfg.demoteMinSamples &&
    currentTier > RequestTier.DIRECT
  ) {
    const recommendedTier = currentTier - 1;
    return {
      category,
      currentTier,
      recommendedTier,
      direction: 'demote',
      successRate: stats.successRate,
      sampleCount: stats.count,
      reason: `${category}: ${(stats.successRate * 100).toFixed(0)}% success rate over ${String(stats.count)} tasks — eligible for demotion to Tier ${String(recommendedTier)}`,
    };
  }

  return null;
}
