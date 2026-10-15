/**
 * nexus-agents/cli-adapters - TOPSIS Helper Functions
 *
 * Extracted mathematical utilities for TOPSIS calculations.
 *
 * @module cli-adapters/topsis-helpers
 */

import type { TaskProfile } from '../core/index.js';
import type { CliName } from './types.js';
import type {
  TopsisModelProfile,
  TopsisConfig,
  TopsisScore,
  TopsisResult,
} from './topsis-types.js';
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
  return estimateKeyedCost(profile, inputTokens, outputTokens);
}
function estimateKeyedCost(
  profile: Pick<TopsisModelProfile, 'costPerMillionInput' | 'costPerMillionOutput'>,
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
  return sumSquaresValues(matrix.values(), criteria);
}
function sumSquaresValues(
  rows: Iterable<Record<string, number>>,
  criteria: TopsisConfig['criteria']
): Record<string, number> {
  const sumOfSquares: Record<string, number> = {};
  for (const criterion of criteria) {
    sumOfSquares[criterion.name] = 0;
  }

  for (const values of rows) {
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
  return keyedSavings(profiles, selected);
}
function keyedSavings<Key extends string>(
  profiles: readonly KeyedTopsisProfile<Key>[],
  selected: Key
): number {
  const selectedProfile = profiles.find((p) => p.cliName === selected);
  const highestQuality = profiles.reduce((best, p) =>
    p.qualityScore > best.qualityScore ? p : best
  );

  if (selectedProfile === undefined || selected === highestQuality.cliName) {
    return 0;
  }

  const selectedCost = estimateKeyedCost(selectedProfile, 1000, 500);
  const maxCost = estimateKeyedCost(highestQuality, 1000, 500);

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
  return keyedReasoning(best, ranked, savings);
}
function keyedReasoning<Key extends string>(
  best: KeyedTopsisScore<Key>,
  ranked: KeyedTopsisScore<Key>[],
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

/**
 * Adjusts model profile based on task characteristics.
 */
export function adjustProfileForTask(
  profile: TopsisModelProfile,
  taskProfile: TaskProfile
): TopsisModelProfile {
  return adjustKeyedProfileForTask(profile, taskProfile);
}
export function adjustKeyedProfileForTask<Key extends string>(
  profile: KeyedTopsisProfile<Key>,
  taskProfile: TaskProfile
): KeyedTopsisProfile<Key> {
  if (taskProfile.taskType === 'architecture' || taskProfile.reasoningComplexity > 7) {
    return { ...profile, qualityScore: Math.min(profile.qualityScore * 1.2, 10) };
  }
  if (taskProfile.taskType === 'bulk_operations' || taskProfile.contextRequired < 1000) {
    return { ...profile, averageLatencyMs: profile.averageLatencyMs * 0.8 };
  }
  return profile;
}

/** Internal keyed views; existing public CLI declarations remain unchanged. */
export type KeyedTopsisProfile<Key extends string> = Omit<TopsisModelProfile, 'cliName'> & {
  readonly cliName: Key;
};
type KeyedTopsisScore<Key extends string> = Omit<TopsisScore, 'cliName'> & {
  readonly cliName: Key;
};
type KeyedTopsisResult<Key extends string> = Omit<TopsisResult, 'selectedModel' | 'scores'> & {
  readonly selectedModel: Key;
  readonly scores: readonly KeyedTopsisScore<Key>[];
};

/** The one canonical TOPSIS computation used by CLI and internal actual-arm callers. */
class KeyedTopsisComputation<Key extends string> {
  constructor(private readonly config: TopsisConfig) {}
  rank(
    profiles: readonly KeyedTopsisProfile<Key>[],
    inputTokens = 1000,
    outputTokens = 500
  ): KeyedTopsisResult<Key> {
    // Step 1: Build decision matrix
    const matrix = this.buildDecisionMatrix(profiles, inputTokens, outputTokens);

    // Step 2: Normalize the matrix
    const normalized = this.normalizeMatrix(matrix);

    // Step 3: Apply weights
    const weighted = this.applyWeights(normalized);

    // Step 4: Find ideal solutions
    const { positive, negative } = this.findIdealSolutions(weighted);

    // Step 5: Calculate distances and scores
    const scores = this.calculateScoresOpts({
      profiles,
      matrices: { raw: matrix, normalized, weighted },
      ideals: { positive, negative },
    });

    // Step 6: Rank and select
    const ranked = [...scores].sort((a, b) => b.closenessScore - a.closenessScore);
    const best = ranked[0];

    if (best === undefined) {
      throw new Error('No models available for selection');
    }

    // Calculate savings
    const costSavings = keyedSavings(profiles, best.cliName);

    const result: KeyedTopsisResult<Key> = {
      selectedModel: best.cliName,
      scores: ranked,
      positiveIdeal: positive,
      negativeIdeal: negative,
      costOptimized: costSavings > 10,
      estimatedSavingsPercent: costSavings,
      reasoning: keyedReasoning(best, ranked, costSavings),
    };

    return result;
  }

  /**
   * Builds the decision matrix from model profiles.
   */
  private buildDecisionMatrix(
    profiles: readonly KeyedTopsisProfile<Key>[],
    inputTokens: number,
    outputTokens: number
  ): Map<Key, Record<string, number>> {
    const matrix = new Map<Key, Record<string, number>>();

    for (const profile of profiles) {
      const cost = estimateKeyedCost(profile, inputTokens, outputTokens);
      const values: Record<string, number> = {
        quality: profile.qualityScore,
        cost: cost,
        latency: profile.averageLatencyMs,
      };
      matrix.set(profile.cliName, values);
    }

    return matrix;
  }

  /**
   * Normalizes the decision matrix using vector normalization.
   */
  private normalizeMatrix(
    matrix: Map<Key, Record<string, number>>
  ): Map<Key, Record<string, number>> {
    const sumOfSquares = sumSquaresValues(matrix.values(), this.config.criteria);
    const normFactors = calculateNormFactors(sumOfSquares, this.config.criteria);

    const normalized = new Map<Key, Record<string, number>>();
    for (const [cli, values] of matrix) {
      const normalizedValues: Record<string, number> = {};
      for (const criterion of this.config.criteria) {
        const factor = normFactors[criterion.name] ?? 1;
        normalizedValues[criterion.name] = factor > 0 ? (values[criterion.name] ?? 0) / factor : 0;
      }
      normalized.set(cli, normalizedValues);
    }

    return normalized;
  }

  /**
   * Applies weights to normalized matrix.
   */
  private applyWeights(
    normalized: Map<Key, Record<string, number>>
  ): Map<Key, Record<string, number>> {
    const weighted = new Map<Key, Record<string, number>>();

    for (const [cli, values] of normalized) {
      const weightedValues: Record<string, number> = {};
      for (const criterion of this.config.criteria) {
        weightedValues[criterion.name] = (values[criterion.name] ?? 0) * criterion.weight;
      }
      weighted.set(cli, weightedValues);
    }

    return weighted;
  }

  /**
   * Finds positive and negative ideal solutions.
   */
  private findIdealSolutions(weighted: Map<Key, Record<string, number>>): {
    positive: Record<string, number>;
    negative: Record<string, number>;
  } {
    const positive: Record<string, number> = {};
    const negative: Record<string, number> = {};

    for (const criterion of this.config.criteria) {
      const values: number[] = [];
      for (const weightedValues of weighted.values()) {
        values.push(weightedValues[criterion.name] ?? 0);
      }

      if (values.length === 0) {
        positive[criterion.name] = 0;
        negative[criterion.name] = 0;
        continue;
      }

      if (criterion.beneficial) {
        positive[criterion.name] = Math.max(...values);
        negative[criterion.name] = Math.min(...values);
      } else {
        positive[criterion.name] = Math.min(...values);
        negative[criterion.name] = Math.max(...values);
      }
    }

    return { positive, negative };
  }

  /**
   * Options for calculating TOPSIS scores.
   */
  private calculateScoresOpts(opts: {
    profiles: readonly KeyedTopsisProfile<Key>[];
    matrices: {
      raw: Map<Key, Record<string, number>>;
      normalized: Map<Key, Record<string, number>>;
      weighted: Map<Key, Record<string, number>>;
    };
    ideals: { positive: Record<string, number>; negative: Record<string, number> };
  }): KeyedTopsisScore<Key>[] {
    const { profiles, matrices, ideals } = opts;
    const scores: KeyedTopsisScore<Key>[] = [];

    for (const profile of profiles) {
      const score = this.calculateSingleScore(profile, matrices, ideals);
      scores.push(score);
    }

    return scores;
  }

  /**
   * Calculates TOPSIS score for a single model.
   */
  private calculateSingleScore(
    profile: KeyedTopsisProfile<Key>,
    matrices: {
      raw: Map<Key, Record<string, number>>;
      normalized: Map<Key, Record<string, number>>;
      weighted: Map<Key, Record<string, number>>;
    },
    ideals: { positive: Record<string, number>; negative: Record<string, number> }
  ): KeyedTopsisScore<Key> {
    const cli = profile.cliName;
    const rawValues = matrices.raw.get(cli) ?? {};
    const normalizedValues = matrices.normalized.get(cli) ?? {};
    const weightedValues = matrices.weighted.get(cli) ?? {};

    const distToPIS = calculateDistance(weightedValues, ideals.positive, this.config.criteria);
    const distToNIS = calculateDistance(weightedValues, ideals.negative, this.config.criteria);
    const closeness = distToPIS + distToNIS > 0 ? distToNIS / (distToPIS + distToNIS) : 0;

    return {
      cliName: cli,
      rawValues,
      normalizedValues,
      weightedValues,
      distanceToPIS: distToPIS,
      distanceToNIS: distToNIS,
      closenessScore: closeness,
    };
  }
}

/** Internal arm-aware entry point; no new public barrel export. */
export function rankTopsisProfiles<Key extends string>(
  config: TopsisConfig,
  profiles: readonly KeyedTopsisProfile<Key>[],
  inputTokens?: number,
  outputTokens?: number
): KeyedTopsisResult<Key> {
  return new KeyedTopsisComputation<Key>(config).rank(profiles, inputTokens, outputTokens);
}
