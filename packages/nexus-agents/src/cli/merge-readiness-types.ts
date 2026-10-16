/**
 * Merge Readiness Types (#7445, parent epic #4463)
 *
 * Types for composing and verifying canonical merge-readiness evidence
 * for autonomous PR / release merge lanes.
 *
 * @module cli/merge-readiness-types
 * (Source: Issue #7445 - Compose canonical merge-readiness evidence)
 */

/**
 * Candidate branch and commit identity.
 */
export interface CandidateIdentity {
  /** Target base ref (e.g. 'main', 'refs/heads/main'). */
  readonly baseRef: string;
  /** Full 40-hex lowercase commit SHA of the candidate head. */
  readonly headSha: string;
  /** Full 40-hex lowercase git tree SHA of the candidate commit. */
  readonly treeSha: string;
}

/**
 * Evaluated candidate identity with validity status.
 */
export interface EvaluatedCandidateIdentity extends CandidateIdentity {
  /** Whether the candidate identity meets format and non-empty requirements. */
  readonly isValid: boolean;
  /** Error message if candidate identity is invalid. */
  readonly error?: string | undefined;
}

/**
 * Built artifact hash and reviewed byte prefix disclosure evidence.
 */
export interface ArtifactEvidence {
  /** Full cryptographic hash (SHA-256) of the built artifact. */
  readonly artifactHash: string;
  /** Total bytes reviewed by the panel or diff reviewer. */
  readonly reviewedBytes: number;
  /** Total bytes of the artifact or diff. */
  readonly totalBytes: number;
  /** Whether the reviewed portion was truncated to a prefix cap. */
  readonly isTruncated: boolean;
  /** Disclosed prefix hash or reviewed diff hash if available. */
  readonly reviewedDiffHash?: string | undefined;
}

/**
 * Evaluation status for artifact evidence.
 */
export type ArtifactEvidenceStatus = 'verified' | 'partial' | 'unmeasured' | 'invalid';

/**
 * Evaluated artifact evidence with honest disclosure.
 */
export interface EvaluatedArtifactEvidence {
  readonly status: ArtifactEvidenceStatus;
  readonly artifactHash?: string | undefined;
  readonly reviewedBytes: number;
  readonly totalBytes: number;
  readonly isTruncated: boolean;
  readonly reviewedDiffHash?: string | undefined;
  readonly detail: string;
}

/**
 * Allowed decision for an individual reviewer.
 */
export type ReviewerDecision = 'approve' | 'request_changes' | 'reject' | 'abstain' | 'dissent';

/**
 * Individual reviewer or voter disposition.
 */
export interface ReviewerDisposition {
  readonly reviewer: string;
  readonly decision: ReviewerDecision;
  readonly reasoning?: string | undefined;
  readonly conditions?: readonly string[] | undefined;
}

/**
 * High-level verdict for review evidence.
 */
export type ReviewVerdict =
  'approved' | 'rejected' | 'changes_requested' | 'dissenting' | 'unmeasured' | 'stale' | 'hold';

/**
 * PR or panel review evidence input.
 */
export interface ReviewEvidence {
  readonly verdict: ReviewVerdict;
  readonly selectedOption?: string | undefined;
  readonly headSha?: string | undefined;
  readonly reviewers?: readonly ReviewerDisposition[] | undefined;
  readonly conditions?: readonly string[] | undefined;
}

/**
 * Evaluation status for review evidence.
 */
export type ReviewEvidenceStatus =
  'approved' | 'hold' | 'dissenting' | 'unmeasured' | 'stale' | 'rejected';

/**
 * Evaluated review evidence.
 */
export interface EvaluatedReviewEvidence {
  readonly status: ReviewEvidenceStatus;
  readonly verdict: string;
  readonly selectedOption?: string | undefined;
  readonly headSha?: string | undefined;
  readonly reviewers?: readonly ReviewerDisposition[] | undefined;
  readonly conditions?: readonly string[] | undefined;
  readonly detail: string;
}

/**
 * A single local gate execution receipt.
 */
export interface LocalGateReceipt {
  readonly name: string;
  readonly passed: boolean;
  readonly exitCode?: number | undefined;
  readonly logHash?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly error?: string | undefined;
}

/**
 * Local gate evidence input.
 */
export interface LocalGatesEvidence {
  readonly receipts: readonly LocalGateReceipt[];
}

/**
 * Evaluation status for local gates evidence.
 */
export type LocalGatesEvidenceStatus = 'passed' | 'failed' | 'unmeasured';

/**
 * Evaluated local gates evidence.
 */
export interface EvaluatedLocalGatesEvidence {
  readonly status: LocalGatesEvidenceStatus;
  readonly receipts: readonly LocalGateReceipt[];
  readonly detail: string;
}

/**
 * Remote CI check lifecycle status.
 */
export type RemoteCiCheckStatus = 'completed' | 'in_progress' | 'queued' | 'pending';

/**
 * Remote CI check completion conclusion.
 */
export type RemoteCiCheckConclusion =
  'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required';

/**
 * Remote CI check or workflow run item.
 */
export interface RemoteCiCheck {
  readonly name: string;
  readonly headSha: string;
  readonly status: RemoteCiCheckStatus;
  readonly conclusion?: RemoteCiCheckConclusion | undefined;
}

/**
 * Remote CI check inventory input.
 */
export interface RemoteCiEvidence {
  readonly checks: readonly RemoteCiCheck[];
  readonly requiredChecks?: readonly string[] | undefined;
}

/**
 * Evaluation status for remote CI evidence.
 */
export type RemoteCiEvidenceStatus =
  'passed' | 'failed' | 'pending' | 'missing' | 'stale' | 'unmeasured';

/**
 * Evaluated remote CI evidence.
 */
export interface EvaluatedRemoteCiEvidence {
  readonly status: RemoteCiEvidenceStatus;
  readonly checks: readonly RemoteCiCheck[];
  readonly missingChecks?: readonly string[] | undefined;
  readonly detail: string;
}

/**
 * Combined input for composing merge-readiness evidence.
 */
export interface MergeReadinessInput {
  readonly candidate: CandidateIdentity;
  readonly artifact?: ArtifactEvidence | undefined;
  readonly review?: ReviewEvidence | undefined;
  readonly localGates?: LocalGatesEvidence | undefined;
  readonly remoteCi?: RemoteCiEvidence | undefined;
}

/**
 * Canonical merge-readiness evidence envelope.
 */
export interface MergeReadinessEvidenceEnvelope {
  readonly candidate: EvaluatedCandidateIdentity;
  readonly artifact: EvaluatedArtifactEvidence;
  readonly review: EvaluatedReviewEvidence;
  readonly localGates: EvaluatedLocalGatesEvidence;
  readonly remoteCi: EvaluatedRemoteCiEvidence;
  readonly isReady: boolean;
  readonly summary: string;
  readonly blockingReasons: readonly string[];
}
