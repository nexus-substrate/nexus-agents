/**
 * Phases 8 & 9: VERIFY and COMMIT
 *
 * Quality verification and Git/GitHub operations for self-development workflow.
 *
 * @module workflows/self-development/phases/verify-commit
 */

import { createLogger, getTimeProvider } from '../../../core/index.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type {
  SelfDevWorkflowState,
  VerifyOutput,
  CommitOutput,
  SelfDevWorkflowResult,
} from '../types.js';
import { runAllVerificationChecks, type VerificationCheckResult } from '../shell-executor.js';
import { attemptAutoMerge } from './auto-merge.js';

const logger = createLogger({ component: 'self-dev-phase-verify-commit' });

/**
 * Error thrown when commit phase cannot proceed due to missing Git/GitHub clients.
 * (Source: Issue #505 - Fail-safe commit)
 */
export class CommitUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `COMMIT phase cannot proceed: ${reason}. ` +
        'To use placeholder fallback (NOT RECOMMENDED), set ' +
        'config.phases.verify.allowPlaceholderFallback = true'
    );
    this.name = 'CommitUnavailableError';
  }
}

/**
 * Parse coverage percentage from test output.
 *
 * Supports common coverage output formats:
 * - Vitest: "All files  |   85.5 |"
 * - Jest/Istanbul: "Statements   : 85.5%"
 * - Simple: "Coverage: 85.5%"
 *
 * @param output - Test command output string
 * @returns Coverage percentage (0-100) or undefined if not found
 */
function parseCoverageFromOutput(output: string): number | undefined {
  // Try Vitest format: "All files  |  85.5 |"
  const vitestMatch = /All files[^|]*\|\s*([\d.]+)\s*\|/i.exec(output);
  if (vitestMatch?.[1] !== undefined) {
    const coverage = parseFloat(vitestMatch[1]);
    if (!isNaN(coverage)) return coverage;
  }

  // Try Jest/Istanbul format: "Statements   : 85.5%"
  const istanbulMatch = /Statements\s*:\s*([\d.]+)%/i.exec(output);
  if (istanbulMatch?.[1] !== undefined) {
    const coverage = parseFloat(istanbulMatch[1]);
    if (!isNaN(coverage)) return coverage;
  }

  // Try simple format: "Coverage: 85.5%" or "coverage: 85.5%"
  const simpleMatch = /coverage[:\s]+([\d.]+)%/i.exec(output);
  if (simpleMatch?.[1] !== undefined) {
    const coverage = parseFloat(simpleMatch[1]);
    if (!isNaN(coverage)) return coverage;
  }

  return undefined;
}

/**
 * Extract coverage from test check results.
 *
 * @param checks - Verification check results
 * @returns Coverage percentage or 0 if not found
 */
function extractCoverageFromChecks(checks: readonly VerificationCheckResult[]): number {
  // Find the test check
  const testCheck = checks.find((c) => c.name === 'test');
  if (testCheck === undefined) return 0;

  // Try to parse from output
  if (testCheck.output !== undefined) {
    const coverage = parseCoverageFromOutput(testCheck.output);
    if (coverage !== undefined) {
      logger.debug('Parsed coverage from test output', { coverage });
      return coverage;
    }
  }

  // Try to parse from error output (coverage might be in stderr)
  if (testCheck.error !== undefined) {
    const coverage = parseCoverageFromOutput(testCheck.error);
    if (coverage !== undefined) {
      logger.debug('Parsed coverage from test error output', { coverage });
      return coverage;
    }
  }

  logger.debug('Coverage not found in test output, using 0');
  return 0;
}

// =============================================================================
// Phase 8: VERIFY
// =============================================================================

/**
 * Execute VERIFY phase - Quality verification checks.
 */
export async function executeVerify(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState
): Promise<VerifyOutput> {
  const startTime = getTimeProvider().now();
  const cwd = state.config.workingDirectory ?? process.cwd();

  const checkResults = await runAllVerificationChecks(cwd);

  const checks = checkResults.map((r) => ({
    name: r.name,
    command: r.command,
    passed: r.passed,
    durationMs: r.durationMs,
    ...(r.output !== undefined && { output: r.output }),
  }));

  const allPassed = checks.every((c) => c.passed);
  const failedChecks = checks.filter((c) => !c.passed);

  logger.info('VERIFY phase completed', {
    allPassed,
    passedCount: checks.filter((c) => c.passed).length,
    totalCount: checks.length,
  });

  // Extract coverage from test output (falls back to 0 if not found)
  const coverage = extractCoverageFromChecks(checkResults);

  const output: VerifyOutput = {
    checks,
    allPassed,
    coverage,
    durationMs: getTimeProvider().now() - startTime,
  };

  if (!allPassed && failedChecks.length > 0) {
    const failedNames = failedChecks.map((c) => c.name).join(', ');
    return { ...output, failureReport: `Failed checks: ${failedNames}` };
  }

  return output;
}

// =============================================================================
// Phase 9: COMMIT
// =============================================================================

/**
 * Generate branch name from issue details.
 */
function generateBranchName(issueNumber: number, issueTitle: string): string {
  const sluggedTitle = issueTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 30);
  return `self-dev/${String(issueNumber)}-${sluggedTitle}`;
}

/**
 * Get issue title for commit message.
 */
function getCommitTitle(outputs: SelfDevWorkflowResult['outputs']): string {
  return outputs.analyze?.selectedIssue.title ?? 'self-development implementation';
}

/**
 * Get issue body snippet for commit message.
 */
function getCommitBody(outputs: SelfDevWorkflowResult['outputs']): string {
  const body = outputs.analyze?.selectedIssue.body;
  return body !== undefined && body.length > 0
    ? body.slice(0, 200)
    : 'Automated implementation from self-development workflow';
}

/**
 * Get close reference for commit message.
 */
function getCloseReference(outputs: SelfDevWorkflowResult['outputs']): string {
  const issue = outputs.analyze?.selectedIssue;
  return issue !== undefined ? `Closes #${String(issue.number)}` : '';
}

/**
 * Build commit message from workflow outputs.
 */
function buildCommitMessage(outputs: SelfDevWorkflowResult['outputs']): string {
  const filesCreated = outputs.implement?.filesCreated.length ?? 0;
  const filesModified = outputs.implement?.filesModified.length ?? 0;

  const parts = [
    `feat(self-dev): ${getCommitTitle(outputs)}`,
    '',
    getCommitBody(outputs),
    '',
    `Files created: ${String(filesCreated)}`,
    `Files modified: ${String(filesModified)}`,
    '',
    getCloseReference(outputs),
    '',
    'Generated by nexus-agents self-development workflow',
  ];

  return parts.filter(Boolean).join('\n');
}

/**
 * Get PR summary from outputs.
 */
function getPRSummary(outputs: SelfDevWorkflowResult['outputs']): string {
  const body = outputs.analyze?.selectedIssue.body;
  return body !== undefined && body.length > 0 ? body.slice(0, 500) : 'Automated implementation';
}

/**
 * Get test plan from outputs.
 */
function getTestPlan(outputs: SelfDevWorkflowResult['outputs']): string {
  return outputs.plan?.plan.testPlan ?? 'See implementation for test coverage';
}

/**
 * Get verification status string.
 */
function getVerifyStatus(verify: VerifyOutput | undefined): string {
  if (verify === undefined) return 'Verification incomplete';
  if (verify.allPassed) return 'All verification checks passed';
  return verify.failureReport ?? 'Some checks failed';
}

/**
 * Build PR body from workflow outputs.
 */
function buildPRBody(outputs: SelfDevWorkflowResult['outputs']): string {
  const filesCreated = outputs.implement?.filesCreated.length ?? 0;
  const filesModified = outputs.implement?.filesModified.length ?? 0;

  const parts = [
    '## Summary',
    getPRSummary(outputs),
    '',
    '## Changes',
    `- Files created: ${String(filesCreated)}`,
    `- Files modified: ${String(filesModified)}`,
    '',
    '## Verification',
    getVerifyStatus(outputs.verify),
    '',
    '## Test Plan',
    getTestPlan(outputs),
    '',
    '---',
    getCloseReference(outputs),
    '',
    'Generated by nexus-agents self-development workflow',
  ];

  return parts.join('\n');
}

/**
 * Execute git operations (create branch, add, commit, push).
 */
async function executeGitOperations(
  deps: SelfDevWorkflowDependencies,
  branch: string,
  outputs: SelfDevWorkflowResult['outputs']
): Promise<{ success: boolean; commitSha: string }> {
  if (deps.gitClient === undefined) {
    logger.info('COMMIT phase: Git client not injected, skipping git operations');
    return { success: false, commitSha: '0000000' };
  }

  logger.info('COMMIT phase: Creating branch and committing', { branch });

  try {
    await deps.gitClient.createBranch(branch);
    await deps.gitClient.checkout(branch);

    const changedFiles = outputs.implement?.filesCreated ?? [];
    const modifiedFiles = outputs.implement?.filesModified ?? [];
    const allFiles = [...changedFiles, ...modifiedFiles];

    if (allFiles.length > 0) {
      await deps.gitClient.add(allFiles);
    }

    const commitMessage = buildCommitMessage(outputs);
    const commitSha = await deps.gitClient.commit(commitMessage);
    await deps.gitClient.push(branch);

    logger.info('COMMIT phase: Git operations complete', { commitSha, branch });
    return { success: true, commitSha };
  } catch (err) {
    const causeError = err instanceof Error ? err : new Error(String(err));
    logger.error('COMMIT phase: Git operations failed', causeError);
    return { success: false, commitSha: '0000000' };
  }
}

/**
 * Create PR using GitHub client.
 */
async function createPullRequest(
  deps: SelfDevWorkflowDependencies,
  branch: string,
  issueNumber: number,
  issueTitle: string,
  outputs: SelfDevWorkflowResult['outputs']
): Promise<{ prNumber: number; prUrl: string }> {
  if (deps.githubClient === undefined) {
    logger.info('COMMIT phase: GitHub client not injected, skipping PR creation');
    return { prNumber: 0, prUrl: '' };
  }

  logger.info('COMMIT phase: Creating pull request');

  try {
    const prTitle = `feat(self-dev): ${issueTitle}`;
    const prBody = buildPRBody(outputs);

    const pr = await deps.githubClient.createPR({
      title: prTitle,
      body: prBody,
      head: branch,
      base: 'main',
    });

    if (issueNumber > 0) {
      await deps.githubClient.addComment(
        issueNumber,
        `Self-development workflow created PR #${String(pr.number)}`
      );
    }

    logger.info('COMMIT phase: PR created', { prNumber: pr.number, prUrl: pr.url });
    return { prNumber: pr.number, prUrl: pr.url };
  } catch (err) {
    const causeError = err instanceof Error ? err : new Error(String(err));
    logger.error('COMMIT phase: PR creation failed', causeError);
    return { prNumber: 0, prUrl: '' };
  }
}

interface PRAndMergeContext {
  deps: SelfDevWorkflowDependencies;
  state: SelfDevWorkflowState;
  outputs: SelfDevWorkflowResult['outputs'];
  branch: string;
  issueNumber: number;
  issueTitle: string;
}

/** Handle PR creation and optional auto-merge after successful git operations. */
async function handlePRAndMerge(
  ctx: PRAndMergeContext
): Promise<{ prNumber: number; prUrl: string; status: 'created' | 'merged' | 'closed' }> {
  const prResult = await createPullRequest(
    ctx.deps,
    ctx.branch,
    ctx.issueNumber,
    ctx.issueTitle,
    ctx.outputs
  );
  const prUrl =
    prResult.prUrl.length > 0
      ? prResult.prUrl
      : `https://github.com/${ctx.state.config.repository}/pull/0`;

  const shouldAutoMerge =
    ctx.state.config.autoMerge === true && ctx.outputs.verify?.allPassed === true;
  if (!shouldAutoMerge) return { prNumber: prResult.prNumber, prUrl, status: 'created' };

  const mergeResult = await attemptAutoMerge(
    ctx.deps,
    prResult.prNumber,
    ctx.state.config.mergeMethod ?? 'squash',
    ctx.issueTitle
  );
  return { prNumber: prResult.prNumber, prUrl, status: mergeResult.merged ? 'merged' : 'created' };
}

/**
 * Check Git client availability and handle failure.
 */
function checkGitClientAvailability(
  deps: SelfDevWorkflowDependencies,
  allowFallback: boolean,
  repository: string,
  branch: string,
  startTime: number
): CommitOutput | null {
  if (deps.gitClient !== undefined) return null;

  if (!allowFallback) {
    throw new CommitUnavailableError('Git client not injected');
  }
  logger.warn(
    'COMMIT phase: Git client not available, using placeholder fallback (NOT RECOMMENDED)'
  );
  return buildPlaceholderCommitOutput(repository, branch, startTime);
}

/**
 * Handle Git operation failure.
 */
function handleGitOperationFailure(
  allowFallback: boolean,
  repository: string,
  branch: string,
  startTime: number
): CommitOutput {
  if (!allowFallback) {
    throw new CommitUnavailableError('Git operations failed');
  }
  logger.warn('COMMIT phase: Git operations failed, using placeholder fallback (NOT RECOMMENDED)');
  return buildPlaceholderCommitOutput(repository, branch, startTime);
}

/**
 * Handle GitHub client unavailability.
 */
function handleGitHubClientUnavailable(
  allowFallback: boolean,
  commitSha: string,
  repository: string,
  branch: string,
  startTime: number
): CommitOutput {
  if (!allowFallback) {
    throw new CommitUnavailableError('GitHub client not injected');
  }
  logger.warn('COMMIT phase: GitHub client not available, skipping PR creation (NOT RECOMMENDED)');
  return {
    branch,
    commitSha,
    prNumber: 0,
    prUrl: `https://github.com/${repository}/pull/0`,
    status: 'created',
    durationMs: getTimeProvider().now() - startTime,
  };
}

/**
 * Execute COMMIT phase - Branch, commit, PR creation, and optional auto-merge.
 *
 * By default, this phase FAILS if Git or GitHub clients are unavailable to prevent
 * workflows from proceeding with placeholder commit/PR data.
 * (Source: Issue #505 - Fail-safe commit)
 */
export async function executeCommit(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState,
  outputs: SelfDevWorkflowResult['outputs']
): Promise<CommitOutput> {
  const startTime = getTimeProvider().now();
  const phaseConfig = state.config.phases?.verify;
  const allowFallback = phaseConfig?.allowPlaceholderFallback === true;
  const issueNumber = outputs.analyze?.selectedIssue.number ?? 0;
  const issueTitle = outputs.analyze?.selectedIssue.title ?? 'self-dev';
  const branch = generateBranchName(issueNumber, issueTitle);
  const repository = state.config.repository;

  // Fail-fast check for Git client (Issue #505)
  const gitClientCheck = checkGitClientAvailability(
    deps,
    allowFallback,
    repository,
    branch,
    startTime
  );
  if (gitClientCheck !== null) return gitClientCheck;

  const gitResult = await executeGitOperations(deps, branch, outputs);
  if (!gitResult.success) {
    return handleGitOperationFailure(allowFallback, repository, branch, startTime);
  }

  // Fail-fast check for GitHub client (Issue #505)
  if (deps.githubClient === undefined) {
    return handleGitHubClientUnavailable(
      allowFallback,
      gitResult.commitSha,
      repository,
      branch,
      startTime
    );
  }

  const prData = await handlePRAndMerge({ deps, state, outputs, branch, issueNumber, issueTitle });
  return {
    branch,
    commitSha: gitResult.commitSha,
    ...prData,
    durationMs: getTimeProvider().now() - startTime,
  };
}

/**
 * Build placeholder commit output when clients are unavailable (NOT RECOMMENDED).
 */
function buildPlaceholderCommitOutput(
  repository: string,
  branch: string,
  startTime: number
): CommitOutput {
  return {
    branch,
    commitSha: '0000000',
    prNumber: 0,
    prUrl: `https://github.com/${repository}/pull/0`,
    status: 'created',
    durationMs: getTimeProvider().now() - startTime,
  };
}
