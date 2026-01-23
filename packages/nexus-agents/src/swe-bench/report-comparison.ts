/**
 * nexus-agents/swe-bench - Report Comparison
 *
 * Generates comparison reports against competitors.
 *
 * @module swe-bench/report-comparison
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { EvaluationRunResult, CompetitorResult } from './evaluation-harness-types.js';
import type { ReportComparison } from './evaluation-report-types.js';

// ============================================================================
// Comparison Functions
// ============================================================================

/**
 * Generates comparison report against competitors.
 */
export function generateComparison(
  result: EvaluationRunResult,
  competitors: readonly CompetitorResult[]
): ReportComparison {
  const allRates = [
    { name: result.modelNameOrPath, rate: result.metrics.resolutionRate },
    ...competitors.map((c) => ({ name: c.displayName, rate: c.resolutionRate })),
  ].sort((a, b) => b.rate - a.rate);

  const nexusRanking = allRates.findIndex((r) => r.name === result.modelNameOrPath) + 1;

  const topRate = allRates[0]?.rate ?? 0;
  const gapFromTop = topRate - result.metrics.resolutionRate;

  const avgRate = allRates.reduce((sum, r) => sum + r.rate, 0) / allRates.length;
  const differenceFromAverage = result.metrics.resolutionRate - avgRate;

  const strengths = identifyStrengths(result, competitors);
  const weaknesses = identifyWeaknesses(result, competitors);

  return {
    competitors,
    nexusRanking,
    gapFromTop,
    differenceFromAverage,
    strengths,
    weaknesses,
  };
}

/**
 * Identifies strengths compared to competitors.
 */
export function identifyStrengths(
  result: EvaluationRunResult,
  competitors: readonly CompetitorResult[]
): readonly string[] {
  const strengths: string[] = [];
  const avgRate = competitors.reduce((sum, c) => sum + c.resolutionRate, 0) / competitors.length;

  if (result.metrics.resolutionRate > avgRate) {
    strengths.push('Above average resolution rate');
  }

  if (result.metrics.patchApplicationRate > 0.9) {
    strengths.push('High patch application success rate');
  }

  return strengths;
}

/**
 * Identifies weaknesses compared to competitors.
 */
export function identifyWeaknesses(
  result: EvaluationRunResult,
  competitors: readonly CompetitorResult[]
): readonly string[] {
  const weaknesses: string[] = [];
  const avgRate = competitors.reduce((sum, c) => sum + c.resolutionRate, 0) / competitors.length;

  if (result.metrics.resolutionRate < avgRate) {
    weaknesses.push('Below average resolution rate');
  }

  if (result.metrics.errors > result.metrics.totalInstances * 0.1) {
    weaknesses.push('High error rate during evaluation');
  }

  return weaknesses;
}
