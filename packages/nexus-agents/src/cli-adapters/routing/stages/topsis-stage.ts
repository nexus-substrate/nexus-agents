/**
 * TOPSIS Router Stage
 *
 * Adapts TopsisRouter to the IRouterStage interface for pipeline composition.
 * Uses TOPSIS (Technique for Order of Preference by Similarity to Ideal Solution)
 * for multi-criteria model selection.
 *
 * @module cli-adapters/routing/stages/topsis-stage
 * (Source: ADR-0005, arXiv:2509.07571)
 */

import type { Result } from '../../../core/result.js';
import type { ILogger } from '../../../core/index.js';
import { ok, createLogger, getTimeProvider } from '../../../core/index.js';
import { TopsisRouter } from '../../topsis-router.js';
import type {
  IRouterStage,
  RoutingContext,
  StageResult,
  StageError,
  RoutingOutcome,
} from '../router-stage.js';
import { addTrace, updateScore, getRemainingCandidates } from '../router-stage.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the TOPSIS stage.
 */
export interface TopsisStageConfig {
  /** Weight for quality criterion (0-1) */
  readonly qualityWeight: number;
  /** Weight for cost criterion (0-1) */
  readonly costWeight: number;
  /** Weight for latency criterion (0-1) */
  readonly latencyWeight: number;
  /** Expected input tokens for cost calculation */
  readonly expectedInputTokens: number;
  /** Expected output tokens for cost calculation */
  readonly expectedOutputTokens: number;
  /** Minimum candidates required to run */
  readonly minCandidates: number;
}

const DEFAULT_CONFIG: TopsisStageConfig = {
  qualityWeight: 0.5,
  costWeight: 0.3,
  latencyWeight: 0.2,
  expectedInputTokens: 1000,
  expectedOutputTokens: 500,
  minCandidates: 2,
};

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * TOPSIS Router Stage for multi-criteria model selection.
 */
export class TopsisRouterStage implements IRouterStage {
  readonly name = 'topsis';
  readonly priority = 60; // Runs after filtering stages (budget=20, zero=40)

  private readonly config: TopsisStageConfig;
  private readonly router: TopsisRouter;
  private readonly logger: ILogger;
  private routingsCount = 0;
  private totalLatencyMs = 0;

  constructor(config: Partial<TopsisStageConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'TopsisRouterStage' });

    // Validate weights sum to 1.0
    const weightSum =
      this.config.qualityWeight + this.config.costWeight + this.config.latencyWeight;
    if (Math.abs(weightSum - 1.0) > 0.01) {
      throw new Error(`TOPSIS weights must sum to 1.0, got ${weightSum.toFixed(3)}`);
    }

    this.router = new TopsisRouter(
      {
        criteria: [
          { name: 'quality', weight: this.config.qualityWeight, beneficial: true },
          { name: 'cost', weight: this.config.costWeight, beneficial: false },
          { name: 'latency', weight: this.config.latencyWeight, beneficial: false },
        ],
      },
      this.logger
    );
  }

  /**
   * TOPSIS runs if there are at least minCandidates remaining.
   */
  canHandle(ctx: RoutingContext): boolean {
    const remaining = getRemainingCandidates(ctx);
    return remaining.length >= this.config.minCandidates;
  }

  /**
   * Execute TOPSIS ranking on remaining candidates.
   */
  route(ctx: RoutingContext): Promise<Result<StageResult, StageError>> {
    const time = getTimeProvider();
    const startTime = time.now();
    const remaining = getRemainingCandidates(ctx);

    this.logger.debug('TOPSIS stage executing', {
      candidates: remaining.length,
      inputTokens: this.config.expectedInputTokens,
      outputTokens: this.config.expectedOutputTokens,
    });

    // Run TOPSIS selection
    const result = this.router.selectModel({
      expectedInputTokens: this.config.expectedInputTokens,
      expectedOutputTokens: this.config.expectedOutputTokens,
    });

    // Map TOPSIS scores to context scores
    let updatedCtx = ctx;
    for (const score of result.scores) {
      // Only update scores for remaining candidates
      if (remaining.includes(score.cliName)) {
        // Closeness score is 0-1, scale to useful range
        updatedCtx = updateScore(updatedCtx, score.cliName, score.closenessScore * 10);
      }
    }

    const durationMs = time.now() - startTime;
    this.routingsCount++;
    this.totalLatencyMs += durationMs;

    // Add trace entry
    updatedCtx = addTrace(
      updatedCtx,
      this.name,
      durationMs,
      'score',
      `Selected: ${result.selectedModel}, Savings: ${result.estimatedSavingsPercent.toFixed(1)}%`
    );

    // Add signal about selection
    const newSignals = [...updatedCtx.signals, `topsis:${result.selectedModel}`];
    if (result.costOptimized) {
      newSignals.push('topsis:cost-optimized');
    }

    return Promise.resolve(
      ok({
        context: { ...updatedCtx, signals: newSignals },
        continuesPipeline: true,
      })
    );
  }

  /**
   * Record outcome for future calibration (not implemented yet).
   */
  recordOutcome(outcome: RoutingOutcome): void {
    this.logger.debug('TOPSIS outcome recorded', {
      cli: outcome.selectedCli,
      success: outcome.success,
      latencyMs: outcome.latencyMs,
    });
    // Future: Use outcome to adjust criteria weights
  }

  /**
   * Get stage statistics.
   */
  getStats(): Record<string, unknown> {
    return {
      routingsCount: this.routingsCount,
      averageLatencyMs:
        this.routingsCount > 0 ? Math.round(this.totalLatencyMs / this.routingsCount) : 0,
      config: {
        qualityWeight: this.config.qualityWeight,
        costWeight: this.config.costWeight,
        latencyWeight: this.config.latencyWeight,
      },
    };
  }
}

/**
 * Creates a TOPSIS router stage.
 */
export function createTopsisStage(
  config?: Partial<TopsisStageConfig>,
  logger?: ILogger
): TopsisRouterStage {
  return new TopsisRouterStage(config, logger);
}
