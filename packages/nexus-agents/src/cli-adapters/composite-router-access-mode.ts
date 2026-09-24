/**
 * Access-mode arm filter for CompositeRouter (#6768).
 *
 * A task that asks for `accessMode: 'read-only-analysis'` may only be routed
 * to an arm that enforces the mode. Each adapter refuses such a task on its
 * own when it cannot enforce it (#6754), but the router does not fail over at
 * execution time, so letting selection pick a non-enforcing arm would turn a
 * routable task into a refusal. The router therefore removes those arms
 * BEFORE selection, and fails the route clearly when none is left.
 *
 * @module cli-adapters/composite-router-access-mode
 */

import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import type { CliTask, ICliAdapter, RoutingArmId } from './types.js';
import { isReadOnlyAnalysis } from './read-only-analysis.js';
import { CompositeRoutingError } from './composite-router-types.js';

/** The `CompositeRoutingError.stage` of an access-mode routing failure. */
const ACCESS_MODE_STAGE = 'access-mode';

/** Whether `adapter` may serve `task` under the task's access mode. */
function armServes(task: Pick<CliTask, 'accessMode'>, adapter: ICliAdapter | undefined): boolean {
  if (!isReadOnlyAnalysis(task)) return true;
  return adapter?.enforcesReadOnlyAnalysis === true;
}

/**
 * The candidate arms that may serve `task`. A task without read-only analysis
 * mode keeps every arm. A read-only task keeps only arms whose adapter
 * declares `enforcesReadOnlyAnalysis: true`; when none does, the route fails
 * rather than falling back to the full set.
 */
export function armsForAccessMode(
  task: Pick<CliTask, 'accessMode'>,
  arms: readonly RoutingArmId[],
  adapters: ReadonlyMap<RoutingArmId, ICliAdapter>
): Result<RoutingArmId[], CompositeRoutingError> {
  if (!isReadOnlyAnalysis(task)) return ok([...arms]);
  const enforcing = arms.filter((arm) => armServes(task, adapters.get(arm)));
  if (enforcing.length > 0) return ok(enforcing);
  return err(
    new CompositeRoutingError(
      `No routing arm enforces read-only analysis mode (candidates: ${arms.join(', ') || 'none'}); the task was not run`,
      ACCESS_MODE_STAGE
    )
  );
}

/**
 * The refusal for a selected arm that may not serve `task`, else `undefined`.
 * Selection can land outside the filtered candidates (routing memory
 * recommends a display slot, not an arm), so the selected arm is checked again.
 */
export function selectedArmAccessRefusal(
  task: Pick<CliTask, 'accessMode'>,
  arm: RoutingArmId,
  adapter: ICliAdapter | undefined
): CompositeRoutingError | undefined {
  if (armServes(task, adapter)) return undefined;
  return new CompositeRoutingError(
    `Selected arm ${arm} does not enforce read-only analysis mode; the task was not run`,
    ACCESS_MODE_STAGE
  );
}
