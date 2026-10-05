/** Recompute ledger decisions through the canonical consensus path (#6952). */
import type { VoteRecord } from '../packages/nexus-agents/src/audit/vote-record.js';
import type { AgentVoteResult, VoterRole } from '../packages/nexus-agents/src/cli/vote-types.js';
import { createStrategyFactory } from '../packages/nexus-agents/src/consensus/strategies.js';
import {
  DEFAULT_MIN_VOTERS_FOR_QUORUM,
  isQuorumReached,
} from '../packages/nexus-agents/src/consensus/decision/quorum.js';
import { getDefaultErrorPolicy } from '../packages/nexus-agents/src/consensus/decision/strategy.js';
import {
  determineFinalStatus,
  resolveVoteDecision,
  type VoteDecisionOutcome,
} from '../packages/nexus-agents/src/consensus/decision/verdict.js';
import { applyErrorPolicy } from '../packages/nexus-agents/src/mcp/tools/consensus-vote-error-policy.js';
import type { ExtendedVotingResult } from '../packages/nexus-agents/src/mcp/tools/consensus-vote-types.js';

const strategies = createStrategyFactory();

/** Restore omitted error seats and the engine's unverifiable abstentions. */
function recordedSeats(record: VoteRecord): AgentVoteResult[] {
  const seats: AgentVoteResult[] = record.voters.map((voter) => ({
    // Ledger roles are strings; the verdict uses them only for diagnostic names.
    role: voter.role as VoterRole,
    source: voter.unverifiable === true ? 'unverifiable' : 'llm',
    vote: {
      decision: voter.unverifiable === true ? 'abstain' : voter.decision,
      confidence: voter.confidence,
      reasoning: voter.reasoning ?? '',
    },
    processingTimeMs: 0,
  }));
  const coverage = record.panelCoverage;
  for (let index = 0; index < (coverage?.errored ?? 0); index++) {
    seats.push({
      role: (coverage?.erroredRoles[index] ?? `errored-seat-${String(index)}`) as VoterRole,
      source: 'error',
      vote: { decision: 'abstain', confidence: 0, reasoning: '' },
      processingTimeMs: 0,
    });
  }
  return seats;
}

/** Roles that occur more than once across answering and errored seats, sorted. */
function repeatedRoles(seats: readonly AgentVoteResult[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const seat of seats) {
    if (seen.has(seat.role)) repeated.add(seat.role);
    seen.add(seat.role);
  }
  return [...repeated].sort();
}

/**
 * Seat evidence a real panel cannot have produced. Zero seats is no evidence.
 * Production keys the tally by role (consensus-vote.ts `voteMap.set(role, vote)`),
 * so a repeated role is one vote there; refuse it rather than count it either way.
 */
function seatEvidenceDefect(
  recordedVoters: number,
  seats: readonly AgentVoteResult[]
): string | undefined {
  if (recordedVoters === 0) return 'zero voters — no seat evidence';
  const repeated = repeatedRoles(seats);
  if (repeated.length > 0) {
    return `repeated role(s) in the recorded panel: ${repeated.join(', ')}`;
  }
  return undefined;
}

/** Never read the producer's aggregate decision, counts or approval percentage. */
export function recomputeRecordDecision(record: VoteRecord): VoteDecisionOutcome {
  const seats = recordedSeats(record);
  const defect = seatEvidenceDefect(record.voters.length, seats);
  if (defect !== undefined) return { decision: 'no_quorum', degradeReason: defect };
  const errorPolicy = record.errorPolicy ?? getDefaultErrorPolicy(record.strategy);
  const policy = applyErrorPolicy(seats, errorPolicy);
  const votes = new Map(policy.engineVotes.map((seat) => [seat.role, seat.vote]));
  const tally = strategies.getStrategy(record.strategy).calculateOutcome(votes);
  const quorumReached = isQuorumReached(votes.size, DEFAULT_MIN_VOTERS_FOR_QUORUM);
  const result: ExtendedVotingResult = {
    proposal: record.proposal,
    threshold: record.strategy,
    strategy: record.strategy,
    errorPolicy,
    votes: seats,
    panelSize: record.panelCoverage?.requested ?? seats.length,
    ...(policy.reason !== undefined ? { policyReason: policy.reason } : {}),
    totalTimeMs: 0,
    simulateVotes: false,
    result: {
      proposalId: record.id,
      proposal: {
        title: record.proposal,
        description: record.proposal,
        algorithm: record.strategy,
      },
      outcome: determineFinalStatus(quorumReached, tally.approved),
      votes,
      voteCounts: tally.voteCounts,
      approvalPercentage: tally.approvalPercentage,
      quorumReached,
      startedAt: record.recordedAt,
      closedAt: record.recordedAt,
      durationMs: 0,
    },
  };
  return resolveVoteDecision(
    {
      proposal: record.proposal,
      strategy: record.strategy,
      errorPolicy,
      quickMode: false,
      simulateVotes: false,
    },
    result,
    seats.filter((seat) => seat.source === 'error').length
  );
}
