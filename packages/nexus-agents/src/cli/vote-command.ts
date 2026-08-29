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
import { VOTER_ROLES } from './vote-types.js';
import type { Vote, ConsensusAlgorithm, ConsensusResult } from '../consensus/types.js';
import { DEFAULT_VOTE_TIMEOUT_MS, type AgentVoteResult } from './voter-agents.js';
import { validateTimeout } from '../config/timeouts.js';
import { executeVoting } from '../mcp/tools/consensus-vote.js';
import type { ConsensusVoteInput, VoteDecisionStatus } from '../mcp/tools/consensus-vote-types.js';
import { toRecordDecision } from '../mcp/tools/consensus-vote-types.js';
import { mapOutcomeToDecision } from '../mcp/tools/consensus-vote-types.js';
import { colors, symbols, writeLine } from './ansi-output.js';
import { recordAuthenticVote } from '../mcp/tools/consensus-vote-recording.js';
import { auditLineFor } from './vote-audit-line.js';

function generateVoteHash(role: VoterRole, vote: Vote): VoteHash {
  const data = JSON.stringify({ role, decision: vote.decision, reasoning: vote.reasoning });
  const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  return { role, hash, timestamp: getTimeProvider().nowIso() };
}

function printVoteDetails(votes: readonly AgentVoteResult[]): void {
  writeLine(`${colors.cyan}Votes${colors.reset}\n`);
  for (const v of votes) writeLine(formatVoteRow(v));
  writeLine('');
}

/**
 * Pure formatter for a single voter row. Errors render distinct from
 * simulations so operators don't mistake an auth failure for a successful
 * (if questionable) vote (#2441). @internal — exported for tests only.
 */
export function formatVoteRow(v: AgentVoteResult): string {
  const label = VOTER_ROLES[v.role].split(' - ')[0] ?? v.role;
  if (v.source === 'error') {
    const reason = (v.error ?? 'execution failed').split('\n')[0] ?? 'execution failed';
    return `  ${colors.red}✗${colors.reset} ${label}: ${colors.red}ERROR${colors.reset} — ${reason}`;
  }
  const icon =
    v.vote.decision === 'approve'
      ? colors.green + symbols.check
      : v.vote.decision === 'reject'
        ? colors.red + symbols.cross
        : colors.yellow + '?';
  const tag = v.source === 'simulation' ? ` ${colors.red}[SIMULATED]${colors.reset}` : '';
  return `  ${icon}${colors.reset} ${label}: ${v.vote.decision.toUpperCase()} (${formatPercentage(v.vote.confidence)})${tag}`;
}

interface SummaryContext {
  readonly result: ConsensusResult;
  readonly votes: readonly AgentVoteResult[];
  readonly threshold: ConsensusAlgorithm;
}

function printSummary(ctx: SummaryContext): void {
  const { result, votes, threshold } = ctx;
  const { voteCounts, approvalPercentage, outcome, quorumReached } = result;
  const errored = votes.filter((v) => v.source === 'error').length;
  const simulated = votes.filter((v) => v.source === 'simulation').length;

  writeLine(`${colors.cyan}Summary${colors.reset}\n`);
  writeLine(`  Approve:  ${String(voteCounts.approve)}`);
  writeLine(`  Reject:   ${String(voteCounts.reject)}`);
  writeLine(`  Abstain:  ${String(voteCounts.abstain)}`);
  if (errored > 0) writeLine(`  ${colors.red}Errored:  ${String(errored)}${colors.reset}`);
  writeLine(`  Approval: ${approvalPercentage.toFixed(1)}%`);
  writeLine(`  Threshold: ${threshold}`);

  const outcomeColor =
    outcome === 'approved' ? colors.green : outcome === 'rejected' ? colors.red : colors.yellow;
  const cause = explainOutcome({
    outcome,
    quorumReached,
    errored,
    votes,
    approvalPercentage,
    threshold,
  });
  writeLine(
    `\n${colors.bold}Result: ${outcomeColor}${outcome.toUpperCase()}${colors.reset}${cause}\n`
  );

  if (simulated > 0) {
    // Banner reinforces what individual rows already flagged — visible at a
    // glance even if the operator skips past the per-voter list.
    writeLine(
      `${colors.red}⚠  ${String(simulated)} of ${String(votes.length)} vote(s) were SIMULATED — do not rely on this result for decisions.${colors.reset}\n`
    );
  }
}

export interface OutcomeExplainCtx {
  readonly outcome: string;
  readonly quorumReached: boolean;
  readonly errored: number;
  readonly votes: readonly AgentVoteResult[];
  readonly approvalPercentage: number;
  readonly threshold: ConsensusAlgorithm;
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
  if (ctx.outcome !== 'rejected') return '';
  if (!ctx.quorumReached && ctx.errored > 0) {
    const total = ctx.votes.length;
    const survived = total - ctx.errored;
    return ` ${colors.dim}— quorum not reached (${String(ctx.errored)} of ${String(total)} voter(s) failed; only ${String(survived)} vote(s) recorded)${colors.reset}`;
  }
  if (!ctx.quorumReached) {
    return ` ${colors.dim}— quorum not reached${colors.reset}`;
  }
  // Quorum reached but rejected ⇒ approval threshold wasn't met.
  return ` ${colors.dim}— ${ctx.threshold} threshold not met (got ${ctx.approvalPercentage.toFixed(1)}%)${colors.reset}`;
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
  const output = safeExecSandboxed(`gh issue view ${String(issueNumber)} --json number`, {
    context: 'gh',
  });
  return output !== null;
}

/**
 * Maps a decision to the markdown result label. `no_quorum` (#4135) renders
 * distinctly from a rejection — a quorum void is recoverable ("re-run the missing
 * voice"), NOT the panel rejecting the proposal.
 */
function decisionResultLabel(decision: VoteDecisionStatus): { emoji: string; text: string } {
  switch (decision) {
    case 'approved':
      return { emoji: '✅', text: 'APPROVED' };
    case 'no_quorum':
      return { emoji: '⚠️', text: 'NO QUORUM' };
    default:
      // rejected / timeout / pending — the same ❌ the pre-#4135 formatter used.
      return { emoji: '❌', text: decision.toUpperCase() };
  }
}

/**
 * Formats vote result as markdown comment.
 *
 * `decision` (#4135) is the response-layer decision (incl. `no_quorum`). When
 * omitted, it falls back to mapping the 2-valued engine outcome — so pre-#4135
 * callers get the identical `APPROVED`/`REJECTED` label.
 */
export function formatVoteComment(result: VotingResult, decision?: VoteDecisionStatus): string {
  const now = new Date(getTimeProvider().now()).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const effectiveDecision = decision ?? mapOutcomeToDecision(result.result.outcome);
  const { emoji: outcomeEmoji, text: outcomeText } = decisionResultLabel(effectiveDecision);

  const voteRows = result.votes
    .map(({ role, vote }) => {
      const roleLabel = VOTER_ROLES[role].split(' - ')[0] ?? role;
      const decision = vote.decision.toUpperCase();
      const confidence = formatPercentage(vote.confidence);
      return `| ${roleLabel} | ${decision} | ${confidence} |`;
    })
    .join('\n');

  const { voteCounts, approvalPercentage } = result.result;
  const summary = `Approve: ${String(voteCounts.approve)}, Reject: ${String(voteCounts.reject)}, Abstain: ${String(voteCounts.abstain)} (${approvalPercentage.toFixed(1)}% approval)`;

  return `## Consensus Vote Result

**Date:** ${now} (ET)
**Proposal:** ${result.proposal.slice(0, 200)}${result.proposal.length > 200 ? '...' : ''}
**Threshold:** ${result.threshold}
**Result:** ${outcomeEmoji} **${outcomeText}**

### Vote Details
| Agent | Decision | Confidence |
| ----- | -------- | ---------- |
${voteRows}

**Summary:** ${summary}

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
  result: VotingResult,
  decision?: VoteDecisionStatus
): void {
  const comment = formatVoteComment(result, decision);

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
async function runVote(options: VoteCommandOptions): Promise<
  VotingResult & {
    readonly decision: VoteDecisionStatus;
    readonly strategy: string;
    readonly policyReason?: string;
  }
> {
  // Validate and constrain timeout to allowed range (Issue #607). Done at
  // the CLI boundary so the operator sees the adjustment immediately.
  const requestedTimeoutMs = options.timeoutMs ?? DEFAULT_VOTE_TIMEOUT_MS;
  const { value: timeoutMs, clamped } = validateTimeout(requestedTimeoutMs);
  const timeoutSec = timeoutMs / 1000;

  if (clamped) {
    writeLine(
      `${colors.yellow}Timeout adjusted to ${String(timeoutSec)}s (min: 30s, max: 300s)${colors.reset}\n`
    );
  }

  const useQuick = options.quick === true;
  const roleCount = useQuick ? 3 : 7;
  writeLine(
    `${colors.dim}Collecting votes from ${String(roleCount)} agents (timeout: ${String(timeoutSec)}s each)...${colors.reset}\n`
  );

  const input: ConsensusVoteInput = {
    proposal: options.proposal,
    ...(options.options !== undefined ? { options: [...options.options] } : {}),
    quickMode: useQuick,
    simulateVotes: options.dryRun === true,
    ...(options.threshold !== undefined && { threshold: options.threshold }),
    ...(options.errorPolicy !== undefined && { errorPolicy: options.errorPolicy }),
  };

  const logger = createLogger({ component: 'cli-vote' });
  const result = await executeVoting(input, logger, { voteTimeoutMs: timeoutMs });

  // `ExtendedVotingResult` is a superset of `VotingResult` — return the
  // narrower view since the CLI pretty-printers only consume the base
  // fields and don't render `strategy` / `higherOrderResult`. #4135: also carry
  // the response-layer `decision` (incl. `no_quorum`) so the command can honor a
  // quorum void; fall back to mapping the engine outcome when it's absent.
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
  decision?: VoteDecisionStatus
): void {
  if (options.issueNumber === undefined) return;

  if (options.dryRun === true) {
    writeLine(
      `${colors.yellow}[DRY RUN]${colors.reset} Would record to issue #${String(options.issueNumber)}\n`
    );
  } else {
    recordVoteToGitHub(options.issueNumber, result, decision);
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
  }
): void {
  if (options.dryRun === true) return;
  writeLine(
    auditLineFor(
      recordAuthenticVote({
        proposal: result.proposal,
        strategy: result.strategy,
        result: result.result,
        votes: result.votes,
        // A vote an error policy voided is not a rejection. Without this the
        // chain records `rejected` while the CLI exits `no_quorum` (#4953).
        errorVoided: result.policyReason !== undefined,
        resolvedDecision: toRecordDecision(result.decision),
      })
    )
  );
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
    printVoteDetails(result.votes);
    printSummary({ result: result.result, votes: result.votes, threshold: result.threshold });
    if (options.verbose === true) printHashes(result.votes);
    writeLine(`${colors.dim}Completed in ${String(result.totalTimeMs)}ms${colors.reset}\n`);

    persistToAuditChain(options, result);
    handleRecording(options, result, result.decision);

    return exitCodeForDecision(result.decision, onNoQuorum);
  } catch (error) {
    writeLine(`${colors.red}Error: ${getErrorMessage(error)}${colors.reset}`);
    return 1;
  }
}

export type { VoteCommandOptions, VotingResult } from './vote-types.js';
