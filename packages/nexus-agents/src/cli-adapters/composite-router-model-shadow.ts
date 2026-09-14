/**
 * Model-selection SHADOW glue for `CompositeRouter` (#4197), split out of
 * `composite-router.ts` (#6148).
 *
 * The router keeps route-time outcome data keyed by the exact task object so
 * the later outcome call (`recordDifficultyOutcome` / the executed path) can
 * be joined to the decision that produced it. That map carries TWO things:
 * the difficulty attribution consumed by the ZeroRouter outcome path, and the
 * shadow comparison consumed here. Because the difficulty path needs the same
 * entry, the map lives in this class rather than as a module-level singleton
 * and the router owns one instance per router: `track` fills an entry at
 * route time, `take` hands it back (once) at outcome time, and
 * `joinModelShadowOutcome` persists the shadow half.
 *
 * Imports nothing from `composite-router.ts` — the split introduces no cycle.
 *
 * @module cli-adapters/composite-router-model-shadow
 */
import { getErrorMessage, getTimeProvider, type ILogger } from '../core/index.js';
import type { CliTask, RoutingArmId } from './types.js';
import { routingArmDisplaySlot } from './types.js';
import type { CompositeRoutingDecision } from './composite-router-types.js';
import {
  MODEL_SELECTION_SHADOW_SCHEMA_VERSION,
  computeModelSelectionShadow,
  isRouteModelShadowEnabled,
  persistModelSelectionShadowRecord,
  recordModelSelectionShadowFailure,
  type ModelSelectionShadowComparison,
} from './model-selection-shadow.js';
import { logModelSelectionReadinessOnce } from './model-selection-readiness.js';

/** Route-time data held for one task until its outcome arrives. */
export interface PendingRoutingOutcome {
  readonly difficultyAttribution:
    { readonly difficulty: number; readonly selectedCli: RoutingArmId } | undefined;
  readonly modelShadow: ModelSelectionShadowComparison | undefined;
}

/**
 * Route-time outcome data keyed by the exact task object for execution-safe
 * feedback joins. Weak keys avoid retaining abandoned task objects.
 */
export class PendingRoutingOutcomes {
  private readonly pending = new WeakMap<CliTask, PendingRoutingOutcome>();

  constructor(private readonly logger: ILogger) {}

  /** Record the route-time attribution and shadow comparison for `task`. */
  track(task: CliTask, decision: CompositeRoutingDecision): void {
    if (this.pending.get(task)?.modelShadow !== undefined) {
      this.logger.debug('Dropping incomplete model-selection shadow comparison after task reroute');
    }
    const difficultyAttribution =
      decision.difficultyEstimate === undefined
        ? undefined
        : {
            difficulty: decision.difficultyEstimate.aggregateScore,
            selectedCli: decision.cliName,
          };
    this.pending.set(task, {
      difficultyAttribution,
      modelShadow: this.computeModelShadow(task, decision),
    });
  }

  /** Remove and return the entry for `task`; `undefined` when none was tracked. */
  take(task: CliTask): PendingRoutingOutcome | undefined {
    const pending = this.pending.get(task);
    this.pending.delete(task);
    return pending;
  }

  /**
   * Compute the model-selection SHADOW comparison for a routed decision
   * (#4197): what `resolveModelForTier` WOULD have picked vs the model the
   * decision actually carries (or the CLI default the adapter will resolve).
   * Held pending until `recordDifficultyOutcome` supplies the outcome, then
   * persisted to the dedicated shadow log. Gated behind
   * `NEXUS_ROUTE_MODEL_SHADOW=1` (default OFF). NEVER affects the live
   * decision — any failure increments the shadow-failure counter and is
   * logged, not thrown into the routing path.
   *
   * Tasks with a PINNED model (`CliTask.model`) are SKIPPED entirely: the
   * adapter executes the pinned model (base-adapter), not the CLI default the
   * comparison would otherwise assume, so a pinned run says nothing about the
   * tier selector — sampling it would mislabel the agree/diverge cohorts and
   * pad the volume criterion with garbage (#4218 review).
   */
  private computeModelShadow(
    task: CliTask,
    decision: CompositeRoutingDecision
  ): ModelSelectionShadowComparison | undefined {
    try {
      if (!isRouteModelShadowEnabled() || decision.difficultyTier === undefined) return undefined;
      if (task.model !== undefined) return undefined; // pinned model — not selector evidence
      // Log-once flip-readiness signal (#4197, mirrors #4161's pattern):
      // surfaced alongside shadow enablement, observed, never acted on.
      logModelSelectionReadinessOnce(this.logger);
      const comparison = computeModelSelectionShadow(
        routingArmDisplaySlot(decision.cliName),
        decision.difficultyTier,
        decision.model
      );
      this.logger.debug('Model-selection shadow computed (#4197)', {
        cli: comparison.cli,
        tier: comparison.tier,
        actualModel: comparison.actualModel,
        shadowModel: comparison.shadowModel,
        agree: comparison.agree,
      });
      return comparison;
    } catch (error: unknown) {
      const failures = recordModelSelectionShadowFailure();
      this.logger.warn('Model-selection shadow failed (non-fatal, #4197)', {
        error: getErrorMessage(error),
        failures,
      });
      return undefined;
    }
  }

  /**
   * Join a pending model-selection shadow comparison with its task outcome and
   * persist the completed record (#4197). `costUsd` is deliberately
   * absent: the routing outcome path measures no per-decision cost today, and
   * the readiness gate's cost criterion stays fail-closed until it does.
   * Exception-guarded — an outcome-join failure never breaks outcome recording.
   */
  joinModelShadowOutcome(
    pending: ModelSelectionShadowComparison | undefined,
    success: boolean
  ): void {
    if (pending === undefined) return;
    try {
      persistModelSelectionShadowRecord({
        schema: MODEL_SELECTION_SHADOW_SCHEMA_VERSION,
        timestamp: new Date(getTimeProvider().now()).toISOString(),
        cli: pending.cli,
        tier: pending.tier,
        actualModel: pending.actualModel,
        shadowModel: pending.shadowModel,
        agree: pending.agree,
        success,
      });
    } catch (error: unknown) {
      const failures = recordModelSelectionShadowFailure();
      this.logger.warn('Model-selection shadow outcome join failed (non-fatal, #4197)', {
        error: getErrorMessage(error),
        failures,
      });
    }
  }
}
