/**
 * Capacity Filter Stage
 *
 * Excludes routing candidates whose provider capacity is measurably exhausted,
 * so a task is not routed to an adapter that cannot serve it (#4373, criterion
 * 3 of #4351).
 *
 * This replaces the capacity semantics of the deleted `WorkBalancer` (#4378).
 * Only the *predicate* was carried over — the queue/dispatch half was the shape
 * mismatch that decided that vote. Capacity here is a per-candidate decision
 * input inside the stage chain, not a dashboard.
 *
 * @module cli-adapters/routing/stages/capacity-stage
 * (Source: ADR-0005)
 */

import type { Result } from '../../../core/result.js';
import type { ILogger } from '../../../core/index.js';
import { ok, createLogger, getTimeProvider } from '../../../core/index.js';
import type { IRouterStage, RoutingContext, StageResult, StageError } from '../router-stage.js';
import { addTrace, filterCandidate, getRemainingCandidates } from '../router-stage.js';
import type { CliName } from '../router-stage.js';
import type { CapacityStatus, ICliAdapter, RoutingArmId } from '../../types.js';

/**
 * Normalized exhaustion diagnostic (#4373).
 *
 * One spelling, exported, so callers match on a constant rather than parsing
 * prose. The deleted WorkBalancer used `ALL_EXHAUSTED`; that vocabulary had no
 * consumers outside the component and died with it, leaving this free to be the
 * single spelling.
 */
export const CAPACITY_EXHAUSTED = 'capacity_exhausted';

/** Configuration for the capacity filter stage. */
export interface CapacityStageConfig {
  /**
   * Whether to enforce exhaustion (filter the candidate out) or merely annotate
   * it (signal only). Mirrors `BudgetStageConfig.enforceHardLimits` so the two
   * filters are configured the same way.
   */
  readonly enforceHardLimits: boolean;
}

const DEFAULT_CONFIG: CapacityStageConfig = {
  enforceHardLimits: true,
};

/**
 * Why a candidate was not excluded. `unmeasured` is deliberately distinct from
 * `healthy`: an unobserved reading is a set of defaults, and collapsing the two
 * is exactly the blindness #4436 was filed about.
 */
type Assessment = 'exhausted' | 'healthy' | 'unmeasured';

/**
 * Classifies one capacity reading.
 *
 * `observed === false` means every other field is a default rather than a
 * measurement (#4374), so such a reading can neither exclude a candidate nor
 * vouch for one.
 *
 * Note `remainingTokens <= 0` is checked independently of the `exhausted` flag:
 * a provider can report zero remaining without setting it. This is the stricter
 * of the two forms the deleted WorkBalancer carried.
 */
export function assessCapacity(status: CapacityStatus): Assessment {
  if (!status.observed) return 'unmeasured';
  if (status.exhausted || status.remainingTokens <= 0) return 'exhausted';
  return 'healthy';
}

/**
 * Capacity filter stage — excludes measurably exhausted candidates.
 */
export class CapacityFilterStage implements IRouterStage {
  readonly name = 'capacity-filter';
  /**
   * Only consulted by `RoutingPipeline`. `CompositeRouter` hand-wires stages and
   * takes call order from the body of `composite-router-stages.ts`, so this
   * number does not position the stage there. Set adjacent to
   * `BudgetFilterStage` (20) to keep the two hard filters together.
   */
  readonly priority = 25;

  private readonly adapters: Map<RoutingArmId, ICliAdapter>;
  private readonly config: CapacityStageConfig;
  private readonly logger: ILogger;
  private excludedCount = 0;
  private unmeasuredCount = 0;

  constructor(
    adapters: Map<RoutingArmId, ICliAdapter>,
    config: Partial<CapacityStageConfig> = {},
    logger?: ILogger
  ) {
    this.adapters = adapters;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'CapacityFilterStage' });
  }

  canHandle(ctx: RoutingContext): boolean {
    return getRemainingCandidates(ctx).length > 0;
  }

  async route(ctx: RoutingContext): Promise<Result<StageResult, StageError>> {
    const time = getTimeProvider();
    const startTime = time.now();
    const remaining = getRemainingCandidates(ctx);

    const assessments = await this.assessAll(remaining);

    let updatedCtx = ctx;
    let exhausted = 0;
    let unmeasured = 0;

    for (const [cli, assessment] of assessments) {
      if (assessment === 'unmeasured') {
        unmeasured++;
        continue;
      }
      if (assessment !== 'exhausted') continue;

      exhausted++;
      if (this.config.enforceHardLimits) {
        updatedCtx = filterCandidate(
          updatedCtx,
          cli,
          `${CAPACITY_EXHAUSTED}: no capacity remaining`
        );
        this.excludedCount++;
      }
    }
    this.unmeasuredCount += unmeasured;

    const signals = this.buildSignals(ctx.signals, exhausted, unmeasured);
    const eligible = getRemainingCandidates(updatedCtx);
    const durationMs = time.now() - startTime;

    const finalCtx = addTrace(
      updatedCtx,
      this.name,
      durationMs,
      'filter',
      `Eligible: ${String(eligible.length)}/${String(remaining.length)}, ` +
        `exhausted: ${String(exhausted)}, unmeasured: ${String(unmeasured)}`
    );

    this.logger.debug('Capacity filter complete', {
      eligible: eligible.length,
      exhausted,
      unmeasured,
      enforced: this.config.enforceHardLimits,
    });

    return ok({
      context: { ...finalCtx, signals },
      continuesPipeline: eligible.length > 0,
    });
  }

  getStats(): Record<string, unknown> {
    return { excludedCount: this.excludedCount, unmeasuredCount: this.unmeasuredCount };
  }

  /**
   * Reads capacity for every remaining candidate concurrently.
   *
   * A candidate with no registered adapter, whose probe rejects, or whose
   * adapter does not implement `getCapacity` at all, is reported `unmeasured` —
   * never excluded. Exclusion is destructive and a failed probe is an absence of
   * evidence, not evidence of exhaustion.
   *
   * The callback is `async` deliberately. An adapter that does not implement
   * `getCapacity` makes `adapter.getCapacity()` throw a TypeError *synchronously*
   * inside `.map()`, which escapes `Promise.allSettled` entirely and would take
   * down the whole routing call — turning a partially-implemented adapter into a
   * total routing failure. An async callback converts that throw into a
   * rejection, so it lands in the `unmeasured` branch like any other bad probe.
   * `ICliAdapter` declares `getCapacity` as required, so only a structurally
   * partial adapter reaches this path — which is exactly the case that must not
   * be fatal.
   */
  private async assessAll(candidates: readonly CliName[]): Promise<Map<CliName, Assessment>> {
    const settled = await Promise.allSettled(
      candidates.map(async (cli) => {
        // `CliName` is a member of the `RoutingArmId` union, so no cast: a
        // slot-keyed lookup finds the CLI arm directly.
        const adapter = this.adapters.get(cli);
        if (adapter === undefined) throw new Error('no adapter registered');
        return adapter.getCapacity();
      })
    );

    const result = new Map<CliName, Assessment>();
    for (const [idx, cli] of candidates.entries()) {
      const outcome = settled[idx];
      if (outcome?.status === 'fulfilled') {
        result.set(cli, assessCapacity(outcome.value));
      } else {
        this.logger.debug('Capacity probe unavailable — not excluding', { cli });
        result.set(cli, 'unmeasured');
      }
    }
    return result;
  }

  /**
   * Emits counts for both exhausted and unmeasured candidates.
   *
   * `capacity:unmeasured-N` is emitted so a downstream consumer can tell a
   * genuinely healthy panel from one nobody has measured. Suppressing it at zero
   * would make "all healthy" and "all unknown" look alike in the signal list.
   */
  private buildSignals(existing: string[], exhausted: number, unmeasured: number): string[] {
    const signals = [...existing];
    if (exhausted > 0) {
      signals.push(`${CAPACITY_EXHAUSTED}:${String(exhausted)}`);
    }
    if (unmeasured > 0) {
      signals.push(`capacity:unmeasured-${String(unmeasured)}`);
    }
    return signals;
  }
}

/** Creates a capacity filter stage. */
export function createCapacityStage(
  adapters: Map<RoutingArmId, ICliAdapter>,
  config?: Partial<CapacityStageConfig>,
  logger?: ILogger
): CapacityFilterStage {
  return new CapacityFilterStage(adapters, config, logger);
}
