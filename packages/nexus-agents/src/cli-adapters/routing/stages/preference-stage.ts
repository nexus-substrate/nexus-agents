/**
 * Preference Router Stage
 *
 * Adapts PreferenceRouter to the IRouterStage interface for pipeline composition.
 * Applies learned user preferences to score CLI candidates.
 *
 * @module cli-adapters/routing/stages/preference-stage
 * (Source: ADR-0005, Issue #148, arXiv:2406.18665 - RouteLLM)
 */

import type { Result } from '../../../core/result.js';
import type { ILogger } from '../../../core/index.js';
import { ok, createLogger, getTimeProvider } from '../../../core/index.js';
import { DEFAULT_CLI } from '../../../config/model-capabilities-types.js';
import type {
  IRouterStage,
  RoutingContext,
  StageResult,
  StageError,
  RoutingOutcome,
  CliName,
} from '../router-stage.js';
import { addTrace, updateScore, getRemainingCandidates } from '../router-stage.js';
import { PreferenceRouter } from '../../preference-router.js';
import type { PreferenceRouterConfig } from '../../preference-router.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the preference stage.
 */
export interface PreferenceStageConfig {
  /** PreferenceRouter configuration */
  readonly routerConfig?: Partial<PreferenceRouterConfig>;
  /** Weight to apply to preference scores (0-1) */
  readonly scoreWeight: number;
  /** Minimum data points before applying preferences */
  readonly minDataForScoring: number;
}

const DEFAULT_CONFIG: PreferenceStageConfig = {
  scoreWeight: 0.25,
  minDataForScoring: 10,
};

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * Preference Stage for learned preference-based CLI scoring.
 */
export class PreferenceStage implements IRouterStage {
  readonly name = 'preference-learned';
  readonly priority = 50; // Runs after zero-difficulty, before TOPSIS

  private readonly config: PreferenceStageConfig;
  private readonly router: PreferenceRouter;
  private readonly logger: ILogger;
  private routingsCount = 0;
  private preferencesApplied = 0;

  constructor(config: Partial<PreferenceStageConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.router = new PreferenceRouter(this.config.routerConfig);
    this.logger = logger ?? createLogger({ component: 'PreferenceStage' });
  }

  canHandle(ctx: RoutingContext): boolean {
    return getRemainingCandidates(ctx).length > 0 && ctx.task.length > 0;
  }

  route(ctx: RoutingContext): Promise<Result<StageResult, StageError>> {
    const time = getTimeProvider();
    const startTime = time.now();
    const remaining = getRemainingCandidates(ctx);

    this.routingsCount++;

    // Check if we have enough preference data
    const hasData = this.router.hasMinimumData();
    let updatedCtx = ctx;
    const signals = [...ctx.signals];

    if (hasData) {
      // Route using learned preferences
      const decision = this.router.route(ctx.task);
      const scores = this.scoreCandidates(remaining, decision.selectedCli, decision.prediction);

      for (const { cli, score } of scores) {
        updatedCtx = updateScore(updatedCtx, cli, score);
      }

      signals.push(`preference:tier-${decision.selectedTier}`);
      signals.push(`preference:confidence-${decision.prediction.confidence.toFixed(2)}`);
      this.preferencesApplied++;
    } else {
      signals.push('preference:insufficient-data');
    }

    const durationMs = time.now() - startTime;
    const stats = this.router.getStats();

    updatedCtx = addTrace(
      updatedCtx,
      this.name,
      durationMs,
      hasData ? 'score' : 'skip',
      hasData
        ? `Applied preferences (${String(stats.totalDataPoints)} data points)`
        : 'Insufficient preference data'
    );

    this.logger.debug('Preference stage complete', {
      hasData,
      dataPoints: stats.totalDataPoints,
      applied: hasData,
    });

    return Promise.resolve(ok({ context: { ...updatedCtx, signals }, continuesPipeline: true }));
  }

  recordOutcome(outcome: RoutingOutcome): void {
    // Determine if the outcome indicates strong model preference
    const strongModelPreferred = this.isStrongModelPreferred(outcome);

    this.router.recordPreference(
      outcome.task,
      strongModelPreferred,
      outcome.qualityScore,
      undefined // weak model quality not available from single outcome
    );

    this.logger.debug('Preference outcome recorded', {
      cli: outcome.selectedCli,
      success: outcome.success,
      strongPreferred: strongModelPreferred,
    });
  }

  getStats(): Record<string, unknown> {
    const routerStats = this.router.getStats();
    return {
      routingsCount: this.routingsCount,
      preferencesApplied: this.preferencesApplied,
      applicationRate: this.routingsCount > 0 ? this.preferencesApplied / this.routingsCount : 0,
      preferenceData: {
        totalDataPoints: routerStats.totalDataPoints,
        strongModelPreferenceRate: routerStats.strongModelPreferenceRate,
        estimatedCostSavingsRate: routerStats.estimatedCostSavingsRate,
      },
      config: {
        scoreWeight: this.config.scoreWeight,
        minDataForScoring: this.config.minDataForScoring,
      },
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Score candidates based on preference prediction.
   */
  private scoreCandidates(
    candidates: CliName[],
    preferredCli: CliName,
    prediction: { strongModelProbability: number; confidence: number }
  ): Array<{ cli: CliName; score: number }> {
    return candidates.map((cli) => ({
      cli,
      score: this.calculatePreferenceScore(cli, preferredCli, prediction),
    }));
  }

  /**
   * Calculate preference score for a CLI.
   */
  private calculatePreferenceScore(
    cli: CliName,
    preferredCli: CliName,
    prediction: { strongModelProbability: number; confidence: number }
  ): number {
    const isPreferred = cli === preferredCli;
    const confidenceFactor = prediction.confidence;

    // Preferred CLI gets full score weighted by confidence
    // Non-preferred gets inverse score
    const baseScore = isPreferred ? 1.0 : 0.3;
    return baseScore * confidenceFactor * this.config.scoreWeight;
  }

  /**
   * Determine if outcome indicates strong model was needed.
   */
  private isStrongModelPreferred(outcome: RoutingOutcome): boolean {
    // Heuristic: if task failed or quality was low, strong model may have been needed
    if (!outcome.success) return true;
    if (outcome.qualityScore !== undefined && outcome.qualityScore < 0.7) return true;

    // If successful with good quality, current selection was appropriate
    // Strong models (claude) indicate strong preference when selected successfully
    return outcome.selectedCli === DEFAULT_CLI;
  }
}

/**
 * Creates a preference stage.
 */
export function createPreferenceStage(
  config?: Partial<PreferenceStageConfig>,
  logger?: ILogger
): PreferenceStage {
  return new PreferenceStage(config, logger);
}
