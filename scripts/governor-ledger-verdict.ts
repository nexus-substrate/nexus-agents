/** Recompute ledger decisions through the canonical consensus path (#6952). */
import type { VoteRecord } from '../packages/nexus-agents/src/audit/vote-record.js';
import type { AgentVoteResult, VoterRole } from '../packages/nexus-agents/src/cli/vote-types.js';
import { createStrategyFactory } from '../packages/nexus-agents/src/consensus/strategies.js';
import {
  VotingStrategySchema,
  type VotingStrategy,
} from '../packages/nexus-agents/src/mcp/tools/consensus-vote-types.js';
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
  // Built from the role list, never from the producer-supplied count: the count
  // is unbounded by the schema, so looping over it is an allocation an attacker
  // controls. `coverageDefect` has already required the two to agree.
  for (const role of record.panelCoverage?.erroredRoles ?? []) {
    seats.push({
      role: role as VoterRole,
      source: 'error',
      vote: { decision: 'abstain', confidence: 0, reasoning: '' },
      processingTimeMs: 0,
    });
  }
  return seats;
}

/** An errored count that disagrees with its role list cannot be a real panel's. */
function coverageDefect(record: VoteRecord): string | undefined {
  const coverage = record.panelCoverage;
  if (coverage === undefined) return undefined;
  if (coverage.errored !== coverage.erroredRoles.length) {
    return `errored count ${String(coverage.errored)} disagrees with ${String(coverage.erroredRoles.length)} errored role(s)`;
  }
  return undefined;
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

/**
 * The live strategy a record ran under, or undefined when it was later retired.
 * A persisted record may legitimately carry proof_of_learning (#5234); it cannot
 * be recomputed under 9.0, so it is refused with a reason rather than thrown on.
 */
function recomputableStrategy(recorded: VoteRecord['strategy']): VotingStrategy | undefined {
  const parsed = VotingStrategySchema.safeParse(recorded);
  return parsed.success ? parsed.data : undefined;
}

/** Whether a recorded strategy is still live and can be recomputed. */
export function isRecomputableStrategy(recorded: VoteRecord['strategy']): boolean {
  return recomputableStrategy(recorded) !== undefined;
}

/** The live strategy and rebuilt seats, or the reason the record cannot be recomputed. */
function recomputableEvidence(
  record: VoteRecord
):
  | { readonly algorithm: VotingStrategy; readonly seats: AgentVoteResult[] }
  | { readonly defect: string } {
  const algorithm = recomputableStrategy(record.strategy);
  if (algorithm === undefined) {
    return { defect: `strategy '${record.strategy}' is retired and cannot be recomputed` };
  }
  const coverage = coverageDefect(record);
  if (coverage !== undefined) return { defect: coverage };
  const seats = recordedSeats(record);
  const defect = seatEvidenceDefect(record.voters.length, seats);
  if (defect !== undefined) return { defect };
  return { algorithm, seats };
}

/** Never read the producer's aggregate decision, counts or approval percentage. */
export function recomputeRecordDecision(record: VoteRecord): VoteDecisionOutcome {
  const evidence = recomputableEvidence(record);
  if ('defect' in evidence) return { decision: 'no_quorum', degradeReason: evidence.defect };
  const { algorithm, seats } = evidence;
  const errorPolicy = record.errorPolicy ?? getDefaultErrorPolicy(algorithm);
  const policy = applyErrorPolicy(seats, errorPolicy);
  const votes = new Map(policy.engineVotes.map((seat) => [seat.role, seat.vote]));
  const tally = strategies.getStrategy(algorithm).calculateOutcome(votes);
  const quorumReached = isQuorumReached(votes.size, DEFAULT_MIN_VOTERS_FOR_QUORUM);
  const result: ExtendedVotingResult = {
    proposal: record.proposal,
    threshold: algorithm,
    strategy: algorithm,
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
        algorithm,
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
      strategy: algorithm,
      errorPolicy,
      quickMode: false,
      simulateVotes: false,
    },
    result,
    seats.filter((seat) => seat.source === 'error').length
  );
}
