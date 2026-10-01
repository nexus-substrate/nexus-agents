/**
 * Shared post-vote recording for MCP and dev-pipeline decisions (#6872).
 * One correlation ID joins the ledger, decision cost and per-seat outcomes.
 * The ledger append runs first so cancellation cannot seed successful outcomes.
 *
 * @module mcp/tools/consensus-vote-completed-recording
 */
import type { DecisionGate } from '../../observability/decision-cost-store.js';
import { randomUUID } from 'node:crypto';
import { getErrorMessage, getTimeProvider, type ILogger } from '../../core/index.js';
import type { AgentVoteResult } from '../../cli/vote-types.js';
import type { VoteRecordPrBinding } from '../../audit/vote-record.js';
import {
  recordAuthenticVote,
  recordVoteSuccess,
  recordVoteError,
  type VoteRecordPersistOutcome,
} from './consensus-vote-recording.js';
import { recordDecisionCost } from './decision-cost-recording.js';
import { detectUndeclaredOptions } from './consensus-vote-option-detection.js';
import { toRecordDecision, type ExtendedVotingResult } from './consensus-vote-types.js';

/**
 * Context from the tool input the record needs but the voting result does not
 * carry: the declared options (#6053) and the two ratification bindings
 * (#4004, #5130).
 */
interface DeclaredByCaller {
  /** Which caller made the decision; defaults to the MCP `consensus_vote` gate. */
  readonly gate?: DecisionGate;
  /** Async runner provenance; omitted when no job ran the decision. */
  readonly jobId?: string | undefined;
  readonly options: readonly string[] | undefined;
  readonly ratifies?: string;
  readonly ratifiesPr?: VoteRecordPrBinding;
  /**
   * The async job's cancel signal (#6735), re-checked inside the ledger lock
   * right before the append. Absent in sync mode.
   */
  readonly signal?: AbortSignal | undefined;
}

/**
 * Best-effort post-vote side effects, extracted to keep `handleConsensusVote`
 * under the per-function line cap. Persists the authentic hash-chained vote
 * record (#3897) and rolls up per-decision cost (#3855), sharing one decision
 * id as the correlation key. Neither must fail the vote — both are guarded.
 *
 * Returns both the cost rollup and the structured vote-record persistence
 * outcome (#3991) so the handler can surface persistence visibility in the
 * result instead of leaving a skip as a server-only WARN.
 */
async function recordVoteSideEffects(
  proposal: string,
  result: ExtendedVotingResult,
  logger: ILogger,
  declared: DeclaredByCaller
): Promise<{
  decisionId: string;
  costSummary: ReturnType<typeof recordDecisionCost> | undefined;
  voteRecord: VoteRecordPersistOutcome;
}> {
  const decisionId = `consensus-${String(getTimeProvider().now())}-${randomUUID().slice(0, 8)}`;
  // #3897: persist an authentic, hash-chained vote record to the runtime
  // vote ledger at vote time so the promotion gate/CI can rest
  // authenticity on the chain, not on hand-transcribed YAML. #4004: bind the
  // authority-tier ratification subject into the record when provided.
  const voteRecord = await recordAuthenticVote({
    proposal,
    strategy: result.strategy,
    result: result.result,
    votes: result.votes,
    declaredOptions: declared.options,
    // #4053: an error-policy short-circuit voided the vote → the PERSISTED record
    // must record `no_quorum`, matching the MCP response (not a stale `rejected`).
    errorVoided: result.policyReason !== undefined,
    // #4986: hand over the decision `resolveVoteDecision` already produced
    // (stamped on the result by `executeVoting`). `errorVoided` alone cannot
    // express an absolute_quorum void, whose reason is stamped on the response
    // and never on the result — so the record used to say `approved` for a vote
    // this tool reports as `no_quorum`.
    resolvedDecision: toRecordDecision(result.decision),
    // #6211: the EFFECTIVE policy `executeVoting` stamped, so a caller that
    // took the per-strategy default still gets `reduce_denominator` on the
    // ledger line rather than nothing.
    errorPolicy: result.errorPolicy,
    correlationId: decisionId,
    ...(declared.ratifies !== undefined ? { ratifies: declared.ratifies } : {}),
    // #5130: the PR binding takes the same hop as `ratifies`; the seam test
    // (`consensus-vote-ratifies-pr.test.ts`) reads it back off the ledger.
    ...(declared.ratifiesPr !== undefined ? { ratifiesPr: declared.ratifiesPr } : {}),
    signal: declared.signal,
  });
  // #3855: roll up + persist this decision's per-voter cost and ride it on the
  // existing response (no new MCP tool). A rollup failure must not fail the vote.
  let costSummary: ReturnType<typeof recordDecisionCost> | undefined;
  // Match the ledger and outcome guards: an empty panel is not simulated.
  const allSimulated =
    result.votes.length > 0 && result.votes.every((v) => v.source === 'simulation');
  try {
    if (!allSimulated) {
      costSummary = recordDecisionCost({
        decisionId,
        gate: declared.gate ?? 'consensus_vote',
        ...(declared.jobId !== undefined ? { jobId: declared.jobId } : {}),
        votes: result.votes,
        // #5422: the detector's verdict, recorded on EVERY vote so the not-fired
        // rows are the denominator. Computed here, where the FULL proposal is in
        // hand — the ledger keeps a 503-char preview, which is why precision
        // cannot be measured there. Same patterns as the `panelWarning` in
        // `buildResponse`, so the measured precision is the warning's precision.
        undeclaredOptionsDetector: {
          ...detectUndeclaredOptions(proposal, declared.options),
          declaredOptionCount: declared.options?.length ?? 0,
        },
      });
    }
  } catch (costError) {
    logger.warn('Per-decision cost rollup failed (non-fatal)', {
      error: getErrorMessage(costError),
    });
    costSummary = undefined;
  }
  return { decisionId, costSummary, voteRecord };
}

/** Preserve MCP's distinct all-error response while sharing the recording guard. */
export class AllVotersFailedError extends Error {
  override readonly name = 'AllVotersFailedError';
}

/**
 * Detect all-error votes and return the structured error message instead of a
 * fake "rejected" (#1552); `null` when at least one seat answered. Empty case:
 * a panel with no votes at all is not "all failed" — it is `null` here and the
 * empty-panel guard in `recordCompletedVote` rejects it before recording.
 */
function allVotersFailedError(
  votes: readonly AgentVoteResult[],
  proposal: string,
  logger: ILogger
): string | null {
  const errorVotes = votes.filter((v) => v.source === 'error');
  if (errorVotes.length !== votes.length || votes.length === 0) return null;
  const failures = errorVotes.map((v) => `${v.role}: ${v.error ?? 'unknown error'}`).join('; ');
  logger.warn('All voters failed', { failureCount: errorVotes.length, failures });
  recordVoteError(proposal, `All ${String(errorVotes.length)} voters failed: ${failures}`);
  return `All ${String(errorVotes.length)} voters failed. Failures: ${failures}`;
}

/** Record one completed panel through the canonical ledger, cost and outcome writers. */
export async function recordCompletedVote(
  proposal: string,
  result: ExtendedVotingResult,
  logger: ILogger,
  declared: DeclaredByCaller = { options: undefined }
): ReturnType<typeof recordVoteSideEffects> {
  const allFailed = allVotersFailedError(result.votes, proposal, logger);
  if (allFailed !== null) throw new AllVotersFailedError(allFailed);
  if (result.decision === undefined) {
    throw new Error('Consensus vote completed without a resolved decision');
  }
  if (result.votes.length === 0) {
    throw new Error('Consensus vote completed with an empty panel (no votes received)');
  }
  const recorded = await recordVoteSideEffects(proposal, result, logger, declared);
  recordVoteSuccess({
    decisionId: recorded.decisionId,
    proposal,
    strategy: result.strategy,
    decision: toRecordDecision(result.decision) ?? 'no_quorum',
    durationMs: result.totalTimeMs,
    approvalPercentage: result.result.approvalPercentage,
    votes: result.votes,
  });
  return recorded;
}
