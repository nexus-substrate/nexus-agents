/**
 * nexus-agents/orchestration — learned-selector promotion readiness gate (#4094).
 *
 * Turns the offline {@link MetaStrategyEvalResult} (learned-vs-rules accuracy over
 * the labeled corpus, {@link evaluateMetaStrategy}) into a FALSIFIABLE, fail-closed
 * "is the learned strategy selector ready to promote?" verdict — the AUDIT-MODE
 * readiness SIGNAL for the #3552 shadow→route flip, NOT the flip itself. This module
 * only EVALUATES; it flips no flag, alters no routing, and runs no selector. The
 * promotion path (#3552, letting the learned arm actually route) is a separate
 * vote-gated increment that consumes this signal — it is deliberately NOT built here.
 *
 * Mirrors {@link evaluateEnforceReadiness} (the shadow→enforce sibling gate): a fixed
 * set of independently-checkable numeric conditions, ALL required (fail-closed — any
 * unmet condition blocks promotion). Reuses the shared {@link ReadinessVerdict}
 * envelope (#4096) rather than minting a new verdict type.
 *
 * THE CRITERIA (per the epic #4094 design):
 *  1. **volume** — the held-out test split is large enough to judge (`testCount >=
 *     minTestCases`). A thin corpus can't certify a selector; fail-closed here keeps
 *     an under-grown corpus in audit longer.
 *  2. **learned-beats-rules** — the learned arm beats rules by a real MARGIN
 *     (`delta >= minDelta`), not merely a tie. Promoting a selector that only ties
 *     the rule router adds bandit complexity for no measured gain.
 *  3. **learned-accuracy-floor** — the learned arm clears an ABSOLUTE accuracy floor
 *     (`learnedAccuracy >= minLearnedAccuracy`). Guards the pathological case where
 *     learned "beats" rules only because rules are worse — both weak. We refuse to
 *     promote a learned selector that is merely less-bad but still poor.
 *
 * INTELLECTUAL HONESTY (carried from the eval): the eval's training reward is
 * SYNTHESIZED from the oracle label, so `learnedAccuracy` is a DIRECTIONAL signal,
 * not a production number. This gate is therefore an AUDIT readiness indicator for
 * operators, not an auto-promote trigger. Crossing it is necessary-not-sufficient for
 * the #3552 flip, which additionally requires the vote gate + real shadow-outcome
 * training.
 *
 * @module orchestration/meta-strategy-readiness
 */

import type { ReadinessCriterion, ReadinessVerdict } from '../mcp/tools/readiness-verdict.js';
import type { MetaStrategyEvalResult } from './meta-strategy-eval.js';

// Re-export the shared envelope so consumers of this gate get the verdict shape
// without a second import site (#4096).
export type { ReadinessCriterion, ReadinessVerdict } from '../mcp/tools/readiness-verdict.js';

/** Tuning for {@link evaluateMetaStrategyReadiness}. */
export interface MetaStrategyReadinessConfig {
  /** Minimum held-out test cases before promotion can be considered. */
  readonly minTestCases: number;
  /** Minimum learned−rules accuracy margin (a tie is not enough). */
  readonly minDelta: number;
  /** Minimum ABSOLUTE learned accuracy (don't promote a merely-less-bad selector). */
  readonly minLearnedAccuracy: number;
}

/**
 * Conservative defaults — high bar, fail-closed.
 *
 * - `minTestCases` is 20: the held-out count a 25%-split ≥80-entry corpus yields — the
 *   volume the #3552 readiness gate expects (matching improvement-enforce-readiness's
 *   own volume floor of 20 at its introduction). A thinner split stays in audit longer.
 * - `minDelta` is 0.05: learned must beat rules by a real margin; a tie stays blocked.
 * - `minLearnedAccuracy` is 0.7: an absolute floor so "learned beats rules" can't pass
 *   on two weak arms.
 *
 * Overridable per-caller; raising any value is monotonically safer.
 */
export const DEFAULT_META_STRATEGY_READINESS_CONFIG: MetaStrategyReadinessConfig = {
  minTestCases: 20,
  minDelta: 0.05,
  minLearnedAccuracy: 0.7,
};

function pctStr(n: number): string {
  return String(Math.round(n * 100));
}

/**
 * Evaluate whether the learned strategy selector's offline eval clears the promotion
 * bar. Pure: supply an {@link evaluateMetaStrategy} result. Never returns
 * `ready: true` unless ALL criteria pass. Fail-closed — an empty/thin corpus yields
 * `testCount: 0`, `delta: 0`, `learnedAccuracy: 0`, so every criterion fails and the
 * verdict is not-ready.
 */
export function evaluateMetaStrategyReadiness(
  result: MetaStrategyEvalResult,
  config: MetaStrategyReadinessConfig = DEFAULT_META_STRATEGY_READINESS_CONFIG
): ReadinessVerdict {
  const criteria: ReadinessCriterion[] = [
    {
      name: 'volume',
      met: result.testCount >= config.minTestCases,
      detail: `${String(result.testCount)} held-out test cases (need ≥ ${String(config.minTestCases)})`,
    },
    {
      name: 'learned-beats-rules',
      met: result.delta >= config.minDelta,
      detail: `learned−rules delta ${result.delta.toFixed(2)} (need ≥ ${config.minDelta.toFixed(2)})`,
    },
    {
      name: 'learned-accuracy-floor',
      met: result.learnedAccuracy >= config.minLearnedAccuracy,
      detail: `learned accuracy ${pctStr(result.learnedAccuracy)}% (need ≥ ${pctStr(config.minLearnedAccuracy)}%)`,
    },
  ];

  const blockers = criteria.filter((c) => !c.met).map((c) => c.name);
  return { ready: blockers.length === 0, criteria, blockers };
}
