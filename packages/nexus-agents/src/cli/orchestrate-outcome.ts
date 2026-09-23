/**
 * Outcome recording for the `orchestrate` CLI command's routed runs (#6533).
 *
 * `CompositeRouter.executeDecision` names the arm that ran (`routedCli`) and
 * times its call alone (`routedDurationMs`), on success and on failure. This
 * module turns that into a `TaskOutcome` with `routedBy: 'composite-router'`,
 * the same fields the dev-pipeline stages write through `expert-bridge`.
 *
 * Two cases write NO row, and both are deliberate:
 * - no arm ran (routing failed, or the result carries no `routedCli`): there is
 *   no routed execution to attribute;
 * - the task category was not detected. `TaskOutcome.category` is required, so
 *   an undetected category cannot be recorded as absent, and any placeholder
 *   (the old `'exploration'` default) would be a fabricated signal that the
 *   distiller and every per-category report would read as measured. The
 *   router's in-process feedback still happens; only the persisted row is
 *   skipped. #6549 tracks giving "undetected" a representation.
 *
 * @module cli/orchestrate-outcome
 */

import { createLogger, getTimeProvider, getRandomProvider, type Result } from '../core/index.js';
import type { CliError, CliResponse } from '../cli-adapters/index.js';
import { detectTaskCategory } from '../config/task-specialization.js';
import { getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { outcomeFailureFields } from '../orchestration/outcomes/outcome-types.js';

const logger = createLogger({ component: 'orchestrate-outcome' });

/** The router's attribution, read from whichever side of the result is present. */
function attributionOf(result: Result<CliResponse, CliError>): {
  routedCli: CliResponse['routedCli'];
  routedDurationMs: number | undefined;
  error: string | undefined;
} {
  const side = result.ok ? result.value : result.error;
  return {
    routedCli: side.routedCli,
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
  const { routedCli, routedDurationMs, error } = attributionOf(result);
  if (routedCli === undefined || routedDurationMs === undefined) {
    logger.debug('No routed arm on the result; no outcome recorded');
    return;
  }
  const category = detectTaskCategory(taskContent)?.category;
  if (category === undefined) {
    logger.debug('Task category not detected; routed outcome not persisted', { routedCli });
    return;
  }
  try {
    const nowMs = getTimeProvider().now();
    const suffix = getRandomProvider().random().toString(36).slice(2, 8);
    getOutcomeStore().append({
      id: `orchestrate-cli-${String(nowMs)}-${suffix}`,
      cli: routedCli,
      routedBy: 'composite-router',
      category,
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
