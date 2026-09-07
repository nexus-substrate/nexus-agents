/**
 * Types, schemas, and response helpers for the consensus_vote MCP tool.
 * Extracted from consensus-vote.ts for file size compliance (Issue #708).
 *
 * @module mcp/tools/consensus-vote-types
 */

/* eslint-disable max-lines --
 * #4701: this file sat exactly at the 400-line cap, so adding
 * `HigherOrderMetadata.appliedToDecision` (a field plus its assignment) puts it
 * one over. Taking the exemption rather than splitting an 18-export types
 * module inside a two-line governance-fidelity fix. Second file this session to
 * hit the cap this way — see #4702 for the same situation in `audit-logger.ts`.
 * Do not keep adding here; split it.
 */

import { z } from 'zod';
import type { AgentVoteResult, VotingResult } from '../../cli/vote-types.js';
import { VOTER_ROLES } from '../../cli/vote-types.js';
import type { HigherOrderVotingResult } from '../../consensus/higher-order-types.js';
import type { OptionGateVerdict } from './consensus-vote-option-gate.js';
import type { DecisionCostSummary } from '../../observability/decision-cost.js';
import type { VoteRecordPersistOutcome } from './consensus-vote-recording.js';
import {
  SUPERMAJORITY_THRESHOLD,
  VOTING_THRESHOLDS,
  type ConsensusAlgorithm,
} from '../../consensus/types-core.js';
import { checkUndeclaredOptions } from './consensus-vote-option-detection.js';

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
 * - `proof_of_learning`: Weighted by agent performance (Issue #103). NOTE: weights come from
 *   recorded voter history, and nothing writes that history today (#5234), so in practice this
 *   currently behaves as simple_majority. The outcome reports `weightBasis: 'unweighted'` when
 *   that is the case (#5117) rather than claiming a weighting that did not happen.
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
 * - `absolute_quorum` (opt-in, #4132): an errored voter DEGRADES the panel
 *   verdict to `no_quorum` instead of being silently dropped from the
 *   denominator. Unlike `fail_closed` (which reports a rejection-flavored void),
 *   `absolute_quorum` reports `no_quorum` — a recoverable "re-run the missing
 *   voice" state that never manufactures `approved` NOR `rejected` from an
 *   induced error. An approval requires ZERO errors, the contrarian (catfish)
 *   present and non-error (unless quick-mode drops it), and an ABSOLUTE approval
 *   count (`ceil(fraction * panelSize)` over the full requested panel — not just
 *   a majority of the responders). A genuine reject (zero errors) still blocks.
 *   The anti-DoS point: a voter you can knock offline can only ever force a
 *   re-run, never flip the verdict.
 *
 * Regardless of policy, a hard floor applies: when errors exceed 50% of
 * total voters, the vote always fails. Catches "all CLIs are down" — a
 * 2-voter consensus is not a real consensus.
 */
export const ErrorPolicySchema = z.enum([
  'reduce_denominator',
  'count_as_abstain',
  'fail_closed',
  'absolute_quorum',
]);

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
  proposal: z
    .string()
    .min(1)
    .max(MAX_PROPOSAL_LENGTH)
    .describe(
      'Proposal text to vote on. If the proposal asks voters to choose among named ' +
        'alternatives, declare them in `options` (#4472) — otherwise the tally records ' +
        'approve/reject/abstain only, so every voter who engages returns `approve` and a 6-1 ' +
        'split on WHICH option persists as 7-0, 100% (#4452). This is ENFORCED AS A WARNING, ' +
        'not a refusal: a heuristic over the proposal text flags an apparent multi-option ' +
        'proposal with no `options` and says so on `panelWarning` (#5360). The wording says ' +
        '"declare", not "MUST", because the warning is what the code actually holds — it is ' +
        'tightened back only in the same change that promotes the warning to a refusal.'
    ),
  options: z
    .array(z.string().min(1).max(200))
    .min(2)
    .max(10)
    .optional()
    .describe(
      'Named alternatives for a multi-option proposal (#4472). When present, the threshold must ' +
        'ALSO be cleared by the leading option, in addition to the ordinary approve/reject bar: ' +
        '`unanimous` requires every approver to have chosen the SAME option, and ' +
        "`supermajority`/`majority` measure the leading option's share of approvers. An " +
        'approving voter whose selection is absent or matches no declared option stays in the ' +
        'denominator and credits no option, so a degraded response can only lower the leading ' +
        'share, never raise it. Omit for an ordinary yes/no vote — behaviour is then unchanged.'
    ),
  threshold: VoteThresholdSchema.optional().describe(
    'Voting threshold (legacy): majority, supermajority, unanimous. Use strategy instead.'
  ),
  strategy: VotingStrategySchema.optional().describe(
    'Voting strategy: simple_majority (default), supermajority, unanimous, proof_of_learning, or higher_order (Bayesian-optimal). ' +
      'NOTE (#4452): thresholds are evaluated over approve/reject/abstain, not over which option a voter chose. On a ' +
      'multi-option proposal even `unanimous` clears trivially — see the `proposal` field description.'
  ),
  errorPolicy: ErrorPolicySchema.optional().describe(
    'How to treat voters that errored or timed out (#2630). Default: fail_closed for unanimous only; reduce_denominator for all other strategies incl. higher_order/opinion_wise (#3138 — a single infra timeout should not void an otherwise-unanimous vote). Opt-in absolute_quorum (#4132): an errored voter — especially the contrarian (catfish) — degrades the verdict to no_quorum (recoverable re-run) instead of being dropped from the denominator; never manufactures approved/rejected from an induced error. Regardless of policy, errors > 50% always fails.'
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
  /** Which declared option this voter chose (#4472). Absent when the proposal
   * declared none, or the voter's selection matched none of them. */
  selectedOption?: string;
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

/**
 * Narrows a response decision to the three-value vocabulary the audit record
 * uses (#4986).
 *
 * The response vocabulary is wider — it carries `timeout` and `pending` too —
 * so the narrowing has to be stated rather than left to a cast:
 *
 * - `timeout` becomes `no_quorum`. A panel that ran out of time reached no
 *   quorum; it did not reject the proposal, and recording it as `rejected`
 *   would attribute a verdict to voters who never gave one.
 * - `pending` returns `undefined`. A vote still in flight has no decision to
 *   record, and inventing one would be worse than falling back.
 */
export function toRecordDecision(
  status: VoteDecisionStatus | undefined
): 'approved' | 'rejected' | 'no_quorum' | undefined {
  switch (status) {
    case 'approved':
    case 'rejected':
    case 'no_quorum':
      return status;
    case 'timeout':
      return 'no_quorum';
    default:
      return undefined;
  }
}

/**
 * Higher-Order Voting metadata (Issue #514).
 *
 * ADVISORY, not the verdict (#4701). Read `appliedToDecision` before drawing
 * any conclusion from the rest of this object.
 */
export interface HigherOrderMetadata {
  posteriorApproval: number;
  posteriorRejection: number;
  effectiveVoteCount: number;
  /**
   * Aggregation used for THIS correlation-aware run — not necessarily the one
   * that produced `decision`. See {@link HigherOrderMetadata.appliedToDecision}.
   */
  method: 'ow' | 'isp' | 'simple';
  usedCorrelationData: boolean;
  improvementOverBaseline: number;
  downweightedAgents: readonly string[];
  reasoning: string;
  /**
   * Whether this correlation-aware result actually produced the response's
   * `decision` (#4701).
   *
   * Currently ALWAYS FALSE. The verdict comes from `ConsensusEngine.close()`,
   * which calls `HigherOrderVotingStrategy.calculateOutcome` — and that calls
   * `aggregateSimpleInternal`, a plain `approve / (approve + reject)` ratio
   * with no correlation input. This object is computed separately and consumed
   * only as metadata plus one escalation check.
   *
   * The field exists because the omission was actively misleading: `method`
   * can read `'ow'` while `downweightedAgents` is non-empty, from which any
   * reasonable reader concludes the correlation analysis decided the vote. It
   * did not — the "seven voters that are really one opinion" case is detected
   * here and then discarded.
   *
   * Making the decision genuinely correlation-aware changes governance
   * outcomes and is tracked separately; this field makes the current state
   * legible in the meantime, including in persisted vote records.
   */
  appliedToDecision: boolean;
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
   * #4472: declared-option outcome, present only when the proposal declared
   * `options`. Separate from `approvalPercentage` — that stays the
   * approve/reject figure — so a caller can tell WHICH bar failed.
   *
   * `unattributedApprovals` is load-bearing, not decoration: a share alone
   * cannot distinguish dissent from absence, since `4 pick X + 3 unparseable`
   * reads 57% exactly like a real 4/3 split.
   */
  optionOutcome?: {
    tally: ReadonlyArray<{ option: string; count: number }>;
    leadingOption?: string;
    leadingShare: number;
    approverCount: number;
    selectedCount: number;
    unattributedApprovals: number;
    thresholdMet: boolean;
    /**
     * #4529: why the gate vetoed, present only when it did. Carried here rather
     * than on `policyReason`, which means "an error policy voided this vote" —
     * a split is a decision, not a void, and conflating them let a retry policy
     * re-roll a panel that had already disagreed.
     */
    vetoReason?: string;
  };
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
  /**
   * #4472: the declared-option tally + verdict, present only when the proposal
   * declared `options`. Reported alongside `approvalPercentage` rather than
   * folded into it, so a reader can tell which bar failed.
   */
  optionGate?: OptionGateVerdict;
  higherOrderResult?: HigherOrderVotingResult;
  /** Reason an error policy short-circuited the vote (#3124); surfaced on the response. */
  policyReason?: string;
  /**
   * #4132: the FULL requested panel size (`roles.length`) — the absolute_quorum
   * predicate in {@link buildResponse} needs it to compute the absolute approval
   * floor `ceil(fraction * panelSize)`. Distinct from `votes.length`, which can
   * differ from the requested panel if the collector ever returns a short list.
   * When absent, the predicate falls back to `votes.length`.
   */
  panelSize?: number;
  /**
   * #4132: whether the contrarian (catfish) was in the requested panel. `--quick`
   * runs a 3-role panel WITHOUT catfish, so the absolute_quorum "contrarian must
   * be present and non-error" clause is skipped when this is false (the quick-mode
   * carve-out). True on the full 7-role panel.
   */
  contrarianRequested?: boolean;
  /**
   * #4135: the response-layer decision (incl. `no_quorum`) for this vote, computed
   * by {@link resolveVoteDecision}. Set by `executeVoting` right before it returns
   * so pipeline consumers (iterative-consensus, agent-executor, the CLI) can honor
   * a `no_quorum` void instead of misreading it as a rejection — WITHOUT recomputing
   * the policy math. The engine `ConsensusResult.outcome` stays 2-valued
   * (`approved`/`rejected`); this is the widened, opt-in-aware view. Absent on
   * results built by paths that never ran `executeVoting` (direct unit calls to
   * `buildResponse`), where consumers fall back to mapping the engine outcome.
   */
  decision?: VoteDecisionStatus;
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

// ============================================================================
// absolute_quorum (#4132)
// ============================================================================

/**
 * #4132: process-wide count of panels that DEGRADED to `no_quorum` under the
 * opt-in `absolute_quorum` policy. The evidence base a future default-flip rests
 * on — how often does an errored voice actually void a real panel? Incremented in
 * {@link buildResponse}; read via {@link getDegradedPanelCount}. There is no
 * metrics bus in this module, so this mirrors the bare module-level counter style
 * used elsewhere (e.g. the correlation-tracker singleton).
 */
let degradedPanelCount = 0;

/** #4132: current degraded-panel count (see {@link degradedPanelCount}). */
export function getDegradedPanelCount(): number {
  return degradedPanelCount;
}

/** #4132: reset the degraded-panel counter. Test-isolation only. @internal */
export function resetDegradedPanelCount(): void {
  degradedPanelCount = 0;
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
  const contrarianOk = contrarianVote !== undefined && contrarianVote.source !== 'error';
  const contrarianDegraded = result.contrarianRequested === true && !contrarianOk;
  if (errorCount === 0 && !contrarianDegraded) return undefined;

  const erroredRoles = result.votes.filter((v) => v.source === 'error').map((v) => v.role);
  const named =
    contrarianDegraded && !erroredRoles.includes('catfish')
      ? [...erroredRoles, 'catfish']
      : erroredRoles;
  const list = named.length > 0 ? named.join(', ') : 'contrarian';
  return `no_quorum: re-run — voter(s) [${list}] errored (absolute_quorum)`;
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
    (v) =>
      v.source !== 'error' && (v.vote.decision === 'approve' || v.vote.decision === 'reject')
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

/**
 * #4132: absolute_quorum response side-effects — increment the degraded-panel
 * telemetry counter and surface the actionable re-run reason on policyReason /
 * panelWarning (when an errored voter degraded the verdict without an upstream
 * short-circuit already setting result.policyReason). Extracted to hold
 * {@link buildResponse} within its cyclomatic budget.
 */
function applyAbsoluteQuorumTelemetry(
  response: ConsensusVoteResponse,
  input: ConsensusVoteInput,
  decision: VoteDecisionStatus,
  degradeReason: string | undefined
): void {
  // The evidence base for a future default-flip: how often does an errored voice
  // actually void a real panel?
  if (input.errorPolicy === 'absolute_quorum' && decision === 'no_quorum') {
    degradedPanelCount++;
  }
  if (degradeReason !== undefined) {
    response.policyReason ??= degradeReason;
    response.panelWarning ??= degradeReason;
  }
}

/**
 * Builds the response from voting result.
 *
 * `voteRecord` (#3991) is the structured authentic-vote-record persistence
 * outcome; when omitted (direct unit calls) `voteRecordPersisted` defaults to
 * `false` with no note. The live handler always supplies it.
 */
/**
 * Name the bar a strategy actually enforces.
 *
 * Derived from {@link VOTING_THRESHOLDS} rather than a second hand-written
 * mapping, so it cannot drift from the value the engine compares against.
 * Strategies that are aliases (`higher_order`, `opinion_wise`) resolve to their
 * own 0.5 entry and therefore report `majority`, which is the point.
 */
function appliedThresholdFor(strategy: VotingStrategy | undefined): VoteThreshold {
  const algorithm: ConsensusAlgorithm = strategy ?? 'simple_majority';
  const bar = VOTING_THRESHOLDS[algorithm];
  if (bar >= 1) return 'unanimous';
  if (bar >= SUPERMAJORITY_THRESHOLD) return 'supermajority';
  return 'majority';
}

export function buildResponse(
  input: ConsensusVoteInput,
  result: ExtendedVotingResult,
  costSummary?: DecisionCostSummary,
  voteRecord?: VoteRecordPersistOutcome
): ConsensusVoteResponse {
  const proposalTruncated =
    input.proposal.length > 200 ? input.proposal.slice(0, 200) + '...' : input.proposal;

  const errorCount = result.votes.filter((v) => v.source === 'error').length;

  // #4053 / #4132: the user-facing decision. An error-policy short-circuit (the
  // >50% hard floor, or fail_closed) VOIDED the vote — that is no_quorum, NOT the
  // panel rejecting. The opt-in absolute_quorum policy (#4132) additionally
  // degrades to no_quorum when ANY voter (especially the contrarian) errored, so
  // an induced error can never manufacture approved/rejected. Every other policy
  // keeps the legacy mapping. `degradeReason` (when present) is the actionable
  // "re-run" message; it rides the response as `policyReason`.
  //
  // #4135 (DRY): `executeVoting` already stamped `result.decision` via THIS same
  // `resolveVoteDecision`. Reuse it so the response decision can't diverge from the
  // one pipeline consumers read; recompute only for the `degradeReason` telemetry
  // and for direct unit calls that bypass `executeVoting` (where `decision` is absent).
  const resolved = resolveVoteDecision(input, result, errorCount);
  const decision = result.decision ?? resolved.decision;
  const { degradeReason } = resolved;

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

  if (result.optionGate !== undefined) {
    const g = result.optionGate;
    response.optionOutcome = {
      tally: g.tally.map((t) => ({ option: t.option, count: t.count })),
      ...(g.leadingOption !== undefined ? { leadingOption: g.leadingOption } : {}),
      leadingShare: g.leadingShare,
      approverCount: g.approverCount,
      selectedCount: g.selectedCount,
      unattributedApprovals: g.unattributedApprovals,
      thresholdMet: g.approved,
      ...(g.reason !== undefined ? { vetoReason: g.reason } : {}),
    };
  }

  applyOptionalResponseFields(response, input, result, errorCount, costSummary);
  applyAbsoluteQuorumTelemetry(response, input, decision, degradeReason);
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
  // #5315: this echoed `input.threshold` verbatim. But `resolveStrategy`
  // ignores `threshold` entirely when `strategy` is also supplied, and
  // `higher_order` carries a 0.5 bar — so a caller passing
  // `strategy: 'higher_order'` + `threshold: 'supermajority'` (the pairing the
  // governance table itself prescribes) got a record naming a bar the vote
  // never had to clear. Observed live at 4-approve/3-reject, 57.1%, reported as
  // `threshold: 'supermajority'`.
  //
  // The field now names the bar the ENGINE enforced, taken from the strategy it
  // actually ran. The record is ratification evidence; it must state what it
  // measured, not what was asked for.
  response.threshold = appliedThresholdFor(result.strategy);
  if (result.policyReason !== undefined) {
    response.policyReason = result.policyReason;
  }
  const panelWarning = panelDegradationWarning(errorCount, result.votes.length);
  if (panelWarning !== undefined) {
    response.panelWarning = panelWarning;
  }
  // #5360: a proposal that names alternatives while `options` is undefined
  // records a split as uniform approval — every voter approves the ACT of
  // deciding, not a side. A 3-3 tie was recorded as `APPROVED 83.3%` that way.
  //
  // The all-approved signal is the sharper half: on a proposal that enumerates a
  // fork it is the observed signature, and unlike a reasoning-variance detector
  // it needs nothing the persisted record drops (#5339).
  //
  // APPENDED, not assigned. `panelWarning` already has two writers and a third
  // that clobbered would silently drop whichever fired first.
  const engaged = result.votes.length - errorCount;
  const undeclared = checkUndeclaredOptions(
    input.proposal,
    input.options,
    engaged > 0 && response.voteCounts.reject === 0 && response.voteCounts.abstain === 0
  );
  if (undeclared.flagged) {
    response.panelWarning =
      response.panelWarning === undefined
        ? undeclared.warning
        : `${response.panelWarning} ${undeclared.warning}`;
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
    // #4701: the engine's `calculateOutcome` decides, and it aggregates simple.
    // Hardcoded false rather than computed, because there is currently no code
    // path where this result reaches the verdict — a computed `false` would
    // imply one exists.
    appliedToDecision: false,
  };
}
