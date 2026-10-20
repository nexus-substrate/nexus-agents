/** Binding checks and receipt conversion for trusted host content observations. */
import type { EvidenceObligation, EvidenceReceipt } from './task-contract.js';
import {
  MAX_EVIDENCE_BYTES,
  type EvidenceAuthorization,
  type EvidenceBinding,
  type EvidenceObservation,
} from './evidence-verification-types.js';

export function copyBoundedEvidence(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_EVIDENCE_BYTES) {
    throw new Error('EvidencePayloadTooLargeError: verification payload exceeds byte limit');
  }
  return JSON.parse(serialized) as unknown;
}

function checkBinding(observed: EvidenceObservation, expected: EvidenceBinding): string | null {
  if (observed.taskId !== expected.taskId) return 'EvidenceTaskMismatch';
  if (observed.attemptId !== expected.attemptId) return 'EvidenceAttemptMismatch';
  if (observed.subjectRevision !== expected.subjectRevision) return 'EvidenceSubjectMismatch';
  return null;
}

function checkContent(
  observed: EvidenceObservation,
  authorization: EvidenceAuthorization,
  obligation: EvidenceObligation
): string | null {
  if (obligation.claim !== 'artifact-content-digest') return 'UnsupportedEvidenceClaim';
  if (
    observed.artifactRef !== obligation.artifactRef ||
    observed.artifactRef !== authorization.artifactRef
  ) {
    return 'EvidenceArtifactMismatch';
  }
  const issuerError = checkIssuer(observed, authorization, obligation);
  if (issuerError !== null) return issuerError;
  if (observed.digest !== authorization.expectedDigest) return 'EvidenceDigestMismatch';
  if (observed.bytes !== authorization.expectedBytes) return 'EvidenceByteCountMismatch';
  if (observed.coverage.start !== 0 || observed.coverage.end !== authorization.expectedBytes) {
    return 'EvidenceCoverageIncomplete';
  }
  return null;
}

function checkIssuer(
  observed: EvidenceObservation,
  authorization: EvidenceAuthorization,
  obligation: EvidenceObligation
): string | null {
  if (observed.issuer !== authorization.issuer) return 'EvidenceIssuerMismatch';
  if (obligation.receiptIssuer !== undefined && observed.issuer !== obligation.receiptIssuer) {
    return 'EvidenceIssuerMismatch';
  }
  return null;
}

export function observationRejection(
  observed: EvidenceObservation,
  binding: EvidenceBinding,
  authorizations: readonly EvidenceAuthorization[],
  obligations: readonly EvidenceObligation[]
): string | null {
  const mismatch = checkBinding(observed, binding);
  if (mismatch !== null) return mismatch;
  const obligation = obligations.find((item) => item.id === observed.obligationId);
  const authorization = authorizations.find((item) => item.obligationId === observed.obligationId);
  if (obligation === undefined || authorization === undefined)
    return 'UnauthorizedEvidenceObligation';
  return checkContent(observed, authorization, obligation);
}

export function observationReceipt(
  observed: EvidenceObservation,
  expected: EvidenceBinding,
  rejection: string | null
): EvidenceReceipt {
  return {
    obligationId: observed.obligationId,
    artifactRef: observed.artifactRef,
    digest: observed.digest,
    issuer: observed.issuer,
    verified: rejection === null,
    metadata: {
      provenance: 'host-content-verifier',
      operation: observed.operation,
      taskId: observed.taskId,
      attemptId: observed.attemptId,
      subjectRevision: observed.subjectRevision,
      bytes: observed.bytes,
      coverage: { ...observed.coverage },
      expectedBinding: { ...expected },
      acceptance: rejection === null ? 'accepted' : 'rejected',
      ...(rejection === null ? {} : { rejection }),
    },
  };
}

export function rejectedVerificationReceipt(
  binding: EvidenceBinding,
  rejection: string
): EvidenceReceipt {
  return {
    obligationId: 'unattributed',
    artifactRef: 'unattributed',
    verified: false,
    metadata: {
      ...binding,
      provenance: 'host-content-verifier',
      acceptance: 'rejected',
      rejection,
    },
  };
}
