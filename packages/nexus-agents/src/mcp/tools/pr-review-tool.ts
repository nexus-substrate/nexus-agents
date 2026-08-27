/**
 * nexus-agents/mcp - PR Review Tool (#2233 Child 1)
 *
 * Wires the existing consensus voter infrastructure to GitHub PR review.
 * Reuses `collectRealVotes` from voter-agents.ts; constructs a PR-review-
 * specific proposal that includes the diff, then maps each voter's
 * approve/reject/abstain decision into PR review semantics
 * (approve/request_changes/abstain).
 *
 * NOT a full PR-review platform — this is the smallest valuable demonstration
 * of the multi-voter pattern applied to code review, per the experiment
 * design in #2233. Children 3-6 (verification gate wiring, sample dataset,
 * analysis writeup, live PR enablement) are follow-up work.
 *
 * @module mcp/tools/pr-review-tool
 */

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createLogger,
  formatZodError,
  getErrorMessage,
  type ILogger,
  type IModelAdapter,
} from '../../core/index.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  toolStructuredError,
  toolSuccess,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';
import type { VoterRole } from '../../cli/vote-types.js';
import { collectRealVotes } from '../../cli/voter-agents.js';
import { checkSimulationAllowed, simulationDeniedResult } from './simulation-guard.js';
import { getToolAnnotations } from '../tool-annotations.js';
import { recordDecisionCost } from './decision-cost-recording.js';
import type { DecisionCostSummary } from '../../observability/decision-cost.js';
// #3731 / epic #2631: async-mode dispatch via the shared `runAsJob` helper.
import { runAsJob } from '../jobs/run-as-job.js';
import { FINDINGS_FORMAT_INSTRUCTIONS, type Finding } from './pr-review-findings.js';
import { persistReviewRecord, type PrReviewRecordOutcome } from './pr-review-record-producer.js';
// prettier-ignore
import {
  applyPartialCoverageGate,
  looksLikeUnifiedDiff,
  packDiffForReview,
  type PrReviewCoverage,
} from './pr-review-diff-budget.js';
// #4278: split out of this file to stay under the max-lines budget (no behavior change).
import { toPrReviewVote, summarizeReviews } from './pr-review-result-mapping.js';

export type { Finding, VerificationGate, FindingSeverity } from './pr-review-findings.js';

// ============================================================================
// Constants
// ============================================================================

/** Voter panel for PR review. PM and AI/ML excluded — they're proposal-level
 * roles, not code-level. The 5 here are the ones with concrete claims about
 * code (#2233). */
export const PR_REVIEW_ROLES: readonly VoterRole[] = [
  'architect',
  'security',
  'devex',
  'catfish',
  'scope_steward',
];

/** Voter PANEL budget: the max diff bytes packed into the proposal sent to the
 * 5-voter panel. Diffs above this are NOT rejected — they are security-prioritized
 * and PARTIALLY reviewed (whole-file packing via `pr-review-diff-budget.ts`, #4140).
 * Also the byte cap the canonical `reviewedDiffHash` binds to (unchanged, #3831). */
export const MAX_DIFF_LENGTH = 50_000;
/** DoS bound on `prDiff` INPUT (#4140). Diffs up to this size are ACCEPTED (no
 * hard-fail, no caller-side truncation); those over `MAX_DIFF_LENGTH` are packed
 * to a security-prioritized, partially-reviewed subset. Two-number contract:
 * `MAX_DIFF_INPUT_LENGTH` gates acceptance, `MAX_DIFF_LENGTH` gates the panel. */
export const MAX_DIFF_INPUT_LENGTH = 2_000_000;
/** Max `repoContext` length; over-limit input hard-fails Zod validation (#4133). */
export const MAX_REPO_CONTEXT_LENGTH = 2000;

/** Hard cap on PR description. */
export const MAX_DESCRIPTION_LENGTH = 10_000;

/**
 * Discoverability hint (#3731) appended to sync pr_review error/timeout
 * envelopes. The 5-voter panel runs live LLM calls in parallel and can exceed
 * even the interim 900s per-tool cap; async mode is the durable escape hatch.
 */
const PR_REVIEW_ASYNC_HINT =
  'A pr_review run fans out to 5 live LLM voters and can exceed the synchronous ' +
  "MCP request timeout. Retry with `dispatch: 'async'` to get a jobId immediately, " +
  'then poll get_job_result({ jobId }) for the result.';

// ============================================================================
// Types
// ============================================================================

export const PrReviewInputSchema = z.object({
  prTitle: z.string().min(1).max(500).describe('PR title'),
  prDescription: z
    .string()
    .max(MAX_DESCRIPTION_LENGTH)
    .optional()
    .describe('PR body / description'),
  prDiff: z
    .string()
    .min(1)
    .max(MAX_DIFF_INPUT_LENGTH)
    // #4451: previously length-validated only, so a prose summary produced a
    // full panel review and a `verified: true` governance record that was
    // indistinguishable from a real one — the panel approved a PR that
    // warranted request_changes because it never saw any code. Fail closed on
    // anything without unified-diff structure, per the untrusted-input rule.
    .refine(looksLikeUnifiedDiff, {
      message:
        'prDiff must be a unified diff (expected a `diff --git`, `---`/`+++`, or `@@ … @@` line). ' +
        'Prose descriptions of a change are rejected: a review of a summary is not a review of the code, ' +
        'and would be recorded as though it were (#4451).',
    })
    .describe(
      `Unified diff text (max ${String(MAX_DIFF_INPUT_LENGTH)} chars). REQUIRED SHAPE (#4451): must contain a \`diff --git\` header, an \`@@ … @@\` hunk header backed by +/- lines, or a \`---\`/\`+++\` header pair — a prose summary of the change is REJECTED, because reviewing a summary is not reviewing the code and would be recorded as though it were. (Stated here because Zod refinements do not survive JSON-schema generation, so this constraint is otherwise invisible to clients.) No need to truncate before calling: diffs over ${String(MAX_DIFF_LENGTH)} chars are security-prioritized and PARTIALLY reviewed (lowest-priority whole files dropped; coverage reported on the response, and a partial review can block but never verified-approve).`
    ),
  repoContext: z
    .string()
    .max(MAX_REPO_CONTEXT_LENGTH)
    .optional()
    .describe(
      `Optional one-paragraph repo context (architecture, conventions; max ${String(MAX_REPO_CONTEXT_LENGTH)} chars; trim before calling)`
    ),
  baseRef: z.string().max(200).optional().describe('Base branch ref (e.g. main)'),
  headRef: z.string().max(200).optional().describe('Head branch ref'),
  /**
   * Option-C audit binding (#4031). When BOTH `prNumber` and `baseSha` are
   * supplied AND the review is live (not simulated), pr_review persists an
   * authentic, self-hashed pr-review record binding {prNumber, baseSha,
   * reviewedDiffHash(prDiff), verdict} to the governance ledger — the record the
   * warn-first governor-review gate (#3831) queries. Omit either to skip
   * persistence (a structured `recordOutcome` note explains why). IMPORTANT: for
   * the gate to FIND the record, `prDiff`'s first 50_000 bytes must match the
   * canonical `git diff <baseSha>..<headSha>` the gate recomputes (the hash
   * truncates at that byte cap) — pass the canonical diff, not a reordered one.
   */
  prNumber: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('PR number — with baseSha, enables Option-C audit-record persistence (#4031)'),
  baseSha: z
    .string()
    .regex(/^[0-9a-f]{40}$/, 'baseSha must be a 40-char lowercase hex commit sha')
    .optional()
    .describe(
      '40-hex base commit sha the reviewed diff was computed from (Option-C binding, #4031)'
    ),
  repoPath: z
    .string()
    .max(1024)
    .optional()
    .describe(
      'Repo root path for persisting the governance pr-review record (overrides cwd auto-detection). Must contain a .git ancestor — relative paths are resolved against cwd; ignored (falls back to cwd auto-detection) if it is not a real repo root. Env NEXUS_PR_REVIEW_RECORDS_PATH still takes precedence and is unrestricted.'
    ),
  simulate: z
    .boolean()
    .default(false)
    .describe('Use simulated voters (testing only; never ship live with this true)'),
  /**
   * Error policy (#4132). `standard` (default) keeps the pre-#4132 aggregation:
   * an errored voter is simply excluded from the panel. `absolute_quorum` gates
   * the verified-approve verdict on a COMPLETE, error-free panel with the
   * contrarian (catfish) present and approving — any errored voter (especially
   * catfish) degrades the verdict to a recoverable `{ decision: 'abstain',
   * verified: false }` (the no_quorum analogue; `PrReviewAggregate` has no
   * `no_quorum` state), so an induced voter error can never manufacture a
   * verified approve. A genuine `request_changes` blocker still wins (Tiers 1-2
   * run first).
   */
  errorPolicy: z
    .enum(['standard', 'absolute_quorum'])
    .default('standard')
    .describe(
      "Error policy (#4132). 'standard' (default): errored voters excluded. 'absolute_quorum': any errored voter — esp. the contrarian — degrades a would-be approve to a recoverable abstain (verified:false); never manufactures a verified approve from an induced error."
    ),
  /**
   * Dispatch mode (#3731). `sync` (default) runs the 5-voter panel inline and
   * returns the result — but a live fan-out can exceed the MCP request timeout.
   * `async` returns a `{ status: 'pending', jobId }` envelope immediately and
   * runs the panel in the background; poll `get_job_result({ jobId })` for the
   * result.
   */
  dispatch: z
    .enum(['sync', 'async'])
    .default('sync')
    .describe(
      "Dispatch mode (#3731). 'sync' (default): run inline. 'async': return a jobId immediately + run the panel in background (poll get_job_result)."
    ),
});

export type PrReviewInput = z.infer<typeof PrReviewInputSchema>;

export type PrReviewDecision = 'approve' | 'request_changes' | 'abstain';

export interface PrReviewVote {
  readonly role: VoterRole;
  readonly decision: PrReviewDecision;
  readonly confidence: number;
  /** Free-form reasoning from the voter — full text including the
   * findings YAML block (which is also parsed into `findings` below). */
  readonly reasoning: string;
  /** Structured findings parsed from the voter's reasoning per #2225 +
   * #2233 Child 3. Each Finding has a verification gate output and a
   * derived `verified` boolean. Only verified findings can trigger
   * request_changes — see aggregatePrDecisions. */
  readonly findings: readonly Finding[];
  readonly source: 'llm' | 'simulation' | 'error';
  readonly cli?: string | undefined;
  readonly processingTimeMs: number;
  readonly errorMessage?: string;
}

/** Aggregate decision shape (#2250 Child 7). When `summary` is
 * `request_changes`, `verified` distinguishes high-confidence
 * blockers (≥1 verified finding) from majority-dissent soft blocks
 * (≥3/5 voters request_changes without producing verified findings).
 * Reviewers should apply the verification gate themselves on
 * unverified soft blocks. */
export interface PrReviewAggregate {
  readonly decision: PrReviewDecision;
  readonly verified: boolean;
  /**
   * #4132: set when `absolute_quorum` DEGRADED a would-be verified approve to a
   * recoverable `{ decision: 'abstain', verified: false }` because a voter (esp.
   * the contrarian) errored or the panel was incomplete. `PrReviewAggregate` has
   * no `no_quorum` state, so `abstain`+`verified:false`+`reason` represents it —
   * the actionable "re-run the missing voice" signal. Absent on ungated verdicts.
   */
  readonly reason?: string;
}

export interface PrReviewResponse {
  readonly summary: PrReviewDecision;
  /** True when the request_changes / approve outcome was driven by
   * verified findings or unanimous approval; false when the outcome
   * is a soft signal (majority dissent without verified findings). */
  readonly verified: boolean;
  readonly approveCount: number;
  readonly requestChangesCount: number;
  readonly abstainCount: number;
  readonly errorCount: number;
  readonly reviews: readonly PrReviewVote[];
  readonly totalDurationMs: number;
  /**
   * Per-decision cost rollup (#3855): per-voter / per-model token + USD totals
   * for this governed review. Rides the existing response — no new MCP tool.
   * Totals are a floor when `costSummary.unmeasuredVoters > 0` (voters whose
   * adapter reported no usage are counted as unmeasured, not a measured $0).
   */
  readonly costSummary?: DecisionCostSummary;
  /**
   * Option-C audit-record persistence outcome (#4031). Present on every
   * response: `persisted: true` with the record's binding + sequence when an
   * authentic record was written, otherwise `persisted: false` with the reason.
   */
  readonly recordOutcome?: PrReviewRecordOutcome;
  /**
   * Large-diff review coverage (#4140). Present only when the input diff exceeded
   * `MAX_DIFF_LENGTH` and was security-prioritized + partially reviewed; absent for
   * a whole-diff (≤`MAX_DIFF_LENGTH`) review.
   */
  readonly coverage?: PrReviewCoverage;
}

export interface PrReviewDeps extends BaseMcpToolDeps {
  /**
   * In-process gateway model adapters (#4040) — routes the review panel through
   * the gateway (HTTP, in-process) instead of a CLI subprocess when configured.
   * Omitted ⇒ CLI voter path.
   */
  gatewayAdapters?: readonly IModelAdapter[] | undefined;
}

// ============================================================================
// Decision Mapping
// ============================================================================

/** Maps a voter's approve/reject/abstain to PR review semantics. */
export function mapVoteDecisionToPrDecision(
  voteDecision: 'approve' | 'reject' | 'abstain'
): PrReviewDecision {
  if (voteDecision === 'reject') return 'request_changes';
  return voteDecision;
}

/** Threshold for soft-block aggregation: ≥3 of 5 non-error voters
 * voting request_changes triggers a soft blocker per #2250 Child 7. */
const SOFT_BLOCK_REQUEST_CHANGES_THRESHOLD = 3;

/** Aggregates per-voter decisions into a single summary outcome with a
 * verified/unverified tag (#2250 Child 7).
 *
 * Tiers, in order:
 *
 * 1. **Verified blocker** (`request_changes`, verified=true) — at least
 *    one non-error voter declared `request_changes` AND has at least one
 *    VERIFIED finding (all 4 gate checks passed with substantive
 *    named_assertion). This is the #2225 verification gate.
 * 2. **Soft blocker** (`request_changes`, verified=false) — ≥3 of 5
 *    non-error voters voted `request_changes`, but none produced a
 *    verified finding. The retest in #2241 showed voters reliably
 *    flag diff-readable bugs at this rate even without producing the
 *    YAML structure (#2245 covers why). Tagged unverified so reviewers
 *    apply the verification gate themselves.
 * 3. **Approve** (verified=true) — all non-error voters approve.
 * 4. **Abstain** (verified=true) — anything else; conservative default.
 *
 * Why no "AND has any finding" guard on the soft path: the empirical
 * data in `pr-review-experiment-results-v2.md` showed voters voting
 * request_changes but emitting 0 findings (verified or otherwise).
 * Adding the finding requirement would zero this path out and reproduce
 * the baseline behavior.
 */
export function aggregatePrDecisions(
  reviews: readonly PrReviewVote[],
  errorPolicy: 'standard' | 'absolute_quorum' = 'standard'
): PrReviewAggregate {
  const valid = reviews.filter((r) => r.source !== 'error');
  // #5017: `verified` is a claim about the PANEL, not about the decision, and
  // it is the field a reader of a governance record trusts. An outcome reached
  // over a denominator that excludes voters who could have disagreed cannot
  // support it — including the empty case below, which asserted a complete
  // panel for a vote in which nobody spoke. Decided by consensus vote.
  const complete = (): PrReviewAggregate['verified'] => valid.length === reviews.length;
  const incompleteReason = `incomplete panel: ${String(valid.length)} of ${String(reviews.length)} voters responded`;
  const panelVerdict = (decision: PrReviewAggregate['decision']): PrReviewAggregate =>
    complete()
      ? { decision, verified: true }
      : { decision, verified: false, reason: incompleteReason };

  if (valid.length === 0) return panelVerdict('abstain');

  // Tier 1: verified blocker — ≥1 voter has a verified finding. A genuine
  // request_changes blocker still wins under BOTH policies (runs before the
  // absolute_quorum gate) so a real defect is never masked by a re-run signal.
  const hasVerifiedBlocker = valid.some(
    (r) => r.decision === 'request_changes' && r.findings.some((f) => f.verified)
  );
  if (hasVerifiedBlocker) return { decision: 'request_changes', verified: true };

  // Tier 2: soft blocker — majority dissent without verified findings.
  const requestChangesVoters = valid.filter((r) => r.decision === 'request_changes').length;
  if (requestChangesVoters >= SOFT_BLOCK_REQUEST_CHANGES_THRESHOLD) {
    return { decision: 'request_changes', verified: false };
  }

  // Tier 3: unanimous approve. Under absolute_quorum (#4132) the verified-approve
  // is GATED on a complete, error-free panel with the contrarian (catfish)
  // present and approving — an errored voter (esp. catfish) cannot manufacture a
  // verified approve; it degrades to a recoverable abstain (verified:false), the
  // no_quorum analogue. `valid.every(approve)` alone would silently drop the
  // errored voter from the denominator and rubber-stamp the merge.
  if (valid.every((r) => r.decision === 'approve')) {
    if (errorPolicy === 'absolute_quorum') {
      return absoluteQuorumApprove(reviews, valid);
    }
    // The DECISION still drops the errored voter — that is what `standard`
    // means and #4132 kept it deliberately. Only the completeness claim moves.
    return panelVerdict('approve');
  }

  // Tier 4: ambiguous — abstain.
  return panelVerdict('abstain');
}

/**
 * #4132: the absolute_quorum verified-approve gate. Reached only when every
 * non-error voter approved. Requires ZERO errors, a COMPLETE panel
 * (`valid.length === PR_REVIEW_ROLES.length`), and the contrarian (catfish)
 * present-and-approving. Any shortfall degrades to a recoverable
 * `{ decision: 'abstain', verified: false, reason }` — the no_quorum analogue.
 */
function absoluteQuorumApprove(
  reviews: readonly PrReviewVote[],
  valid: readonly PrReviewVote[]
): PrReviewAggregate {
  const errorCount = reviews.length - valid.length;
  const erroredRoles = reviews.filter((r) => r.source === 'error').map((r) => r.role);
  const catfish = valid.find((r) => r.role === 'catfish');
  const catfishApproved = catfish?.decision === 'approve';
  const panelComplete = valid.length === PR_REVIEW_ROLES.length;

  if (errorCount > 0 || !catfishApproved || !panelComplete) {
    const missing = catfishApproved ? [] : ['catfish'];
    const named = [...erroredRoles, ...missing];
    const list = named.length > 0 ? named.join(', ') : 'incomplete panel';
    return {
      decision: 'abstain',
      verified: false,
      reason: `no_quorum: re-run — voter(s) [${list}] errored/missing (absolute_quorum)`,
    };
  }
  return { decision: 'approve', verified: true };
}

// ============================================================================
// Proposal Construction
// ============================================================================

/** Builds the proposal text passed to voters. The voters are designed for
 * yes/no proposals — by framing the diff as "should this PR be merged?" we
 * get usable output without needing new system prompts (Child 3 will add
 * those). */
export function buildPrReviewProposal(
  input: Pick<
    PrReviewInput,
    'prTitle' | 'prDescription' | 'prDiff' | 'repoContext' | 'baseRef' | 'headRef'
  >
): string {
  const parts: string[] = [];
  parts.push(`# Pull Request Review\n`);
  parts.push(`**Title:** ${input.prTitle}\n`);

  if (input.baseRef !== undefined && input.headRef !== undefined) {
    parts.push(`**Branches:** ${input.headRef} → ${input.baseRef}\n`);
  }
  if (input.repoContext !== undefined && input.repoContext !== '') {
    parts.push(`\n**Repo context:**\n${input.repoContext}\n`);
  }
  if (input.prDescription !== undefined && input.prDescription !== '') {
    parts.push(`\n**Description:**\n${input.prDescription}\n`);
  }

  parts.push(`\n## Diff\n\n\`\`\`diff\n${input.prDiff}\n\`\`\`\n`);
  parts.push(`\n## Your task\n`);
  parts.push(`Review this PR from your role's perspective. Decide: should it be merged as-is?\n`);
  parts.push(`- **APPROVE** if the diff is correct, complete, and aligned with your role.\n`);
  parts.push(
    `- **REJECT** (= "request changes") if there is at least one concrete defect, missing requirement, or violation that justifies blocking the merge.\n`
  );
  parts.push(`- **ABSTAIN** if the diff is outside your role's concerns.\n`);
  parts.push(`\n${FINDINGS_FORMAT_INSTRUCTIONS}\n`);

  return parts.join('');
}

// ============================================================================
// Handler
// ============================================================================

/**
 * Aggregate the panel, emit telemetry, and apply the #4140 C1 gate. Under
 * absolute_quorum (#4132) an errored/incomplete panel degrades a would-be approve to
 * a recoverable abstain (logged). Then the C1 gate bars a PARTIAL review from a
 * verified-approve (degrade to the same no_quorum shape) while a genuine blocker from
 * a reviewed file still wins — reference inequality signals the degrade for logging.
 */
function resolveAggregate(
  reviews: readonly PrReviewVote[],
  input: PrReviewInput,
  errorCount: number,
  coverage: PrReviewCoverage | undefined,
  logger: ILogger
): PrReviewAggregate {
  const preGate = aggregatePrDecisions(reviews, input.errorPolicy);
  if (preGate.reason !== undefined) {
    logger.warn('pr_review degraded to no_quorum under absolute_quorum (#4132)', {
      reason: preGate.reason,
      errorCount,
    });
  }
  const aggregate = applyPartialCoverageGate(preGate, coverage);
  if (aggregate !== preGate) {
    logger.warn(
      'pr_review partial review barred from verified-approve — degraded to no_quorum (#4140)',
      { reason: aggregate.reason }
    );
  }
  return aggregate;
}

/**
 * #4140 large-diff affordance: within budget → byte-identical proposal (no pack, no
 * note, `coverage: undefined`); over budget → security-first packed subset with a
 * prepended partial-review NOTE. Logs an over-budget warning when partial.
 */
function preparePanelProposal(
  input: PrReviewInput,
  logger: ILogger
): { proposal: string; coverage: PrReviewCoverage | undefined } {
  const { coverage, packedDiff, note } = packDiffForReview(input.prDiff, MAX_DIFF_LENGTH);
  const body = coverage === undefined ? input : { ...input, prDiff: packedDiff };
  if (coverage?.partial === true) {
    logger.warn(
      `pr_review diff over budget — reviewed ${String(coverage.reviewedFiles)} of ${String(coverage.totalFiles)} files, dropped ${String(coverage.droppedFiles.length)}`
    );
  }
  return { proposal: note + buildPrReviewProposal(body), coverage };
}

async function executePrReviewBody(
  input: PrReviewInput,
  logger: ILogger,
  gatewayAdapters?: readonly IModelAdapter[]
): Promise<ToolResult> {
  const start = Date.now();
  const { proposal, coverage } = preparePanelProposal(input, logger);
  const voteResults = await collectRealVotes({
    roles: PR_REVIEW_ROLES,
    proposal,
    simulate: input.simulate,
    logger,
    ...(gatewayAdapters !== undefined && { gatewayAdapters }),
  });

  const reviews = voteResults.map(toPrReviewVote);
  const counts = summarizeReviews(reviews);
  const aggregate = resolveAggregate(reviews, input, counts.errorCount, coverage, logger);

  // #3855: roll up + persist this review's per-voter cost and ride it on the
  // existing response (no new MCP tool). Best-effort — a rollup failure must
  // not fail the review.
  let costSummary: DecisionCostSummary | undefined;
  try {
    costSummary = recordDecisionCost({
      decisionId: `pr-${randomUUID().slice(0, 8)}`,
      gate: 'pr_review',
      votes: voteResults,
    });
  } catch (costError) {
    logger.warn('Per-decision cost rollup failed (non-fatal)', {
      error: getErrorMessage(costError),
    });
  }

  // #4031: best-effort Option-C audit-record persistence. The producer surfaces
  // every non-persist (binding absent / simulated / no quorum / write-failed) as
  // a structured outcome and never throws — an audit sink must not break the
  // review it observes.
  const recordOutcome = persistReviewRecord({
    // #4459: `input.prDiff` is opaque MCP input — it passed the unified-diff
    // shape gate (#4451), but nothing here establishes it is the PR's real diff.
    diffSource: 'caller-supplied',
    input,
    aggregate,
    counts,
    reviewCount: reviews.length,
    logger,
    ...(coverage !== undefined ? { coverage } : {}),
  });

  const response: PrReviewResponse = {
    summary: aggregate.decision,
    verified: aggregate.verified,
    ...counts,
    reviews,
    totalDurationMs: Date.now() - start,
    ...(costSummary !== undefined ? { costSummary } : {}),
    recordOutcome,
    ...(coverage !== undefined ? { coverage } : {}),
  };
  return toolSuccess(JSON.stringify(response, null, 2));
}

/**
 * Build the pr_review handler, capturing the in-process gateway adapters (#4040)
 * so the review panel routes through the gateway instead of a CLI subprocess
 * when one is configured.
 */
function makePrReviewHandler(gatewayAdapters?: readonly IModelAdapter[]) {
  return async function prReviewHandler(args: unknown, ctx: HandlerContext): Promise<ToolResult> {
    const parsed = PrReviewInputSchema.safeParse(args);
    if (!parsed.success) {
      return toolStructuredError({
        errorCategory: 'validation',
        message: `Validation error: ${formatZodError(parsed.error)}`,
      });
    }
    const input = parsed.data;
    // #4170: simulate fails CLOSED outside test runners — BEFORE the try block
    // (its catch categorizes as `internal`) and BEFORE the async dispatch
    // (sync and async modes must reject identically). Simulated review panels
    // feed the same collectRealVotes → createSimulatedVotes machinery as
    // consensus_vote, so they get the identical gate.
    if (input.simulate) {
      const simCheck = checkSimulationAllowed('pr_review', ctx.logger);
      if (!simCheck.allowed) return simulationDeniedResult(simCheck.reason);
    }

    try {
      // #3731: async dispatch — the 5-voter live fan-out can exceed the MCP
      // request timeout. pr_review has no sessionId, so a fresh `pr-<uuid>` jobId
      // is always minted (no idempotency surface). Returns a pending envelope.
      if (input.dispatch === 'async') {
        return runAsJob<PrReviewInput, ToolResult>({
          toolName: 'pr_review',
          input,
          freshJobId: () => `pr-${randomUUID()}`,
          run: () => executePrReviewBody(input, ctx.logger, gatewayAdapters),
          logger: ctx.logger,
        });
      }
      return await executePrReviewBody(input, ctx.logger, gatewayAdapters);
    } catch (error) {
      // #3731 discoverability: a sync run that times out (or otherwise fails)
      // should point the caller at async mode — the durable fix for runs that
      // exceed the request timeout.
      return toolStructuredError({
        errorCategory: 'internal',
        message: `${PR_REVIEW_ASYNC_HINT} PR review failed: ${getErrorMessage(error)}`,
      });
    }
  };
}

// ============================================================================
// Registration
// ============================================================================

/** @category MCP */
export function registerPrReviewTool(server: McpServer, deps: PrReviewDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'pr_review' });
  const description =
    'Run multi-voter consensus review on a PR diff (#2233). 5 voters (architect, security, ' +
    'devex, catfish, scope_steward) each emit approve/request_changes/abstain with reasoning ' +
    'and citations. Reuses consensus_vote infra; experimental.';

  const secureHandler = createSecureHandler(makePrReviewHandler(deps.gatewayAdapters), {
    toolName: 'pr_review',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const timeoutMs = getToolTimeout('pr_review', deps.security);
  const wrappedHandler = wrapToolWithTimeout('pr_review', secureHandler, { timeoutMs, logger });

  server.registerTool(
    'pr_review',
    {
      description,
      inputSchema: PrReviewInputSchema.shape,
      annotations: getToolAnnotations('pr_review'),
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered pr_review tool');
}
