/**
 * Distilled Rule Stage
 *
 * Applies score adjustments from automatically distilled routing rules.
 * Rules are produced by StrategyDistiller from observed task outcomes.
 *
 * Score-only stage (no filtering): penalize, boost, or avoid adjustments
 * scaled by rule confidence. Runs at priority 45 (after ZeroRouter 40,
 * before Preference 50).
 *
 * @module cli-adapters/routing/stages/distilled-rule-stage
 * (Source: Issue #999 - Automatic Strategy Distillation)
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
import type { StrategyDistiller } from '../../../learning/strategy-distiller.js';
import type { DistilledRule, StrategyAction } from '../../../learning/strategy-distiller-types.js';

/** Score deltas per action type. */
const ACTION_DELTAS: Readonly<Record<StrategyAction, number>> = {
  penalize: -5,
  boost: 5,
  avoid: -10,
};

/** Configuration for the distilled rule stage. */
export interface DistilledRuleStageConfig {
  /** Penalty score for penalize action (default: -5) */
  readonly penaltyDelta: number;
  /** Boost score for boost action (default: 5) */
  readonly boostDelta: number;
  /** Avoid score for avoid action (default: -10) */
  readonly avoidDelta: number;
}

const DEFAULT_CONFIG: DistilledRuleStageConfig = {
  penaltyDelta: ACTION_DELTAS.penalize,
  boostDelta: ACTION_DELTAS.boost,
  avoidDelta: ACTION_DELTAS.avoid,
};

/**
 * Routing stage that applies distilled rules as score adjustments.
 */
export class DistilledRuleStage implements IRouterStage {
  readonly name = 'distilled-rule';
  readonly priority = 45;

  private readonly distiller: StrategyDistiller;
  private readonly config: DistilledRuleStageConfig;
  private readonly logger: ILogger;
  private rulesAppliedCount = 0;

  constructor(
    distiller: StrategyDistiller,
    config?: Partial<DistilledRuleStageConfig>,
    logger?: ILogger
  ) {
    this.distiller = distiller;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'DistilledRuleStage' });
  }

  canHandle(ctx: RoutingContext): boolean {
    const candidates = getRemainingCandidates(ctx);
    if (candidates.length <= 1) return false;
    const activeRules = this.distiller.getRules('active');
    return activeRules.length > 0;
  }

  route(ctx: RoutingContext): Promise<Result<StageResult, StageError>> {
    return Promise.resolve(this.routeSync(ctx));
  }

  recordOutcome(outcome: RoutingOutcome): void {
    this.distiller.onOutcome();
    this.logger.debug('Forwarded outcome to distiller', {
      cli: outcome.selectedCli,
      success: outcome.success,
    });
  }

  getStats(): Record<string, unknown> {
    const distillerStats = this.distiller.getStats();
    return {
      rulesAppliedCount: this.rulesAppliedCount,
      activeRuleCount: distillerStats.ruleCountByStatus.active,
      totalRules: distillerStats.totalRules,
    };
  }

  private routeSync(ctx: RoutingContext): Result<StageResult, StageError> {
    const start = getTimeProvider().now();
    const candidates = getRemainingCandidates(ctx);
    const activeRules = this.distiller.getRules('active');

    if (activeRules.length === 0) {
      const elapsed = getTimeProvider().now() - start;
      const updated = addTrace(ctx, this.name, elapsed, 'skip', 'no active rules');
      return ok({ context: updated, continuesPipeline: true });
    }

    // Extract task category from signals
    const category = this.extractCategory(ctx);

    let updated = ctx;
    let applied = 0;

    for (const cli of candidates) {
      const matchingRules = this.findMatchingRules(activeRules, cli, category);
      for (const rule of matchingRules) {
        const delta = this.computeDelta(rule);
        updated = updateScore(updated, cli, delta);
        updated = {
          ...updated,
          signals: [...updated.signals, `distilled-rule:applied=${rule.id}`],
        };
        applied++;
      }
    }

    this.rulesAppliedCount += applied;

    const elapsed = getTimeProvider().now() - start;
    updated = addTrace(
      updated,
      this.name,
      elapsed,
      'score',
      `applied=${String(applied)} rules=${String(activeRules.length)}`
    );

    this.logger.debug('Distilled rules applied', { applied, candidates: candidates.length });

    return ok({ context: updated, continuesPipeline: true });
  }

  private findMatchingRules(
    rules: readonly DistilledRule[],
    cli: CliName,
    category: string | undefined
  ): DistilledRule[] {
    return rules.filter(
      (r) => r.cli === cli && (category === undefined || r.category === category)
    );
  }

  private computeDelta(rule: DistilledRule): number {
    const baseDelta =
      rule.action === 'penalize'
        ? this.config.penaltyDelta
        : rule.action === 'boost'
          ? this.config.boostDelta
          : this.config.avoidDelta;
    return baseDelta * rule.confidence;
  }

  private extractCategory(ctx: RoutingContext): string | undefined {
    for (const signal of ctx.signals) {
      if (signal.startsWith('task-category:')) {
        return signal.slice('task-category:'.length);
      }
      if (signal.startsWith('capability:type=')) {
        return signal.slice('capability:type='.length);
      }
    }
    return undefined;
  }
}

/** Factory function for creating DistilledRuleStage. */
export function createDistilledRuleStage(
  distiller: StrategyDistiller,
  config?: Partial<DistilledRuleStageConfig>,
  logger?: ILogger
): DistilledRuleStage {
  return new DistilledRuleStage(distiller, config, logger);
}
