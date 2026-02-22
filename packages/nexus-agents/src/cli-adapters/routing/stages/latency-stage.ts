/**
 * Latency Stage
 *
 * Adapts LatencyTracker to the IRouterStage interface for pipeline composition.
 * Adjusts CLI scores based on observed latency performance.
 *
 * @module cli-adapters/routing/stages/latency-stage
 * (Source: ADR-0005, Issue #361 - CLI latency tracking for routing)
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
import {
  LatencyTracker,
  type LatencyTrackerConfig,
  type ILatencyTracker,
} from '../../latency-tracker.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the latency stage.
 */
export interface LatencyStageConfig {
  /** LatencyTracker configuration */
  readonly trackerConfig?: Partial<LatencyTrackerConfig>;
  /** Weight to apply to latency scores (0-1) */
  readonly scoreWeight: number;
  /** Minimum samples before applying latency adjustments */
  readonly minSamplesForScoring: number;
  /** Penalty factor for unreliable CLIs (low success rate) */
  readonly reliabilityPenalty: number;
}

const DEFAULT_CONFIG: LatencyStageConfig = {
  scoreWeight: 0.15,
  minSamplesForScoring: 3,
  reliabilityPenalty: 0.3,
};

// ============================================================================
// Stage Implementation
// ============================================================================

/**
 * Latency Stage for performance-based CLI scoring.
 */
export class LatencyStage implements IRouterStage {
  readonly name = 'latency-performance';
  readonly priority = 80; // Runs last to adjust based on real performance

  private readonly config: LatencyStageConfig;
  private readonly tracker: ILatencyTracker;
  private readonly logger: ILogger;
  private routingsCount = 0;
  private latencyApplied = 0;

  constructor(
    config: Partial<LatencyStageConfig> = {},
    logger?: ILogger,
    tracker?: ILatencyTracker
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tracker = tracker ?? new LatencyTracker(this.config.trackerConfig);
    this.logger = logger ?? createLogger({ component: 'LatencyStage' });
  }

  canHandle(ctx: RoutingContext): boolean {
    return getRemainingCandidates(ctx).length > 0;
  }

  route(ctx: RoutingContext): Promise<Result<StageResult, StageError>> {
    const time = getTimeProvider();
    const startTime = time.now();
    const remaining = getRemainingCandidates(ctx);

    this.routingsCount++;

    // Get latency scores for remaining candidates
    const latencyScores = this.tracker.getScores(remaining);
    const reliableScores = latencyScores.filter((s) => s.hasReliableData);

    let updatedCtx = ctx;
    const signals = [...ctx.signals];

    if (reliableScores.length > 0) {
      // Apply latency-based score adjustments
      for (const latencyScore of latencyScores) {
        const adjustment = this.calculateAdjustment(latencyScore);
        updatedCtx = updateScore(updatedCtx, latencyScore.cli, adjustment);
      }

      // Find fastest CLI
      const fastest = this.findFastest(latencyScores);
      if (fastest !== undefined) {
        signals.push(`latency:fastest-${fastest.cli}`);
        signals.push(`latency:avg-${String(Math.round(fastest.weightedAvgMs))}ms`);
      }

      this.latencyApplied++;
    } else {
      signals.push('latency:insufficient-data');
    }

    const durationMs = time.now() - startTime;

    updatedCtx = addTrace(
      updatedCtx,
      this.name,
      durationMs,
      reliableScores.length > 0 ? 'score' : 'skip',
      reliableScores.length > 0
        ? `Applied latency scores for ${String(reliableScores.length)} CLIs`
        : 'Insufficient latency data'
    );

    this.logger.debug('Latency stage complete', {
      reliableCount: reliableScores.length,
      totalCandidates: remaining.length,
      applied: reliableScores.length > 0,
    });

    return Promise.resolve(ok({ context: { ...updatedCtx, signals }, continuesPipeline: true }));
  }

  recordOutcome(outcome: RoutingOutcome): void {
    // Record latency if available
    if (outcome.latencyMs !== undefined) {
      this.tracker.record(outcome.selectedCli, outcome.latencyMs, outcome.success);

      this.logger.debug('Latency outcome recorded', {
        cli: outcome.selectedCli,
        latencyMs: outcome.latencyMs,
        success: outcome.success,
      });
    }
  }

  getStats(): Record<string, unknown> {
    const trackerStats = this.tracker.getTrackerStats();
    return {
      routingsCount: this.routingsCount,
      latencyApplied: this.latencyApplied,
      applicationRate: this.routingsCount > 0 ? this.latencyApplied / this.routingsCount : 0,
      tracker: {
        totalSamples: trackerStats.totalSamples,
        totalRecordings: trackerStats.totalRecordings,
        perCli: {
          claude: {
            count: trackerStats.perCli.claude.count,
            avgMs: trackerStats.perCli.claude.avg,
          },
          gemini: {
            count: trackerStats.perCli.gemini.count,
            avgMs: trackerStats.perCli.gemini.avg,
          },
          codex: { count: trackerStats.perCli.codex.count, avgMs: trackerStats.perCli.codex.avg },
          opencode: {
            count: trackerStats.perCli.opencode.count,
            avgMs: trackerStats.perCli.opencode.avg,
          },
        },
      },
      config: {
        scoreWeight: this.config.scoreWeight,
        minSamplesForScoring: this.config.minSamplesForScoring,
      },
    };
  }

  /**
   * Get the underlying tracker for direct access if needed.
   */
  getTracker(): ILatencyTracker {
    return this.tracker;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Calculate score adjustment based on latency data.
   */
  private calculateAdjustment(score: {
    cli: CliName;
    score: number;
    confidence: number;
    hasReliableData: boolean;
  }): number {
    if (!score.hasReliableData) {
      return 0; // No adjustment for unreliable data
    }

    // Base adjustment from latency score (higher = faster = better)
    let adjustment = score.score * this.config.scoreWeight;

    // Apply confidence factor
    adjustment *= score.confidence;

    return adjustment;
  }

  /**
   * Find the fastest CLI from latency scores.
   */
  private findFastest(
    scores: readonly { cli: CliName; weightedAvgMs: number; hasReliableData: boolean }[]
  ): { cli: CliName; weightedAvgMs: number } | undefined {
    const reliable = scores.filter((s) => s.hasReliableData && s.weightedAvgMs > 0);
    if (reliable.length === 0) return undefined;

    return reliable.reduce((fastest, current) =>
      current.weightedAvgMs < fastest.weightedAvgMs ? current : fastest
    );
  }
}

/**
 * Creates a latency stage.
 */
export function createLatencyStage(
  config?: Partial<LatencyStageConfig>,
  logger?: ILogger,
  tracker?: ILatencyTracker
): LatencyStage {
  return new LatencyStage(config, logger, tracker);
}
