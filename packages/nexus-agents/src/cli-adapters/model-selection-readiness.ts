/**
 * Route-time model-selection flip readiness gate (#4197, epic #4175).
 *
 * Turns the accumulated {@link ModelSelectionShadowRecord} log into a
 * FALSIFIABLE, fail-closed "is NEXUS_ROUTE_MODEL_SELECTION ready to default
 * on?" verdict — the AUDIT-MODE readiness SIGNAL for the flip, NOT the flip
 * itself. This module only EVALUATES; it flips no flag and alters no routing.
 * The flip is a separate vote-gated increment that consumes this signal
 * (precedent: #3552's learned selector lost its shadow eval, delta −0.29, and
 * stayed off — that is the outcome this gate exists to make observable).
 *
 * Mirrors {@link evaluateMetaStrategyReadiness} (#4094) and reuses the shared
 * {@link ReadinessVerdict} envelope (#4096) rather than minting a new verdict
 * type. Fail-closed: ALL criteria required.
 *
 * THE PRE-DECLARED WIN METRIC (fixed before any data is inspected):
 *  1. **volume** — at least `minDivergingDecisions` (default 50) outcome-joined
 *     shadow records where the shadow model DIFFERED from the actual model.
 *     Agreement-only volume proves nothing about the flip (flipping changes
 *     behavior only where the shadow diverges).
 *  2. **success-delta** — success rate of shadow-AGREEING decisions minus
 *     success rate of shadow-DIVERGING decisions must be ≥ `minSuccessDelta`
 *     (default 0.05 — a tie is not enough, matching the #4094 margin). A
 *     positive delta means current routing underperforms exactly where the
 *     tier resolver would have picked differently — the directional signal
 *     that its picks could help. This is a PROXY (the shadow never executes,
 *     so its counterfactual outcome is unobservable); crossing it is
 *     necessary-not-sufficient for the flip.
 *  3. **cost-measured** — at least `minCostSamples` (default 10) records carry
 *     a measured `costUsd`, and the detail reports the mean where measured.
 *     Today the routing outcome path measures NO per-decision cost, so this
 *     criterion blocks by construction — deliberate fail-closed: the flip must
 *     not be judged without a cost dimension, and this stays a blocker until
 *     cost attribution reaches the routing outcome join.
 *
 * @module cli-adapters/model-selection-readiness
 * (Source: Issue #4197 — shadow-mode eval for NEXUS_ROUTE_MODEL_SELECTION)
 */

import { getErrorMessage } from '../core/index.js';
import { readModelSelectionShadowRecords } from './model-selection-shadow.js';

import type { ILogger } from '../core/index.js';
import type { ReadinessCriterion, ReadinessVerdict } from '../mcp/tools/readiness-verdict.js';
import type { ModelSelectionShadowRecord } from './model-selection-shadow.js';

// Re-export the shared envelope so consumers of this gate get the verdict shape
// without a second import site (#4096 pattern).
export type { ReadinessCriterion, ReadinessVerdict } from '../mcp/tools/readiness-verdict.js';

/** Tuning for {@link evaluateModelSelectionReadiness}. */
export interface ModelSelectionReadinessConfig {
  /** Minimum outcome-joined records where shadow ≠ actual. */
  readonly minDivergingDecisions: number;
  /** Minimum agree−diverge success-rate margin (a tie is not enough). */
  readonly minSuccessDelta: number;
  /** Minimum records carrying a measured costUsd. */
  readonly minCostSamples: number;
}

/**
 * Conservative defaults — high bar, fail-closed.
 *
 * - `minDivergingDecisions` is 50 (the #4197 pre-declared volume floor).
 * - `minSuccessDelta` is 0.05: a real margin, matching the #4094 gate's
 *   minDelta — a tie stays blocked.
 * - `minCostSamples` is 10: enough measured costs for the mean to be citable.
 *
 * Overridable per-caller; raising any value is monotonically safer.
 */
export const DEFAULT_MODEL_SELECTION_READINESS_CONFIG: ModelSelectionReadinessConfig = {
  minDivergingDecisions: 50,
  minSuccessDelta: 0.05,
  minCostSamples: 10,
};

/** Aggregates of the shadow log the readiness criteria are computed from. */
export interface ModelSelectionShadowSummary {
  /** Total outcome-joined shadow records. */
  readonly total: number;
  /** Records where shadow model === actual model. */
  readonly agreeing: number;
  /** Records where shadow model !== actual model. */
  readonly diverging: number;
  /** Success rate over the agreeing cohort (0 when empty). */
  readonly agreeSuccessRate: number;
  /** Success rate over the diverging cohort (0 when empty). */
  readonly divergeSuccessRate: number;
  /**
   * agreeSuccessRate − divergeSuccessRate. 0 (incomparable, fail-closed) when
   * EITHER cohort is empty — a one-cohort log cannot certify a delta.
   */
  readonly successDelta: number;
  /** Records carrying a measured costUsd. */
  readonly costSamples: number;
  /** Mean costUsd over the measured records (0 when none measured). */
  readonly meanCostUsd: number;
}

/** Running success tally for one cohort (agreeing or diverging). */
interface CohortTally {
  count: number;
  successes: number;
}

function successRate(t: CohortTally): number {
  return t.count === 0 ? 0 : t.successes / t.count;
}

/** Summarize the shadow log into the aggregates the criteria read. Pure. */
export function summarizeModelSelectionShadow(
  records: readonly ModelSelectionShadowRecord[]
): ModelSelectionShadowSummary {
  const agree: CohortTally = { count: 0, successes: 0 };
  const diverge: CohortTally = { count: 0, successes: 0 };
  let costSamples = 0;
  let costTotal = 0;
  for (const r of records) {
    const cohort = r.agree ? agree : diverge;
    cohort.count++;
    if (r.success) cohort.successes++;
    if (r.costUsd !== undefined) {
      costSamples++;
      costTotal += r.costUsd;
    }
  }
  const agreeSuccessRate = successRate(agree);
  const divergeSuccessRate = successRate(diverge);
  // Fail-closed: with either cohort empty the delta is incomparable, not "won".
  const successDelta =
    agree.count === 0 || diverge.count === 0 ? 0 : agreeSuccessRate - divergeSuccessRate;
  return {
    total: records.length,
    agreeing: agree.count,
    diverging: diverge.count,
    agreeSuccessRate,
    divergeSuccessRate,
    successDelta,
    costSamples,
    meanCostUsd: costSamples === 0 ? 0 : costTotal / costSamples,
  };
}

/**
 * Evaluate whether the shadow log clears the pre-declared flip bar. Pure.
 * Never returns `ready: true` unless ALL criteria pass. Fail-closed — an
 * empty/thin log yields `diverging: 0`, `successDelta: 0`, `costSamples: 0`,
 * so every criterion fails and the verdict is not-ready.
 */
export function evaluateModelSelectionReadiness(
  records: readonly ModelSelectionShadowRecord[],
  config: ModelSelectionReadinessConfig = DEFAULT_MODEL_SELECTION_READINESS_CONFIG
): ReadinessVerdict {
  const s = summarizeModelSelectionShadow(records);
  const criteria: ReadinessCriterion[] = [
    {
      name: 'volume',
      met: s.diverging >= config.minDivergingDecisions,
      detail: `${String(s.diverging)} shadow-diverging decisions (need ≥ ${String(config.minDivergingDecisions)})`,
    },
    {
      name: 'success-delta',
      met: s.successDelta >= config.minSuccessDelta,
      detail: `agree−diverge success delta ${s.successDelta.toFixed(2)} (agree ${s.agreeSuccessRate.toFixed(2)} over ${String(s.agreeing)}, diverge ${s.divergeSuccessRate.toFixed(2)} over ${String(s.diverging)}; need ≥ ${config.minSuccessDelta.toFixed(2)})`,
    },
    {
      name: 'cost-measured',
      met: s.costSamples >= config.minCostSamples,
      detail: `${String(s.costSamples)} decisions with measured costUsd, mean $${s.meanCostUsd.toFixed(4)} (need ≥ ${String(config.minCostSamples)})`,
    },
  ];

  const blockers = criteria.filter((c) => !c.met).map((c) => c.name);
  return { ready: blockers.length === 0, criteria, blockers };
}

// ============================================================================
// Log-once surface (mirrors logMetaStrategyReadinessOnce, #4161)
// ============================================================================

let readinessLogged = false;

/** Reset the log-once guard. For tests. */
export function resetModelSelectionReadinessLogging(): void {
  readinessLogged = false;
}

/**
 * Compute the flip-readiness verdict from the persisted shadow log and SURFACE
 * it for operators — once per process, at first shadow-enabled routing
 * decision (mirrors `logMetaStrategyReadinessOnce`, #4161). AUDIT-MODE ONLY:
 * a logged/reported signal, never acted on; the routed decision is untouched.
 * Best-effort: an eval failure is swallowed so routing never breaks.
 */
export function logModelSelectionReadinessOnce(logger: ILogger): void {
  if (readinessLogged) return;
  readinessLogged = true;
  try {
    const records = readModelSelectionShadowRecords();
    const summary = summarizeModelSelectionShadow(records);
    const verdict = evaluateModelSelectionReadiness(records);
    logger.info('route-model-selection shadow readiness', {
      ready: verdict.ready,
      blockers: verdict.blockers,
      total: summary.total,
      diverging: summary.diverging,
      successDelta: summary.successDelta,
      agreeSuccessRate: summary.agreeSuccessRate,
      divergeSuccessRate: summary.divergeSuccessRate,
      costSamples: summary.costSamples,
      meanCostUsd: summary.meanCostUsd,
    });
  } catch (err) {
    logger.warn('route-model-selection readiness signal failed (non-fatal)', {
      error: getErrorMessage(err),
    });
  }
}
