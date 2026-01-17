/**
 * nexus-agents/cli-adapters - ZeroRouter
 *
 * Universal difficulty space routing for intelligent model selection.
 * Creates a unified difficulty metric across diverse task types,
 * enabling better model selection across domains.
 *
 * @module cli-adapters/zero-router
 * (Source: Issue #338)
 */

import { createLogger, type ILogger } from '../core/index.js';
import type { CliName, CliTask } from './types.js';
import { analyzeTask, type TaskProfile } from './task-analyzer.js';
import type { Task } from '../core/types/agent.js';
import {
  type ZeroRouterConfig,
  type DifficultyEstimate,
  type DifficultyOutcome,
  type CalibrationStats,
  type ZeroRoutingDecision,
  type DifficultyLevel,
  type ModelTier,
  ZeroRouterConfigSchema,
  ZeroRoutingError,
} from './zero-router-types.js';
import {
  estimateDifficultySpace,
  aggregateDifficulty,
  findDominantDimension,
  classifyDifficultyLevel,
  calculateEstimateConfidence,
  summarizeDifficultySpace,
} from './difficulty-space.js';

// Re-export types for consumers
export {
  ZeroRouterConfigSchema,
  ZeroRoutingError,
  DEFAULT_DIFFICULTY_THRESHOLDS,
  type ZeroRouterConfig,
  type DifficultyEstimate,
  type DifficultyOutcome,
  type CalibrationStats,
  type ZeroRoutingDecision,
  type DifficultyLevel,
  type ModelTier,
  type DifficultyThresholds,
} from './zero-router-types.js';

/**
 * Interface for ZeroRouter for dependency injection.
 */
export interface IZeroRouter {
  estimateDifficulty(task: CliTask): DifficultyEstimate;
  routeByDifficulty(task: CliTask, availableClis?: CliName[]): ZeroRoutingDecision;
  calibrate(outcome: DifficultyOutcome): void;
  getCalibrationStats(): CalibrationStats;
  getConfig(): ZeroRouterConfig;
}

/**
 * ZeroRouter implementation.
 *
 * Routes tasks based on a universal difficulty space that normalizes
 * task difficulty across different dimensions (reasoning, knowledge,
 * creativity, precision, context length).
 */
export class ZeroRouter implements IZeroRouter {
  private readonly config: ZeroRouterConfig;
  private readonly logger: ILogger;
  private readonly outcomes: DifficultyOutcome[] = [];
  private calibrationBias = 0;

  constructor(config?: Partial<ZeroRouterConfig>, logger?: ILogger) {
    this.config = ZeroRouterConfigSchema.parse(config ?? {});
    this.logger = logger ?? createLogger({ component: 'ZeroRouter' });

    this.logger.debug('ZeroRouter initialized', {
      thresholds: this.config.thresholds,
      enableCalibration: this.config.enableCalibration,
    });
  }

  /**
   * Estimates difficulty for a task.
   *
   * @param task - CLI task to analyze
   * @returns Difficulty estimate with all dimensions and aggregate score
   */
  estimateDifficulty(task: CliTask): DifficultyEstimate {
    const taskProfile = this.analyzeTaskProfile(task);
    const dimensions = estimateDifficultySpace(task, taskProfile);

    // Aggregate with configured weights
    let aggregateScore = aggregateDifficulty(dimensions, this.config.weights);

    // Apply calibration adjustment if enabled and sufficient data
    let calibrationApplied = false;
    if (this.config.enableCalibration && this.hasMinimumCalibrationData()) {
      aggregateScore = this.applyCalibrationAdjustment(aggregateScore);
      calibrationApplied = true;
    }

    // Ensure bounds after calibration
    aggregateScore = Math.max(0, Math.min(1, aggregateScore));

    const level = classifyDifficultyLevel(aggregateScore, this.config.thresholds);
    const recommendedTier = this.getTierForLevel(level);
    const confidence = calculateEstimateConfidence(dimensions);
    const dominantDimension = findDominantDimension(dimensions);

    const estimate: DifficultyEstimate = {
      dimensions,
      aggregateScore,
      level,
      recommendedTier,
      confidence,
      dominantDimension,
    };

    if (this.config.verbose) {
      this.logger.debug('Difficulty estimated', {
        aggregate: aggregateScore.toFixed(3),
        level,
        tier: recommendedTier,
        dominant: dominantDimension,
        calibrationApplied,
        summary: summarizeDifficultySpace(dimensions),
      });
    }

    return estimate;
  }

  /**
   * Routes a task based on difficulty.
   *
   * @param task - CLI task to route
   * @param availableClis - Optional list of available CLIs (filters selection)
   * @returns Routing decision with selected CLI and explanation
   */
  routeByDifficulty(task: CliTask, availableClis?: CliName[]): ZeroRoutingDecision {
    const difficulty = this.estimateDifficulty(task);
    const tier = difficulty.recommendedTier;
    const tierClis = this.config.tierToClis[tier] as CliName[];

    // Filter by available CLIs if provided
    let candidates = tierClis;
    if (availableClis !== undefined) {
      // Empty array means explicitly no CLIs available
      if (availableClis.length === 0) {
        throw new ZeroRoutingError('No CLIs available for routing', 'NO_AVAILABLE_CLIS');
      }
      candidates = tierClis.filter((cli) => availableClis.includes(cli));
      // Fall back to any available if no tier match
      if (candidates.length === 0) {
        candidates = availableClis;
      }
    }

    if (candidates.length === 0) {
      throw new ZeroRoutingError('No CLIs available for routing', 'NO_AVAILABLE_CLIS');
    }

    const selectedCli = candidates[0] as CliName;
    const alternatives = candidates.slice(1);
    const calibrationApplied = this.config.enableCalibration && this.hasMinimumCalibrationData();

    const reason = this.buildRoutingReason(difficulty, selectedCli, calibrationApplied);

    return {
      difficulty,
      selectedCli,
      tier,
      alternatives,
      reason,
      calibrationApplied,
      calibrationAdjustment: calibrationApplied ? this.calibrationBias : undefined,
    };
  }

  /**
   * Records an outcome for calibration.
   *
   * @param outcome - Difficulty outcome with success/quality information
   */
  calibrate(outcome: DifficultyOutcome): void {
    if (!this.config.enableCalibration) {
      return;
    }

    this.outcomes.push(outcome);

    // Trim to max size
    while (this.outcomes.length > this.config.maxCalibrationOutcomes) {
      this.outcomes.shift();
    }

    // Recalculate calibration bias
    this.updateCalibrationBias();

    if (this.config.verbose) {
      this.logger.debug('Calibration outcome recorded', {
        estimated: outcome.estimatedDifficulty.toFixed(3),
        success: outcome.success,
        quality: outcome.qualityScore,
        totalOutcomes: this.outcomes.length,
        newBias: this.calibrationBias.toFixed(4),
      });
    }
  }

  /**
   * Gets calibration statistics.
   *
   * @returns Calibration statistics for observability
   */
  getCalibrationStats(): CalibrationStats {
    if (this.outcomes.length === 0) {
      return {
        totalOutcomes: 0,
        meanAbsoluteError: 0,
        difficultySuccessCorrelation: 0,
        successRateByLevel: { easy: 0, medium: 0, hard: 0 },
        avgQualityByLevel: { easy: 0, medium: 0, hard: 0 },
        calibrationBias: 0,
      };
    }

    const outcomesByLevel = this.groupOutcomesByLevel();
    const successRateByLevel = this.calculateSuccessRateByLevel(outcomesByLevel);
    const avgQualityByLevel = this.calculateAvgQualityByLevel(outcomesByLevel);
    const meanAbsoluteError = this.calculateMeanAbsoluteError();
    const difficultySuccessCorrelation = this.calculateCorrelation();

    return {
      totalOutcomes: this.outcomes.length,
      meanAbsoluteError,
      difficultySuccessCorrelation,
      successRateByLevel,
      avgQualityByLevel,
      calibrationBias: this.calibrationBias,
    };
  }

  /**
   * Gets current configuration.
   */
  getConfig(): ZeroRouterConfig {
    return { ...this.config };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private analyzeTaskProfile(task: CliTask): TaskProfile {
    // Convert CliTask to Task for the analyzer
    const internalTask: Task = {
      id: this.hashTask(task.content),
      description: task.content,
      context: {
        history: [],
        metadata: {},
      },
    };
    return analyzeTask(internalTask);
  }

  private getTierForLevel(level: DifficultyLevel): ModelTier {
    return this.config.difficultyToTier[level] as ModelTier;
  }

  private hasMinimumCalibrationData(): boolean {
    return this.outcomes.length >= this.config.minCalibrationOutcomes;
  }

  private applyCalibrationAdjustment(score: number): number {
    // Apply bias correction: if we're underestimating, increase scores
    return score + this.calibrationBias;
  }

  private updateCalibrationBias(): void {
    if (this.outcomes.length < 10) {
      this.calibrationBias = 0;
      return;
    }

    // Calculate bias: difference between estimated and actual difficulty
    // Actual difficulty is inferred from success rate
    // Low success = task was harder than estimated (positive bias needed)
    // High success = task was easier than estimated (negative bias needed)

    let biasSum = 0;
    let count = 0;

    for (const outcome of this.outcomes) {
      // Infer actual difficulty from success (failure indicates harder task)
      const actualDifficulty = outcome.success ? outcome.estimatedDifficulty : 1.0;
      const error = actualDifficulty - outcome.estimatedDifficulty;
      biasSum += error;
      count++;
    }

    // Small learning rate to prevent overcorrection
    const learningRate = 0.1;
    const rawBias = count > 0 ? biasSum / count : 0;
    this.calibrationBias = rawBias * learningRate;

    // Clamp bias to reasonable range
    this.calibrationBias = Math.max(-0.2, Math.min(0.2, this.calibrationBias));
  }

  private groupOutcomesByLevel(): Record<DifficultyLevel, DifficultyOutcome[]> {
    const groups: Record<DifficultyLevel, DifficultyOutcome[]> = {
      easy: [],
      medium: [],
      hard: [],
    };

    for (const outcome of this.outcomes) {
      const level = classifyDifficultyLevel(outcome.estimatedDifficulty, this.config.thresholds);
      groups[level].push(outcome);
    }

    return groups;
  }

  private calculateSuccessRateByLevel(
    groups: Record<DifficultyLevel, DifficultyOutcome[]>
  ): Record<DifficultyLevel, number> {
    const result: Record<DifficultyLevel, number> = { easy: 0, medium: 0, hard: 0 };

    for (const level of ['easy', 'medium', 'hard'] as DifficultyLevel[]) {
      const levelOutcomes = groups[level];
      if (levelOutcomes.length > 0) {
        const successes = levelOutcomes.filter((o) => o.success).length;
        result[level] = successes / levelOutcomes.length;
      }
    }

    return result;
  }

  private calculateAvgQualityByLevel(
    groups: Record<DifficultyLevel, DifficultyOutcome[]>
  ): Record<DifficultyLevel, number> {
    const result: Record<DifficultyLevel, number> = { easy: 0, medium: 0, hard: 0 };

    for (const level of ['easy', 'medium', 'hard'] as DifficultyLevel[]) {
      const levelOutcomes = groups[level];
      const withQuality = levelOutcomes.filter((o) => o.qualityScore !== undefined);
      if (withQuality.length > 0) {
        const qualitySum = withQuality.reduce((sum, o) => sum + (o.qualityScore ?? 0), 0);
        result[level] = qualitySum / withQuality.length;
      }
    }

    return result;
  }

  private calculateMeanAbsoluteError(): number {
    if (this.outcomes.length === 0) return 0;

    // MAE between estimated difficulty and inferred actual difficulty
    let totalError = 0;
    for (const outcome of this.outcomes) {
      // Use quality score as proxy for actual difficulty if available
      // Otherwise, use success as binary indicator
      const actualDifficulty =
        outcome.qualityScore !== undefined
          ? 1 - outcome.qualityScore // High quality = easier task
          : outcome.success
            ? 0.3 // Success suggests reasonable difficulty
            : 0.8; // Failure suggests high difficulty

      totalError += Math.abs(outcome.estimatedDifficulty - actualDifficulty);
    }

    return totalError / this.outcomes.length;
  }

  private calculateCorrelation(): number {
    if (this.outcomes.length < 2) return 0;

    // Calculate Pearson correlation between difficulty and success rate
    const difficulties = this.outcomes.map((o) => o.estimatedDifficulty);
    const successes: number[] = this.outcomes.map((o) => (o.success ? 1 : 0));

    const n = difficulties.length;
    const sumD = difficulties.reduce((a, b) => a + b, 0);
    const sumS = successes.reduce((a: number, b: number) => a + b, 0);
    const sumDS = difficulties.reduce((sum, d, i) => sum + d * (successes[i] ?? 0), 0);
    const sumD2 = difficulties.reduce((sum, d) => sum + d * d, 0);
    const sumS2 = successes.reduce((sum: number, s: number) => sum + s * s, 0);

    const numerator = n * sumDS - sumD * sumS;
    const denominator = Math.sqrt((n * sumD2 - sumD * sumD) * (n * sumS2 - sumS * sumS));

    if (denominator === 0) return 0;

    // Negative correlation expected: higher difficulty = lower success
    return numerator / denominator;
  }

  private buildRoutingReason(
    difficulty: DifficultyEstimate,
    selectedCli: CliName,
    calibrationApplied: boolean
  ): string {
    const parts: string[] = [];

    parts.push(
      `Difficulty: ${difficulty.level} (${(difficulty.aggregateScore * 100).toFixed(1)}%)`
    );
    parts.push(`Dominant: ${difficulty.dominantDimension}`);
    parts.push(`Tier: ${difficulty.recommendedTier} → ${selectedCli}`);

    if (calibrationApplied) {
      parts.push(
        `(calibrated: ${this.calibrationBias > 0 ? '+' : ''}${(this.calibrationBias * 100).toFixed(1)}%)`
      );
    }

    return parts.join(' | ');
  }

  private hashTask(content: string): string {
    // Simple hash for task deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Creates a ZeroRouter instance.
 *
 * @param config - Optional configuration
 * @param logger - Optional logger
 * @returns ZeroRouter instance
 */
export function createZeroRouter(
  config?: Partial<ZeroRouterConfig>,
  logger?: ILogger
): IZeroRouter {
  return new ZeroRouter(config, logger);
}

/**
 * Quick function to estimate difficulty without creating a router instance.
 *
 * @param task - CLI task to analyze
 * @returns Difficulty estimate
 */
export function estimateTaskDifficulty(task: CliTask): DifficultyEstimate {
  const router = new ZeroRouter({ verbose: false, enableCalibration: false });
  return router.estimateDifficulty(task);
}

/**
 * Quick function to route by difficulty without creating a router instance.
 *
 * @param task - CLI task to route
 * @param availableClis - Optional list of available CLIs
 * @returns Routing decision
 */
export function routeByTaskDifficulty(
  task: CliTask,
  availableClis?: CliName[]
): ZeroRoutingDecision {
  const router = new ZeroRouter({ verbose: false, enableCalibration: false });
  return router.routeByDifficulty(task, availableClis);
}
