/**
 * Zero Router Stage
 *
 * Adapts ZeroRouter to the IRouterStage interface for pipeline composition.
 * Adds difficulty-based scoring to candidates for intelligent model selection.
 *
 * @module cli-adapters/routing/stages/zero-stage
 * (Source: ADR-0005, Issue #338)
 */

import type { Result } from '../../../core/result.js';
import type { ILogger } from '../../../core/index.js';
import { ok, createLogger, getTimeProvider } from '../../../core/index.js';
import type {
  IRouterStage,
  RoutingContext,
  StageResult,
  StageError,
  RoutingOutcome,
  CliName,
} from '../router-stage.js';
import { addTrace, updateScore, getRemainingCandidates } from '../router-stage.js';
import type { IZeroRouter, ZeroRouterConfig, DifficultyEstimate } from '../../zero-router.js';
import { createZeroRouter } from '../../zero-router.js';
import type { CliTask } from '../../types.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the zero router stage.
 */
export interface ZeroStageConfig {
  /** ZeroRouter configuration */
  readonly routerConfig?: Partial<ZeroRouterConfig>;
  /** Weight to apply to difficulty scores (0-1) */
  readonly scoreWeight: number;
  /** Whether to prefer simpler models for easy tasks */
  readonly preferSimpleModels: boolean;
}

const DEFAULT_CONFIG: ZeroStageConfig = {
  scoreWeight: 0.3,
  preferSimpleModels: true,
};

/**
 * Model tier rankings for difficulty matching.
 * Lower rank = simpler/cheaper model.
 */
const CLI_TIER_RANK: Record<CliName, number> = {
  gemini: 1, // Fast, cheap
  codex: 2, // Code-specialized
  claude: 3, // Most capable
};

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * Zero Router Stage for difficulty-based CLI scoring.
 */
export class ZeroRouterStage implements IRouterStage {
  readonly name = 'zero-difficulty';
  readonly priority = 40; // Runs after budget filter, before TOPSIS

  private readonly config: ZeroStageConfig;
  private readonly router: IZeroRouter;
  private readonly logger: ILogger;
  private routingsCount = 0;
  private totalDifficulty = 0;

  constructor(config: Partial<ZeroStageConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.router = createZeroRouter(this.config.routerConfig, logger);
    this.logger = logger ?? createLogger({ component: 'ZeroRouterStage' });
  }

  canHandle(ctx: RoutingContext): boolean {
    return getRemainingCandidates(ctx).length > 0 && ctx.task.length > 0;
  }

  route(ctx: RoutingContext): Promise<Result<StageResult, StageError>> {
    const time = getTimeProvider();
    const startTime = time.now();
    const remaining = getRemainingCandidates(ctx);

    this.routingsCount++;

    // Convert string task to CliTask for ZeroRouter
    const cliTask: CliTask = { content: ctx.task };

    // Estimate task difficulty
    const difficulty = this.router.estimateDifficulty(cliTask);
    this.totalDifficulty += difficulty.aggregateScore;

    // Score candidates based on difficulty match
    let updatedCtx = ctx;
    const scores = this.scoreCandidates(remaining, difficulty);

    for (const { cli, score } of scores) {
      updatedCtx = updateScore(updatedCtx, cli, score);
    }

    // Add signals for downstream stages
    const signals = this.buildSignals(ctx.signals, difficulty);
    const durationMs = time.now() - startTime;

    updatedCtx = addTrace(
      updatedCtx,
      this.name,
      durationMs,
      'score',
      `Difficulty: ${difficulty.level} (${difficulty.aggregateScore.toFixed(2)}), dominant: ${difficulty.dominantDimension}`
    );

    this.logger.debug('Zero difficulty scoring complete', {
      level: difficulty.level,
      score: difficulty.aggregateScore.toFixed(3),
      dominant: difficulty.dominantDimension,
      recommended: difficulty.recommendedTier,
    });

    return Promise.resolve(ok({ context: { ...updatedCtx, signals }, continuesPipeline: true }));
  }

  recordOutcome(outcome: RoutingOutcome): void {
    const time = getTimeProvider();

    // Re-estimate difficulty for calibration (since we don't store estimates)
    const cliTask: CliTask = { content: outcome.task };
    const estimate = this.router.estimateDifficulty(cliTask);

    // Calibrate based on outcome (only include optional fields if defined)
    this.router.calibrate({
      taskHash: outcome.task.slice(0, 32), // Use first 32 chars as hash
      estimatedDifficulty: estimate.aggregateScore,
      selectedCli: outcome.selectedCli,
      success: outcome.success,
      timestamp: time.now(),
      ...(outcome.qualityScore !== undefined && { qualityScore: outcome.qualityScore }),
      ...(outcome.latencyMs !== undefined && { executionTimeMs: outcome.latencyMs }),
    });

    this.logger.debug('Zero outcome recorded', {
      success: outcome.success,
      estimatedDifficulty: estimate.aggregateScore.toFixed(3),
    });
  }

  getStats(): Record<string, unknown> {
    const calibration = this.router.getCalibrationStats();
    return {
      routingsCount: this.routingsCount,
      avgDifficulty: this.routingsCount > 0 ? this.totalDifficulty / this.routingsCount : 0,
      calibration: {
        totalOutcomes: calibration.totalOutcomes,
        meanAbsoluteError: calibration.meanAbsoluteError,
        successRateByLevel: calibration.successRateByLevel,
      },
      config: {
        scoreWeight: this.config.scoreWeight,
        preferSimpleModels: this.config.preferSimpleModels,
      },
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Score candidates based on difficulty match.
   */
  private scoreCandidates(
    candidates: CliName[],
    difficulty: DifficultyEstimate
  ): Array<{ cli: CliName; score: number }> {
    return candidates.map((cli) => ({
      cli,
      score: this.calculateMatchScore(cli, difficulty),
    }));
  }

  /**
   * Calculate how well a CLI matches the task difficulty.
   */
  private calculateMatchScore(cli: CliName, difficulty: DifficultyEstimate): number {
    const cliRank = CLI_TIER_RANK[cli];
    const difficultyRank = this.difficultyToRank(difficulty.aggregateScore);

    // Perfect match = 1.0, mismatch reduces score
    const rankDiff = Math.abs(cliRank - difficultyRank);
    const matchScore = 1 - rankDiff * 0.2;

    // Apply weight
    return matchScore * this.config.scoreWeight;
  }

  /**
   * Convert difficulty score to tier rank.
   */
  private difficultyToRank(score: number): number {
    if (score < 0.33) return 1; // Easy -> simple model
    if (score < 0.67) return 2; // Medium -> mid-tier
    return 3; // Hard -> capable model
  }

  /**
   * Build routing signals for the context.
   */
  private buildSignals(existing: string[], difficulty: DifficultyEstimate): string[] {
    const signals = [...existing];
    signals.push(`difficulty:${difficulty.level}`);
    signals.push(`difficulty:score-${difficulty.aggregateScore.toFixed(2)}`);
    signals.push(`difficulty:dominant-${difficulty.dominantDimension}`);
    return signals;
  }
}

/**
 * Creates a zero router stage.
 */
export function createZeroStage(
  config?: Partial<ZeroStageConfig>,
  logger?: ILogger
): ZeroRouterStage {
  return new ZeroRouterStage(config, logger);
}
