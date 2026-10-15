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
import type { TopsisModelProfile, TopsisConfig, TopsisResult } from './topsis-types.js';
import { DEFAULT_TOPSIS_CONFIG, getDefaultTopsisProfiles } from './topsis-types.js';
/** Tolerance for weight sum validation (weights must sum to 1.0 ± this). */
const WEIGHT_SUM_TOLERANCE = 0.01;

import { rankTopsisProfiles } from './topsis-helpers.js';

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
  /** Profiles to evaluate (defaults to current registry-priced CLI profiles). */
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
    if (Math.abs(sum - 1.0) > WEIGHT_SUM_TOLERANCE) {
      throw new Error(`Criteria weights must sum to 1.0, got ${sum.toFixed(3)}`);
    }
  }

  /**
   * Selects the optimal model using TOPSIS algorithm.
   */
  selectModel(opts: SelectModelOptions = {}): TopsisResult {
    const result = rankTopsisProfiles(
      this.config,
      opts.profiles ?? getDefaultTopsisProfiles(),
      opts.expectedInputTokens,
      opts.expectedOutputTokens
    );
    this.logResult(result);
    return result;
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
