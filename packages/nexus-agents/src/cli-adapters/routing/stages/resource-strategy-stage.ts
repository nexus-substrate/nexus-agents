/**
 * Resource Strategy Stage
 *
 * Implements resource-aware strategy oscillation for the routing pipeline.
 * Dynamically adjusts model scoring based on budget utilization level,
 * oscillating between aggressive (prefer quality) and conservative (prefer cost)
 * strategies as resources deplete.
 *
 * @module cli-adapters/routing/stages/resource-strategy-stage
 * (Source: Issue #998 — Resource-aware strategy oscillation in routing pipeline)
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
import { deriveCliQualityRank, deriveCliCostRank } from '../../derive-tier-tables.js';

/**
 * Resource strategy tier determining routing behavior.
 */
export type ResourceTier = 'aggressive' | 'balanced' | 'conservative' | 'critical';

/**
 * Configuration for the resource strategy stage.
 */
export interface ResourceStrategyConfig {
  /** Threshold above which aggressive tier activates (0-1) */
  readonly aggressiveThreshold: number;
  /** Threshold above which balanced tier activates (0-1) */
  readonly balancedThreshold: number;
  /** Threshold above which conservative tier activates (0-1) */
  readonly conservativeThreshold: number;
  /** Score boost for quality-oriented CLIs in aggressive mode */
  readonly aggressiveBoost: number;
  /** Score boost for cost-efficient CLIs in conservative mode */
  readonly conservativeBoost: number;
  /** Score boost for cheapest CLI in critical mode */
  readonly criticalBoost: number;
}

const DEFAULT_CONFIG: ResourceStrategyConfig = {
  aggressiveThreshold: 0.75,
  balancedThreshold: 0.5,
  conservativeThreshold: 0.25,
  aggressiveBoost: 5,
  conservativeBoost: 5,
  criticalBoost: 8,
};

/**
 * Quality ranking per CLI (higher = better quality). DERIVED from each CLI's
 * default-model composite `qualityScores` (#4195); an unscored default ranks 0
 * (never quality-boosted). No longer a hand-tuned literal.
 */
const CLI_QUALITY_RANK: Record<CliName, number> = deriveCliQualityRank();

/**
 * Cost-efficiency ranking per CLI (higher = cheaper). DERIVED from each CLI's
 * default-model real registry pricing (#4195); a $0/$0 default is treated as
 * most-expensive so it can never rank "cheapest" and pull budget traffic.
 */
const CLI_COST_RANK: Record<CliName, number> = deriveCliCostRank();

/**
 * Computes the current resource tier from a utilization level.
 */
export function computeResourceTier(
  resourceLevel: number,
  config: ResourceStrategyConfig = DEFAULT_CONFIG
): ResourceTier {
  if (resourceLevel >= config.aggressiveThreshold) return 'aggressive';
  if (resourceLevel >= config.balancedThreshold) return 'balanced';
  if (resourceLevel >= config.conservativeThreshold) return 'conservative';
  return 'critical';
}

/**
 * Computes score adjustments for each CLI based on resource tier.
 */
export function computeScoreAdjustments(
  tier: ResourceTier,
  candidates: readonly CliName[],
  config: ResourceStrategyConfig = DEFAULT_CONFIG
): Map<CliName, number> {
  const adjustments = new Map<CliName, number>();

  for (const cli of candidates) {
    switch (tier) {
      case 'aggressive':
        // Boost quality-oriented CLIs (claude gets most, gemini least)
        adjustments.set(cli, CLI_QUALITY_RANK[cli] * (config.aggressiveBoost / 3));
        break;
      case 'balanced':
        // No adjustment — let other stages decide
        adjustments.set(cli, 0);
        break;
      case 'conservative':
        // Boost cost-efficient CLIs (gemini gets most, claude least)
        adjustments.set(cli, CLI_COST_RANK[cli] * (config.conservativeBoost / 3));
        break;
      case 'critical':
        // Strongly boost cheapest CLI
        adjustments.set(cli, CLI_COST_RANK[cli] * (config.criticalBoost / 3));
        break;
    }
  }

  return adjustments;
}

/**
 * Resource Strategy Stage for budget-aware routing oscillation.
 *
 * Reads budget utilization from context signals (populated by BudgetStage)
 * and adjusts candidate scores based on resource availability.
 */
export class ResourceStrategyStage implements IRouterStage {
  readonly name = 'resource-strategy';
  readonly priority = 55; // After preference (50), before TOPSIS (60)

  private readonly config: ResourceStrategyConfig;
  private readonly logger: ILogger;
  private routingsCount = 0;
  private tierHistory: ResourceTier[] = [];

  constructor(config: Partial<ResourceStrategyConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'ResourceStrategyStage' });
  }

  canHandle(ctx: RoutingContext): boolean {
    return getRemainingCandidates(ctx).length > 1;
  }

  route(ctx: RoutingContext): Promise<Result<StageResult, StageError>> {
    return Promise.resolve(this.routeSync(ctx));
  }

  private routeSync(ctx: RoutingContext): Result<StageResult, StageError> {
    const start = getTimeProvider().now();
    const candidates = getRemainingCandidates(ctx);

    const resourceLevel = this.extractResourceLevel(ctx);

    if (resourceLevel === undefined) {
      const elapsed = getTimeProvider().now() - start;
      const updated = addTrace(ctx, this.name, elapsed, 'skip', 'no budget data');
      return ok({ context: updated, continuesPipeline: true });
    }

    const tier = computeResourceTier(resourceLevel, this.config);
    const adjustments = computeScoreAdjustments(tier, candidates, this.config);

    let updated = ctx;
    for (const [cli, delta] of adjustments) {
      if (delta !== 0) {
        updated = updateScore(updated, cli, delta);
      }
    }

    updated = {
      ...updated,
      signals: [
        ...updated.signals,
        `resource-strategy:tier=${tier}`,
        `resource-strategy:level=${resourceLevel.toFixed(2)}`,
      ],
    };

    const elapsed = getTimeProvider().now() - start;
    updated = addTrace(
      updated,
      this.name,
      elapsed,
      'score',
      `tier=${tier} level=${resourceLevel.toFixed(2)}`
    );

    this.routingsCount++;
    this.tierHistory.push(tier);
    if (this.tierHistory.length > 100) {
      this.tierHistory = this.tierHistory.slice(-100);
    }

    this.logger.debug('Resource strategy applied', {
      tier,
      resourceLevel,
      adjustments: Object.fromEntries(adjustments),
    });

    return ok({ context: updated, continuesPipeline: true });
  }

  recordOutcome(_outcome: RoutingOutcome): void {
    // Future: could adjust thresholds based on outcome quality per tier
  }

  getStats(): Record<string, unknown> {
    const tierCounts: Record<string, number> = {};
    for (const t of this.tierHistory) {
      tierCounts[t] = (tierCounts[t] ?? 0) + 1;
    }
    return {
      routingsCount: this.routingsCount,
      config: this.config,
      tierDistribution: tierCounts,
      currentTier:
        this.tierHistory.length > 0 ? this.tierHistory[this.tierHistory.length - 1] : null,
    };
  }

  /**
   * Extracts resource level (0-1) from context signals or metadata.
   * Looks for budget utilization signals added by BudgetStage.
   */
  private extractResourceLevel(ctx: RoutingContext): number | undefined {
    // Check signals for budget utilization (added by budget-stage)
    for (const signal of ctx.signals) {
      if (signal.startsWith('budget:utilization=')) {
        const value = parseFloat(signal.slice('budget:utilization='.length));
        if (!isNaN(value)) {
          // Budget utilization is spent ratio — resource level is inverse
          return Math.max(0, Math.min(1, 1 - value));
        }
      }
    }

    // Check metadata for explicit resource level
    const meta = ctx.metadata;
    if (meta !== undefined) {
      const level = meta['resourceLevel'];
      if (typeof level === 'number' && level >= 0 && level <= 1) {
        return level;
      }
    }

    return undefined;
  }
}

/**
 * Factory function for creating ResourceStrategyStage.
 */
export function createResourceStrategyStage(
  config?: Partial<ResourceStrategyConfig>,
  logger?: ILogger
): ResourceStrategyStage {
  return new ResourceStrategyStage(config, logger);
}
