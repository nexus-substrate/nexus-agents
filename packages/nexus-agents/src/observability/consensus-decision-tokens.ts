/**
 * Read-only join of persisted consensus cost rollups and vote verdicts (#6809).
 * Cost rows contain final-seat usage, not discarded retry/fallback attempts.
 */
import type { VoteRecordDecision } from '../audit/vote-record.js';
import { aggregateDecisionCosts } from './decision-cost-aggregate.js';
import { DecisionCostRecordSchema, type DecisionCostRecord } from './decision-cost-store.js';

/** The two persisted vote fields needed by the read-only cost join. */
export interface LinkedVote {
  readonly correlationId?: string | undefined;
  readonly decision: VoteRecordDecision;
}

export interface ConsensusDecisionTokenReport {
  /** Only uniquely joined approved/rejected vote records count as decisions. */
  readonly matchedQuorumDecisions: number;
  readonly matchedNoQuorumDecisions: number;
  readonly unmatchedQuorumVoteRecords: number;
  readonly unmatchedNoQuorumVoteRecords: number;
  readonly unmatchedCostRecords: number;
  readonly ambiguousDecisionIds: number;
  readonly invalidCostRecords: number;
  /** Includes matched no_quorum costs; excludes ambiguous and invalid records. */
  readonly totalReportedFinalSeatTokens: number;
  readonly noQuorumReportedFinalSeatTokens: number;
  /** Null, not zero, when no quorum-backed decision can be measured. */
  readonly reportedTokensPerMatchedQuorumDecision: number | null;
  readonly tokenMeasuredVoters: number;
  readonly tokenUnmeasuredVoters: number;
  readonly tokenCoverage: number | null;
  /** Discarded retries/fallbacks are not persisted; every token total is a floor. */
  readonly measurement: 'lower-bound-final-seats';
}

/** Count IDs without turning duplicates into independent decisions. */
function countIds<T>(
  rows: readonly T[],
  idOf: (row: T) => string | undefined
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = idOf(row);
    if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Schema-valid rows may still contain contradictory token totals; refuse them. */
function validCostRecord(record: DecisionCostRecord): boolean {
  if (!DecisionCostRecordSchema.safeParse(record).success) return false;
  const s = record.summary;
  if (s.voterCount === 0 || s.perVoter.length !== s.voterCount) return false;
  let input = 0;
  let output = 0;
  for (const voter of s.perVoter) {
    if (voter.totalTokens !== voter.inputTokens + voter.outputTokens) return false;
    input += voter.inputTokens;
    output += voter.outputTokens;
  }
  return (
    s.totalInputTokens === input &&
    s.totalOutputTokens === output &&
    s.totalTokens === input + output
  );
}

interface VoteIndex {
  readonly unique: ReadonlyMap<string, LinkedVote>;
  readonly ambiguous: ReadonlySet<string>;
  readonly unmatchedQuorum: number;
  readonly unmatchedNoQuorum: number;
}

function duplicateIds(...counts: readonly ReadonlyMap<string, number>[]): ReadonlySet<string> {
  const duplicates = new Set<string>();
  for (const group of counts) {
    for (const [id, count] of group) if (count > 1) duplicates.add(id);
  }
  return duplicates;
}

function countUnmatchedVotes(
  votes: readonly LinkedVote[],
  costCounts: ReadonlyMap<string, number>,
  ambiguous: ReadonlySet<string>
): { quorum: number; noQuorum: number } {
  const unmatched = votes.filter((vote) => {
    const id = vote.correlationId;
    return id === undefined || (!ambiguous.has(id) && !costCounts.has(id));
  });
  const noQuorum = unmatched.filter((vote) => vote.decision === 'no_quorum').length;
  return { quorum: unmatched.length - noQuorum, noQuorum };
}

function indexVotes(
  votes: readonly LinkedVote[],
  validCosts: readonly DecisionCostRecord[],
  allCosts: readonly DecisionCostRecord[]
): VoteIndex {
  const costCounts = countIds(validCosts, (r) => r.decisionId);
  const voteCounts = countIds(votes, (r) => r.correlationId);
  const ambiguous = duplicateIds(
    countIds(allCosts, (r) => r.decisionId),
    voteCounts
  );

  const unique = new Map<string, LinkedVote>();
  for (const vote of votes) {
    const id = vote.correlationId;
    if (id !== undefined && !ambiguous.has(id)) unique.set(id, vote);
  }
  const unmatched = countUnmatchedVotes(votes, costCounts, ambiguous);
  return {
    unique,
    ambiguous,
    unmatchedQuorum: unmatched.quorum,
    unmatchedNoQuorum: unmatched.noQuorum,
  };
}

interface JoinedCosts {
  readonly records: readonly DecisionCostRecord[];
  readonly quorum: number;
  readonly noQuorum: number;
  readonly unmatched: number;
  readonly noQuorumTokens: number;
}

function joinCosts(costs: readonly DecisionCostRecord[], index: VoteIndex): JoinedCosts {
  const records: DecisionCostRecord[] = [];
  let quorum = 0;
  let noQuorum = 0;
  let unmatched = 0;
  let noQuorumTokens = 0;
  for (const record of costs) {
    if (index.ambiguous.has(record.decisionId)) continue;
    const vote = index.unique.get(record.decisionId);
    if (vote === undefined) {
      unmatched++;
      continue;
    }
    records.push(record);
    if (vote.decision === 'no_quorum') {
      noQuorum++;
      noQuorumTokens += record.summary.totalTokens;
    } else quorum++;
  }
  return { records, quorum, noQuorum, unmatched, noQuorumTokens };
}

/**
 * Aggregate final-seat tokens from uniquely matched consensus decisions.
 * Both inputs must already be windowed to the same report period. The numerator
 * includes no_quorum rows; the denominator counts only approved/rejected rows.
 */
export function summarizeConsensusDecisionTokens(
  costRecords: readonly DecisionCostRecord[],
  voteRecords: readonly LinkedVote[]
): ConsensusDecisionTokenReport {
  const consensusCosts = costRecords.filter((r) => r.gate === 'consensus_vote');
  const validCosts = consensusCosts.filter(validCostRecord);
  const invalidCostRecords = consensusCosts.length - validCosts.length;
  const index = indexVotes(voteRecords, validCosts, consensusCosts);
  const joined = joinCosts(validCosts, index);
  const totalReportedFinalSeatTokens = joined.records.reduce(
    (sum, r) => sum + r.summary.totalTokens,
    0
  );
  // Reuse #6813's fail-closed provenance guard; legacy/damaged rows remain unmeasured.
  const coverage = aggregateDecisionCosts(joined.records, 0).byGate[0];
  return {
    matchedQuorumDecisions: joined.quorum,
    matchedNoQuorumDecisions: joined.noQuorum,
    unmatchedQuorumVoteRecords: index.unmatchedQuorum,
    unmatchedNoQuorumVoteRecords: index.unmatchedNoQuorum,
    unmatchedCostRecords: joined.unmatched,
    ambiguousDecisionIds: index.ambiguous.size,
    invalidCostRecords,
    totalReportedFinalSeatTokens,
    noQuorumReportedFinalSeatTokens: joined.noQuorumTokens,
    reportedTokensPerMatchedQuorumDecision:
      joined.quorum === 0 ? null : totalReportedFinalSeatTokens / joined.quorum,
    tokenMeasuredVoters: coverage?.tokenMeasuredVoters ?? 0,
    tokenUnmeasuredVoters: coverage?.tokenUnmeasuredVoters ?? 0,
    tokenCoverage: coverage?.tokenCoverage ?? null,
    measurement: 'lower-bound-final-seats',
  };
}
