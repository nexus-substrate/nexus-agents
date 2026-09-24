/**
 * Per-role retry of errored voter seats (#5578).
 *
 * Split out of `voter-agents.ts`, which was already at its 400-line cap.
 * @module cli/voter-retry
 */

import type { VoterRole, AgentVoteResult, RetriedFrom } from './vote-types.js';
import type { ILogger } from '../core/index.js';
import { clipForRecord } from '../audit/vote-record.js';
import { sleep } from '../utils/async-utils.js';
import { isAbsentSeat } from './voter-unverifiable.js';
import { isCancelled } from './voter-cancel.js';

/**
 * C0 and C1 control characters, DEL included (#6246, security seat; the C1
 * range on the #6252 panel's rejection — `\x9b` is the single-byte CSI,
 * equivalent to `ESC [`, so an ASCII-only range still let a terminal escape
 * through). A first-pass error string can be a subprocess's stderr; each of
 * these becomes one space so the carried cause cannot inject a line into the
 * summary row or the JSONL ledger line, nor an escape sequence into the
 * terminal.
 */
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f-\x9f]/g;

/**
 * What the retry is about to discard, carried onto the seat that replaces it
 * (#6246). `source` is the first pass's; `error` is its error string when it
 * had one — de-controlled, then bounded by the #5373 record clip so the marker
 * travels with it rather than a silent slice. Called only at the discard site,
 * so a seat that was never retried, or whose retry failed again, has no key.
 */
function retriedFromOf(first: AgentVoteResult): RetriedFrom {
  const source = first.source === 'unverifiable' ? 'unverifiable' : 'error';
  if (first.error === undefined) return { source };
  const { text, truncated } = clipForRecord(first.error.replace(CONTROL_CHARS_RE, ' '));
  return { source, error: text, ...(truncated === true ? { errorTruncated: true as const } : {}) };
}

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
 *
 * An UNVERIFIABLE seat (#6094) is relaunched by the same call: it is an
 * absence, not a judgment. Exactly once — on the deterministic host failure a
 * second attempt is futile, so a retry that comes back unverifiable again
 * REPLACES the first result (marked `retried: true`) rather than looping, and
 * the panel records one entry for the role.
 */
/** The absent seats to relaunch — none once the panel is cancelled (#6729). */
function rolesToRetry(
  first: readonly AgentVoteResult[],
  signal: AbortSignal | undefined
): VoterRole[] {
  return isCancelled(signal) ? [] : first.filter(isAbsentSeat).map((v) => v.role);
}

export async function retryErroredRoles(
  first: readonly AgentVoteResult[],
  relaunch: (roles: readonly VoterRole[]) => Promise<readonly AgentVoteResult[]>,
  logger: ILogger,
  backoffMs: number,
  /**
   * The panel's cancel (#6729). A cancelled panel is not retried: every seat
   * the cancel aborted reads as errored, and the pass would only wait out its
   * backoff to relaunch seats the launcher refuses anyway.
   */
  signal?: AbortSignal
): Promise<readonly AgentVoteResult[]> {
  const erroredRoles = rolesToRetry(first, signal);
  if (erroredRoles.length === 0) return first;

  logger.warn('Retrying errored or unverifiable voter roles before aggregating (#5578, #6094)', {
    erroredRoles,
    unverifiableRoles: first.filter((v) => v.source === 'unverifiable').map((v) => v.role),
    of: first.length,
  });
  if (backoffMs > 0) await sleep(backoffMs);

  const retriedResults = await relaunch(erroredRoles);
  const firstByRole = new Map(first.map((v) => [v.role, v]));
  const recovered = new Map<VoterRole, AgentVoteResult>();
  for (const r of retriedResults) {
    if (r.source === 'error') continue;
    // #6246: this is where the first pass is discarded — carry what it was
    // before it goes, so the seat names both what it is and what it recovered
    // from. Every relaunched role has an absent first pass; the guard holds
    // the relaunch to that contract rather than carrying a `source` the first
    // pass never had.
    const prior = firstByRole.get(r.role);
    const from = prior !== undefined && isAbsentSeat(prior) ? retriedFromOf(prior) : undefined;
    recovered.set(r.role, {
      ...r,
      retried: true,
      ...(from !== undefined ? { retriedFrom: from } : {}),
    });
  }
  if (recovered.size === 0) {
    logger.warn('Per-role retry recovered no voter — the panel stays degraded', { erroredRoles });
    return first;
  }
  logger.info('Per-role retry recovered voters', {
    recoveredRoles: [...recovered.values()].filter((v) => v.source === 'llm').map((v) => v.role),
    stillUnverifiable: [...recovered.values()]
      .filter((v) => v.source === 'unverifiable')
      .map((v) => v.role),
    stillErrored: erroredRoles.filter((r) => !recovered.has(r)),
  });
  return first.map((v) => recovered.get(v.role) ?? v);
}
