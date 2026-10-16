/**
 * Canonical Merge-Readiness Evidence Composer (#7445, parent epic #4463)
 *
 * Binds candidate identity, artifact hash with prefix disclosure, review
 * evidence with option/head validation, local gate receipts, and remote CI
 * inventory into an authentic merge-readiness evidence envelope.
 *
 * @module cli/merge-readiness-evidence
 * (Source: Issue #7445 - Compose canonical merge-readiness evidence)
 */

import type {
  ArtifactEvidence,
  CandidateIdentity,
  EvaluatedArtifactEvidence,
  EvaluatedCandidateIdentity,
  EvaluatedLocalGatesEvidence,
  EvaluatedRemoteCiEvidence,
  EvaluatedReviewEvidence,
  LocalGatesEvidence,
  MergeReadinessEvidenceEnvelope,
  MergeReadinessInput,
  RemoteCiCheck,
  RemoteCiEvidence,
  RemoteCiEvidenceStatus,
  ReviewEvidence,
  ReviewEvidenceStatus,
  ReviewerDisposition,
} from './merge-readiness-types.js';

const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

/**
 * Validates candidate branch and commit identity.
 */
export function evaluateCandidateIdentity(
  candidate: CandidateIdentity
): EvaluatedCandidateIdentity {
  const hasBaseRef = candidate.baseRef.trim().length > 0;
  const isHeadShaValid = GIT_SHA_PATTERN.test(candidate.headSha);
  const isTreeShaValid = GIT_SHA_PATTERN.test(candidate.treeSha);

  const isValid = hasBaseRef && isHeadShaValid && isTreeShaValid;
  if (!isValid) {
    return {
      ...candidate,
      isValid: false,
      error:
        'Candidate identity invalid: baseRef must be non-empty, headSha and treeSha must be 40-character hex strings',
    };
  }

  return {
    ...candidate,
    isValid: true,
  };
}

/**
 * Evaluates built artifact binding and prefix coverage disclosure.
 */
export function evaluateArtifactEvidence(artifact?: ArtifactEvidence): EvaluatedArtifactEvidence {
  if (artifact === undefined || artifact.artifactHash.trim().length === 0) {
    return {
      status: 'unmeasured',
      reviewedBytes: 0,
      totalBytes: 0,
      isTruncated: false,
      detail: 'Built artifact hash is missing or unmeasured',
    };
  }

  if (artifact.totalBytes <= 0) {
    return {
      status: 'unmeasured',
      artifactHash: artifact.artifactHash,
      reviewedBytes: artifact.reviewedBytes,
      totalBytes: artifact.totalBytes,
      isTruncated: artifact.isTruncated,
      detail: 'Zero artifact bytes measured',
    };
  }

  if (artifact.isTruncated || artifact.reviewedBytes < artifact.totalBytes) {
    return {
      status: 'partial',
      artifactHash: artifact.artifactHash,
      reviewedBytes: artifact.reviewedBytes,
      totalBytes: artifact.totalBytes,
      isTruncated: artifact.isTruncated,
      ...(artifact.reviewedDiffHash !== undefined && {
        reviewedDiffHash: artifact.reviewedDiffHash,
      }),
      detail: `Disclosed prefix: ${String(artifact.reviewedBytes)}/${String(artifact.totalBytes)} bytes reviewed`,
    };
  }

  return {
    status: 'verified',
    artifactHash: artifact.artifactHash,
    reviewedBytes: artifact.reviewedBytes,
    totalBytes: artifact.totalBytes,
    isTruncated: false,
    ...(artifact.reviewedDiffHash !== undefined && {
      reviewedDiffHash: artifact.reviewedDiffHash,
    }),
    detail: `Full artifact bound and reviewed (${String(artifact.reviewedBytes)}/${String(artifact.totalBytes)} bytes)`,
  };
}

/**
 * Checks reviewer dispositions for dissenting or rejecting verdicts.
 */
function checkReviewersDisposition(reviewers: readonly ReviewerDisposition[]): {
  isDissenting: boolean;
  hasReviewers: boolean;
} {
  if (reviewers.length === 0) {
    return { isDissenting: false, hasReviewers: false };
  }

  const isDissenting = reviewers.some(
    (r) => r.decision === 'reject' || r.decision === 'request_changes' || r.decision === 'dissent'
  );
  return { isDissenting, hasReviewers: true };
}

/**
 * Checks review headSha freshness against candidate headSha.
 */
function checkReviewHead(
  reviewHeadSha: string | undefined,
  candidateHeadSha: string
): { status: ReviewEvidenceStatus; detail: string } | undefined {
  if (reviewHeadSha === undefined || reviewHeadSha.trim().length === 0) {
    return { status: 'unmeasured', detail: 'Review headSha not specified' };
  }
  if (
    candidateHeadSha.length > 0 &&
    reviewHeadSha.toLowerCase() !== candidateHeadSha.toLowerCase()
  ) {
    return {
      status: 'stale',
      detail: `Review is stale: reviewed head ${reviewHeadSha} does not match candidate head ${candidateHeadSha}`,
    };
  }
  return undefined;
}

/**
 * Checks if review consensus selected HOLD option.
 */
function checkReviewOption(
  selectedOption?: string
): { status: ReviewEvidenceStatus; detail: string } | undefined {
  if (selectedOption?.trim().toUpperCase() === 'HOLD') {
    return {
      status: 'hold',
      detail: 'Review selected option is HOLD: consensus blocks merge despite mechanical approval',
    };
  }
  return undefined;
}

/**
 * Checks individual reviewers and disposition in review evidence.
 */
function checkReviewers(
  reviewers: readonly ReviewerDisposition[] | undefined,
  verdict: string
): { status: ReviewEvidenceStatus; detail: string } | undefined {
  if (reviewers === undefined) {
    return undefined;
  }
  const { isDissenting, hasReviewers } = checkReviewersDisposition(reviewers);
  if (!hasReviewers && verdict === 'unmeasured') {
    return {
      status: 'unmeasured',
      detail: 'Review evidence is unmeasured: empty reviewers list',
    };
  }
  if (isDissenting || verdict === 'dissenting') {
    return {
      status: 'dissenting',
      detail: 'Review contains dissenting or rejecting reviewers',
    };
  }
  return undefined;
}

/**
 * Evaluates review evidence against candidate headSha and selected option.
 */
export function evaluateReviewEvidence(
  review: ReviewEvidence | undefined,
  candidateHeadSha: string
): EvaluatedReviewEvidence {
  if (review === undefined) {
    return {
      status: 'unmeasured',
      verdict: 'unmeasured',
      detail: 'Review evidence is missing or unmeasured',
    };
  }

  const headCheck = checkReviewHead(review.headSha, candidateHeadSha);
  if (headCheck !== undefined) {
    return { ...review, ...headCheck };
  }

  const optionCheck = checkReviewOption(review.selectedOption);
  if (optionCheck !== undefined) {
    return { ...review, ...optionCheck };
  }

  const reviewersCheck = checkReviewers(review.reviewers, review.verdict);
  if (reviewersCheck !== undefined) {
    return { ...review, ...reviewersCheck };
  }

  if (review.verdict !== 'approved') {
    return {
      ...review,
      status: review.verdict === 'unmeasured' ? 'unmeasured' : 'rejected',
      detail: `Review verdict is ${review.verdict}`,
    };
  }

  return {
    ...review,
    status: 'approved',
    detail: 'Review approved and bound to candidate headSha',
  };
}

/**
 * Evaluates local gate receipts, requiring non-empty measured receipts.
 */
export function evaluateLocalGatesEvidence(
  localGates?: LocalGatesEvidence
): EvaluatedLocalGatesEvidence {
  if (localGates === undefined || localGates.receipts.length === 0) {
    return {
      status: 'unmeasured',
      receipts: [],
      detail: 'Local gate receipts are unmeasured: no validators executed',
    };
  }

  const failedReceipts = localGates.receipts.filter(
    (r) => !r.passed || (r.exitCode !== undefined && r.exitCode !== 0)
  );

  if (failedReceipts.length > 0) {
    const failedNames = failedReceipts.map((r) => r.name).join(', ');
    return {
      status: 'failed',
      receipts: localGates.receipts,
      detail: `Local gates failed: ${failedNames}`,
    };
  }

  return {
    status: 'passed',
    receipts: localGates.receipts,
    detail: `All ${String(localGates.receipts.length)} local gates passed`,
  };
}

/**
 * Checks if all required checks are present in the CI inventory.
 */
function findMissingRequiredChecks(
  checks: readonly { name: string }[],
  requiredChecks: readonly string[]
): string[] {
  return requiredChecks.filter((req) => !checks.some((c) => c.name === req));
}

/**
 * Checks CI check head matching and required workflow presence.
 */
function checkCiHeadAndRequired(
  remoteCi: RemoteCiEvidence,
  candidateHeadSha: string
):
  | { status: RemoteCiEvidenceStatus; detail: string; missingChecks?: readonly string[] }
  | undefined {
  const staleChecks = remoteCi.checks.filter(
    (c) => c.headSha.toLowerCase() !== candidateHeadSha.toLowerCase()
  );
  if (staleChecks.length > 0) {
    return {
      status: 'stale',
      detail: `Remote CI contains ${String(staleChecks.length)} check(s) with mismatched headSha for candidate ${candidateHeadSha}`,
    };
  }

  if (remoteCi.requiredChecks !== undefined && remoteCi.requiredChecks.length > 0) {
    const missing = findMissingRequiredChecks(remoteCi.checks, remoteCi.requiredChecks);
    if (missing.length > 0) {
      return {
        status: 'missing',
        missingChecks: missing,
        detail: `Missing required CI checks: ${missing.join(', ')}`,
      };
    }
  }

  return undefined;
}

/**
 * Checks pending and failed CI check states.
 */
function checkCiState(
  checks: readonly RemoteCiCheck[]
): { status: RemoteCiEvidenceStatus; detail: string } | undefined {
  const pendingChecks = checks.filter((c) => c.status !== 'completed');
  if (pendingChecks.length > 0) {
    const names = pendingChecks.map((c) => c.name).join(', ');
    return {
      status: 'pending',
      detail: `Remote CI checks still pending: ${names}`,
    };
  }

  const failedChecks = checks.filter((c) => c.conclusion !== 'success');
  if (failedChecks.length > 0) {
    const names = failedChecks.map((c) => c.name).join(', ');
    return {
      status: 'failed',
      detail: `Remote CI checks failed: ${names}`,
    };
  }

  return undefined;
}

/**
 * Evaluates remote CI check inventory matching candidate headSha.
 */
export function evaluateRemoteCiEvidence(
  remoteCi: RemoteCiEvidence | undefined,
  candidateHeadSha: string
): EvaluatedRemoteCiEvidence {
  if (remoteCi === undefined || remoteCi.checks.length === 0) {
    return {
      status: 'unmeasured',
      checks: [],
      detail: 'Remote CI checks are unmeasured: check inventory is empty',
    };
  }

  const headAndRequired = checkCiHeadAndRequired(remoteCi, candidateHeadSha);
  if (headAndRequired !== undefined) {
    return {
      status: headAndRequired.status,
      checks: remoteCi.checks,
      detail: headAndRequired.detail,
      ...(headAndRequired.missingChecks !== undefined && {
        missingChecks: headAndRequired.missingChecks,
      }),
    };
  }

  const stateCheck = checkCiState(remoteCi.checks);
  if (stateCheck !== undefined) {
    return {
      status: stateCheck.status,
      checks: remoteCi.checks,
      detail: stateCheck.detail,
    };
  }

  return {
    status: 'passed',
    checks: remoteCi.checks,
    detail: `All ${String(remoteCi.checks.length)} remote CI checks completed green`,
  };
}

/**
 * Collects unmet blocking reasons from evaluated evidence pillars.
 */
function collectBlockingReasons(params: {
  candidate: EvaluatedCandidateIdentity;
  artifact: EvaluatedArtifactEvidence;
  review: EvaluatedReviewEvidence;
  localGates: EvaluatedLocalGatesEvidence;
  remoteCi: EvaluatedRemoteCiEvidence;
}): string[] {
  const reasons: string[] = [];

  if (!params.candidate.isValid) {
    reasons.push(params.candidate.error ?? 'Candidate identity invalid');
  }
  if (params.artifact.status !== 'verified' && params.artifact.status !== 'partial') {
    reasons.push(params.artifact.detail);
  }
  if (params.review.status !== 'approved') {
    reasons.push(params.review.detail);
  }
  if (params.localGates.status !== 'passed') {
    reasons.push(params.localGates.detail);
  }
  if (params.remoteCi.status !== 'passed') {
    reasons.push(params.remoteCi.detail);
  }

  return reasons;
}

/**
 * Composes canonical merge-readiness evidence envelope from input evidence.
 */
export function composeMergeReadinessEvidence(
  input: MergeReadinessInput
): MergeReadinessEvidenceEnvelope {
  const candidate = evaluateCandidateIdentity(input.candidate);
  const artifact = evaluateArtifactEvidence(input.artifact);
  const review = evaluateReviewEvidence(input.review, candidate.headSha);
  const localGates = evaluateLocalGatesEvidence(input.localGates);
  const remoteCi = evaluateRemoteCiEvidence(input.remoteCi, candidate.headSha);

  const blockingReasons = collectBlockingReasons({
    candidate,
    artifact,
    review,
    localGates,
    remoteCi,
  });

  const isReady =
    candidate.isValid &&
    (artifact.status === 'verified' || artifact.status === 'partial') &&
    review.status === 'approved' &&
    localGates.status === 'passed' &&
    remoteCi.status === 'passed' &&
    blockingReasons.length === 0;

  const summary = isReady
    ? 'Candidate satisfies all merge readiness criteria'
    : `Candidate is not ready for merge: ${blockingReasons.join('; ')}`;

  return {
    candidate,
    artifact,
    review,
    localGates,
    remoteCi,
    isReady,
    summary,
    blockingReasons,
  };
}
