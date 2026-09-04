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
import { TaskCategorySchema } from '../../../config/task-specialization-types.js';

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

    const category = readTaskCategory(ctx);

    let updated = ctx;
    if (category === undefined) {
      // An unscoped application is not the same as a scoped one, and the
      // recorded `distilled-rule:applied=` cannot tell them apart on its own
      // (#4832). Say which happened.
      updated = { ...updated, signals: [...updated.signals, 'distilled-rule:category-unknown'] };
    }
    let applied = 0;

    for (const cli of candidates) {
      const matchingRules = this.findMatchingRules(activeRules, cli, category);
      if (matchingRules.length === 0) continue;

      // #5004: sum first, then clamp. Each rule was applied separately with no
      // bound on the total, so an unscoped task — `detectTaskCategory` returns
      // null for any content without a specialization keyword, and an undefined
      // category matches ALL of a CLI's rules — could stack six penalties into
      // -26.4 against a candidate at 0. Every documented bound is per-rule
      // (`ACTION_DELTAS`), and nothing bounded the sum. Panel decision:
      // Option A, 4 of 6 approvers, audit record #81.
      const raw = matchingRules.reduce((sum, rule) => sum + this.computeDelta(rule), 0);
      const capped = Math.min(this.config.boostDelta, Math.max(this.config.avoidDelta, raw));
      updated = updateScore(updated, cli, capped);
      for (const rule of matchingRules) {
        updated = {
          ...updated,
          signals: [...updated.signals, `distilled-rule:applied=${rule.id}`],
        };
        applied++;
      }
      if (capped !== raw) {
        // Disclose the clamp: a score that was bounded is not the same as one
        // the rules produced, and the trace should not imply otherwise.
        updated = {
          ...updated,
          signals: [...updated.signals, `distilled-rule:capped=${cli}`],
        };
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

  /**
   * Score delta for one rule: the action's base delta scaled by
   * `rule.confidence`, which is `support × effect` (#5004 finding 3).
   *
   * `support` is the sigmoid over observations; `effect` is how far the
   * metric sits past its detector threshold, in [0, 1]. So a 100% failure
   * rate over 40 tasks moves the score by the full `support`, a 62.5% rate
   * over the same 40 tasks moves it by a sixteenth of that, a 6/6 failure
   * stays small because support bounds it, and a rule exactly at threshold
   * contributes 0. Before #5004 confidence was sample support alone and the
   * penalty tracked traffic volume rather than performance.
   */
  private computeDelta(rule: DistilledRule): number {
    const baseDelta =
      rule.action === 'penalize'
        ? this.config.penaltyDelta
        : rule.action === 'boost'
          ? this.config.boostDelta
          : this.config.avoidDelta;
    return baseDelta * rule.confidence;
  }
}

/**
 * Reads the task category the caller supplied, validated against the
 * vocabulary a {@link DistilledRule} actually carries (#4832).
 *
 * This replaced a signal parser reading `task-category:` (which nothing
 * emitted) and `capability:type=` (whose producer emits `capability:task-`
 * over a DIFFERENT vocabulary — `reasoning|code|creative|general` — sharing no
 * values with `TASK_CATEGORIES`). Renaming that prefix would have matched no
 * rule ever and taken the whole distillation loop dark while looking like a
 * fix, so the parser is gone rather than corrected.
 *
 * Anything off-vocabulary is `undefined`: unknown, not "a category that
 * happens to match nothing".
 */
function readTaskCategory(ctx: RoutingContext): string | undefined {
  const parsed = TaskCategorySchema.safeParse(ctx.metadata?.['taskCategory']);
  return parsed.success ? parsed.data : undefined;
}

/** Factory function for creating DistilledRuleStage. */
export function createDistilledRuleStage(
  distiller: StrategyDistiller,
  config?: Partial<DistilledRuleStageConfig>,
  logger?: ILogger
): DistilledRuleStage {
  return new DistilledRuleStage(distiller, config, logger);
}
