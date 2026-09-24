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
import {
  DEPRECATED_MODE_ALIAS_INPUT,
  refineDispatchModeAgreement,
} from './async-dispatch-input.js';
import type {
  AgentVoteResult,
  RetriedFrom,
  SeatFallback,
  VotingResult,
} from '../../cli/vote-types.js';
import {
  panelDiversityOf,
  singleFamilyPanelWarning,
  singleModelPanelWarning,
  type PanelDiversity,
} from '../../cli/vote-diversity.js';
import { VOTER_ROLES } from '../../cli/vote-types.js';
import {
  resolveVoterProject,
  VoterProjectInputSchema,
  type ResolvedVoterProject,
} from '../../cli/voter-project.js';
import type { HigherOrderVotingResult } from '../../consensus/higher-order-types.js';
import type { OptionGateVerdict } from './consensus-vote-option-gate.js';
import type { DecisionCostSummary } from '../../observability/decision-cost.js';
import type { VoteRecordPersistOutcome } from './consensus-vote-recording.js';
import { VoteRecordPrBindingSchema } from '../../audit/vote-record.js';
import {
  SUPERMAJORITY_THRESHOLD,
  VOTING_THRESHOLDS,
  type ConsensusAlgorithm,
} from '../../consensus/types-core.js';
import { checkUndeclaredOptions } from './consensus-vote-option-detection.js';
import { resolveVoteDecision } from '../../consensus/decision/verdict.js';
import { UNRESOLVED_MODEL_ID } from '../../config/model-equivalence.js';

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
 * `ERROR_FLOOR_FRACTION` moved to `consensus/decision/thresholds.ts` and
 * `getDefaultErrorPolicy` to `consensus/decision/strategy.ts` (#6000 step 1),
 * so the hard floor and the per-strategy policy default can be governed on
 * their own path. Re-exported here so every existing import keeps resolving.
 */
export { ERROR_FLOOR_FRACTION } from '../../consensus/decision/thresholds.js';
export { getDefaultErrorPolicy } from '../../consensus/decision/strategy.js';

export const ConsensusVoteInputSchema = z
  .object({
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
    project: VoterProjectInputSchema,
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
     * Async dispatch (#3045, Stage 4 of epic #2631). Default `sync` —
     * backward-compat invariant. `async` returns `{ status: 'pending', jobId }`
     * immediately; caller polls `get_job_result(jobId)`. Per-tool cap via
     * `NEXUS_JOB_MAX_CONCURRENT_CONSENSUS_VOTE` (default 2 — voting is
     * 7-fan-out so concurrent jobs multiply adapter load fast).
     *
     * Cancellation semantics (#5393, #6729): when a polling client calls
     * `cancel_job` mid-vote, the job's AbortSignal stops launching voters
     * that have not started and aborts the adapter call of every voter in
     * flight (combined with each seat's own deadline, so a deadline is still
     * recorded as a timeout). The body then settles and releases its
     * async slot. The job record stays `{ status: 'cancelled' }` — a later
     * complete/failed write cannot change it (#4022) — and carries no
     * `result` and no decision: the body stops before the tally, so no
     * verdict is computed and nothing is appended to the vote-record ledger.
     * Once the body settles, the record gains `cancelledPartial:
     * { partialVotes, seatsCast, panelSize }` (#6735): the seats that had
     * cast a vote before the cancel (a seat aborted or never launched is not
     * counted), and how many of the panel that is — `seatsCast: 0` when none
     * had. Sidecar store only; a `NEXUS_JOB_RESULT_SOURCE=task_state` read
     * does not carry it. A poll between the cancel and the body settling
     * sees `cancelled` without the field.
     *
     * The key is `dispatch` (#4968); `mode` is the deprecated alias this tool
     * used to spell it with, resolved as `dispatch ?? mode` by the handler and
     * rejected when the two disagree (the `superRefine` below). Both optional
     * (no `.default()`) so the inferred type doesn't force a value onto every
     * existing call site / test fixture.
     */
    ...DEPRECATED_MODE_ALIAS_INPUT,
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
    /**
     * Governor-path PR ratification binding (#5130 step 1). Set ONLY when this
     * vote ratifies a PR that touches governor-owned paths: the PR number and
     * the FULL head sha the panel reviewed. Bound into the persisted record's
     * self-hash as `ratifiesPr` (schema 1.10), so the caller-commits script
     * (`scripts/append-ratification-record.ts`) can copy the record into the
     * committed ledger and the governor gate (step 2) can require it to name
     * the PR under review at its head. Validated by the same schema the record
     * uses, so producer and ledger cannot disagree on the shape.
     */
    ratifiesPr: VoteRecordPrBindingSchema.optional().describe(
      'Governor-path PR ratification binding (#5130): pr is the PR number and headSha the full 40-hex head sha the panel reviewed. Bound into the authentic vote record so the committed ledger and the governor gate can verify which PR, at which head, this panel ratified. Omit for ordinary votes.'
    ),
    // #4968: `dispatch` and the deprecated `mode` alias must agree when both are sent.
  })
  .superRefine(refineDispatchModeAgreement);

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
  /**
   * Model this seat ran on (Issue #817). Populated since #6606 from the seat's
   * resolved model; absent when the seat resolved none (an errored seat that
   * never reached a model, or the lazy-detection placeholder). Clipped to
   * {@link MODEL_USED_MAX_CHARS} to fit the advertised output schema.
   */
  modelUsed?: string;
  /** Structured rejection categories for reject→refine→re-vote loops (Issue #1213). */
  rejectionCategories?: readonly string[];
  /**
   * True when this seat was recovered by the per-role retry (#6050).
   *
   * Present only when true. A retried seat is weaker evidence than a first-pass
   * one — the model was unavailable or timed out — so a caller reading a panel
   * result should be able to see that "7 of 7 answered" and "6 answered, 1
   * recovered" are different facts.
   */
  retried?: boolean;
  /** Which declared option this voter chose (#4472). Absent when the proposal
   * declared none, or the voter's selection matched none of them. */
  selectedOption?: string;
  /**
   * True when this seat could not read the artifact (#6094). Present only
   * when true. Its `decision` is always `abstain`; `voteCounts.unverifiable`
   * counts these seats separately so a blind seat is never read as a
   * considered abstention.
   */
  unverifiable?: true;
  /**
   * Present only when this seat answered on a different CLI or model than it
   * was assigned (#6115): where it was meant to answer and the adapter error
   * class that moved it. `panelDiversity.fallbacks` counts these seats.
   */
  fallback?: SeatFallback;
  /**
   * Present only when the per-role retry REPLACED this seat (#6246): the first
   * pass's source and, when it had one, its clipped error string. `retried`
   * says a recovery happened; this says what it recovered from.
   */
  retriedFrom?: RetriedFrom;
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
 * Outcome of the quick-mode contrarian check (#6111).
 *
 * In quick mode the contrarian is a separate `executeExpert` call, not a seat
 * in `votes`, so `voteCounts.error` cannot count it: an errored check under
 * `absolute_quorum` yields `no_quorum` with `error: 0`. This names that voice.
 *
 * - `ok` — the check ran and returned a verdict (escalating or not).
 * - `errored` — the check ran and the contrarian voice was NOT obtained.
 * - `skipped` — the check did not run: full-panel mode (catfish is a seat),
 *   simulated votes, a non-approved quick verdict, a posterior-confidence
 *   escalation that pre-empted it, or an error-policy short-circuit.
 */
export const ContrarianCheckStatusSchema = z.enum(['ok', 'errored', 'skipped']);

export type ContrarianCheckStatus = z.infer<typeof ContrarianCheckStatusSchema>;

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
  /**
   * `unverifiable` (#6094) counts seats that answered without reading the
   * artifact. Those seats are ALSO inside `abstain` (their legacy decision);
   * the bucket is always present, explicit 0 included — an absent key would
   * read as health.
   */
  voteCounts: {
    approve: number;
    reject: number;
    abstain: number;
    error: number;
    unverifiable: number;
  };
  /**
   * #6111: the quick-mode contrarian check, reported beside the tally because
   * `voteCounts.error` counts seats and the check is not one. Always present;
   * `skipped` is the named empty case (see {@link ContrarianCheckStatus}).
   */
  contrarianCheck: ContrarianCheckStatus;
  votes: AgentVoteSummary[];
  durationMs: number;
  simulateVotes: boolean;
  /**
   * #6110: the project every voter was told it is judging, and how that name
   * was decided — `input` (the caller's `project`), `derived` (the working
   * directory's `origin` remote or `package.json`), or `default`
   * (`nexus-agents`). Always present: a consuming repository that forgot the
   * input sees `default` next to the verdict instead of a silent mis-scope.
   */
  project: ResolvedVoterProject;
  /**
   * #6258: the working directory every seat was pointed at — the caller's
   * checkout, else the server's `process.cwd()`. Present-only: absent when no
   * live seat ran (a simulated panel) or the result bypassed `executeVoting`.
   */
  workspace?: string;
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
   * #6115: how many distinct models answered and how many seats answered
   * somewhere other than where they were assigned. Always present, explicit
   * zeros included — three consecutive 7-seat panels ran every seat on one
   * model after the claude and codex seats fell over, and the response read
   * identically to a three-model panel. `panelWarning` names a single-model
   * panel of 3+ seats.
   */
  panelDiversity: PanelDiversity;
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
  /**
   * #5130: the persisted record's `id`, present only when
   * {@link voteRecordPersisted} is `true`. The caller-commits script
   * (`scripts/append-ratification-record.ts --record-id`) is keyed on it, and
   * a job result carries it so `--job <jobId>` can find the record. Without
   * it nothing downstream of the vote could name the record it produced.
   */
  voteRecordId?: string;
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
   * #6211: the error policy the panel actually ran under — the EFFECTIVE value
   * `executeVoting` resolved (`input.errorPolicy ?? getDefaultErrorPolicy(strategy)`),
   * stamped on every path it returns through (the short-circuit and the
   * finalized result; an escalated re-vote carries its own). The persisted
   * vote record reads it from here so the ledger states the policy the vote
   * ran under rather than the raw input, which is absent whenever the caller
   * took the default. Absent only on results built by paths that never ran
   * `executeVoting` (direct unit constructions), where no policy was applied.
   */
  errorPolicy?: ErrorPolicy;
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
   * #6111: outcome of the quick-mode contrarian check. Stamped by `executeVoting`
   * on every path (`skipped` when the check did not run). Absent only on results
   * built by paths that never ran `executeVoting` (direct unit calls to
   * `buildResponse`), which `buildResponse` reports as `skipped` — the check
   * genuinely did not run there.
   */
  contrarianCheck?: ContrarianCheckStatus;
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
  /**
   * #6110: the resolved target project, stamped by `executeVoting` alongside
   * `decision` so the CLI and the response disclose the same name and source.
   * Absent only on results built by paths that never ran `executeVoting`.
   */
  project?: ResolvedVoterProject;
  /**
   * #6258: the directory `executeVoting` handed every seat, stamped once per
   * panel. Absent on a simulated panel and on results that bypassed it.
   */
  workspace?: string;
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
    // #6050: a caller acting on the live result sees what the ledger will.
    // Present only when true, so a clean panel's response is unchanged.
    ...(result.retried === true ? { retried: true } : {}),
    // #6094: same rule for a seat that could not read the artifact.
    ...(result.source === 'unverifiable' ? { unverifiable: true as const } : {}),
    // #6115: and for a seat that answered elsewhere.
    ...(result.fallback !== undefined ? { fallback: result.fallback } : {}),
    // #6246: and for what a recovered seat was retried from.
    ...(result.retriedFrom !== undefined ? { retriedFrom: result.retriedFrom } : {}),
    // #6606: the per-seat model was only in `costSummary.perVoter`.
    ...modelUsedOf(result),
  };
}

/** The advertised `votes[].modelUsed` bound in the consensus_vote output schema. */
const MODEL_USED_MAX_CHARS = 100;

/** `{ modelUsed }` for a seat that resolved a model; the placeholder is not one. */
function modelUsedOf(result: AgentVoteResult): { modelUsed?: string } {
  const model = result.model;
  if (model === undefined || model === '' || model === UNRESOLVED_MODEL_ID) return {};
  return {
    modelUsed:
      model.length <= MODEL_USED_MAX_CHARS ? model : `${model.slice(0, MODEL_USED_MAX_CHARS - 1)}…`,
  };
}

/**
 * `mapOutcomeToDecision`, `VoteDecisionOutcome` and `resolveVoteDecision` (with
 * its absolute_quorum and respondent-floor helpers) moved to
 * `consensus/decision/verdict.ts` (#6000 step 1): they are the computation that
 * turns a tally plus an error policy into `approved` / `rejected` /
 * `no_quorum`, and now live where that computation can be governed on its own
 * path. Re-exported here so every existing import keeps resolving.
 */
export {
  mapOutcomeToDecision,
  resolveVoteDecision,
  type VoteDecisionOutcome,
} from '../../consensus/decision/verdict.js';

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
 * Append to `panelWarning` rather than assign: it has several writers and an
 * assignment would silently drop whichever fired first. A `undefined` text is
 * a no-op.
 */
function appendPanelWarning(response: ConsensusVoteResponse, text: string | undefined): void {
  if (text === undefined) return;
  response.panelWarning =
    response.panelWarning === undefined ? text : `${response.panelWarning} ${text}`;
}

/**
 * #6094: seats that answered without reading the artifact. Their abstention
 * is already inside `voteCounts.abstain`; this says how many of those never
 * saw the thing they were asked to judge. Undefined when there are none —
 * the count itself is still rendered as an explicit 0 in `voteCounts`.
 */
function unverifiableSeatsWarning(unverifiableCount: number, total: number): string | undefined {
  if (unverifiableCount <= 0) return undefined;
  return (
    `${String(unverifiableCount)} of ${String(total)} seat(s) could not read the artifact and ` +
    'are recorded as unverifiable (counted as abstain in voteCounts; any decision they returned was discarded).'
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

/**
 * #6111: the contrarian-check status the response reports. `executeVoting`
 * stamps one on every path; a result that never went through it never ran the
 * check, so `skipped` is the truthful name for that absence — not a default
 * standing in for a measurement.
 */
function contrarianCheckFor(result: ExtendedVotingResult): ContrarianCheckStatus {
  return result.contrarianCheck ?? 'skipped';
}

/**
 * The project disclosure for the response (#6110). `executeVoting` stamps the
 * resolution on the result; a direct call that bypassed it (unit tests) gets
 * the SAME resolution recomputed from the input — mirroring how `decision` is
 * handled above — so the field is always present and never a fabricated source.
 */
function disclosedProject(
  input: ConsensusVoteInput,
  result: ExtendedVotingResult
): ResolvedVoterProject {
  const { name, source } =
    result.project ?? resolveVoterProject({ input: input.project, cwd: process.cwd() });
  return { name, source };
}

/**
 * The workspace disclosure for the response (#6258): present-only, like the
 * stamp it copies — no directory is fabricated for a panel that never ran one.
 */
function disclosedWorkspace(result: ExtendedVotingResult): { workspace?: string } {
  return result.workspace === undefined ? {} : { workspace: result.workspace };
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
  const unverifiableCount = result.votes.filter((v) => v.source === 'unverifiable').length;

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
      unverifiable: unverifiableCount,
    },
    contrarianCheck: contrarianCheckFor(result),
    votes: result.votes.map(toAgentVoteSummary),
    durationMs: result.totalTimeMs,
    simulateVotes: result.simulateVotes,
    project: disclosedProject(input, result),
    ...disclosedWorkspace(result),
    // #6115: always present — a panel nobody answered is explicit zeros.
    panelDiversity: panelDiversityOf(result.votes),
    // #3991: surface the authentic-vote-record persistence outcome so a skipped
    // or failed persist is visible to the MCP caller (was WARN-only).
    voteRecordPersisted: voteRecord?.persisted ?? false,
  };
  if (voteRecord !== undefined && !voteRecord.persisted) {
    response.voteRecordNote = voteRecord.detail;
  }
  if (voteRecord?.persisted === true) {
    response.voteRecordId = voteRecord.record.id;
  }

  if (result.optionGate !== undefined) {
    response.optionOutcome = toOptionOutcome(result.optionGate);
  }

  applyOptionalResponseFields(response, input, result, errorCount, costSummary);
  applyAbsoluteQuorumTelemetry(response, input, decision, resolved.degradeReason);
  return response;
}

/** The #4472 declared-option block of the response, from the gate's verdict. */
function toOptionOutcome(
  g: OptionGateVerdict
): NonNullable<ConsensusVoteResponse['optionOutcome']> {
  return {
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
  // #6094: APPENDED, like the undeclared-options warning below — a third
  // writer that assigned would clobber whichever fired first.
  appendPanelWarning(
    response,
    unverifiableSeatsWarning(response.voteCounts.unverifiable, result.votes.length)
  );
  // #6115: a 3+ panel whose every answering seat ran on ONE model. Appended for
  // the same reason as the two above.
  appendPanelWarning(response, singleModelPanelWarning(result.votes));
  // #6606: several models of ONE family — same rule, appended.
  appendPanelWarning(response, singleFamilyPanelWarning(result.votes));
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
  if (undeclared.flagged) appendPanelWarning(response, undeclared.warning);
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
