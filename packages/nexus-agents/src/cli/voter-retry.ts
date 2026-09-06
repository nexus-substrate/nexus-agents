/**
 * Per-role retry of errored voter seats (#5578).
 *
 * Split out of `voter-agents.ts`, which was already at its 400-line cap.
 * @module cli/voter-retry
 */

import type { VoterRole, AgentVoteResult } from './vote-types.js';
import type { ILogger } from '../core/index.js';
import { sleep } from '../utils/async-utils.js';

/**
 * Backoff before retrying an errored voter role (#5578).
 *
 * Short on purpose: a voter at `source: 'error'` has already exhausted the
 * resilient adapter's own retries and breaker, so this is not a backoff for
 * that adapter — it is a gap for a transient panel-wide condition (a rate
 * limit window, a stalled gateway) to clear.
 */
export const DEFAULT_ERRORED_ROLE_BACKOFF_MS = 3000;

/**
 * Re-launch ONLY the roles that errored, once, and merge the results (#5578).
 *
 * The panel launches once. A voter that errors is dropped: under
 * `reduce_denominator` its seat silently leaves the denominator, and under
 * `absolute_quorum` the whole vote voids to `no_quorum` and the caller replays
 * all N voters for a single failure. Retrying just the errored roles recovers
 * the seat for one extra call instead of N.
 *
 * The empty case is the common one and is named here: a panel with no errored
 * voter issues no retry and returns its results untouched, so a healthy vote
 * costs exactly what it did before.
 *
 * A role that errors again keeps its first-attempt result, so the existing
 * error policy still sees an errored seat and decides unchanged. This recovers
 * seats; it never manufactures one.
 */
export async function retryErroredRoles(
  first: readonly AgentVoteResult[],
  relaunch: (roles: readonly VoterRole[]) => Promise<readonly AgentVoteResult[]>,
  logger: ILogger,
  backoffMs: number
): Promise<readonly AgentVoteResult[]> {
  const erroredRoles = first.filter((v) => v.source === 'error').map((v) => v.role);
  if (erroredRoles.length === 0) return first;

  logger.warn('Retrying errored voter roles before aggregating (#5578)', {
    erroredRoles,
    of: first.length,
  });
  if (backoffMs > 0) await sleep(backoffMs);

  const retriedResults = await relaunch(erroredRoles);
  const recovered = new Map<VoterRole, AgentVoteResult>();
  for (const r of retriedResults) {
    if (r.source === 'error') continue;
    recovered.set(r.role, { ...r, retried: true });
  }
  if (recovered.size === 0) {
    logger.warn('Per-role retry recovered no voter — the panel stays degraded', { erroredRoles });
    return first;
  }
  logger.info('Per-role retry recovered voters', {
    recoveredRoles: [...recovered.keys()],
    stillErrored: erroredRoles.filter((r) => !recovered.has(r)),
  });
  return first.map((v) => recovered.get(v.role) ?? v);
}
