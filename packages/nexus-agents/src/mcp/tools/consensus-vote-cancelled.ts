/**
 * A cancelled `consensus_vote` stops before any verdict and hands the votes it
 * had cast to the cancelled job record (#6735).
 *
 * Two defects shared one cause. `cancel_job` writes `cancelled` first, and
 * the body then ran on: it tallied whatever seats had answered, computed a
 * decision from that partial panel, recorded it to the correlation tracker and
 * appended it to the vote-record ledger — and then handed the result to
 * `writeJobComplete`, a no-op against a `cancelled` record (#4022). So the
 * ledger held a decision nobody asked for, and the job record held none of the
 * votes that had landed.
 *
 * Now `executeVoting` checks the job signal once the seats settle and, if it
 * fired, throws {@link VoteCancelledError} carrying only the seats that cast a
 * vote. Nothing downstream of that point runs: no engine, no decision, no
 * tracker, no ledger. The async dispatcher catches the error and attaches the
 * seats to the `cancelled` record through the store's one narrow writer.
 *
 * @module mcp/tools/consensus-vote-cancelled
 */

import type { AgentVoteResult } from '../../cli/vote-types.js';
import { attachCancelledPartial } from '../jobs/job-cancelled-partial.js';

/**
 * The job signal fired before the vote reached a verdict. Carries the seats
 * that cast a vote (every source except `error` — a seat aborted or never
 * launched by the cancel is an `error` result) and the panel size they were
 * cast against. Also thrown when the runaway guard aborts the job; that job is
 * recorded `failed`, and the attach below is then a no-op.
 */
export class VoteCancelledError extends Error {
  override readonly name = 'VoteCancelledError';

  constructor(
    readonly votesCast: readonly AgentVoteResult[],
    readonly panelSize: number
  ) {
    super(
      `Vote cancelled before a verdict: ${String(votesCast.length)} of ${String(panelSize)} seats had cast a vote`
    );
  }
}

/**
 * Throw {@link VoteCancelledError} when `signal` has fired. Called once the
 * seats have settled and before anything reads them as a panel. No-op when
 * there is no signal (sync mode) or it has not fired.
 */
export function throwIfVoteCancelled(
  signal: AbortSignal | undefined,
  votes: readonly AgentVoteResult[],
  panelSize: number
): void {
  if (signal?.aborted !== true) return;
  throw new VoteCancelledError(
    votes.filter((v) => v.source !== 'error'),
    panelSize
  );
}

/**
 * Await an async vote body; on {@link VoteCancelledError}, attach the cast
 * seats to the job's `cancelled` record, then rethrow so `runAsJob` still
 * settles the job through its normal path (a no-op on the cancelled record).
 */
export async function attachPartialsOnCancel<T>(jobId: string, body: Promise<T>): Promise<T> {
  try {
    return await body;
  } catch (error: unknown) {
    if (error instanceof VoteCancelledError) {
      attachCancelledPartial(jobId, 'consensus_vote', {
        partialVotes: error.votesCast,
        panelSize: error.panelSize,
      });
    }
    throw error;
  }
}
