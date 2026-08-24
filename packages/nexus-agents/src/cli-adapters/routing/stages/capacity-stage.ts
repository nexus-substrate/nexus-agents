/**
 * Capacity Filter Stage
 *
 * Classifies each routing candidate's adapter capacity and reports it. Under
 * `enforceHardLimits: true` it also excludes measurably exhausted candidates so
 * a task is not routed to an adapter that cannot serve it (#4373, criterion 3
 * of #4351).
 *
 * The shipped default is SIGNAL-ONLY — see `DEFAULT_CONFIG` for why, and #4456
 * for the missing signal that would make enforcement safe. Criterion 3 of #4351
 * is therefore not yet closed.
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
import type { CapacityStatus, CliName, ICliAdapter, RoutingArmId } from '../../types.js';

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
  /**
   * Per-adapter capacity-probe budget (ms). `ICliAdapter.getCapacity()` is a
   * promise on a public interface with no timeout of its own, so an adapter that
   * hangs would hang every routing decision. A probe that overruns is treated as
   * `unmeasured`, never as exhausted.
   */
  readonly probeTimeoutMs: number;
}

/**
 * Signal-only by default — deliberately NOT enforcing.
 *
 * The available `exhausted` flag is not what its name suggests. `CapacityTracker`
 * sets it from a **rolling 60-second** window against **hardcoded per-minute
 * estimates** (`capacity-tracker.ts:22-37`: claude 100k tokens / 50 requests,
 * commented "conservative estimates"), and `requestCount` increments on every
 * call whether or not token usage was reported. So `exhausted === true` means
 * "this process made 50 claude calls in the last minute", not "the account's
 * quota is gone", and it self-clears within 60s (`resetTime = windowStart +
 * windowMs`).
 *
 * That is a rate-limit heuristic, and #4351 — the bug this stage serves — is
 * about *weekly quota* exhaustion. Different phenomena. Hard-excluding on the
 * heuristic would let an ordinary burst (a 7-voter panel, a subagent fan-out)
 * empty the candidate pool and fail routing closed for a condition that clears
 * itself, which is a self-inflicted outage rather than a fix.
 *
 * A 7/7 panel voted to enforce by default, but on a proposal in which I
 * described this signal as a local *quota* lower bound. That was wrong, and the
 * panel's decisive reasoning ("observed exhaustion implies provider-side quota
 * is at least as exhausted") does not survive the correction. Enforcement is
 * therefore held until a real quota signal exists (#4456).
 *
 * WIRING, corrected (#4658). This previously said `enforceHardLimits: true`
 * "remains available for callers who have one". No caller can set it, and the
 * reason is broader than the flag: `createCapacityStage` has **no non-test
 * caller at all**. The stage is not part of the production routing chain
 * (`Task -> BudgetRouter -> ZeroRouter -> PreferenceRouter -> TopsisRouter ->
 * LinUCB`), so neither the signal nor the exclusion runs today, and
 * `excludedCount` is structurally 0.
 *
 * Do not read a passing capacity check as evidence of available capacity —
 * nothing is measuring it. Making the flag settable without first wiring the
 * stage AND supplying a real quota producer would only relocate the hole #4456
 * deliberately left open.
 *
 * (`BudgetStageConfig.enforceHardLimits` is a different setting on a different
 * router and IS enforced — see `budget-router.ts`. The mirrored name here is
 * why this one reads as live.)
 */
const DEFAULT_CONFIG: CapacityStageConfig = {
  enforceHardLimits: false,
  probeTimeoutMs: 2_000,
};

/**
 * Why a candidate was not excluded. `unmeasured` is deliberately distinct from
 * `healthy`: an unobserved reading is a set of defaults, and collapsing the two
 * is exactly the blindness #4436 was filed about.
 */
/**
 * `throttled` (#4456) sits between healthy and exhausted: this process's own
 * rolling window is full. It never excludes a candidate — the window clears
 * within the minute — but it IS reported, via a `capacity:throttled-N` signal
 * and a `throttledCount` stat.
 *
 * Reported rather than acted on, deliberately. Preferring another candidate
 * would be a routing behaviour change, and local rate-limiting is common
 * enough (an ordinary 7-voter panel trips it) that silently reordering on it
 * needs its own evidence. Until then the honest position is to surface the
 * state, not to hide it and not to claim a preference nothing implements.
 */
type Assessment = 'exhausted' | 'throttled' | 'healthy' | 'unmeasured';

/**
 * Classifies one capacity reading.
 *
 * `observed === false` means every other field is a default rather than a
 * measurement (#4374), so such a reading can neither exclude a candidate nor
 * vouch for one.
 *
 * Note `remainingTokens <= 0` is checked independently: a provider can report
 * zero remaining without any flag being set. This is the stricter of the two
 * forms the deleted WorkBalancer carried.
 *
 * #4456: `quotaExhausted` and `rateLimited` are graded differently on purpose.
 * `quotaExhausted` is provider-asserted and durable, so it is the only signal
 * strong enough to justify excluding a candidate. `rateLimited` is this
 * process's own rolling-60s arithmetic against an estimated constant — an
 * ordinary 7-voter panel trips it while plenty of quota remains, so enforcing
 * on it would empty the candidate pool for a condition that clears within the
 * minute. That is why enforcement shipped switched off; grading them apart is
 * what makes it safe to switch on.
 */
export function assessCapacity(status: CapacityStatus): Assessment {
  if (!status.observed) return 'unmeasured';
  if (status.quotaExhausted || status.remainingTokens <= 0) return 'exhausted';
  if (status.rateLimited) return 'throttled';
  return 'healthy';
}

/**
 * Capacity filter stage — classifies candidates, and excludes the exhausted ones
 * only when `enforceHardLimits` is opted into.
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
  /** Candidates whose own rolling window was full (#4456). Never excluded. */
  private throttledCount = 0;

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

    const { updatedCtx, exhausted, unmeasured, throttled } = this.classifyAndFilter(
      ctx,
      remaining,
      assessments
    );

    const signals = this.buildSignals(ctx.signals, exhausted, unmeasured, throttled);
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
    return {
      excludedCount: this.excludedCount,
      unmeasuredCount: this.unmeasuredCount,
      throttledCount: this.throttledCount,
    };
  }

  /**
   * Races a capacity probe against `probeTimeoutMs`.
   *
   * `ICliAdapter.getCapacity()` carries no timeout of its own, and the router's
   * `maxDecisionTimeMs` is declared but not enforced anywhere, so without this a
   * single hanging adapter would stall every routing decision. A timed-out probe
   * rejects, which lands in the `unmeasured` branch — never `exhausted`.
   */
  private async probeWithTimeout(adapter: ICliAdapter): Promise<CapacityStatus> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        adapter.getCapacity(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new Error(`capacity probe timed out after ${String(this.config.probeTimeoutMs)}ms`)
            );
          }, this.config.probeTimeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
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
  /**
   * Assess capacity for a set of routing ARMS (#4455).
   *
   * Capacity belongs to the serving route, not the display slot: a CLI
   * subscription's quota and an API key's quota are genuinely independent, so
   * `claude` and `api:anthropic` must be probed separately even though they
   * share a vendor slot. Callers that hold the arm list should use this rather
   * than routing through the slot-collapsing `RoutingContext`.
   */
  async assessArms(arms: readonly RoutingArmId[]): Promise<Map<RoutingArmId, Assessment>> {
    return this.assessAll(arms);
  }

  /**
   * Arm-granular filter (#4455).
   *
   * The `route()` path filters at display-slot granularity because that is what
   * `RoutingContext` carries, but capacity is a property of the serving route:
   * `claude` and `api:anthropic` share a vendor slot and have entirely separate
   * quotas. Assessing per slot meant one arm's exhaustion excluded both — a
   * destructive false positive — while an exhausted api arm went unprobed.
   *
   * Enforcement and the metric counters stay in here rather than at the call
   * site so both paths share one policy.
   */
  async filterArms(
    arms: readonly RoutingArmId[]
  ): Promise<{ eligible: RoutingArmId[]; excluded: Map<RoutingArmId, string> }> {
    const assessments = await this.assessAll(arms);
    const excluded = new Map<RoutingArmId, string>();
    const eligible: RoutingArmId[] = [];
    let unmeasured = 0;

    for (const arm of arms) {
      const assessment = assessments.get(arm) ?? 'unmeasured';
      if (assessment === 'unmeasured') unmeasured++;
      // Throttled arms stay eligible, but the count must not vanish (#4456).
      if (assessment === 'throttled') this.throttledCount++;

      // Only a measured exhaustion excludes, and only under hard limits. An
      // unmeasured arm is never dropped: absence of a reading is not a reading.
      if (assessment === 'exhausted' && this.config.enforceHardLimits) {
        excluded.set(arm, `${CAPACITY_EXHAUSTED}: no capacity remaining`);
        this.excludedCount++;
        continue;
      }
      eligible.push(arm);
    }

    this.unmeasuredCount += unmeasured;
    return { eligible, excluded };
  }

  private async assessAll(
    candidates: readonly RoutingArmId[]
  ): Promise<Map<RoutingArmId, Assessment>> {
    const settled = await Promise.allSettled(
      candidates.map(async (cli) => {
        const adapter = this.adapters.get(cli);
        if (adapter === undefined) throw new Error('no adapter registered');
        return this.probeWithTimeout(adapter);
      })
    );

    const result = new Map<RoutingArmId, Assessment>();
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
   * Tally each candidate's grade, excluding only the exhausted ones.
   *
   * Iterates the slot list rather than the assessment map: `route()` operates
   * on the slot-granular RoutingContext, so `filterCandidate` needs a
   * CliName. Arm-granular callers use `assessArms` instead (#4455).
   *
   * Extracted from `route()` to keep it inside its line budget once
   * `throttled` gained a counter (#4456 follow-up).
   */
  private classifyAndFilter(
    ctx: RoutingContext,
    remaining: readonly CliName[],
    assessments: Map<RoutingArmId, Assessment>
  ): { updatedCtx: RoutingContext; exhausted: number; unmeasured: number; throttled: number } {
    let updatedCtx = ctx;
    let exhausted = 0;
    let unmeasured = 0;
    let throttled = 0;

    for (const cli of remaining) {
      // Exhaustive switch, not an if/!== chain (#4563). When `throttled` was
      // added to Assessment, the old chain's `if (assessment !== 'exhausted')
      // continue;` swallowed it silently alongside `healthy` — the compiler
      // had nothing to object to, so a rate-limited candidate went unreported
      // in every trace. A switch with no default makes the next member a
      // build error here instead of a silent fall-through.
      const assessment: Assessment = assessments.get(cli) ?? 'unmeasured';
      switch (assessment) {
        case 'unmeasured':
          unmeasured++;
          break;
        case 'throttled':
          throttled++;
          break;
        case 'healthy':
          break;
        case 'exhausted':
          exhausted++;
          if (this.config.enforceHardLimits) {
            updatedCtx = filterCandidate(
              updatedCtx,
              cli,
              `${CAPACITY_EXHAUSTED}: no capacity remaining`
            );
            this.excludedCount++;
          }
          break;
        default: {
          // A bare switch does NOT force exhaustiveness in TypeScript —
          // verified by adding a member and watching the build stay green.
          // This assertion is what makes the next Assessment member a compile
          // error here, using the `const exhaustive: never` idiom already used
          // across the codebase rather than a new helper.
          const exhaustive: never = assessment;
          throw new Error(`Unhandled capacity assessment: ${String(exhaustive)}`);
        }
      }
    }

    this.unmeasuredCount += unmeasured;
    this.throttledCount += throttled;
    return { updatedCtx, exhausted, unmeasured, throttled };
  }

  /**
   * Emits counts for both exhausted and unmeasured candidates.
   *
   * `capacity:unmeasured-N` lets a downstream consumer tell a genuinely healthy
   * panel from one nobody has measured. It is emitted only when the count is
   * non-zero — its *absence* therefore means every candidate was measured, which
   * is the distinction that matters. (An earlier version of this comment claimed
   * the signal was emitted at zero too; it never was.)
   */
  private buildSignals(
    existing: string[],
    exhausted: number,
    unmeasured: number,
    throttled: number
  ): string[] {
    const signals = [...existing];
    if (exhausted > 0) {
      signals.push(`${CAPACITY_EXHAUSTED}:${String(exhausted)}`);
    }
    if (unmeasured > 0) {
      signals.push(`capacity:unmeasured-${String(unmeasured)}`);
    }
    // #4456 follow-up: without this, a rate-limited candidate was
    // indistinguishable from a healthy one in every trace — the grade existed
    // in the type and nowhere in the output.
    if (throttled > 0) {
      signals.push(`capacity:throttled-${String(throttled)}`);
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
