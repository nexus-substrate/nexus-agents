/**
 * Types, schemas, and response helpers for the consensus_vote MCP tool.
 * Extracted from consensus-vote.ts for file size compliance (Issue #708).
 *
 * @module mcp/tools/consensus-vote-types
 */

import { z } from 'zod';
import type { AgentVoteResult, VotingResult } from '../../cli/vote-types.js';
import { VOTER_ROLES } from '../../cli/vote-types.js';
import type { HigherOrderVotingResult } from '../../consensus/higher-order-types.js';
import type { DecisionCostSummary } from '../../observability/decision-cost.js';
import type { VoteRecordPersistOutcome } from './consensus-vote-recording.js';

/** Maximum proposal length (memory bounds per Issue #435). */
export const MAX_PROPOSAL_LENGTH = 4000;

// ============================================================================
// Strategy Types
// ============================================================================

/**
 * Available consensus voting strategies.
 *
 * - `simple_majority`: Standard majority voting (>50%)
 * - `supermajority`: Requires >=67% approval
 * - `unanimous`: Requires 100% approval
 * - `proof_of_learning`: Weighted by agent performance (Issue #103)
 * - `higher_order`: Bayesian-optimal with correlation awareness (Issue #514)
 * - `opinion_wise`: Alias for higher_order (Issue #333)
 */
export type VotingStrategy =
  | 'simple_majority'
  | 'supermajority'
  | 'unanimous'
  | 'proof_of_learning'
  | 'higher_order'
  | 'opinion_wise';

export const VotingStrategySchema = z.enum([
  'simple_majority',
  'supermajority',
  'unanimous',
  'proof_of_learning',
  'higher_order',
  'opinion_wise',
]);

/**
 * Whether a strategy uses higher-order (Bayesian, correlation-aware) aggregation.
 * `opinion_wise` is a documented alias of `higher_order` (#333), so both must
 * take the higher-order path — gating on the literal `'higher_order'` silently
 * dropped opinion_wise to the plain engine with no higherOrderMetadata (#3271).
 */
export function isHigherOrderStrategy(strategy: VotingStrategy): boolean {
  return strategy === 'higher_order' || strategy === 'opinion_wise';
}

/**
 * Posterior-approval floor below which a `higher_order` quickMode *approval* is
 * escalated to the full voter panel (#3174). For Bayesian aggregation the
 * posterior is a first-class confidence signal: an approval whose posterior sits
 * near 0.5 means the 3-voter quick panel was barely decisive, which is exactly
 * the case where the extra voters are worth their cost. Mirrors the bare-constant
 * style of `CONTRARIAN_ESCALATION_THRESHOLD`. Set above any real posterior to
 * always escalate, or — since the gate also requires `posterior < floor` — a
 * floor of `0` disables posterior-based escalation entirely.
 */
export const HIGHER_ORDER_ESCALATION_POSTERIOR_FLOOR = 0.65;

/**
 * Whether a quickMode approval should escalate to the full panel purely on a
 * borderline Bayesian posterior (#3174). Independent of the contrarian-agent
 * check — this catches low-confidence higher_order approvals that a clean
 * outcome string hides. Only fires for higher_order/opinion_wise (the strategies
 * with a meaningful posterior), on approvals, in quickMode, when the posterior
 * is known and below the floor.
 */
export function shouldEscalateLowPosterior(
  strategy: VotingStrategy,
  outcome: 'approved' | 'rejected',
  quickMode: boolean,
  posteriorApproval: number | undefined
): boolean {
  return (
    quickMode &&
    outcome === 'approved' &&
    isHigherOrderStrategy(strategy) &&
    posteriorApproval !== undefined &&
    posteriorApproval < HIGHER_ORDER_ESCALATION_POSTERIOR_FLOOR
  );
}

// ============================================================================
// Input / Output Schemas
// ============================================================================

/**
 * How error-source votes (timed-out or crashed voters) are counted toward
 * the threshold (#2630).
 *
 * - `reduce_denominator` (default for non-strict strategies): errors are
 *   filtered out before the engine sees votes — denominator = non-error
 *   votes. Best for operational decisions where you trust the responding
 *   voters and infrastructure flake should not block the vote.
 * - `count_as_abstain`: error votes reach the engine as abstain. Behaves
 *   conservatively — a timed-out voter effectively withholds approval
 *   relative to the threshold. Use when you can't tell what the error
 *   voter would have decided and want the math to reflect uncertainty.
 * - `fail_closed` (default for unanimous / higher_order): any error voids
 *   the vote. Threshold math is not run. Use for security-critical or
 *   breaking-change decisions where every voter must be heard.
 *
 * Regardless of policy, a hard floor applies: when errors exceed 50% of
 * total voters, the vote always fails. Catches "all CLIs are down" — a
 * 2-voter consensus is not a real consensus.
 */
export const ErrorPolicySchema = z.enum(['reduce_denominator', 'count_as_abstain', 'fail_closed']);

export type ErrorPolicy = z.infer<typeof ErrorPolicySchema>;

/**
 * Threshold values accepted by the `--threshold` CLI flag and the
 * \`threshold\` MCP input field (#2638 — single source of truth).
 *
 * Maps to consensus algorithms via:
 * `majority → simple_majority`, `supermajority → supermajority`, `unanimous → unanimous`.
 *
 * Used as the canonical Zod schema for CLI parsing
 * (`cli.ts:parseThreshold`), validation (`cli-commands-validators.ts:isValidThreshold`),
 * and the `ConsensusVoteInputSchema.threshold` field.
 */
export const VoteThresholdSchema = z.enum(['majority', 'supermajority', 'unanimous']);

export type VoteThreshold = z.infer<typeof VoteThresholdSchema>;

/**
 * Fraction of total voters that, if errored, forces the vote to fail
 * regardless of `errorPolicy`. (#2630 — safety floor.)
 */
export const ERROR_FLOOR_FRACTION = 0.5;

/**
 * Default error policy per voting strategy.
 *
 * Only `unanimous` defaults to `fail_closed`: a missing/errored voter genuinely
 * breaks the unanimity guarantee, so the vote must void. Every other strategy —
 * including `higher_order` and its `opinion_wise` alias — defaults to
 * `reduce_denominator`: Bayesian/weighted aggregation over the *non-error*
 * voters is well-defined, so a single infra timeout (e.g. one slow voter's
 * adapter transport, #3304) should NOT fail-close an otherwise-unanimous result
 * (#3138). The >50% `ERROR_FLOOR_FRACTION` hard floor still voids any vote where
 * most voters errored. Callers can override via the `errorPolicy` input.
 */
export function getDefaultErrorPolicy(strategy: VotingStrategy): ErrorPolicy {
  if (strategy === 'unanimous') {
    return 'fail_closed';
  }
  return 'reduce_denominator';
}

export const ConsensusVoteInputSchema = z.object({
  proposal: z.string().min(1).max(MAX_PROPOSAL_LENGTH).describe('Proposal text to vote on'),
  threshold: VoteThresholdSchema.optional().describe(
    'Voting threshold (legacy): majority, supermajority, unanimous. Use strategy instead.'
  ),
  strategy: VotingStrategySchema.optional().describe(
    'Voting strategy: simple_majority (default), supermajority, unanimous, proof_of_learning, or higher_order (Bayesian-optimal)'
  ),
  errorPolicy: ErrorPolicySchema.optional().describe(
    'How to treat voters that errored or timed out (#2630). Default: fail_closed for unanimous only; reduce_denominator for all other strategies incl. higher_order/opinion_wise (#3138 — a single infra timeout should not void an otherwise-unanimous vote). Regardless of policy, errors > 50% always fails.'
  ),
  quickMode: z
    .boolean()
    .optional()
    .default(false)
    .describe('Use 3 agents instead of the full 7-role panel for faster execution'),
  simulateVotes: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'TESTS ONLY — when true, voters return random decisions. Output must not be used for real decisions. (#2319)'
    ),
  /**
   * Async-mode dispatch (#3045, Stage 4 of epic #2631). Default `sync` —
   * backward-compat invariant. `async` returns `{ status: 'pending', jobId }`
   * immediately; caller polls `get_job_result(jobId)`. Per-tool cap via
   * `NEXUS_JOB_MAX_CONCURRENT_CONSENSUS_VOTE` (default 2 — voting is
   * 7-fan-out so concurrent jobs multiply adapter load fast).
   *
   * Cancellation semantics (#3041 vote deferred this to Stage 4): when
   * a polling client calls `cancel_job` mid-vote, the dispatcher aborts
   * in-flight voters via the AbortSignal plumbing from #3038. The
   * resulting job result is `{ status: 'cancelled', partialVotes: [...] }`
   * with whatever voters completed before the abort signal — preserves
   * audit visibility into who voted before the cancel landed.
   *
   * Kept optional (no `.default()`) so the inferred type doesn't force
   * `mode: 'sync'` on every existing call site / test fixture.
   */
  mode: z
    .enum(['sync', 'async'])
    .optional()
    .describe(
      'Dispatch mode (default: sync). Use "async" for higher-order strategies with 7 voters.'
    ),
  /**
   * Idempotency key for async-mode replay-safety (#3042 Stage 1c / epic
   * #2631). When set: identical (key, inputs) returns the existing job;
   * same key with different inputs fails closed with
   * `idempotency_key_collision`. Sync mode ignores this.
   */
  idempotencyKey: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe(
      'Replay-safe key for async-mode dispatch (#3042 Stage 1c). Same (key, inputs) returns existing jobId.'
    ),
  /**
   * Authority-tier ratification subject (#4004). Set ONLY when this vote
   * ratifies an authority-ladder promotion: the loop/strategy id (the
   * tier-transition `subject`) this vote authorizes. It is bound into the
   * persisted record's self-hash as `ratifies`, so the promotion gate
   * (`check-authority-tier-drift.ts`) can resolve a `ratificationVoteRef` to this
   * record and require `ratifies === transition.subject` (with decision=approved,
   * strategy=higher_order). Omit on an ordinary vote.
   */
  ratifies: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe(
      'Authority-tier ratification subject (#4004) — the loop/strategy id this vote ratifies for an authority-ladder promotion. Bound into the authentic vote record so the promotion gate can verify it. Omit for ordinary votes.'
    ),
});

export type ConsensusVoteInput = z.infer<typeof ConsensusVoteInputSchema>;

// ============================================================================
// Response Types
// ============================================================================

export interface AgentVoteSummary {
  role: string;
  decision: 'approve' | 'reject' | 'abstain';
  confidence: number;
  reasoning: string;
  simulated: boolean;
  /** True when this vote was generated from an error (Issue #815). */
  error: boolean;
  /** Model used for this agent's vote (Issue #817). */
  modelUsed?: string;
  /** Structured rejection categories for reject→refine→re-vote loops (Issue #1213). */
  rejectionCategories?: readonly string[];
}

/**
 * Canonical set of decision statuses a vote response can carry. Single source
 * of truth: the `consensus_vote` MCP `outputSchema` reuses
 * {@link VoteDecisionStatusSchema} so the advertised enum can never be narrower
 * than what {@link buildResponse} emits (all five are reachable —
 * `no_quorum` on an all-error/no-quorum panel, the rest via
 * {@link mapOutcomeToDecision}). A narrower schema made strict MCP clients
 * reject `timeout`/`pending` votes with a `-32602`-class error (#4032).
 */
export const VoteDecisionStatusSchema = z.enum([
  'approved',
  'rejected',
  'pending',
  'timeout',
  'no_quorum',
]);

export type VoteDecisionStatus = z.infer<typeof VoteDecisionStatusSchema>;

/** Higher-Order Voting metadata (Issue #514). */
export interface HigherOrderMetadata {
  posteriorApproval: number;
  posteriorRejection: number;
  effectiveVoteCount: number;
  method: 'ow' | 'isp' | 'simple';
  usedCorrelationData: boolean;
  improvementOverBaseline: number;
  downweightedAgents: readonly string[];
  reasoning: string;
}

export interface ConsensusVoteResponse {
  proposal: string;
  threshold?: VoteThreshold;
  strategy: VotingStrategy;
  decision: VoteDecisionStatus;
  approvalPercentage: number;
  voteCounts: { approve: number; reject: number; abstain: number; error: number };
  votes: AgentVoteSummary[];
  durationMs: number;
  simulateVotes: boolean;
  higherOrderMetadata?: HigherOrderMetadata;
  /**
   * Set when an error policy short-circuited the vote (#2630/#3124). Explains a
   * `rejected` decision that may coexist with a high `approvalPercentage` — e.g.
   * `fail_closed: 1 voter(s) errored`. Absent on normally-tallied votes.
   */
  policyReason?: string;
  /**
   * Set when the panel was DEGRADED (#3587): some voters errored, so the
   * decision rests on fewer than the requested number of voters. Surfaces a
   * silently-shrunk panel so the result isn't read as a full-strength consensus.
   * Absent when every requested voter returned a real vote.
   */
  panelWarning?: string;
  /**
   * Per-decision cost rollup (#3855): per-voter / per-model token + USD totals
   * for this governed decision. Rides the existing response — no new MCP tool.
   * Totals are a floor when `costSummary.unmeasuredVoters > 0` (voters whose
   * adapter reported no usage are counted as unmeasured, not a measured $0).
   */
  costSummary?: DecisionCostSummary;
  /**
   * #3991: whether the authentic vote record (#3897) was persisted at vote time.
   * Post-#3991 the runtime ledger routes through `nexusDataPath` under
   * `governance/`, so a writable `.nexus-agents/governance/` location almost
   * always exists and `true` is the normal case. `false` means the persist was
   * skipped (all votes simulated) or the write failed (data dir unwritable) —
   * see {@link voteRecordNote}. Surfaces to the MCP caller what was previously
   * only a server-side WARN.
   */
  voteRecordPersisted: boolean;
  /**
   * #3991: present only when {@link voteRecordPersisted} is `false` — the
   * actionable reason the record was not written (e.g. the data dir is unwritable
   * → fix permissions or set `NEXUS_VOTE_RECORDS_PATH` to a writable path).
   */
  voteRecordNote?: string;
}

/** Extended voting result with optional Higher-Order metadata. */
export interface ExtendedVotingResult extends VotingResult {
  strategy: VotingStrategy;
  higherOrderResult?: HigherOrderVotingResult;
  /** Reason an error policy short-circuited the vote (#3124); surfaced on the response. */
  policyReason?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Converts AgentVoteResult to AgentVoteSummary for response. */
export function toAgentVoteSummary(result: AgentVoteResult): AgentVoteSummary {
  const roleName = VOTER_ROLES[result.role].split(' - ')[0] ?? result.role;
  return {
    role: roleName,
    decision: result.vote.decision,
    confidence: result.vote.confidence,
    reasoning: result.vote.reasoning,
    simulated: result.source === 'simulation',
    error: result.source === 'error',
    ...(result.vote.rejectionCategories !== undefined
      ? { rejectionCategories: result.vote.rejectionCategories }
      : {}),
  };
}

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
 * #3587: partial panel degradation — some (but not all) voters errored, so the
 * decision rests on fewer voters than requested. Returns a warning string, or
 * undefined when the panel is full or entirely errored (the latter is already a
 * structured error elsewhere).
 */
function panelDegradationWarning(errorCount: number, total: number): string | undefined {
  if (errorCount <= 0 || errorCount >= total) return undefined;
  return (
    `Panel degraded: ${String(errorCount)} of ${String(total)} voters errored; ` +
    `decision rests on ${String(total - errorCount)} voter(s).`
  );
}

/**
 * Builds the response from voting result.
 *
 * `voteRecord` (#3991) is the structured authentic-vote-record persistence
 * outcome; when omitted (direct unit calls) `voteRecordPersisted` defaults to
 * `false` with no note. The live handler always supplies it.
 */
export function buildResponse(
  input: ConsensusVoteInput,
  result: ExtendedVotingResult,
  costSummary?: DecisionCostSummary,
  voteRecord?: VoteRecordPersistOutcome
): ConsensusVoteResponse {
  const proposalTruncated =
    input.proposal.length > 200 ? input.proposal.slice(0, 200) + '...' : input.proposal;

  const errorCount = result.votes.filter((v) => v.source === 'error').length;

  const allErrors = errorCount === result.votes.length && errorCount > 0;
  // #4053: an error-policy short-circuit (the >50% hard floor, or fail_closed)
  // VOIDED the vote because too many voters errored — that is "couldn't get
  // enough valid votes" (no_quorum), NOT the panel rejecting the proposal.
  // Reporting `rejected` when the responding voters actually approved is
  // misleading (e.g. quickMode 1 approve + 2 error → no_quorum, not rejected).
  // `policyReason` is set iff such a short-circuit occurred; it still rides the
  // response so callers see WHY there was no quorum.
  const errorVoidedVote = result.policyReason !== undefined;
  const decision: VoteDecisionStatus =
    errorVoidedVote || (!result.result.quorumReached && allErrors)
      ? 'no_quorum'
      : mapOutcomeToDecision(result.result.outcome);

  const response: ConsensusVoteResponse = {
    proposal: proposalTruncated,
    strategy: result.strategy,
    decision,
    approvalPercentage: result.result.approvalPercentage,
    voteCounts: {
      approve: result.result.voteCounts.approve,
      reject: result.result.voteCounts.reject,
      abstain: result.result.voteCounts.abstain,
      error: errorCount,
    },
    votes: result.votes.map(toAgentVoteSummary),
    durationMs: result.totalTimeMs,
    simulateVotes: result.simulateVotes,
    // #3991: surface the authentic-vote-record persistence outcome so a skipped
    // or failed persist is visible to the MCP caller (was WARN-only).
    voteRecordPersisted: voteRecord?.persisted ?? false,
  };
  if (voteRecord !== undefined && !voteRecord.persisted) {
    response.voteRecordNote = voteRecord.detail;
  }

  applyOptionalResponseFields(response, input, result, errorCount, costSummary);
  return response;
}

/**
 * Attach the optional response fields (threshold, policy reason, panel warning,
 * higher-order metadata, cost summary). Extracted from {@link buildResponse} to
 * keep its cyclomatic complexity within the lint budget (#3855).
 */
function applyOptionalResponseFields(
  response: ConsensusVoteResponse,
  input: ConsensusVoteInput,
  result: ExtendedVotingResult,
  errorCount: number,
  costSummary?: DecisionCostSummary
): void {
  if (input.threshold !== undefined) {
    response.threshold = input.threshold;
  }
  if (result.policyReason !== undefined) {
    response.policyReason = result.policyReason;
  }
  const panelWarning = panelDegradationWarning(errorCount, result.votes.length);
  if (panelWarning !== undefined) {
    response.panelWarning = panelWarning;
  }
  if (isHigherOrderStrategy(result.strategy) && result.higherOrderResult) {
    response.higherOrderMetadata = toHigherOrderMetadata(result.higherOrderResult);
  }
  if (costSummary !== undefined) {
    response.costSummary = costSummary;
  }
}

/** Maps a HigherOrderVotingResult to the response's metadata shape. */
function toHigherOrderMetadata(r: HigherOrderVotingResult): HigherOrderMetadata {
  return {
    posteriorApproval: r.posteriorApproval,
    posteriorRejection: r.posteriorRejection,
    effectiveVoteCount: r.effectiveVoteCount,
    method: r.method,
    usedCorrelationData: r.usedCorrelationData,
    improvementOverBaseline: r.improvementOverBaseline,
    downweightedAgents: r.downweightedAgents,
    reasoning: r.reasoning,
  };
}
