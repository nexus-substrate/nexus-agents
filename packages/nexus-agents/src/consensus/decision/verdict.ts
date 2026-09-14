/**
 * nexus-agents/consensus/decision - Verdict computation
 *
 * The pure functions that turn a tally into a decision, extracted verbatim
 * (#6000 step 1) from the three files that used to hold them:
 *
 * - `evaluateThreshold` (from `consensus/strategies.ts`): ratio vs. bar — the
 *   comparison behind the simple-majority, supermajority and proof-of-learning
 *   strategies.
 * - `determineFinalStatus` (from `consensus/result-builder.ts`): quorum +
 *   approval → the engine's `approved` / `rejected`.
 * - `mapOutcomeToDecision`, `resolveVoteDecision` and its helpers (from
 *   `mcp/tools/consensus-vote-types.ts`): engine outcome + error policy →
 *   the response-layer `approved` / `rejected` / `no_quorum`.
 *
 * What stays outside: the strategy classes that count votes and call
 * `evaluateThreshold` (`strategies.ts`), the engine's cascade and close
 * orchestration (`engine.ts`), the error-policy vote-list shaping that feeds
 * the engine (`consensus-vote-error-policy.ts`), and the response assembly in
 * `buildResponse`. Each previous home re-exports what moved, so the public
 * API is unchanged. Types from the MCP tool module are imported type-only, so
 * this module has no runtime edge into `mcp/`.
 *
 * @module consensus/decision/verdict
 */

import { isAbsentSeat } from '../../cli/voter-unverifiable.js';
import type {
  ConsensusVoteInput,
  ExtendedVotingResult,
  VoteDecisionStatus,
  VotingStrategy,
} from '../../mcp/tools/consensus-vote-types.js';
import type { ProposalStatus } from '../types-core.js';

// ============================================================================
// Engine-level verdict
// ============================================================================

/**
 * Evaluates an approval ratio against a threshold — the shared math behind
 * the simple-majority, supermajority and proof-of-learning strategies.
 *
 * `inclusive` selects the comparison: `>=` for supermajority (an exact 2/3
 * passes), strict `>` for simple-majority and proof-of-learning (a tie at the
 * threshold is not enough). Callers apply their own zero-denominator guard
 * before calling this.
 */
export function evaluateThreshold(
  approveCount: number,
  votingTotal: number,
  threshold: number,
  inclusive: boolean
): { approved: boolean; approvalPercentage: number } {
  const ratio = approveCount / votingTotal;
  return {
    approved: inclusive ? ratio >= threshold : ratio > threshold,
    approvalPercentage: ratio * 100,
  };
}

/**
 * Determine final status based on quorum and approval.
 */
export function determineFinalStatus(quorumReached: boolean, approved: boolean): ProposalStatus {
  if (!quorumReached || !approved) return 'rejected';
  return 'approved';
}

// ============================================================================
// Response-level decision
// ============================================================================

/** Maps ProposalStatus to VoteDecisionStatus. */
export function mapOutcomeToDecision(outcome: string): VoteDecisionStatus {
  switch (outcome) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'timeout':
      return 'timeout';
    default:
      return 'pending';
  }
}

/**
 * #4132: the absolute approval fraction a strategy requires over the FULL panel.
 * `ceil(fraction * panelSize)` is the absolute number of approvals an
 * `absolute_quorum` verdict needs — an ABSOLUTE floor over every requested
 * voter, not a majority of the responders (which abstains/errors would shrink).
 * majority → 0.5, supermajority → 2/3, unanimous → 1.0; the higher_order family
 * and proof_of_learning follow the majority (0.5) baseline they tally against.
 */
function absoluteQuorumFraction(strategy: VotingStrategy): number {
  switch (strategy) {
    case 'supermajority':
      return 2 / 3;
    case 'unanimous':
      return 1;
    default:
      return 0.5;
  }
}

/**
 * #5780: the smallest number of voters that must have cast approve-or-reject
 * before any ratio is applied to them.
 *
 * The gap this closes: every strategy measures its threshold over
 * `approve + reject`, and abstentions and errored seats leave that denominator
 * with no floor under it. `ERROR_FLOOR_FRACTION` voids a panel only when errors
 * EXCEED half, so one seat under it — 7 requested, 3 errored, 1 abstained —
 * left three respondents, and 2 approvals carried an architecture or security
 * vote at 66.7%.
 *
 * Two thirds of the requested panel, never fewer than three, never more than
 * the panel itself. That is one rule satisfying both figures the panel named
 * (7 → 5, quick 3 → 3); the `3` clamp is what makes quick mode require every
 * seat, since two thirds of 3 is 2.
 *
 * Deliberately about RESPONDENTS, not errors. `absolute_quorum` (#4132) voids
 * on an errored seat specifically, so an induced error cannot manufacture a
 * verdict; this is about how few voices decided, whatever silenced them — a
 * panel of 7 returning four abstentions and three votes has zero errors and
 * still should not decide. The two compose; neither replaces the other.
 */
function minimumRespondents(panelSize: number): number {
  if (panelSize <= 0) return 0;
  return Math.min(panelSize, Math.max(Math.ceil((panelSize * 2) / 3), 3));
}

/** A vote decision plus the (optional) actionable reason a panel degraded. */
export interface VoteDecisionOutcome {
  readonly decision: VoteDecisionStatus;
  /** Set when the verdict degraded to `no_quorum` under absolute_quorum. */
  readonly degradeReason?: string;
}

/**
 * #4132: the absolute_quorum predicate (post-tally). Applied ONLY when
 * `errorPolicy === 'absolute_quorum'`; every other policy keeps the legacy
 * decision path untouched (opt-in).
 *
 * The invariant this enforces (anti-DoS): an induced voter error can NEVER
 * manufacture `approved` and NEVER manufacture `rejected` — errors force
 * `no_quorum`, a recoverable "re-run the missing voice" state. A GENUINE reject
 * (zero errors) still blocks. The happy path (all approve, zero errors,
 * contrarian present) stays `approved`.
 *
 *   approved  ⇔ errorCount === 0 AND (contrarian present-and-non-error, unless
 *               quick-mode dropped it) AND approveCount >= ceil(frac * panel)
 *   no_quorum ⇔ errorCount > 0 OR the contrarian was requested but errored/missing
 *   rejected  ⇔ zero errors, contrarian present, engine rejected (genuine reject)
 *   no_quorum ⇔ zero errors but the absolute approval floor was not met and there
 *               is no genuine reject (abstain-heavy; recoverable)
 */
/**
 * The "an errored/absent voice voids the quorum" half of the predicate. Returns
 * the actionable re-run reason when the panel had ANY error, or the contrarian
 * was required but errored/missing; `undefined` otherwise (clean panel).
 */
function absoluteQuorumDegradeReason(
  result: ExtendedVotingResult,
  errorCount: number
): string | undefined {
  const contrarianVote = result.votes.find((v) => v.role === 'catfish');
  const contrarianOk = contrarianVote !== undefined && !isAbsentSeat(contrarianVote);
  const contrarianDegraded = result.contrarianRequested === true && !contrarianOk;
  // #6094: a seat that could not read the artifact is an absence, not a
  // judgment, and degrades the quorum exactly as an errored seat does.
  const unverifiableRoles = result.votes
    .filter((v) => v.source === 'unverifiable')
    .map((v) => v.role);
  if (errorCount === 0 && unverifiableRoles.length === 0 && !contrarianDegraded) return undefined;

  const erroredRoles = result.votes.filter((v) => v.source === 'error').map((v) => v.role);
  const missingContrarian = contrarianDegraded && contrarianVote === undefined;
  const named = missingContrarian ? [...erroredRoles, 'catfish'] : erroredRoles;
  return `no_quorum: re-run — ${absentSeatClauses(named, unverifiableRoles).join('; ')} (absolute_quorum)`;
}

/** The "[roles] errored" and "[roles] unverifiable" clauses of the re-run reason. */
function absentSeatClauses(
  erroredNames: readonly string[],
  unverifiable: readonly string[]
): string[] {
  const clauses: string[] = [];
  if (erroredNames.length > 0 || unverifiable.length === 0) {
    const list = erroredNames.length > 0 ? erroredNames.join(', ') : 'contrarian';
    clauses.push(`voter(s) [${list}] errored`);
  }
  if (unverifiable.length > 0) {
    clauses.push(
      `voter(s) [${unverifiable.join(', ')}] unverifiable — could not read the artifact`
    );
  }
  return clauses;
}

function computeAbsoluteQuorumDecision(
  result: ExtendedVotingResult,
  errorCount: number,
  allErrors: boolean
): VoteDecisionOutcome {
  const degradeReason = absoluteQuorumDegradeReason(result, errorCount);
  if (degradeReason !== undefined) return { decision: 'no_quorum', degradeReason };

  // Zero errors, contrarian satisfied (or not required in quick mode).
  const panel = result.panelSize ?? result.votes.length;
  const needed = Math.ceil(absoluteQuorumFraction(result.strategy) * panel);
  const approveCount = result.votes.filter(
    (v) => v.source !== 'error' && v.vote.decision === 'approve'
  ).length;

  if (result.result.outcome === 'approved' && approveCount >= needed) {
    return { decision: 'approved' };
  }
  if (result.result.outcome === 'rejected' && !allErrors) {
    // A genuine reject (the engine rejected with zero errors) still blocks.
    return { decision: 'rejected' };
  }
  // Approved-by-responders but the absolute approval floor was not met (e.g.
  // abstain-heavy) — no error, no genuine reject, just not enough YES. Recoverable.
  return {
    decision: 'no_quorum',
    degradeReason: `no_quorum: absolute quorum not met (${String(approveCount)}/${String(needed)} approvals over ${String(panel)}-voter panel, absolute_quorum)`,
  };
}

/**
 * #5780: `no_quorum` when too few voices actually decided, or `undefined` when
 * the panel met its floor.
 *
 * `no_quorum` and not `rejected`: too few respondents is a statement about the
 * panel, not about the proposal, and it is recoverable by re-running the
 * missing seats — the same shape `absolute_quorum` uses for an errored voice.
 * Reporting it as a rejection would be a verdict the panel never reached.
 *
 * Applied ONLY to an approval, mirroring the asymmetry `absolute_quorum`
 * already encodes ("A GENUINE reject still blocks"). The harm in #5780 is that
 * too few voices can CARRY a decision; a rejection by too few blocks it, which
 * is the safe direction, and voiding that would add a re-run without
 * preventing anything. A thin reject is still visible in `panelCoverage`.
 */
function respondentFloorOutcome(result: ExtendedVotingResult): VoteDecisionOutcome | undefined {
  if (result.result.outcome !== 'approved') return undefined;
  const panel = result.panelSize ?? result.votes.length;
  const floor = minimumRespondents(panel);
  const respondents = result.votes.filter(
    (v) => v.source !== 'error' && (v.vote.decision === 'approve' || v.vote.decision === 'reject')
  ).length;
  if (respondents >= floor) return undefined;
  return {
    decision: 'no_quorum',
    degradeReason: `no_quorum: ${String(respondents)} of ${String(panel)} voters decided; ${String(floor)} required before a ratio is applied (#5780)`,
  };
}

/**
 * Resolve the user-facing decision for a tallied vote. Keeps the pre-#4132 path
 * verbatim for every policy except `absolute_quorum`, which routes through
 * {@link computeAbsoluteQuorumDecision}.
 *
 * Exported (#4135) so `executeVoting` can stamp `ExtendedVotingResult.decision`
 * with the SAME computation `buildResponse` uses — the response-layer decision
 * (including `no_quorum`) is derived once, in one place, and can't diverge
 * between the engine result and the MCP response. The engine
 * `ConsensusResult.outcome` stays 2-valued; this is the widened view.
 */
export function resolveVoteDecision(
  input: ConsensusVoteInput,
  result: ExtendedVotingResult,
  errorCount: number
): VoteDecisionOutcome {
  const allErrors = errorCount === result.votes.length && errorCount > 0;
  // #4053: an error-policy short-circuit (>50% hard floor, or fail_closed) VOIDED
  // the vote — that is no_quorum, not the panel rejecting. Applies to every policy.
  if (result.policyReason !== undefined || (!result.result.quorumReached && allErrors)) {
    return { decision: 'no_quorum' };
  }
  // #5780: the responder floor guards an APPROVAL under every policy and every
  // strategy — a denominator of three out of a requested seven is equally
  // unrepresentative whichever bar is measured over it.
  //
  // Ordered after `absolute_quorum`, not before, so that policy keeps its own
  // more specific degrade reason. The two are not redundant: absolute_quorum
  // guarantees `approveCount >= ceil(frac * panel)`, which subsumes the floor
  // at `supermajority` (5 approvals of 7) but NOT at `majority`, where 4
  // approvals over 4 respondents of a requested 7 clears it and still leaves
  // three voices unheard.
  if (input.errorPolicy === 'absolute_quorum') {
    const quorumOutcome = computeAbsoluteQuorumDecision(result, errorCount, allErrors);
    if (quorumOutcome.decision !== 'approved') return quorumOutcome;
    return respondentFloorOutcome(result) ?? quorumOutcome;
  }
  return (
    respondentFloorOutcome(result) ?? { decision: mapOutcomeToDecision(result.result.outcome) }
  );
}
