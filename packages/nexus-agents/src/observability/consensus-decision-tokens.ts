/**
 * Read-only join of consensus cost rollups, vote verdicts and seat outcomes.
 * The legacy totals are final-seat usage. Rows written since #6821 also carry
 * observed outer-attempt usage (retries, parse failures, fallbacks), reported
 * separately in {@link ConsensusDecisionTokenReport.observedAttemptUsage}.
 */
import type { VoteRecordDecision } from '../audit/vote-record.js';
import { aggregateDecisionCosts } from './decision-cost-aggregate.js';
import { DecisionCostRecordSchema, type DecisionCostRecord } from './decision-cost-store.js';
import type { ObservedAttemptUsage } from './attempt-usage.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';

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
  /** The final-seat totals above exclude retries/fallbacks; every one is a floor. */
  readonly measurement: 'lower-bound-final-seats';
  /**
   * Outer-attempt usage summed over the matched decisions that recorded it
   * (#6821); `decisions` of the matched total did. Never added to the
   * final-seat totals. A floor when `incompleteSeats > 0`; null when no
   * matched decision recorded any — not observed, never zero. Optional so a
   * report built by code that predates #6821 still type-checks.
   */
  readonly observedAttemptUsage?:
    (ObservedAttemptUsage & { readonly decisions: number }) | null | undefined;
  /** Matched cost/vote decisions with at least one consensus outcome row. */
  readonly matchedDecisionsWithOutcomes?: number;
  /** Consensus seat rows joined by traceId, including failed seats. */
  readonly matchedOutcomeRows?: number;
  /** Includes missing traceId, unknown IDs, invalid costs and ambiguous joins. */
  readonly unmatchedOutcomeRows?: number;
  /**
   * Joined seats whose `success` means they answered (`source === 'llm'` at
   * the consensus writer), not that their answers were validated.
   */
  readonly matchedLlmAnsweredOutcomeRows?: number;
  /**
   * Fraction of matched cost/vote decisions with at least one outcome row;
   * does not measure full-panel coverage or answer validation. Null when no
   * consensus outcomes or no matched decisions were measured.
   */
  readonly outcomeJoinCoverage?: number | null;
}

/** Join seat outcomes only to unambiguous, valid cost/vote decision IDs. */
function joinOutcomes(
  records: readonly DecisionCostRecord[],
  outcomes: readonly TaskOutcome[]
): Pick<
  ConsensusDecisionTokenReport,
  | 'matchedDecisionsWithOutcomes'
  | 'matchedOutcomeRows'
  | 'unmatchedOutcomeRows'
  | 'matchedLlmAnsweredOutcomeRows'
  | 'outcomeJoinCoverage'
> {
  const ids = new Set(records.map((record) => record.decisionId));
  const consensus = outcomes.filter((row) => row.source === 'consensus');
  const matched = consensus.filter((row) => row.traceId !== undefined && ids.has(row.traceId));
  const decisions = new Set(matched.map((row) => row.traceId)).size;
  return {
    matchedDecisionsWithOutcomes: decisions,
    matchedOutcomeRows: matched.length,
    unmatchedOutcomeRows: consensus.length - matched.length,
    matchedLlmAnsweredOutcomeRows: matched.filter((row) => row.success).length,
    outcomeJoinCoverage: consensus.length === 0 || ids.size === 0 ? null : decisions / ids.size,
  };
}

/** Sum the observed attempt usage of the matched records that carry it. */
function sumObservedAttempts(
  records: readonly DecisionCostRecord[]
): ConsensusDecisionTokenReport['observedAttemptUsage'] {
  const observed = records.flatMap((r) =>
    r.summary.observedAttemptUsage !== undefined ? [r.summary.observedAttemptUsage] : []
  );
  if (observed.length === 0) return null;
  const sum = (key: keyof ObservedAttemptUsage): number =>
    observed.reduce((total, o) => total + o[key], 0);
  return {
    decisions: observed.length,
    seats: sum('seats'),
    incompleteSeats: sum('incompleteSeats'),
    completions: sum('completions'),
    reportedCompletions: sum('reportedCompletions'),
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    totalTokens: sum('totalTokens'),
  };
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
 * All inputs must already be windowed to the same report period. The numerator
 * includes no_quorum rows; the denominator counts only approved/rejected rows.
 */
export function summarizeConsensusDecisionTokens(
  costRecords: readonly DecisionCostRecord[],
  voteRecords: readonly LinkedVote[],
  outcomes: readonly TaskOutcome[] = []
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
    observedAttemptUsage: sumObservedAttempts(joined.records),
    ...joinOutcomes(joined.records, outcomes),
  };
}
