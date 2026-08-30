/**
 * nexus-agents/cli-adapters - TOPSIS Helper Functions
 *
 * Extracted mathematical utilities for TOPSIS calculations.
 *
 * @module cli-adapters/topsis-helpers
 */

import type { CliName } from './types.js';
import type { TopsisModelProfile, TopsisConfig, TopsisScore } from './topsis-types.js';
import { computeTokenCost } from '../learning/token-cost-core.js';

/**
 * Estimates cost for a request based on token counts.
 *
 * Rates come from the routing PROFILE rather than the registry, which is why
 * this path exists separately at all — and why the shared core takes injected
 * rates (#5122). No unpriced policy is needed here: a profile always carries
 * rates, so there is no absent-rate case to fail open or closed on.
 */
export function estimateCost(
  profile: TopsisModelProfile,
  inputTokens: number,
  outputTokens: number
): number {
  return computeTokenCost(
    { input: inputTokens, output: outputTokens },
    {
      inputPer1M: profile.costPerMillionInput,
      outputPer1M: profile.costPerMillionOutput,
    }
  ).costUsd;
}

/**
 * Calculates sum of squares for each criterion.
 */
export function calculateSumOfSquares(
  matrix: Map<CliName, Record<string, number>>,
  criteria: TopsisConfig['criteria']
): Record<string, number> {
  const sumOfSquares: Record<string, number> = {};
  for (const criterion of criteria) {
    sumOfSquares[criterion.name] = 0;
  }

  for (const values of matrix.values()) {
    for (const criterion of criteria) {
      const val = values[criterion.name] ?? 0;
      sumOfSquares[criterion.name] = (sumOfSquares[criterion.name] ?? 0) + val * val;
    }
  }
  return sumOfSquares;
}

/**
 * Calculates normalization factors from sum of squares.
 */
export function calculateNormFactors(
  sumOfSquares: Record<string, number>,
  criteria: TopsisConfig['criteria']
): Record<string, number> {
  const normFactors: Record<string, number> = {};
  for (const criterion of criteria) {
    normFactors[criterion.name] = Math.sqrt(sumOfSquares[criterion.name] ?? 0);
  }
  return normFactors;
}

/**
 * Calculates Euclidean distance between weighted values and ideal.
 */
export function calculateDistance(
  values: Record<string, number>,
  ideal: Record<string, number>,
  criteria: TopsisConfig['criteria']
): number {
  let sumSquares = 0;
  for (const criterion of criteria) {
    const diff = (values[criterion.name] ?? 0) - (ideal[criterion.name] ?? 0);
    sumSquares += diff * diff;
  }
  return Math.sqrt(sumSquares);
}

/**
 * Calculates cost savings percentage compared to highest quality model.
 */
export function calculateSavings(
  profiles: readonly TopsisModelProfile[],
  selected: CliName
): number {
  const selectedProfile = profiles.find((p) => p.cliName === selected);
  const highestQuality = profiles.reduce((best, p) =>
    p.qualityScore > best.qualityScore ? p : best
  );

  if (selectedProfile === undefined || selected === highestQuality.cliName) {
    return 0;
  }

  const selectedCost = estimateCost(selectedProfile, 1000, 500);
  const maxCost = estimateCost(highestQuality, 1000, 500);

  return maxCost > 0 ? ((maxCost - selectedCost) / maxCost) * 100 : 0;
}

/**
 * Generates human-readable reasoning for the selection.
 */
export function generateReasoning(
  best: TopsisScore,
  ranked: TopsisScore[],
  savings: number
): string {
  const parts: string[] = [];

  parts.push(`Selected "${best.cliName}" with closeness score ${best.closenessScore.toFixed(3)}`);

  if (ranked.length > 1 && ranked[1] !== undefined) {
    const runnerUp = ranked[1];
    const diff = best.closenessScore - runnerUp.closenessScore;
    parts.push(`(${(diff * 100).toFixed(1)}% better than ${runnerUp.cliName})`);
  }

  if (savings > 10) {
    parts.push(`Cost savings: ${savings.toFixed(1)}% vs highest quality model`);
  }

  return parts.join('. ');
}
