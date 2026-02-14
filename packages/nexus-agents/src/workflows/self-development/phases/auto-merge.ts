/**
 * Auto-Merge Logic
 *
 * Handles CI check polling and automatic PR merging for the self-development workflow.
 *
 * @module workflows/self-development/phases/auto-merge
 */

import { createLogger, getTimeProvider } from '../../../core/index.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../../../config/timeouts.js';

const logger = createLogger({ component: 'self-dev-auto-merge' });

/** Maximum wait time for CI checks. */
const MAX_CI_WAIT_MS = CLI_SUBPROCESS_TIMEOUTS.ciWaitMaxMs;

/** Poll interval for CI checks. */
const CI_POLL_INTERVAL_MS = CLI_SUBPROCESS_TIMEOUTS.ciPollIntervalMs;

/**
 * Wait for PR checks to pass before merging.
 */
export async function waitForChecks(
  deps: SelfDevWorkflowDependencies,
  prNumber: number,
  timeoutMs: number = MAX_CI_WAIT_MS
): Promise<{ ready: boolean; reason?: string }> {
  if (deps.githubClient === undefined) {
    return { ready: false, reason: 'GitHub client not available' };
  }

  const startTime = getTimeProvider().now();
  let lastStatus: { checksStatus: string; reviewStatus: string } | undefined;

  while (getTimeProvider().now() - startTime < timeoutMs) {
    const status = await deps.githubClient.getPRStatus(prNumber);
    lastStatus = status;

    if (!status.mergeable) {
      return { ready: false, reason: 'PR has merge conflicts' };
    }

    if (status.checksStatus === 'failure') {
      return { ready: false, reason: 'CI checks failed' };
    }

    if (status.reviewStatus === 'changes_requested') {
      return { ready: false, reason: 'Changes requested in review' };
    }

    if (status.checksStatus === 'success') {
      logger.info('CI checks passed, PR ready to merge');
      return { ready: true };
    }

    logger.debug('Waiting for CI checks', { status });
    await new Promise((resolve) => setTimeout(resolve, CI_POLL_INTERVAL_MS));
  }

  return {
    ready: false,
    reason: `Timeout waiting for CI (last status: ${lastStatus?.checksStatus ?? 'unknown'})`,
  };
}

/**
 * Attempt to auto-merge the PR.
 */
export async function attemptAutoMerge(
  deps: SelfDevWorkflowDependencies,
  prNumber: number,
  mergeMethod: 'merge' | 'squash' | 'rebase',
  issueTitle: string
): Promise<{ merged: boolean; reason?: string }> {
  if (deps.githubClient === undefined) {
    return { merged: false, reason: 'GitHub client not available' };
  }

  if (prNumber === 0) {
    return { merged: false, reason: 'No PR to merge' };
  }

  logger.info('Waiting for CI checks before merge', { prNumber });

  const checkResult = await waitForChecks(deps, prNumber);
  if (!checkResult.ready) {
    logger.info('Cannot auto-merge', { reason: checkResult.reason });
    return {
      merged: false,
      ...(checkResult.reason !== undefined && { reason: checkResult.reason }),
    };
  }

  try {
    await deps.githubClient.mergePR(prNumber, {
      method: mergeMethod,
      commitTitle: `feat(self-dev): ${issueTitle} (#${String(prNumber)})`,
      deleteBranch: true,
    });

    logger.info('PR auto-merged', { prNumber, mergeMethod });
    return { merged: true };
  } catch (err) {
    const causeError = err instanceof Error ? err : new Error(String(err));
    logger.error('Auto-merge failed', causeError);
    return { merged: false, reason: causeError.message };
  }
}
