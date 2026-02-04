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
import { getTimeProvider, formatPercentage, getErrorMessage } from '../core/index.js';
import { safeExecSandboxed } from './sandbox-exec.js';
import type { VoteCommandOptions, VoterRole, VotingResult, VoteHash } from './vote-types.js';
import { THRESHOLD_MAP, VOTER_ROLES } from './vote-types.js';
import type { Vote, ConsensusAlgorithm, ConsensusResult, Proposal } from '../consensus/types.js';
import { createConsensusEngine } from '../consensus/engine.js';
import {
  collectRealVotes,
  validateTimeout,
  DEFAULT_VOTE_TIMEOUT_MS,
  type AgentVoteResult,
} from './voter-agents.js';
import { colors, symbols, writeLine } from './ansi-output.js';

function generateVoteHash(role: VoterRole, vote: Vote): VoteHash {
  const data = JSON.stringify({ role, decision: vote.decision, reasoning: vote.reasoning });
  const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  return { role, hash, timestamp: getTimeProvider().nowIso() };
}

/**
 * Collects votes from voter agents.
 * Uses real LLM execution when not using simulated votes.
 */
async function collectVotes(
  proposal: string,
  roles: readonly VoterRole[],
  simulateVotes: boolean,
  timeoutMs?: number
): Promise<readonly AgentVoteResult[]> {
  return collectRealVotes({
    roles,
    proposal,
    simulate: simulateVotes,
    ...(timeoutMs !== undefined && { timeoutMs }),
  });
}

function printVoteDetails(votes: readonly AgentVoteResult[]): void {
  writeLine(`${colors.cyan}Votes${colors.reset}\n`);
  for (const { role, vote, source } of votes) {
    const icon =
      vote.decision === 'approve'
        ? colors.green + symbols.check
        : vote.decision === 'reject'
          ? colors.red + symbols.cross
          : colors.yellow + '?';
    const label = VOTER_ROLES[role].split(' - ')[0] ?? role;
    const sourceTag = source === 'llm' ? '' : ` ${colors.dim}[sim]${colors.reset}`;
    writeLine(
      `  ${icon}${colors.reset} ${label}: ${vote.decision.toUpperCase()} (${formatPercentage(vote.confidence)})${sourceTag}`
    );
  }
  writeLine('');
}

function printSummary(result: ConsensusResult, threshold: ConsensusAlgorithm): void {
  const { voteCounts, approvalPercentage, outcome } = result;
  writeLine(`${colors.cyan}Summary${colors.reset}\n`);
  writeLine(`  Approve:  ${String(voteCounts.approve)}`);
  writeLine(`  Reject:   ${String(voteCounts.reject)}`);
  writeLine(`  Abstain:  ${String(voteCounts.abstain)}`);
  writeLine(`  Approval: ${approvalPercentage.toFixed(1)}%`);
  writeLine(`  Threshold: ${threshold}`);
  const outcomeColor =
    outcome === 'approved' ? colors.green : outcome === 'rejected' ? colors.red : colors.yellow;
  writeLine(`\n${colors.bold}Result: ${outcomeColor}${outcome.toUpperCase()}${colors.reset}\n`);
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
 * Escapes special characters for shell command.
 */
function escapeForShell(text: string): string {
  return text.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

/**
 * Formats vote result as markdown comment.
 */
export function formatVoteComment(result: VotingResult): string {
  const now = new Date(getTimeProvider().now()).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const outcomeEmoji = result.result.outcome === 'approved' ? '✅' : '❌';
  const outcomeText = result.result.outcome.toUpperCase();

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
 */
function recordVoteToGitHub(issueNumber: number, result: VotingResult): void {
  const comment = formatVoteComment(result);
  const escapedComment = escapeForShell(comment);

  const output = safeExecSandboxed(
    `gh issue comment ${String(issueNumber)} --body "${escapedComment}"`,
    { context: 'gh' }
  );

  if (output !== null) {
    writeLine(
      `${colors.green}${symbols.check}${colors.reset} Vote recorded to issue #${String(issueNumber)}\n`
    );
  } else {
    writeLine(`${colors.red}Failed to record vote: command denied or failed${colors.reset}\n`);
  }
}

async function runVote(options: VoteCommandOptions): Promise<VotingResult> {
  const threshold = THRESHOLD_MAP[options.threshold ?? 'supermajority'] ?? 'supermajority';
  const useQuick = options.quick === true;
  const roles: readonly VoterRole[] = useQuick
    ? ['architect', 'security', 'pm']
    : ['architect', 'security', 'devex', 'ai_ml', 'pm', 'catfish'];
  const start = getTimeProvider().now();

  // Validate and constrain timeout to allowed range (Issue #607)
  const requestedTimeoutMs = options.timeoutMs ?? DEFAULT_VOTE_TIMEOUT_MS;
  const { value: timeoutMs, clamped } = validateTimeout(requestedTimeoutMs);
  const timeoutSec = timeoutMs / 1000;

  if (clamped) {
    writeLine(
      `${colors.yellow}Timeout adjusted to ${String(timeoutSec)}s (min: 30s, max: 300s)${colors.reset}\n`
    );
  }

  writeLine(
    `${colors.dim}Collecting votes from ${String(roles.length)} agents (timeout: ${String(timeoutSec)}s each)...${colors.reset}\n`
  );
  const votes = await collectVotes(options.proposal, roles, options.dryRun === true, timeoutMs);
  const engine = createConsensusEngine();
  const proposal: Proposal = {
    title: 'CLI Vote',
    description: options.proposal,
    algorithm: threshold,
  };
  const proposalResult = await engine.propose(proposal);
  if (!proposalResult.ok) throw new Error(proposalResult.error.message);
  const proposalId = proposalResult.value;
  for (const { role, vote } of votes) {
    await engine.vote(proposalId, role, vote);
  }
  const resultRes = await engine.close(proposalId);
  if (!resultRes.ok) throw new Error(resultRes.error.message);
  return {
    proposal: options.proposal,
    threshold,
    result: resultRes.value,
    votes,
    totalTimeMs: getTimeProvider().now() - start,
    simulateVotes: options.dryRun === true,
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
function handleRecording(options: VoteCommandOptions, result: VotingResult): void {
  if (options.issueNumber === undefined) return;

  if (options.dryRun === true) {
    writeLine(
      `${colors.yellow}[DRY RUN]${colors.reset} Would record to issue #${String(options.issueNumber)}\n`
    );
  } else {
    recordVoteToGitHub(options.issueNumber, result);
  }
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
  try {
    const result = await runVote(options);
    printVoteDetails(result.votes);
    printSummary(result.result, result.threshold);
    if (options.verbose === true) printHashes(result.votes);
    writeLine(`${colors.dim}Completed in ${String(result.totalTimeMs)}ms${colors.reset}\n`);

    handleRecording(options, result);

    return result.result.outcome === 'approved' ? 0 : 1;
  } catch (error) {
    writeLine(`${colors.red}Error: ${getErrorMessage(error)}${colors.reset}`);
    return 1;
  }
}

export type { VoteCommandOptions, VotingResult } from './vote-types.js';
