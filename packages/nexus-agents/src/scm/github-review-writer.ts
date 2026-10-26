/** Minimal review capability. All consumers share this POST and the process-wide SCM token cache. */
import { ok, err, type Result } from '../core/result.js';
import {
  ScmError,
  type IScmReviewer,
  type ScmReviewDecision,
  type ScmReviewReceipt,
} from './types.js';
import { execGhApiRaw } from './github-api-transport.js';
import { parseReviewReceipt, REVIEW_DECISIONS } from './github-review-receipt.js';

export type GitHubReviewWriter = Required<
  Pick<IScmReviewer, 'createReview' | 'createReviewAtCommit'>
>;

function postReview(
  repo: string,
  prNumber: number,
  body: string,
  decision: ScmReviewDecision,
  commitId?: string
): Promise<Result<string, ScmError>> {
  const args = [
    'api',
    `repos/${repo}/pulls/${String(prNumber)}/reviews`,
    '--method',
    'POST',
    '-f',
    `body=${body}`,
    '-f',
    `event=${REVIEW_DECISIONS[decision].event}`,
  ];
  if (commitId !== undefined) args.push('-f', `commit_id=${commitId}`);
  return execGhApiRaw(args);
}

/** Same capability as the trait methods, without loading provider or logger modules. */
export function createGitHubReviewWriter(repo: string): GitHubReviewWriter {
  return {
    createReview: async (
      prNumber: number,
      body: string,
      decision: ScmReviewDecision
    ): Promise<Result<void, ScmError>> => {
      const result = await postReview(repo, prNumber, body, decision);
      return result.ok ? ok(undefined) : result;
    },
    createReviewAtCommit: async (
      prNumber: number,
      body: string,
      decision: ScmReviewDecision,
      commitId: string
    ): Promise<Result<ScmReviewReceipt, ScmError>> => {
      if (typeof commitId !== 'string' || !/^[0-9a-f]{40}$/.test(commitId))
        return err(new ScmError('Expected a full lowercase commit identity', 'github'));
      const result = await postReview(repo, prNumber, body, decision, commitId);
      return result.ok ? parseReviewReceipt(result.value, commitId, decision) : result;
    },
  };
}
