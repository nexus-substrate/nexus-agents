/**
 * nexus-agents vote command
 *
 * Automated Consensus Voting per CLAUDE.md Voting Protocol.
 * Spawns 5 voter agents and collects votes using real LLM execution.
 *
 * (Source: Issue #212, Process Automation Epic #209)
 * (Consensus: 7.8/10, 5/5 UNANIMOUS APPROVE)
 *
 * Real Agent Voting (Issue #226):
 * - Execute actual LLM calls for each voter role
 * - Fall back to simulation if model unavailable
 *
 * Vote Recording (Issue #227):
 * - Record vote results as GitHub issue comments
 * - Use --record <issue-number> flag
 */

import * as crypto from 'node:crypto';
import { getTimeProvider, formatPercentage, getErrorMessage, createLogger } from '../core/index.js';
import { safeExecSandboxed } from './sandbox-exec.js';
import type {
  VoteCommandOptions,
  VoterRole,
  VotingResult,
  VoteHash,
  NoQuorumPolicy,
} from './vote-types.js';
import { VOTER_ROLES } from './voter-roles.js';
import type { Vote, ConsensusAlgorithm, ConsensusResult } from '../consensus/types.js';
import { DEFAULT_VOTE_TIMEOUT_MS, type AgentVoteResult } from './voter-agents.js';
import type { ResolvedVoterProject } from './voter-project.js';
import { validateTimeout, VOTE_TIMEOUTS } from '../config/timeouts.js';
import { executeVoting } from '../mcp/tools/consensus-vote.js';
import type {
  ConsensusVoteInput,
  ContrarianCheckStatus,
  ErrorPolicy,
  ExtendedVotingResult,
  VoteDecisionStatus,
} from '../mcp/tools/consensus-vote-types.js';
import { toRecordDecision } from '../mcp/tools/consensus-vote-types.js';
import {
  commentVoteRow,
  contrarianCheckLine,
  contrarianCheckSummaryLine,
  modelsLine,
  projectLine,
  tallySummaryLine,
  type VotingResultWithProject,
} from './vote-summary-lines.js';
import { mapOutcomeToDecision } from '../consensus/decision/verdict.js';
import { colors, symbols, writeLine } from './ansi-output.js';
import { recordAuthenticVote } from '../mcp/tools/consensus-vote-recording.js';
import { persistLines } from './vote-audit-line.js';

function generateVoteHash(role: VoterRole, vote: Vote): VoteHash {
  const data = JSON.stringify({ role, decision: vote.decision, reasoning: vote.reasoning });
  const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  return { role, hash, timestamp: getTimeProvider().nowIso() };
}

function printVoteDetails(votes: readonly AgentVoteResult[], verbose: boolean): void {
  writeLine(`${colors.cyan}Votes${colors.reset}\n`);
  for (const v of votes) writeLine(formatVoteRow(v, { verbose }));
  writeLine('');
}

/**
 * Runaway guard on a single voter's reasoning — NOT an editorial limit.
 *
 * The first version of this clipped at 600 characters, on the theory that seven
 * multi-paragraph rationales would bury the tally. Measured against a real
 * 7-voter panel, every single voter exceeded it and the shortest rationale was
 * 1567 characters, so 600 removed roughly 80% of the median argument rather
 * than trimming verbosity. A blocking dissent was cut mid-sentence and its
 * grounds were unrecoverable, because reasoning never reaches the persisted
 * record (#5339's open half) — which cost a full review round.
 *
 * The concern the clip was for is already handled one level up: reasoning
 * renders only under `--verbose`, and the default panel shows the tally alone.
 * It was a second control on something the flag already controlled. So this
 * bound exists solely to stop a pathological model response from flooding a
 * terminal, is set far above any real rationale, and DISCLOSES itself when it
 * fires rather than trailing off into an ellipsis.
 */
const REASONING_RUNAWAY_GUARD_CHARS = 20_000;

/**
 * Render a voter's grounds beneath its row (#5339).
 *
 * The CLI already held this: `generateVoteHash` hashes `vote.reasoning` to bind
 * the record to the argument, while nothing ever displayed the argument. So a
 * blocking dissent recorded *that* it blocked and not *why*, and the grounds
 * were unrecoverable from any artifact without re-running the whole panel.
 *
 * Reasoning is verbose-only: the default panel is a scannable tally.
 */
function formatReasoning(reasoning: string): string {
  const trimmed = reasoning.trim();
  if (trimmed === '') return '';
  const shown =
    trimmed.length > REASONING_RUNAWAY_GUARD_CHARS
      ? `${trimmed.slice(0, REASONING_RUNAWAY_GUARD_CHARS)}\n[reasoning truncated at ${String(REASONING_RUNAWAY_GUARD_CHARS)} characters]`
      : trimmed;
  const indented = shown
    .split('\n')
    .map((line) => `      ${colors.dim}${line}${colors.reset}`)
    .join('\n');
  return `\n${indented}`;
}

/**
 * The row for a seat that did not judge: errored, or unverifiable (#6094 — a
 * seat that never saw the artifact is not an ABSTAIN; rendering it as one is
 * how a blind seat reads as a considered one). Undefined for a seat that
 * returned a judgment.
 */
function formatAbsentSeatRow(v: AgentVoteResult, label: string): string | undefined {
  if (v.source === 'error') {
    const reason = (v.error ?? 'execution failed').split('\n')[0] ?? 'execution failed';
    return `  ${colors.red}✗${colors.reset} ${label}: ${colors.red}ERROR${colors.reset} — ${reason}`;
  }
  if (v.source === 'unverifiable') {
    return `  ${colors.yellow}?${colors.reset} ${label}: ${colors.yellow}UNVERIFIABLE${colors.reset} — could not read the artifact (${v.unverifiableSignal ?? 'unknown'} signal)`;
  }
  return undefined;
}

/**
 * Pure formatter for a single voter row. Errors render distinct from
 * simulations so operators don't mistake an auth failure for a successful
 * (if questionable) vote (#2441). @internal — exported for tests only.
 */
export function formatVoteRow(v: AgentVoteResult, opts?: { verbose?: boolean }): string {
  const label = VOTER_ROLES[v.role].split(' - ')[0] ?? v.role;
  const absent = formatAbsentSeatRow(v, label);
  if (absent !== undefined) return absent;
  const icon =
    v.vote.decision === 'approve'
      ? colors.green + symbols.check
      : v.vote.decision === 'reject'
        ? colors.red + symbols.cross
        : colors.yellow + '?';
  const tag = v.source === 'simulation' ? ` ${colors.red}[SIMULATED]${colors.reset}` : '';
  // Only a voter that actually returned a judgment has grounds. The error arm
  // above returns before this point, so an errored voter's placeholder vote
  // stub is never rendered as though it had reasoned.
  const grounds = opts?.verbose === true ? formatReasoning(v.vote.reasoning) : '';
  return `  ${icon}${colors.reset} ${label}: ${v.vote.decision.toUpperCase()} (${formatPercentage(v.vote.confidence)})${tag}${grounds}`;
}

interface SummaryContext {
  readonly result: ConsensusResult;
  readonly votes: readonly AgentVoteResult[];
  readonly threshold: ConsensusAlgorithm;
  /**
   * The RESOLVED decision, not the engine's 2-valued outcome.
   *
   * `executeVoting` stamps `decision` without mutating `result.outcome`, and
   * `computeAbsoluteQuorumDecision` can return `no_quorum` while the outcome
   * stays `approved` — an errored seat, or an unmet absolute approval floor.
   * The summary read `outcome`, so a voided vote printed `Result: APPROVED` in
   * green while the audit record, the GitHub comment and the exit code all said
   * `no_quorum`. Every persisted artifact was right and the one a human reads
   * live was wrong, in the laundering direction.
   */
  readonly decision: VoteDecisionStatus;
  /** #5362: present when the option gate drove the rejection. */
  readonly optionGate?: OptionGateExplain;
  /** #6111: the quick-mode contrarian check, which no seat count can carry. */
  readonly contrarianCheck: ContrarianCheckStatus;
  /** #6110: the project the panel judged; `executeVoting` always stamps it. */
  readonly project?: ResolvedVoterProject | undefined;
}

function printSummary(ctx: SummaryContext): void {
  const { result, votes, threshold, decision } = ctx;
  const { voteCounts, approvalPercentage, quorumReached } = result;
  const errored = votes.filter((v) => v.source === 'error').length;
  const simulated = votes.filter((v) => v.source === 'simulation').length;
  const unverifiable = votes.filter((v) => v.source === 'unverifiable').length;

  writeLine(`${colors.cyan}Summary${colors.reset}\n`);
  writeLine(`  Approve:  ${String(voteCounts.approve)}`);
  writeLine(`  Reject:   ${String(voteCounts.reject)}`);
  writeLine(`  Abstain:  ${String(voteCounts.abstain)}`);
  // #6094: always printed, explicit 0 included — an omitted line would read as
  // health. Counted inside Abstain above; this says how many of those never
  // read the artifact.
  writeLine(
    `  ${unverifiable > 0 ? colors.yellow : ''}Unverifiable: ${String(unverifiable)} (of the abstentions; could not read the artifact)${colors.reset}`
  );
  if (errored > 0) writeLine(`  ${colors.red}Errored:  ${String(errored)}${colors.reset}`);
  // #6111: always printed, `ok` included — the check is not a seat, so no
  // count above can carry it.
  writeLine(contrarianCheckSummaryLine(ctx.contrarianCheck));
  writeLine(`  Approval: ${approvalPercentage.toFixed(1)}%`);
  writeLine(`  Threshold: ${threshold}`);
  writeLine(`  ${projectLine(ctx.project)}`);
  // #6115: always printed, zeros included — a collapsed panel read as diverse without it.
  writeLine(`  ${modelsLine(votes)}`);

  // Yellow for a void: it is neither an approval nor the panel rejecting, and
  // the colour is the first thing a human reads.
  const decisionColor =
    decision === 'approved' ? colors.green : decision === 'no_quorum' ? colors.yellow : colors.red;
  const { text: decisionText } = decisionResultLabel(decision);
  const cause = explainOutcome({
    decision,
    quorumReached,
    errored,
    votes,
    approvalPercentage,
    threshold,
    ...(ctx.optionGate === undefined ? {} : { optionGate: ctx.optionGate }),
  });
  writeLine(`\n${colors.bold}Result: ${decisionColor}${decisionText}${colors.reset}${cause}\n`);

  if (simulated > 0) {
    // Banner reinforces what individual rows already flagged — visible at a
    // glance even if the operator skips past the per-voter list.
    writeLine(
      `${colors.red}⚠  ${String(simulated)} of ${String(votes.length)} vote(s) were SIMULATED — do not rely on this result for decisions.${colors.reset}\n`
    );
  }
}

/**
 * The option gate's own account of why it vetoed (#4529), as far as the summary
 * line needs it.
 *
 * Structural rather than importing `OptionGateVerdict`: the CLI only reads the
 * prose and the coverage counts, and a narrower type keeps the display from
 * depending on the gate's full shape.
 *
 * NOT exported. It appears only as a field type on the exported
 * `OutcomeExplainCtx`, which is structural — a caller builds the object literal
 * and never names this type. Exporting it would add a symbol whose only
 * non-test consumer is this file, which the producer/consumer gate (#3024)
 * correctly rejects.
 */
interface OptionGateExplain {
  /** Present only when the gate vetoed an otherwise-approved vote. */
  readonly reason?: string;
  readonly unattributedApprovals: number;
  readonly approverCount: number;
  readonly selectedCount: number;
}

export interface OutcomeExplainCtx {
  /**
   * The RESOLVED decision. Was the engine's 2-valued `outcome`, which cannot
   * express `no_quorum` — so a voided vote got no explanation at all, because
   * every arm below was gated on `outcome === 'rejected'`.
   */
  readonly decision: VoteDecisionStatus;
  readonly quorumReached: boolean;
  readonly errored: number;
  readonly votes: readonly AgentVoteResult[];
  readonly approvalPercentage: number;
  readonly threshold: ConsensusAlgorithm;
  /** #5362: the option gate's veto, when one drove the rejection. */
  readonly optionGate?: OptionGateExplain;
}

/**
 * Names the *reason* a vote was rejected so operators don't see e.g.
 * "Approval: 100% / Result: REJECTED" with no explanation. Issue #2442.
 *
 * Three rejection paths the summary now distinguishes:
 *   1. Quorum failed because voters errored — surfaces the failed count.
 *   2. Quorum failed for any other reason (panel was too small, voters
 *      didn't return a decision in time).
 *   3. Quorum reached but the supermajority/unanimous threshold wasn't met.
 *
 * Exported for tests only.
 * @internal
 */
export function explainOutcome(ctx: OutcomeExplainCtx): string {
  if (ctx.decision === 'no_quorum') {
    // A void is recoverable and its cause is the thing an operator acts on:
    // re-run the missing voice, or lower the bar deliberately.
    return ctx.errored > 0
      ? ` ${colors.dim}— quorum void (${String(ctx.errored)} of ${String(ctx.votes.length)} voter(s) failed); re-run to recover${colors.reset}`
      : ` ${colors.dim}— quorum void: the absolute approval floor was not met by the full panel${colors.reset}`;
  }
  if (ctx.decision !== 'rejected') return '';
  if (!ctx.quorumReached && ctx.errored > 0) {
    const total = ctx.votes.length;
    const survived = total - ctx.errored;
    return ` ${colors.dim}— quorum not reached (${String(ctx.errored)} of ${String(total)} voter(s) failed; only ${String(survived)} vote(s) recorded)${colors.reset}`;
  }
  if (!ctx.quorumReached) {
    return ` ${colors.dim}— quorum not reached${colors.reset}`;
  }
  // #5362: BEFORE the threshold arm. A vote vetoed by the option gate is
  // rejected while its APPROVAL percentage may comfortably clear the bar — the
  // live case printed "supermajority threshold not met (got 83.3%)" against a
  // 67% bar, blaming the one number that did not explain the outcome. Ordering
  // matters for the same reason `osvCoverageNote`'s does (#5018): the specific
  // cause has to be checked first or it falls through to the generic one.
  const gateReason = ctx.optionGate?.reason;
  if (gateReason !== undefined && gateReason !== '') {
    return ` ${colors.dim}— ${gateReason}${unattributedNote(ctx.optionGate)}${colors.reset}`;
  }

  // Quorum reached, no option veto ⇒ the approval threshold genuinely wasn't met.
  return ` ${colors.dim}— ${ctx.threshold} threshold not met (got ${ctx.approvalPercentage.toFixed(1)}%)${colors.reset}`;
}

/**
 * Names the approvals the tally could not attribute.
 *
 * Separate from the gate's own reason because they answer different questions:
 * the reason says which bar failed, this says how much of the panel the tally
 * was measured over. `4 pick X + 3 unparseable` and a real 4/3 split both read
 * 57% on the share alone — which is why `unattributedApprovals` exists on the
 * record, and why the summary should not omit it.
 */
function unattributedNote(gate: OptionGateExplain | undefined): string {
  if (gate === undefined || gate.unattributedApprovals <= 0) return '';
  return (
    ` (${String(gate.selectedCount)} of ${String(gate.approverCount)} approvals carried a` +
    ` usable selection; ${String(gate.unattributedApprovals)} unattributed)`
  );
}

function printHashes(votes: readonly AgentVoteResult[]): void {
  writeLine(`${colors.cyan}Vote Verification Hashes${colors.reset}\n`);
  for (const { role, vote } of votes) {
    const h = generateVoteHash(role, vote);
    writeLine(`  ${role}: ${colors.dim}${h.hash}${colors.reset}`);
  }
  writeLine('');
}

// ============================================================================
// GitHub Vote Recording (Issue #227)
// ============================================================================

/**
 * Validates that a GitHub issue exists and is accessible.
 */
function validateGitHubIssue(issueNumber: number): boolean {
  const command = `gh issue view ${String(issueNumber)} --json number`;
  return safeExecSandboxed(command, { context: 'gh' }) !== null;
}

/**
 * Maps a decision to the markdown result label. `no_quorum` (#4135) renders
 * distinctly from a rejection — a quorum void is recoverable ("re-run the missing
 * voice"), NOT the panel rejecting the proposal.
 */
function decisionResultLabel(decision: VoteDecisionStatus): { emoji: string; text: string } {
  if (decision === 'approved') return { emoji: '✅', text: 'APPROVED' };
  if (decision === 'no_quorum') return { emoji: '⚠️', text: 'NO QUORUM' };
  // rejected / timeout / pending — the same ❌ the pre-#4135 formatter used.
  return { emoji: '❌', text: decision.toUpperCase() };
}

/**
 * Formats vote result as markdown comment.
 *
 * `decision` (#4135) is the response-layer decision (incl. `no_quorum`). When
 * omitted, it falls back to mapping the 2-valued engine outcome — so pre-#4135
 * callers get the identical `APPROVED`/`REJECTED` label.
 *
 * `contrarianCheck` (#6111) is the quick-mode contrarian check. A caller that
 * formats a result without having run the vote never ran the check either, so
 * omission renders as `skipped` — the named empty case, not a default health.
 */
export function formatVoteComment(
  result: VotingResultWithProject,
  decision?: VoteDecisionStatus,
  contrarianCheck: ContrarianCheckStatus = 'skipped'
): string {
  const now = new Date(getTimeProvider().now()).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const effectiveDecision = decision ?? mapOutcomeToDecision(result.result.outcome);
  const { emoji: outcomeEmoji, text: outcomeText } = decisionResultLabel(effectiveDecision);
  const voteRows = result.votes.map(commentVoteRow).join('\n');

  return `## Consensus Vote Result

**Date:** ${now} (ET)
**Proposal:** ${result.proposal.slice(0, 200)}${result.proposal.length > 200 ? '...' : ''}
**Threshold:** ${result.threshold}
**${projectLine(result.project)}**
**Result:** ${outcomeEmoji} **${outcomeText}**

### Vote Details
| Agent | Decision | Confidence |
| ----- | -------- | ---------- |
${voteRows}

**Summary:** ${tallySummaryLine(result)}
**${contrarianCheckLine(contrarianCheck)}**
**${modelsLine(result.votes)}**

---
*Vote conducted per CLAUDE.md Consensus Voting Protocol*`;
}

/**
 * Records vote result to GitHub issue.
 *
 * The comment body is piped to `gh` via stdin (`--body-file -`) rather
 * than embedded in the command string (#2863). The previous `--body
 * '<comment>'` form was rejected by the sandbox `validateArgs` gate for
 * every vote: `formatVoteComment` always emits a markdown table (`|`)
 * and a `(NN% approval)` parenthetical, both of which match the denied
 * shell-metacharacter pattern. Piping keeps the body off the shell
 * entirely — no escaping, no injection surface.
 */
export function recordVoteToGitHub(
  issueNumber: number,
  result: VotingResultWithProject,
  decision?: VoteDecisionStatus,
  contrarianCheck?: ContrarianCheckStatus
): void {
  const comment = formatVoteComment(result, decision, contrarianCheck);

  const output = safeExecSandboxed(`gh issue comment ${String(issueNumber)} --body-file -`, {
    context: 'gh',
    stdin: comment,
  });

  if (output !== null) {
    writeLine(
      `${colors.green}${symbols.check}${colors.reset} Vote recorded to issue #${String(issueNumber)}\n`
    );
  } else {
    writeLine(`${colors.red}Failed to record vote: command denied or failed${colors.reset}\n`);
  }
}

/** The tool input the CLI hands `executeVoting`; each optional flag is present only when given. */
function toVoteInput(options: VoteCommandOptions, quickMode: boolean): ConsensusVoteInput {
  return {
    proposal: options.proposal,
    ...(options.options !== undefined ? { options: [...options.options] } : {}),
    // #6110: `--project`; the resolver validates it and falls through when invalid.
    ...(options.project !== undefined ? { project: options.project } : {}),
    quickMode,
    simulateVotes: options.dryRun === true,
    ...(options.threshold !== undefined && { threshold: options.threshold }),
    // #6227: both bar spellings go through; `resolveStrategy` lets `strategy` win.
    ...(options.strategy !== undefined && { strategy: options.strategy }),
    ...(options.errorPolicy !== undefined && { errorPolicy: options.errorPolicy }),
  };
}

/**
 * Vote runner. Delegates the actual voting flow to `executeVoting` so the
 * CLI and MCP paths share the same: error-policy gate (`reduce_denominator`
 * / `count_as_abstain` / `fail_closed`), >50% hard floor, contrarian
 * escalation on quickMode approvals, higher_order strategy support, and
 * outcome recording for adaptive routing. (DRY pass on top of #2630.)
 *
 * CLI-specific concerns (timeout clamping + diagnostic line) remain here
 * because they belong to the operator UX, not the voting flow itself.
 */
async function runVote(options: VoteCommandOptions): Promise<CliVoteResult> {
  // Validate and constrain timeout to allowed range (Issue #607). Done at
  // the CLI boundary so the operator sees the adjustment immediately.
  const requestedTimeoutMs = options.timeoutMs ?? DEFAULT_VOTE_TIMEOUT_MS;
  const { value: timeoutMs, clamped } = validateTimeout(requestedTimeoutMs);
  const timeoutSec = timeoutMs / 1000;

  if (clamped) {
    // Both bounds are rendered from the constants validateTimeout clamps to.
    // A spelled-out `max: 300s` outlived the ceiling's move to 600 s (#6242).
    const minSec = VOTE_TIMEOUTS.minMs / 1000;
    const maxSec = VOTE_TIMEOUTS.maxMs / 1000;
    writeLine(
      `${colors.yellow}Timeout adjusted to ${String(timeoutSec)}s (min: ${String(minSec)}s, max: ${String(maxSec)}s)${colors.reset}\n`
    );
  }

  const useQuick = options.quick === true;
  const roleCount = useQuick ? 3 : 7;
  writeLine(
    `${colors.dim}Collecting votes from ${String(roleCount)} agents (timeout: ${String(timeoutSec)}s each)...${colors.reset}\n`
  );

  const logger = createLogger({ component: 'cli-vote' });
  const input = toVoteInput(options, useQuick);
  return toCliVoteResult(await executeVoting(input, logger, { voteTimeoutMs: timeoutMs }));
}

/** The view of a vote the CLI printers and recorders consume. */
type CliVoteResult = VotingResult & {
  readonly decision: VoteDecisionStatus;
  readonly strategy: string;
  readonly policyReason?: string;
  /**
   * #5362: `executeVoting` has always returned this; the CLI's narrower
   * return type dropped it, so the summary line could not say that an option
   * veto — not the approval bar — caused a rejection.
   */
  readonly optionGate?: OptionGateExplain;
  /** #6111: the quick-mode contrarian check; `skipped` when it did not run. */
  readonly contrarianCheck: ContrarianCheckStatus;
  /** #6110: the project the panel judged, for the summary and the comment. */
  readonly project?: ResolvedVoterProject | undefined;
  /** #6211: the effective error policy `executeVoting` stamped, for the record. */
  readonly errorPolicy?: ErrorPolicy | undefined;
};

/**
 * `ExtendedVotingResult` is a superset of `VotingResult` — return the
 * narrower view since the CLI pretty-printers only consume the base
 * fields and don't render `higherOrderResult`. #4135: also carry
 * the response-layer `decision` (incl. `no_quorum`) so the command can honor a
 * quorum void; fall back to mapping the engine outcome when it's absent.
 */
function toCliVoteResult(result: ExtendedVotingResult): CliVoteResult {
  return {
    proposal: result.proposal,
    threshold: result.threshold,
    result: result.result,
    votes: result.votes,
    totalTimeMs: result.totalTimeMs,
    simulateVotes: result.simulateVotes,
    decision: result.decision ?? mapOutcomeToDecision(result.result.outcome),
    // Carried past the narrowing above so the audit record states the strategy
    // that was applied. `threshold` is the display value and can differ (#4924).
    strategy: result.strategy,
    // Likewise: an error-policy short-circuit voided the vote, and without it
    // the record calls a void a `rejected` (#4953).
    ...(result.policyReason !== undefined ? { policyReason: result.policyReason } : {}),
    // #5362 widened the RETURN TYPE for this and never added it to the literal,
    // so `explainOutcome`'s gate arm — written to consume it — was unreachable
    // and every option veto fell through to the generic threshold message,
    // blaming an approval bar the vote had cleared. TypeScript stayed silent
    // because the field is optional.
    ...(result.optionGate !== undefined ? { optionGate: result.optionGate } : {}),
    // #6111: `executeVoting` stamps this on every path; the field is optional
    // on its result type only for direct unit constructions, where the check
    // genuinely did not run.
    contrarianCheck: result.contrarianCheck ?? 'skipped',
    ...(result.project !== undefined ? { project: result.project } : {}),
    // #6211: the record states the policy the panel ran under; this is the
    // same narrowing that dropped `optionGate` (#5362), so it is carried
    // explicitly and asserted at the recorder hop.
    ...(result.errorPolicy !== undefined ? { errorPolicy: result.errorPolicy } : {}),
  };
}

function printDryRunBanner(): void {
  writeLine(
    `${colors.yellow}[DRY RUN]${colors.reset} Simulated votes - no actual agent execution\n`
  );
}

/**
 * Validates GitHub issue if recording is requested.
 * Returns false if validation fails, true otherwise.
 */
function validateIssueIfNeeded(issueNumber: number | undefined): boolean {
  if (issueNumber === undefined) return true;

  writeLine(`${colors.dim}Validating issue #${String(issueNumber)}...${colors.reset}`);
  if (!validateGitHubIssue(issueNumber)) {
    writeLine(
      `${colors.red}Error: Issue #${String(issueNumber)} not found or not accessible${colors.reset}\n`
    );
    writeLine(
      `${colors.dim}Ensure you are authenticated with gh CLI and the issue exists.${colors.reset}\n`
    );
    return false;
  }
  writeLine(`${colors.green}${symbols.check}${colors.reset} Issue validated\n`);
  return true;
}

/**
 * Handles recording vote to GitHub or dry-run message.
 */
function handleRecording(
  options: VoteCommandOptions,
  result: VotingResult,
  decision: VoteDecisionStatus,
  contrarianCheck: ContrarianCheckStatus
): void {
  if (options.issueNumber === undefined) return;

  if (options.dryRun === true) {
    writeLine(
      `${colors.yellow}[DRY RUN]${colors.reset} Would record to issue #${String(options.issueNumber)}\n`
    );
  } else {
    recordVoteToGitHub(options.issueNumber, result, decision, contrarianCheck);
  }
}

/**
 * #4135: map a resolved decision to the CLI exit code, honoring `--on-no-quorum`.
 * `approved` → 0; a quorum void → 2 under `exit2`, else 1 (`fail`/`retry`
 * fall-through, back-compat); everything else (a genuine rejection) → 1.
 */
function exitCodeForDecision(decision: VoteDecisionStatus, policy: NoQuorumPolicy): number {
  if (decision === 'approved') return 0;
  if (decision === 'no_quorum') return policy === 'exit2' ? 2 : 1;
  return 1;
}

/**
 * Write the vote to the tamper-evident chain, sharing the MCP path's recorder
 * rather than growing a second one.
 *
 * Skipped for a dry run: `recordAuthenticVote` would decline it anyway, and
 * printing a persistence line for a vote that never happened is its own small
 * misreport.
 */
function persistToAuditChain(
  options: VoteCommandOptions,
  result: VotingResult & {
    readonly strategy: string;
    readonly policyReason?: string;
    // #4986: the resolved three-valued decision `runVote` carries down from
    // `resolveVoteDecision`. Typed here so the record gets the same answer the
    // CLI printed and exited on, rather than a second derivation.
    readonly decision?: VoteDecisionStatus;
    /** #6211: the effective error policy, from the same stamp. */
    readonly errorPolicy?: ErrorPolicy | undefined;
  }
): void {
  if (options.dryRun === true) return;
  const outcome = recordAuthenticVote({
    proposal: result.proposal,
    strategy: result.strategy,
    result: result.result,
    votes: result.votes,
    // #6049: the CLI path had the declared options all along and did not
    // pass them, so its records lost the option fields whenever no
    // selection was parseable -- the same defect as the MCP path.
    declaredOptions: options.options,
    // A vote an error policy voided is not a rejection. Without this the
    // chain records `rejected` while the CLI exits `no_quorum` (#4953).
    errorVoided: result.policyReason !== undefined,
    resolvedDecision: toRecordDecision(result.decision),
    // #6211: the policy the panel ran under, as `executeVoting` resolved it.
    errorPolicy: result.errorPolicy,
    ratifiesPr: options.ratifiesPr,
  });
  for (const line of persistLines(outcome, options.ratifiesPr, result)) writeLine(line);
}

/**
 * Run the vote command.
 */
export async function voteCommand(options: VoteCommandOptions): Promise<number> {
  writeLine(`\n${colors.bold}Nexus Agents Consensus Vote${colors.reset}`);
  writeLine('============================\n');

  if (!validateIssueIfNeeded(options.issueNumber)) return 1;

  if (options.dryRun === true) printDryRunBanner();
  writeLine(
    `${colors.dim}Proposal: ${options.proposal.slice(0, 100)}${options.proposal.length > 100 ? '...' : ''}${colors.reset}\n`
  );
  const onNoQuorum: NoQuorumPolicy = options.onNoQuorum ?? 'fail';
  try {
    let result = await runVote(options);
    // #4135: a quorum void is recoverable (a voice was missing) — under `retry`,
    // re-run the vote ONCE before falling back to `fail`. The plan is unchanged.
    if (result.decision === 'no_quorum' && onNoQuorum === 'retry') {
      writeLine(
        `${colors.yellow}No quorum — re-running the vote once (--on-no-quorum=retry)...${colors.reset}\n`
      );
      result = await runVote(options);
    }
    printVoteDetails(result.votes, options.verbose === true);
    printSummary({
      result: result.result,
      votes: result.votes,
      threshold: result.threshold,
      decision: result.decision,
      ...(result.optionGate === undefined ? {} : { optionGate: result.optionGate }),
      contrarianCheck: result.contrarianCheck,
      project: result.project,
    });
    if (options.verbose === true) printHashes(result.votes);
    writeLine(`${colors.dim}Completed in ${String(result.totalTimeMs)}ms${colors.reset}\n`);

    persistToAuditChain(options, result);
    handleRecording(options, result, result.decision, result.contrarianCheck);

    return exitCodeForDecision(result.decision, onNoQuorum);
  } catch (error) {
    writeLine(`${colors.red}Error: ${getErrorMessage(error)}${colors.reset}`);
    return 1;
  }
}

export type { VoteCommandOptions, VotingResult } from './vote-types.js';
