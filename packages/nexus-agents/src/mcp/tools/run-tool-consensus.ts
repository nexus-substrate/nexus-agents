/** Run-layer consensus assessment, bounded retry and canonical recording (#4464). */
import {
  createLogger,
  getErrorMessage,
  type ILogger,
  type IModelAdapter,
} from '../../core/index.js';
import type { ConsensusEnforcementMode } from '../../orchestration/consensus-enforcement-mode.js';
import type { ExtendedVotingResult } from './consensus-vote-types.js';
import { runConsensusForGoal } from './consensus-vote.js';
import { recordCompletedVote } from './consensus-vote-completed-recording.js';
import { recordVoteDecisionCost } from './decision-cost-recording.js';
import { randomUUID } from 'node:crypto';

/** What an enforcing run would do; off explicitly reports an unmeasured verdict. */
export interface ConsensusEnforcement {
  readonly mode: ConsensusEnforcementMode;
  readonly wouldBlock?: boolean;
  readonly reason: string;
  readonly attempts: 1 | 2;
  readonly recordingError?: string;
}

/** Read the assessment from the dispatcher's opaque engine result. */
export function getConsensusEnforcement(result: unknown): ConsensusEnforcement | undefined {
  if (typeof result !== 'object' || result === null) return undefined;
  return (result as { enforcement?: ConsensusEnforcement }).enforcement;
}

interface ConsensusRunResult extends ExtendedVotingResult {
  readonly enforcement: ConsensusEnforcement;
  readonly success?: false;
  readonly error?: string;
  readonly voteRecord?: Awaited<ReturnType<typeof recordCompletedVote>>['voteRecord'] | undefined;
}

/** Count approve/reject and unavailable seats; genuine abstentions leave the denominator. */
function assessPanel(
  result: ExtendedVotingResult,
  mode: ConsensusEnforcementMode,
  attempts: 1 | 2
): ConsensusRunResult {
  if (mode === 'off') {
    return { ...result, enforcement: { mode, attempts, reason: 'unmeasured' } };
  }
  const decision = result.decision ?? 'no_quorum';
  // Count respondents and errored seats from the roster: engine totals may already
  // include errors under other policies, so adding errors to that total is unsound.
  const denominator = result.votes.filter(
    (seat) =>
      seat.source === 'error' || seat.source === 'unverifiable' || seat.vote.decision !== 'abstain'
  ).length;
  const outageInvariant = denominator > 0 && result.result.voteCounts.approve > 0.5 * denominator;
  const reason = decision === 'approved' && !outageInvariant ? 'not_outage_invariant' : decision;
  return {
    ...result,
    enforcement: { mode, attempts, wouldBlock: reason !== 'approved', reason },
  };
}

/** Record only the final attempt; recording failures cannot masquerade as enforce-mode success. */
async function recordFinalPanel(
  goal: string,
  result: ConsensusRunResult,
  logger: ILogger,
  signal?: AbortSignal
): Promise<ConsensusRunResult> {
  let voteRecord: ConsensusRunResult['voteRecord'];
  let reason: string | undefined;
  try {
    ({ voteRecord } = await recordCompletedVote(goal, result, logger, {
      options: undefined,
      signal,
    }));
    if (!voteRecord.persisted) reason = `Vote ledger ${voteRecord.reason}`;
  } catch (error) {
    // A cancelled ledger append must still reach the job cancellation machinery.
    if (signal?.aborted === true) throw error;
    reason = getErrorMessage(error);
  }
  const recorded = { ...result, voteRecord };
  if (reason === undefined) return recorded;
  logger.warn('run: consensus vote recording failed', {
    error: reason,
    mode: result.enforcement.mode,
  });
  if (result.enforcement.mode === 'off') return recorded;
  const enforcement: ConsensusEnforcement = {
    ...result.enforcement,
    wouldBlock: true,
    recordingError: reason,
  };
  if (result.enforcement.mode === 'audit') return { ...recorded, enforcement };
  return {
    ...recorded,
    success: false,
    error: `Consensus recording failed: ${reason}`,
    enforcement,
  };
}

/** Execute at most two panels and write one final ledger record per consensus run. */
export async function runConsensusWithEnforcement(
  goal: string,
  options: {
    readonly mode: ConsensusEnforcementMode;
    readonly logger?: ILogger | undefined;
    readonly gatewayAdapters?: readonly IModelAdapter[] | undefined;
    readonly onProgress?: (() => void) | undefined;
    readonly signal?: AbortSignal | undefined;
  }
): Promise<ConsensusRunResult> {
  const logger = options.logger ?? createLogger({ tool: 'run', strategy: 'consensus' });
  const runPanel = async (attempts: 1 | 2): Promise<ConsensusRunResult> => {
    options.signal?.throwIfAborted();
    const result = await runConsensusForGoal(
      goal,
      undefined,
      options.gatewayAdapters,
      options.onProgress,
      options.signal
    );
    options.signal?.throwIfAborted();
    return assessPanel(result, options.mode, attempts);
  };
  let result = await runPanel(1);
  if (options.mode === 'enforce' && result.decision === 'no_quorum') {
    recordVoteDecisionCost({
      decisionId: `consensus-${randomUUID()}`,
      gate: 'consensus_vote',
      votes: result.votes,
      proposal: goal,
      declaredOptions: undefined,
      logger,
    });
    logger.info('run: retrying consensus panel once', { reason: result.enforcement.reason });
    result = await runPanel(2);
  }
  return recordFinalPanel(goal, result, logger, options.signal);
}
