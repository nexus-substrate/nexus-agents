/**
 * Outcome recording for the `orchestrate` CLI command's routed runs (#6533).
 *
 * `CompositeRouter.executeDecision` names the arm that ran (`routedArm`, with
 * its display slot in `routedCli`) and times its call alone
 * (`routedDurationMs`), on success and on failure. The row's `cli` is the ARM
 * id (#6552): an `api:anthropic` run is recorded as `api:anthropic`, not as
 * its `claude` slot, so warm start credits the arm that ran. This
 * module turns that into a `TaskOutcome` with `routedBy: 'composite-router'`,
 * the same fields the dev-pipeline stages write through `expert-bridge`.
 *
 * No arm ran (routing failed, or the result carries no `routedCli`): NO row is
 * written, since there is no routed execution to attribute.
 *
 * The task category was not detected: the row IS written, marked
 * `categorySource: 'defaulted'` (#6549). The routed population and `doctor`'s
 * routed count include the run; the distiller and every per-category reader
 * skip it, so the placeholder category is never read as measured.
 *
 * @module cli/orchestrate-outcome
 */

import { createLogger, getTimeProvider, getRandomProvider, type Result } from '../core/index.js';
import type { CliError, CliResponse, RoutingArmId } from '../cli-adapters/index.js';
import { detectTaskCategory } from '../config/task-specialization.js';
import { getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import {
  outcomeFailureFields,
  resolveOutcomeCategory,
} from '../orchestration/outcomes/outcome-types.js';

const logger = createLogger({ component: 'orchestrate-outcome' });

/**
 * The router's attribution, read from whichever side of the result is present.
 * `routedArm` is the arm id; a result that names only the slot (`routedCli`)
 * falls back to it, which is the arm id for every CLI arm.
 */
function attributionOf(result: Result<CliResponse, CliError>): {
  routedArm: RoutingArmId | undefined;
  routedDurationMs: number | undefined;
  error: string | undefined;
} {
  const side = result.ok ? result.value : result.error;
  return {
    routedArm: side.routedArm ?? side.routedCli,
    routedDurationMs: side.routedDurationMs,
    error: result.ok ? undefined : result.error.message,
  };
}

/**
 * Append the outcome of one routed `orchestrate` run. Best-effort: a store
 * failure is logged, never thrown, so it cannot fail the user's command.
 */
export function recordRoutedOrchestrateOutcome(
  taskContent: string,
  result: Result<CliResponse, CliError>
): void {
  const { routedArm, routedDurationMs, error } = attributionOf(result);
  if (routedArm === undefined || routedDurationMs === undefined) {
    logger.debug('No routed arm on the result; no outcome recorded');
    return;
  }
  try {
    const nowMs = getTimeProvider().now();
    const suffix = getRandomProvider().random().toString(36).slice(2, 8);
    getOutcomeStore().append({
      id: `orchestrate-cli-${String(nowMs)}-${suffix}`,
      cli: routedArm,
      routedBy: 'composite-router',
      ...resolveOutcomeCategory(detectTaskCategory(taskContent)?.category),
      model: 'orchestrate-cli',
      success: result.ok,
      durationMs: routedDurationMs,
      timestamp: new Date(nowMs).toISOString(),
      source: 'delegate',
      ...outcomeFailureFields(result.ok, error),
    });
  } catch (err: unknown) {
    logger.warn('Failed to record orchestrate outcome', { error: String(err) });
  }
}
