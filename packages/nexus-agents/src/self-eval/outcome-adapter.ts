/**
 * Adapter mapping self-evaluation aggregated results into TaskOutcome
 * records so the eval -> log -> tune loop closes: self-eval output now
 * feeds the OutcomeStore (and thereby improvement_review / tuning).
 *
 * All self-eval outputs are RECOMMENDATIONS, not decisions — this adapter
 * preserves that semantic by carrying the recommendation in qualitySignals
 * and (for non-retain results) a human-readable note.
 *
 * @module self-eval/outcome-adapter
 * (Source: Issues #3219, #3235, #3241 — self-eval -> OutcomeStore wiring)
 */

import type { AggregatedResult } from './aggregation-logic.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';

/**
 * Marker quality signal stamped on every self-eval-sourced outcome.
 * Lets downstream consumers (and idempotency checks) recognize and, if
 * desired, exclude self-eval recommendations from routing reward signals.
 */
export const SELF_EVAL_MARKER = 'self-eval';

/**
 * Derive a stable, deterministic outcome id from a component path so that
 * re-running self-eval over the same tree upserts (replaces on persistence
 * load / dedupes) rather than piling up duplicate rows. Mirrors the
 * `synthetic-<cli>-<category>` / `e2e-<i>-<cli>-<category>` id schemes used
 * by warm-up.ts / e2e-eval.ts.
 */
export function selfEvalOutcomeId(componentPath: string): string {
  const sanitized = componentPath.replace(/[^a-zA-Z0-9._/-]/g, '_');
  return `self-eval-${sanitized}`;
}

/**
 * Map one self-eval `AggregatedResult` to a `TaskOutcome`.
 *
 * Mapping:
 * - component path        -> stable id (`self-eval-<path>`)
 * - finalRecommendation   -> success (`retain` => true; review/refactor/
 *                            deprecate => false) + carried in qualitySignals
 *                            and (for non-retain) `errorMessage` note
 * - confidence/evidence   -> carried as quality signals for traceability
 * - category              -> `code_review` (self-eval is a code assessment)
 * - cli/model             -> `claude` / `claude-default` (harness identity)
 * - source                -> `manual`
 * - durationMs            -> the evaluation time the caller measured (#5653).
 *                            Required: a zero placeholder made every non-retain
 *                            record match the skipped-worker purge (#1528) and
 *                            vanish on the next store hydrate.
 */
export function aggregatedResultToOutcome(
  result: AggregatedResult,
  timing: { readonly durationMs: number }
): TaskOutcome {
  const success = result.finalRecommendation === 'retain';

  const qualitySignals = [
    SELF_EVAL_MARKER,
    `recommendation:${result.finalRecommendation}`,
    `confidence:${result.confidence.toFixed(2)}`,
    `evidence:${result.evidenceQuality.toFixed(2)}`,
  ];

  const outcome: TaskOutcome = {
    id: selfEvalOutcomeId(result.component),
    cli: 'claude',
    category: 'code_review',
    model: 'claude-default',
    success,
    durationMs: timing.durationMs,
    timestamp: result.timestamp.toISOString(),
    qualitySignals,
    source: 'manual',
  };

  // Surface the recommendation as a failure note when the component is not
  // a clean "retain" — gives downstream tuning/triage a reason string.
  if (!success) {
    return {
      ...outcome,
      errorMessage: `self-eval recommendation: ${result.finalRecommendation}`,
    };
  }

  return outcome;
}
