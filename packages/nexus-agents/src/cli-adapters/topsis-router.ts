/**
 * nexus-agents/cli-adapters - TOPSIS Multi-Criteria Router
 *
 * Implementation of TOPSIS (Technique for Order of Preference by Similarity
 * to Ideal Solution) for Pareto-optimal model selection balancing
 * performance vs cost.
 *
 * @module cli-adapters/topsis-router
 * (Source: arXiv:2509.07571, Issue #146)
 */

import type { ILogger } from '../core/index.js';
import { createLogger } from '../core/index.js';
import type { CliName } from './types.js';
import type {
  TopsisModelProfile,
  TopsisConfig,
  TopsisScore,
  TopsisResult,
} from './topsis-types.js';
import { DEFAULT_TOPSIS_CONFIG, DEFAULT_MODEL_PROFILES } from './topsis-types.js';
import {
  estimateCost,
  calculateSumOfSquares,
  calculateNormFactors,
  calculateDistance,
  calculateSavings,
  generateReasoning,
} from './topsis-helpers.js';

// Re-export helpers for backward compatibility
export {
  estimateCost,
  calculateSumOfSquares,
  calculateNormFactors,
  calculateDistance,
  calculateSavings,
  generateReasoning,
} from './topsis-helpers.js';

/**
 * Options for selecting a model with TOPSIS.
 */
export interface SelectModelOptions {
  /** Profiles to evaluate (defaults to DEFAULT_MODEL_PROFILES) */
  profiles?: readonly TopsisModelProfile[];
  /** Expected input tokens for cost calculation */
  expectedInputTokens?: number;
  /** Expected output tokens for cost calculation */
  expectedOutputTokens?: number;
}

/**
 * TOPSIS Router for multi-criteria model selection.
 */
export class TopsisRouter {
  private readonly config: TopsisConfig;
  private readonly logger: ILogger;

  constructor(config: Partial<TopsisConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_TOPSIS_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'TopsisRouter' });
    this.validateWeights();
  }

  /**
   * Validates that criteria weights sum to 1.0 (within tolerance).
   */
  private validateWeights(): void {
    const sum = this.config.criteria.reduce((acc, c) => acc + c.weight, 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      throw new Error(`Criteria weights must sum to 1.0, got ${sum.toFixed(3)}`);
    }
  }

  /**
   * Selects the optimal model using TOPSIS algorithm.
   */
  selectModel(opts: SelectModelOptions = {}): TopsisResult {
    const profiles = opts.profiles ?? DEFAULT_MODEL_PROFILES;
    const inputTokens = opts.expectedInputTokens ?? 1000;
    const outputTokens = opts.expectedOutputTokens ?? 500;

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
    const costSavings = calculateSavings(profiles, best.cliName);

    const result: TopsisResult = {
      selectedModel: best.cliName,
      scores: ranked,
      positiveIdeal: positive,
      negativeIdeal: negative,
      costOptimized: costSavings > 10,
      estimatedSavingsPercent: costSavings,
      reasoning: generateReasoning(best, ranked, costSavings),
    };

    this.logResult(result);
    return result;
  }

  /**
   * Builds the decision matrix from model profiles.
   */
  private buildDecisionMatrix(
    profiles: readonly TopsisModelProfile[],
    inputTokens: number,
    outputTokens: number
  ): Map<CliName, Record<string, number>> {
    const matrix = new Map<CliName, Record<string, number>>();

    for (const profile of profiles) {
      const cost = estimateCost(profile, inputTokens, outputTokens);
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
    matrix: Map<CliName, Record<string, number>>
  ): Map<CliName, Record<string, number>> {
    const sumOfSquares = calculateSumOfSquares(matrix, this.config.criteria);
    const normFactors = calculateNormFactors(sumOfSquares, this.config.criteria);

    const normalized = new Map<CliName, Record<string, number>>();
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
    normalized: Map<CliName, Record<string, number>>
  ): Map<CliName, Record<string, number>> {
    const weighted = new Map<CliName, Record<string, number>>();

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
  private findIdealSolutions(weighted: Map<CliName, Record<string, number>>): {
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
    profiles: readonly TopsisModelProfile[];
    matrices: {
      raw: Map<CliName, Record<string, number>>;
      normalized: Map<CliName, Record<string, number>>;
      weighted: Map<CliName, Record<string, number>>;
    };
    ideals: { positive: Record<string, number>; negative: Record<string, number> };
  }): TopsisScore[] {
    const { profiles, matrices, ideals } = opts;
    const scores: TopsisScore[] = [];

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
    profile: TopsisModelProfile,
    matrices: {
      raw: Map<CliName, Record<string, number>>;
      normalized: Map<CliName, Record<string, number>>;
      weighted: Map<CliName, Record<string, number>>;
    },
    ideals: { positive: Record<string, number>; negative: Record<string, number> }
  ): TopsisScore {
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

  /**
   * Logs the TOPSIS result.
   */
  private logResult(result: TopsisResult): void {
    this.logger.info('TOPSIS selection complete', {
      selected: result.selectedModel,
      costOptimized: result.costOptimized,
      savingsPercent: result.estimatedSavingsPercent.toFixed(1),
    });

    if (this.config.verbose) {
      for (const score of result.scores) {
        this.logger.debug('Model score', {
          cli: score.cliName,
          closeness: score.closenessScore.toFixed(3),
          distToPIS: score.distanceToPIS.toFixed(4),
          distToNIS: score.distanceToNIS.toFixed(4),
        });
      }
    }
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): TopsisConfig {
    return this.config;
  }
}

/**
 * Creates a TOPSIS router with optional configuration.
 */
export function createTopsisRouter(config?: Partial<TopsisConfig>, logger?: ILogger): TopsisRouter {
  return new TopsisRouter(config, logger);
}

/**
 * Quick model selection using TOPSIS with default settings.
 */
export function selectModelWithTopsis(opts: SelectModelOptions = {}): TopsisResult {
  const router = createTopsisRouter();
  return router.selectModel(opts);
}
