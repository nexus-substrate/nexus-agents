/** Fixed-content eligibility policy. This module never posts a review. */
import { createHash } from 'node:crypto';
import { CanaryEvidenceSchema } from './native-approval-canary-evidence.js';
import type { NativeCanaryEvidence } from './native-approval-canary-evidence.js';
export type { NativeCanaryEvidence } from './native-approval-canary-evidence.js';

export const NATIVE_CANARY_POLICY = {
  repository: 'nexus-substrate/nexus-agents',
  repositoryId: 1127393912,
  repositoryOwnerId: 285505621,
  actorId: 14303249,
  dispatcherId: 41898282,
  reviewerId: 41898282,
  reviewerLogin: 'github-actions[bot]',
  branch: 'probe/native-approval-eligibility-v1',
  path: 'docs/fixtures/native-approval-canary.txt',
  content: 'Nexus native approval eligibility canary v1.\n',
  workflowPath: '.github/workflows/native-approval-canary.yml',
  preflightWorkflowPath: '.github/workflows/native-approval-preflight.yml',
  checkAppId: 15368,
  requiredChecks: ['CI Success', 'Governor-path ratification gate'],
} as const;

export interface NativeCanaryRefusal {
  readonly status: 'refused' | 'unmeasured';
  readonly reason: string;
}
export type NativeCanaryDecision =
  | {
      readonly status: 'allowed';
      readonly pr: number;
      readonly headSha: string;
      readonly baseSha: string;
      readonly runId: number;
    }
  | NativeCanaryRefusal;

type PolicyCheck = (evidence: NativeCanaryEvidence) => NativeCanaryRefusal | undefined;
const refused = (reason: string): NativeCanaryRefusal => ({ status: 'refused', reason });
const unmeasured = (reason: string): NativeCanaryRefusal => ({ status: 'unmeasured', reason });
const expectedBlob = createHash('sha1')
  .update(
    `blob ${String(Buffer.byteLength(NATIVE_CANARY_POLICY.content))}\0${NATIVE_CANARY_POLICY.content}`
  )
  .digest('hex');

function repositoryCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  const r = e.repository;
  const p = NATIVE_CANARY_POLICY;
  if (
    r.id !== p.repositoryId ||
    r.ownerId !== p.repositoryOwnerId ||
    r.name !== p.repository ||
    r.defaultBranch !== 'main'
  )
    return refused('repository-mismatch');
  return undefined;
}

function invocationCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  const i = e.invocation;
  if (
    (i.actorId !== NATIVE_CANARY_POLICY.actorId &&
      i.actorId !== NATIVE_CANARY_POLICY.dispatcherId) ||
    i.event !== 'workflow_dispatch' ||
    i.ref !== 'refs/heads/main' ||
    i.workflowPath !== NATIVE_CANARY_POLICY.workflowPath ||
    i.runAttempt !== 1
  )
    return refused('invocation-mismatch');
  return undefined;
}

function preflightCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  const p = e.preflight;
  if (
    p.actorId !== NATIVE_CANARY_POLICY.actorId ||
    p.workflowPath !== NATIVE_CANARY_POLICY.preflightWorkflowPath ||
    p.workflowSha !== e.invocation.workflowSha ||
    p.observedMainSha !== e.mainSha ||
    p.prNumber !== e.expected.pr ||
    p.headSha !== e.expected.headSha ||
    p.baseSha !== e.expected.baseSha
  )
    return refused('preflight-provenance-mismatch');
  return undefined;
}

function trustedSourceCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  if (
    e.mainSha !== e.latestMainSha ||
    e.invocation.workflowSha !== e.mainSha ||
    e.invocation.checkoutSha !== e.mainSha ||
    e.expected.baseSha !== e.mainSha
  )
    return refused('trusted-source-mismatch');
  return undefined;
}

function pullRequestCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  const pr = e.pr;
  const p = NATIVE_CANARY_POLICY;
  if (
    pr.number !== e.expected.pr ||
    pr.authorId !== p.actorId ||
    pr.state !== 'open' ||
    pr.draft ||
    pr.autoMerge ||
    pr.headRepoId !== e.repository.id ||
    pr.baseRepoId !== e.repository.id ||
    pr.headRef !== p.branch ||
    pr.baseRef !== 'main'
  )
    return refused('pull-request-mismatch');
  return undefined;
}

function pullRequestFreshnessCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  const x = e.expected;
  const latest = e.latestPR;
  if (
    e.pr.headSha !== x.headSha ||
    e.pr.baseSha !== x.baseSha ||
    latest.number !== x.pr ||
    latest.headSha !== x.headSha ||
    latest.baseSha !== x.baseSha ||
    latest.state !== 'open' ||
    latest.draft ||
    latest.autoMerge
  )
    return refused('pull-request-changed');
  return undefined;
}

function completenessCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  for (const key of [
    'preflight',
    'commit',
    'files',
    'governor',
    'checks',
    'history',
    'reviews',
  ] as const) {
    if (!e[key].complete) return unmeasured(`incomplete-${key}`);
  }
  return undefined;
}

function commitAncestryCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  // A canary is one commit directly atop the trusted main commit, not a merge-base-only diff.
  if (
    e.commit.sha !== e.expected.headSha ||
    e.commit.parents.length !== 1 ||
    e.commit.parents[0] !== e.expected.baseSha ||
    e.commit.treeSha !== e.files.treeSha
  ) {
    return refused('commit-ancestry');
  }
  return undefined;
}

function candidateCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  const p = NATIVE_CANARY_POLICY;
  // Zero files is absence, not an exact single-file canary.
  if (e.pr.changedFiles !== 1 || e.files.items.length !== 1) return refused('candidate-file-count');
  const file = e.files.items[0];
  if (file?.path !== p.path || file.status !== 'added' || file.mode !== '100644') {
    return refused('candidate-file-scope');
  }
  if (file.content !== p.content || file.blobSha !== expectedBlob)
    return refused('candidate-content');
  return undefined;
}

function governorCoverageCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  const p = NATIVE_CANARY_POLICY;
  if (
    e.governor.patternCount === 0 ||
    e.governor.files.length !== 1 ||
    e.governor.files[0] !== p.path
  ) {
    return unmeasured('governor-coverage');
  }
  // Empty matches means healthy only after nonempty, complete file coverage above.
  if (e.governor.matches.length !== 0) return refused('governor-path');
  return undefined;
}

function checksCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  if (e.checks.items.length === 0) return unmeasured('checks-missing');
  for (const check of e.checks.items) {
    if (
      check.headSha !== e.expected.headSha ||
      check.status !== 'completed' ||
      !['success', 'skipped'].includes(check.conclusion ?? '')
    ) {
      return refused('checks-not-green');
    }
  }
  return undefined;
}

function legacyStatusesCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  // Empty is measured absence of legacy contexts, after complete check collection.
  for (const status of e.checks.statuses) {
    if (status.headSha !== e.expected.headSha || status.state !== 'success')
      return refused('legacy-status-not-green');
  }
  return undefined;
}

function requiredChecksCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  for (const name of NATIVE_CANARY_POLICY.requiredChecks) {
    const matches = e.checks.items.filter((check) => check.name === name);
    const check = matches[0];
    if (
      matches.length !== 1 ||
      check?.appId !== NATIVE_CANARY_POLICY.checkAppId ||
      check.conclusion !== 'success'
    ) {
      return refused('required-check-mismatch');
    }
  }
  return undefined;
}

function protectionCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  const p = e.protection;
  if (
    !p.strict ||
    p.reviews !== 1 ||
    !p.dismissStale ||
    p.codeOwner ||
    p.lastPush ||
    p.forcePushes ||
    p.deletions
  ) {
    return refused('protection-policy-mismatch');
  }
  return undefined;
}

function protectionSnapshotCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  const p = e.protection;
  if (p.snapshotSha256 !== p.latestSnapshotSha256) return refused('protection-changed');
  if (p.requiredChecks.length !== NATIVE_CANARY_POLICY.requiredChecks.length)
    return refused('protection-checks-mismatch');
  for (const name of NATIVE_CANARY_POLICY.requiredChecks) {
    const matches = p.requiredChecks.filter((check) => check.name === name);
    if (matches.length !== 1 || matches[0]?.appId !== NATIVE_CANARY_POLICY.checkAppId)
      return refused('protection-checks-mismatch');
  }
  return undefined;
}

function singleUseCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  if (e.history.runs.length === 0 || e.history.branchPRs.length === 0)
    return unmeasured('history-missing');
  if (
    e.history.runs.length !== 1 ||
    e.history.branchPRs.length !== 1 ||
    e.history.branchPRs[0] !== e.expected.pr
  ) {
    return refused('experiment-already-used');
  }
  return undefined;
}

function runIdentityCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  const run = e.history.runs[0];
  if (
    run?.id !== e.invocation.runId ||
    run.actorId !== e.invocation.actorId ||
    run.attempt !== 1 ||
    run.event !== 'workflow_dispatch' ||
    run.ref !== 'main'
  ) {
    return refused('experiment-run-mismatch');
  }
  return undefined;
}

function reviewHistoryCheck(e: NativeCanaryEvidence): NativeCanaryRefusal | undefined {
  // An empty, complete review history means no competing review. Missing history never does.
  for (const review of e.reviews.items) {
    if (review.state === 'CHANGES_REQUESTED') return refused('competing-change-request');
    if (review.state === 'APPROVED') return refused('competing-approval');
    if (
      review.authorId === NATIVE_CANARY_POLICY.reviewerId ||
      review.authorLogin === NATIVE_CANARY_POLICY.reviewerLogin
    ) {
      return refused('prior-canary-review');
    }
  }
  return undefined;
}

/** Authorizes only the pinned canary data, never general product review or merge. */
export function assessNativeApprovalCanary(evidence: unknown): NativeCanaryDecision {
  const parsed = CanaryEvidenceSchema.safeParse(evidence);
  if (!parsed.success) return unmeasured('invalid-evidence');
  const e = parsed.data;
  const checks: readonly PolicyCheck[] = [
    completenessCheck,
    repositoryCheck,
    invocationCheck,
    preflightCheck,
    trustedSourceCheck,
    pullRequestCheck,
    pullRequestFreshnessCheck,
    commitAncestryCheck,
    candidateCheck,
    governorCoverageCheck,
    checksCheck,
    legacyStatusesCheck,
    requiredChecksCheck,
    protectionCheck,
    protectionSnapshotCheck,
    singleUseCheck,
    runIdentityCheck,
    reviewHistoryCheck,
  ];
  for (const check of checks) {
    const failure = check(e);
    if (failure !== undefined) return failure;
  }
  return {
    status: 'allowed',
    pr: e.expected.pr,
    headSha: e.expected.headSha,
    baseSha: e.expected.baseSha,
    runId: e.invocation.runId,
  };
}
