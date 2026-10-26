/** Fixed-content single-attempt experiment. This module cannot merge a PR. */
import { z } from 'zod';
import { canaryFailureCause } from './native-approval-canary-diagnostics.js';
import type { CanaryFailureCause } from './native-approval-canary-diagnostics.js';
import { createHash } from 'node:crypto';
import type { IScmReviewer, ScmReviewReceipt } from '../scm/types.js';
import { assessNativeApprovalCanary, NATIVE_CANARY_POLICY as P } from './native-approval-canary.js';
import type { NativeCanaryEvidence as Evidence } from './native-approval-canary.js';
import { collectCanaryEvidence } from './native-approval-canary-github.js';
import type { CanaryRead } from './native-approval-canary-read.js';

interface CanaryExecutionInput {
  read: CanaryRead;
  reviewer: Pick<IScmReviewer, 'createReviewAtCommit'>;
  invocation: Evidence['invocation'];
  expected: Evidence['expected'];
  governor: Evidence['governor'];
}
export interface NativeCanaryObservation {
  status: 'eligible' | 'ineligible' | 'unmeasured';
  headSha: string;
  baseSha: string;
  reviewDecision: string | null;
  mergeStateStatus: string;
}
export interface CanaryExecutionResult {
  status: 'refused' | 'unmeasured' | 'eligible' | 'ineligible';
  reason: string;
  diagnostic?: CanaryFailureCause;
  writeAttempted: boolean;
  reviewId?: number;
  receipt?: ScmReviewReceipt;
  baseline?: NativeCanaryObservation;
  readback?: NativeCanaryObservation;
  before?: Evidence;
  after?: Evidence;
  beforeSha256?: string;
  afterSha256?: string;
}
const BODY =
  'Automated native approval eligibility experiment (#7621). Fixed-content canary only. ' +
  'This is not a product-code review, governor ratification, or permission to merge. Close this PR unmerged.';
const NativeStatus = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        headRefOid: z.string(),
        baseRefOid: z.string(),
        state: z.literal('OPEN'),
        isDraft: z.literal(false),
        merged: z.literal(false),
        autoMergeRequest: z.null(),
        reviewDecision: z.string().nullable(),
        mergeStateStatus: z.string(),
      }),
    }),
  }),
  errors: z.never().optional(),
});
const QUERY = `query($number:Int!){repository(owner:"nexus-substrate",name:"nexus-agents"){
  pullRequest(number:$number){headRefOid baseRefOid state isDraft merged autoMergeRequest{enabledAt}
    reviewDecision mergeStateStatus}}}`;
const digest = (e: Evidence): string =>
  createHash('sha256').update(JSON.stringify(e)).digest('hex');

function observedBefore(
  before: Evidence | undefined
): Pick<CanaryExecutionResult, 'before' | 'beforeSha256'> {
  return before === undefined ? {} : { before, beforeSha256: digest(before) };
}

function expectedReceipt(receipt: ScmReviewReceipt, head: string): boolean {
  return (
    Number.isSafeInteger(receipt.id) &&
    receipt.id > 0 &&
    receipt.commitId === head &&
    receipt.state === 'APPROVED' &&
    receipt.reviewerId === P.reviewerId &&
    receipt.reviewerLogin === P.reviewerLogin &&
    receipt.reviewerType === 'Bot'
  );
}

function readbackPolicy(before: Evidence, after: Evidence, receipt: ScmReviewReceipt): boolean {
  const actual = after.reviews.items.filter((r) => r.id === receipt.id);
  const r = actual[0];
  if (
    actual.length !== 1 ||
    r?.authorId !== receipt.reviewerId ||
    r.authorLogin !== receipt.reviewerLogin ||
    r.authorType !== 'Bot' ||
    r.state !== receipt.state ||
    r.commitSha !== receipt.commitId
  )
    return false;
  if (before.protection.snapshotSha256 !== after.protection.snapshotSha256) return false;
  // Exclude only the independently read-back review just created by this experiment.
  // The original evidence is retained; all competing reviews still reach the guard.
  return (
    assessNativeApprovalCanary({
      ...after,
      reviews: {
        ...after.reviews,
        items: after.reviews.items.filter((item) => item.id !== receipt.id),
      },
    }).status === 'allowed'
  );
}

async function nativeReadback(
  read: CanaryRead,
  expected: Evidence['expected']
): Promise<NativeCanaryObservation> {
  const raw = await read([
    'api',
    'graphql',
    '-f',
    `query=${QUERY}`,
    '-F',
    `number=${String(expected.pr)}`,
  ]);
  const pr = NativeStatus.parse(raw).data.repository.pullRequest;
  let status: NativeCanaryObservation['status'] = 'unmeasured';
  if (pr.headRefOid === expected.headSha && pr.baseRefOid === expected.baseSha) {
    if (pr.reviewDecision === 'APPROVED' && pr.mergeStateStatus === 'CLEAN') status = 'eligible';
    if (pr.reviewDecision === 'REVIEW_REQUIRED' && pr.mergeStateStatus === 'BLOCKED')
      status = 'ineligible';
  }
  return {
    status,
    headSha: pr.headRefOid,
    baseSha: pr.baseRefOid,
    reviewDecision: pr.reviewDecision,
    mergeStateStatus: pr.mergeStateStatus,
  };
}

async function measureReadback(
  input: CanaryExecutionInput,
  before: Evidence,
  receipt: ScmReviewReceipt,
  baseline: NativeCanaryObservation
): Promise<CanaryExecutionResult> {
  const after = await collectCanaryEvidence(
    input.read,
    input.invocation,
    input.expected,
    input.governor
  );
  const evidence = {
    before,
    after,
    beforeSha256: digest(before),
    afterSha256: digest(after),
    reviewId: receipt.id,
    receipt,
    writeAttempted: true,
    baseline,
  };
  if (!readbackPolicy(before, after, receipt))
    return { status: 'unmeasured', reason: 'readback-policy-mismatch', ...evidence };
  try {
    const readback = await nativeReadback(input.read, input.expected);
    return {
      status: readback.status,
      reason: `native-approval-${readback.status}`,
      readback,
      ...evidence,
    };
  } catch (cause) {
    return {
      status: 'unmeasured',
      reason: 'post-write-read-unmeasured',
      diagnostic: canaryFailureCause(cause),
      ...evidence,
    };
  }
}

function failedMeasurement(
  writeAttempted: boolean,
  before: Evidence | undefined,
  receipt: ScmReviewReceipt | undefined,
  baseline: NativeCanaryObservation | undefined,
  cause: unknown
): CanaryExecutionResult {
  return {
    status: 'unmeasured',
    reason: writeAttempted ? 'post-write-read-unmeasured' : 'evidence-read-unmeasured',
    writeAttempted,
    diagnostic: canaryFailureCause(cause),
    ...observedBefore(before),
    ...(receipt !== undefined ? { receipt, reviewId: receipt.id } : {}),
    ...(baseline !== undefined ? { baseline } : {}),
  };
}

function baselineRefusal(
  baseline: NativeCanaryObservation,
  before: Evidence
): CanaryExecutionResult {
  return {
    status: baseline.status === 'eligible' ? 'refused' : 'unmeasured',
    reason: `native-baseline-${baseline.status}`,
    writeAttempted: false,
    baseline,
    ...observedBefore(before),
  };
}

function unexpectedReceipt(
  before: Evidence,
  baseline: NativeCanaryObservation,
  receipt: ScmReviewReceipt
): CanaryExecutionResult {
  return {
    status: 'unmeasured',
    reason: 'unexpected-review-receipt',
    baseline,
    ...observedBefore(before),
    writeAttempted: true,
    reviewId: receipt.id,
    receipt,
  };
}

/** Never falls back to a legacy review, retries a POST, edits protection, or merges. */
export async function executeNativeApprovalCanary(
  input: CanaryExecutionInput
): Promise<CanaryExecutionResult> {
  let writeAttempted = false;
  let before: Evidence | undefined;
  let receipt: ScmReviewReceipt | undefined;
  let baseline: NativeCanaryObservation | undefined;
  try {
    if (typeof input.reviewer.createReviewAtCommit !== 'function')
      return { status: 'unmeasured', reason: 'commit-bound-review-unavailable', writeAttempted };
    before = await collectCanaryEvidence(
      input.read,
      input.invocation,
      input.expected,
      input.governor
    );
    const decision = assessNativeApprovalCanary(before);
    if (decision.status !== 'allowed')
      return { ...decision, writeAttempted, ...observedBefore(before) };
    baseline = await nativeReadback(input.read, input.expected);
    if (baseline.status !== 'ineligible') return baselineRefusal(baseline, before);
    writeAttempted = true;
    const posted = await input.reviewer.createReviewAtCommit(
      decision.pr,
      BODY,
      'approve',
      decision.headSha
    );
    if (!posted.ok)
      return {
        status: 'unmeasured',
        reason: 'review-post-failed',
        diagnostic: { ...canaryFailureCause(posted.error), operation: 'review-post' },
        writeAttempted,
        baseline,
        ...observedBefore(before),
      };
    receipt = posted.value;
    if (!expectedReceipt(receipt, decision.headSha))
      return unexpectedReceipt(before, baseline, receipt);
    return await measureReadback(input, before, receipt, baseline);
  } catch (cause) {
    return failedMeasurement(writeAttempted, before, receipt, baseline, cause);
  }
}
