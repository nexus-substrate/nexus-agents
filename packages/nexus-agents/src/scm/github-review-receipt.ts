/** Validate the response to the canonical commit-bound GitHub review writer. */
import { z } from 'zod';
import { err, ok, type Result } from '../core/result.js';
import { ScmError, type ScmReviewDecision, type ScmReviewReceipt } from './types.js';

export const REVIEW_DECISIONS = {
  approve: { event: 'APPROVE', state: 'APPROVED' },
  request_changes: { event: 'REQUEST_CHANGES', state: 'CHANGES_REQUESTED' },
  comment: { event: 'COMMENT', state: 'COMMENTED' },
} as const satisfies Record<ScmReviewDecision, { event: string; state: ScmReviewReceipt['state'] }>;

const ReviewReceiptSchema = z.object({
  id: z.number().int().positive(),
  commit_id: z.string().regex(/^[0-9a-f]{40}$/),
  state: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED']),
  user: z.object({
    id: z.number().int().positive(),
    login: z.string().min(1),
    type: z.enum(['User', 'Bot']),
  }),
});

export function parseReviewReceipt(
  raw: string,
  commitId: string,
  decision: ScmReviewDecision
): Result<ScmReviewReceipt, ScmError> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return err(new ScmError('Invalid review receipt JSON', 'github'));
  }
  const parsed = ReviewReceiptSchema.safeParse(value);
  if (!parsed.success) return err(new ScmError('Invalid review receipt fields', 'github'));
  const review = parsed.data;
  if (review.commit_id !== commitId || review.state !== REVIEW_DECISIONS[decision].state) {
    return err(
      new ScmError('Review receipt does not match requested commit and decision', 'github')
    );
  }
  return ok({
    id: review.id,
    commitId: review.commit_id,
    state: review.state,
    reviewerId: review.user.id,
    reviewerLogin: review.user.login,
    reviewerType: review.user.type,
  });
}
