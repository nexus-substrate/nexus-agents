/**
 * DAAO Estimator - Difficulty-Aware Agent Orchestration
 * @module cli-adapters/daao-estimator
 * (Source: Issue #334, arXiv:2509.11079)
 */

import { createLogger, type ILogger } from '../core/index.js';
import { clamp, clamp01 } from '../utils/math-utils.js';
import type { CliTask, CliName } from './types.js';
import type { DifficultyLevel, ModelTier } from './zero-router-types.js';
import {
  type DAAOConfig,
  type DAAODifficultyEstimate,
  type DAAORoutingDecision,
  type DAAOOutcome,
  type DAAOCalibrationStats,
  type EncodedFeatures,
  type FeatureDimension,
  type FeatureWeights,
  DAAOConfigSchema,
  DAAOError,
  FEATURE_DIMENSIONS,
} from './daao-types.js';
import {
  tokenize,
  extractLexicalComplexity,
  extractSyntacticComplexity,
  extractSemanticDensity,
  extractTechnicalSpecificity,
  extractTaskScope,
  extractConstraintComplexity,
  extractClarity,
  extractOutputComplexity,
} from './daao-feature-extraction.js';

/** Interface for DAAO estimator for dependency injection. */
export interface IDAAOEstimator {
  encode(task: CliTask): EncodedFeatures;
  estimateDifficulty(task: CliTask): DAAODifficultyEstimate;
  route(task: CliTask, availableClis?: CliName[]): DAAORoutingDecision;
  calibrate(outcome: DAAOOutcome): void;
  getCalibrationStats(): DAAOCalibrationStats;
  getConfig(): DAAOConfig;
}

/** DAAO difficulty estimator implementation. */
export class DAAOEstimator implements IDAAOEstimator {
  private readonly config: DAAOConfig;
  private readonly logger: ILogger;
  private readonly outcomes: DAAOOutcome[] = [];
  private calibrationBias = 0;

  constructor(config?: Partial<DAAOConfig>, logger?: ILogger) {
    this.config = DAAOConfigSchema.parse(config ?? {});
    this.logger = logger ?? createLogger({ component: 'DAAOEstimator' });

    this.logger.debug('DAAOEstimator initialized', {
      thresholds: this.config.thresholds,
      enableCalibration: this.config.enableCalibration,
    });
  }

  /**
   * Encodes task content into feature vector.
   */
  encode(task: CliTask): EncodedFeatures {
    const content = task.content + (task.systemPrompt ?? '');
    const lower = content.toLowerCase();
    const words = tokenize(content);

    return {
      lexicalComplexity: extractLexicalComplexity(words),
      syntacticComplexity: extractSyntacticComplexity(content, lower),
      semanticDensity: extractSemanticDensity(words, lower),
      technicalSpecificity: extractTechnicalSpecificity(lower),
      taskScope: extractTaskScope(lower),
      constraintComplexity: extractConstraintComplexity(lower),
      clarity: extractClarity(lower),
      outputComplexity: extractOutputComplexity(lower),
    };
  }

  /**
   * Estimates difficulty for a task.
   */
  estimateDifficulty(task: CliTask): DAAODifficultyEstimate {
    const features = this.encode(task);
    let score = this.aggregateFeatures(features, this.config.weights);

    if (this.config.enableCalibration && this.hasMinimumCalibrationData()) {
      score = this.applyCalibration(score);
    }

    score = clamp01(score);

    const level = this.classifyLevel(score);
    const recommendedTier = this.getTierForLevel(level);
    const confidence = this.calculateConfidence(features);
    const dominantFeature = this.findDominantFeature(features);
    const reconstructionError = this.calculateReconstructionError(features);

    const estimate: DAAODifficultyEstimate = {
      features,
      score,
      level,
      recommendedTier,
      confidence,
      dominantFeature,
      reconstructionError,
    };

    if (this.config.verbose) {
      this.logger.debug('Difficulty estimated', {
        score: score.toFixed(3),
        level,
        tier: recommendedTier,
        dominant: dominantFeature,
      });
    }

    return estimate;
  }

  /**
   * Routes a task based on difficulty estimation.
   */
  route(task: CliTask, availableClis?: CliName[]): DAAORoutingDecision {
    const estimate = this.estimateDifficulty(task);
    const tier = estimate.recommendedTier;
    const tierClis = this.config.tierToClis[tier];

    let candidates = tierClis;
    if (availableClis !== undefined) {
      if (availableClis.length === 0) {
        throw new DAAOError('No CLIs available for routing', 'NO_AVAILABLE_CLIS');
      }
      candidates = tierClis.filter((cli) => availableClis.includes(cli));
      if (candidates.length === 0) {
        candidates = availableClis;
      }
    }

    if (candidates.length === 0) {
      throw new DAAOError('No CLIs available for routing', 'NO_AVAILABLE_CLIS');
    }

    const selectedCli = candidates[0] as CliName;
    const alternatives = candidates.slice(1);
    const isTypicalPattern = estimate.reconstructionError < this.config.typicalPatternThreshold;
    const reason = this.buildReason(estimate, selectedCli, isTypicalPattern);

    return { estimate, selectedCli, tier, alternatives, reason, isTypicalPattern };
  }

  /**
   * Records an outcome for calibration.
   */
  calibrate(outcome: DAAOOutcome): void {
    if (!this.config.enableCalibration) {
      return;
    }

    this.outcomes.push(outcome);
    while (this.outcomes.length > this.config.maxCalibrationOutcomes) {
      this.outcomes.shift();
    }
    this.updateCalibrationBias();
  }

  /**
   * Gets calibration statistics.
   */
  getCalibrationStats(): DAAOCalibrationStats {
    if (this.outcomes.length === 0) {
      return {
        totalOutcomes: 0,
        meanAbsoluteError: 0,
        successRateByLevel: { easy: 0, medium: 0, hard: 0 },
        avgReconstructionError: 0,
        featureImportance: [...FEATURE_DIMENSIONS],
        calibrationBias: 0,
      };
    }

    return {
      totalOutcomes: this.outcomes.length,
      meanAbsoluteError: this.calculateMeanAbsoluteError(),
      successRateByLevel: this.calculateSuccessRateByLevel(),
      avgReconstructionError: this.calculateAvgReconstructionError(),
      featureImportance: this.calculateFeatureImportance(),
      calibrationBias: this.calibrationBias,
    };
  }

  /** Gets current configuration. */
  getConfig(): DAAOConfig {
    return { ...this.config };
  }

  private aggregateFeatures(features: EncodedFeatures, weights: FeatureWeights): number {
    let sum = 0;
    let weightSum = 0;

    for (const dim of FEATURE_DIMENSIONS) {
      let value = features[dim];
      if (dim === 'clarity') {
        value = 1 - value;
      }
      sum += value * weights[dim];
      weightSum += weights[dim];
    }

    return weightSum > 0 ? sum / weightSum : 0;
  }

  private classifyLevel(score: number): DifficultyLevel {
    if (score < this.config.thresholds.easyUpperBound) return 'easy';
    if (score > this.config.thresholds.hardLowerBound) return 'hard';
    return 'medium';
  }

  private getTierForLevel(level: DifficultyLevel): ModelTier {
    const mapping: Record<DifficultyLevel, ModelTier> = {
      easy: 'fast',
      medium: 'balanced',
      hard: 'powerful',
    };
    return mapping[level];
  }

  private calculateConfidence(features: EncodedFeatures): number {
    const values = FEATURE_DIMENSIONS.map((dim) => features[dim]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return clamp01(1 - Math.sqrt(variance) / 0.5);
  }

  private findDominantFeature(features: EncodedFeatures): FeatureDimension {
    let maxDim: FeatureDimension = 'lexicalComplexity';
    let maxValue = features.lexicalComplexity;

    for (const dim of FEATURE_DIMENSIONS) {
      const value = dim === 'clarity' ? 1 - features[dim] : features[dim];
      if (value > maxValue) {
        maxValue = value;
        maxDim = dim;
      }
    }

    return maxDim;
  }

  private calculateReconstructionError(features: EncodedFeatures): number {
    const values = FEATURE_DIMENSIONS.map((dim) => features[dim]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const mad = values.reduce((sum, val) => sum + Math.abs(val - mean), 0) / values.length;
    return Math.min(1, mad * 2);
  }

  private hasMinimumCalibrationData(): boolean {
    return this.outcomes.length >= this.config.minCalibrationOutcomes;
  }

  private applyCalibration(score: number): number {
    return score + this.calibrationBias;
  }

  private updateCalibrationBias(): void {
    if (this.outcomes.length < 10) {
      this.calibrationBias = 0;
      return;
    }

    let biasSum = 0;
    for (const outcome of this.outcomes) {
      if (!outcome.success) {
        biasSum += 0.1 * (1 - outcome.estimatedScore);
      }
    }

    this.calibrationBias = biasSum / this.outcomes.length;
    this.calibrationBias = clamp(this.calibrationBias, -0.2, 0.2);
  }

  private calculateSuccessRateByLevel(): Record<DifficultyLevel, number> {
    const levels: DifficultyLevel[] = ['easy', 'medium', 'hard'];
    const result: Record<DifficultyLevel, number> = { easy: 0, medium: 0, hard: 0 };

    for (const level of levels) {
      const levelOutcomes = this.outcomes.filter(
        (o) => this.classifyLevel(o.estimatedScore) === level
      );
      if (levelOutcomes.length > 0) {
        result[level] = levelOutcomes.filter((o) => o.success).length / levelOutcomes.length;
      }
    }

    return result;
  }

  private calculateMeanAbsoluteError(): number {
    const withQuality = this.outcomes.filter((o) => o.qualityScore !== undefined);
    if (withQuality.length === 0) return 0;
    const totalError = withQuality.reduce(
      (sum, o) => sum + Math.abs(o.estimatedScore - (o.qualityScore ?? 0)),
      0
    );
    return totalError / withQuality.length;
  }

  private calculateAvgReconstructionError(): number {
    const totalError = this.outcomes.reduce(
      (sum, o) => sum + this.calculateReconstructionError(o.features),
      0
    );
    return totalError / this.outcomes.length;
  }

  private calculateFeatureImportance(): FeatureDimension[] {
    const importance: Array<{ dim: FeatureDimension; score: number }> = [];

    for (const dim of FEATURE_DIMENSIONS) {
      const values = this.outcomes.map((o) => o.features[dim]);
      if (values.length === 0) {
        importance.push({ dim, score: 0 });
        continue;
      }
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      importance.push({ dim, score: variance * this.config.weights[dim] });
    }

    return importance.sort((a, b) => b.score - a.score).map((i) => i.dim);
  }

  private buildReason(
    estimate: DAAODifficultyEstimate,
    selectedCli: CliName,
    isTypicalPattern: boolean
  ): string {
    const parts: string[] = [];
    parts.push(`Task difficulty: ${estimate.level} (${(estimate.score * 100).toFixed(1)}%)`);
    parts.push(`Dominant feature: ${estimate.dominantFeature}`);
    parts.push(`Selected ${selectedCli} for ${estimate.recommendedTier} tier`);

    if (!isTypicalPattern) {
      parts.push('(atypical task pattern detected)');
    }

    if (this.config.enableCalibration && this.hasMinimumCalibrationData()) {
      const sign = this.calibrationBias > 0 ? '+' : '';
      parts.push(`[calibration applied: ${sign}${(this.calibrationBias * 100).toFixed(1)}%]`);
    }

    return parts.join('. ');
  }
}

/** Creates a DAAO estimator instance. */
export function createDAAOEstimator(
  config?: Partial<DAAOConfig>,
  logger?: ILogger
): IDAAOEstimator {
  return new DAAOEstimator(config, logger);
}

/** Quick function to estimate difficulty. */
export function estimateDAAODifficulty(task: CliTask): DAAODifficultyEstimate {
  const estimator = new DAAOEstimator({ verbose: false, enableCalibration: false });
  return estimator.estimateDifficulty(task);
}

/** Quick function to route by DAAO difficulty. */
export function routeByDAAODifficulty(
  task: CliTask,
  availableClis?: CliName[]
): DAAORoutingDecision {
  const estimator = new DAAOEstimator({ verbose: false, enableCalibration: false });
  return estimator.route(task, availableClis);
}

/** Quick function to encode task features. */
export function encodeTaskFeatures(task: CliTask): EncodedFeatures {
  const estimator = new DAAOEstimator({ verbose: false, enableCalibration: false });
  return estimator.encode(task);
}
