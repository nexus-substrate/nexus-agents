/**
 * Access-mode arm filter for CompositeRouter (#6768).
 *
 * A task that asks for a restricted access mode (`'read-only-analysis'`, or
 * `'workspace-edit'` since #6792) may only be routed to an arm that declares
 * that mode. Each adapter refuses such a task on its
 * own when it cannot enforce it (#6754), but the router does not fail over at
 * execution time, so letting selection pick a non-enforcing arm would turn a
 * routable task into a refusal. The router therefore removes those arms
 * BEFORE selection, and fails the route clearly when none is left. The one
 * selection input that can name an arm outside the candidates, a routing
 * memory pick, is bounded to the candidates in `runPipeline`.
 *
 * @module cli-adapters/composite-router-access-mode
 */

import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import type { CliTask, ICliAdapter, RoutingArmId } from './types.js';
import { accessModeLabel, adapterEnforces, restrictedAccessMode } from './access-mode.js';
import { CompositeRoutingError } from './composite-router-types.js';

/** The `CompositeRoutingError.stage` of an access-mode routing failure. */
const ACCESS_MODE_STAGE = 'access-mode';

/**
 * The candidate arms that may serve `task`. A default-mode task keeps every
 * arm. A restricted task keeps only arms whose adapter declares that mode
 * (`enforcesReadOnlyAnalysis` / `enforcesWorkspaceEdit` exactly `true`);
 * when none does, the route fails rather than falling back to the full set.
 */
export function armsForAccessMode(
  task: Pick<CliTask, 'accessMode'>,
  arms: readonly RoutingArmId[],
  adapters: ReadonlyMap<RoutingArmId, ICliAdapter>
): Result<RoutingArmId[], CompositeRoutingError> {
  const mode = restrictedAccessMode(task);
  if (mode === undefined) return ok([...arms]);
  const enforcing = arms.filter((arm) => adapterEnforces(adapters.get(arm), task));
  if (enforcing.length > 0) return ok(enforcing);
  return err(
    new CompositeRoutingError(
      `No routing arm enforces ${accessModeLabel(mode)} mode (candidates: ${arms.join(', ') || 'none'}); the task was not run`,
      ACCESS_MODE_STAGE
    )
  );
}
