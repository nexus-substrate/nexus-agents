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

import {
  createLogger,
  type ILogger,
  createSharedTaskAnalyzer,
  taskAnalysisResultToTaskProfile,
  type TaskProfile,
} from '../core/index.js';
import { clamp01 } from '../utils/math-utils.js';
import type { CliName, CliTask } from './types.js';
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
import {
  groupOutcomesByLevel,
  calculateSuccessRateByLevel,
  calculateAvgQualityByLevel,
  calculateMeanAbsoluteError,
  calculateDifficultySuccessCorrelation,
  calculateCalibrationBias,
  hashTaskContent,
  buildRoutingReason,
} from './zero-router-calibration.js';

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

/** Module-level singleton — SharedTaskAnalyzer is stateless. */
const sharedAnalyzer = createSharedTaskAnalyzer();

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
    aggregateScore = clamp01(aggregateScore);

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
    const tierClis = this.config.tierToClis[tier];

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

    const reason = buildRoutingReason({
      level: difficulty.level,
      aggregateScore: difficulty.aggregateScore,
      dominantDimension: difficulty.dominantDimension,
      recommendedTier: difficulty.recommendedTier,
      selectedCli,
      calibrationApplied,
      calibrationBias: this.calibrationBias,
    });

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

    const outcomesByLevel = groupOutcomesByLevel(this.outcomes, this.config.thresholds);
    const successRateByLevel = calculateSuccessRateByLevel(outcomesByLevel);
    const avgQualityByLevel = calculateAvgQualityByLevel(outcomesByLevel);
    const meanAbsoluteError = calculateMeanAbsoluteError(this.outcomes);
    const difficultySuccessCorrelation = calculateDifficultySuccessCorrelation(this.outcomes);

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
      id: hashTaskContent(task.content),
      description: task.content,
      context: {
        history: [],
        metadata: {},
      },
    };
    const analysis = sharedAnalyzer.analyze(internalTask);
    return taskAnalysisResultToTaskProfile(analysis);
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
    this.calibrationBias = calculateCalibrationBias(this.outcomes);
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
