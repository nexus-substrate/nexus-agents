/**
 * Maps a feedback-layer `TaskOutcome` (learning) into a routing-layer
 * `TaskOutcome` (orchestration/outcomes) so feedback outcomes can be recorded
 * into the routing OutcomeStore for unified analysis (#3146, epic #3143 P1).
 *
 * The two `TaskOutcome` shapes are intentionally distinct layers and stay
 * separately exported (see #3146 — no symbol collapse). This is a ONE-WAY,
 * pure mapper: feedback outcomes carry no CLI/category/model, so those come
 * from the routing decision via `RoutingOutcomeContext`. The feedback
 * `traceId` is carried through, giving cross-layer correlation (it lands in
 * the routing schema's optional `traceId` field added in PR-1 / #3281).
 *
 * @module learning/feedback-outcome-mapper
 */

import type { TaskOutcome as FeedbackTaskOutcome } from './outcome-feedback-types.js';
import type {
  TaskOutcome as RoutingTaskOutcome,
  OutcomeFailureCategory,
} from '../orchestration/outcomes/outcome-types.js';

/** Routing-decision context the feedback outcome lacks (cli/category/model). */
export interface RoutingOutcomeContext {
  readonly cli: RoutingTaskOutcome['cli'];
  readonly category: RoutingTaskOutcome['category'];
  readonly model: string;
  /** Outcome source; defaults to `delegate`. */
  readonly source?: RoutingTaskOutcome['source'];
}

/**
 * Map the feedback `outcomeClass` to a routing `failureCategory`. Returns
 * undefined for non-failures (success/partial) — the routing schema omits
 * `failureCategory` on successful outcomes.
 */
export function failureCategoryFromOutcomeClass(
  outcomeClass: FeedbackTaskOutcome['outcomeClass']
): OutcomeFailureCategory | undefined {
  switch (outcomeClass) {
    case 'timeout':
      return 'timeout';
    case 'error':
      return 'execution';
    case 'failure':
      return 'generic';
    case 'success':
    case 'partial':
      return undefined;
  }
}

/**
 * Convert a feedback `TaskOutcome` + routing context into a routing
 * `TaskOutcome`. The result is schema-valid (`TaskOutcomeSchema`). Lossy by
 * design: the feedback `qualitySignals` object and `qualityScore` have no
 * routing-schema home and are dropped (routing `qualitySignals` is a string
 * tag list, semantically different) — correlation is preserved via `traceId`.
 */
export function feedbackToRoutingOutcome(
  feedback: FeedbackTaskOutcome,
  context: RoutingOutcomeContext
): RoutingTaskOutcome {
  const failureCategory = feedback.success
    ? undefined
    : failureCategoryFromOutcomeClass(feedback.outcomeClass);
  return {
    id: feedback.routingDecisionId,
    cli: context.cli,
    category: context.category,
    model: context.model,
    success: feedback.success,
    durationMs: feedback.durationMs,
    timestamp: feedback.timestamp,
    source: context.source ?? 'delegate',
    traceId: feedback.traceId,
    ...(failureCategory !== undefined ? { failureCategory } : {}),
    ...(feedback.errorMessage !== undefined
      ? { errorMessage: feedback.errorMessage.slice(0, 500) }
      : {}),
  };
}
