/** Host authorization and measured content facts; model output is never this channel. */
import { z } from 'zod';
import { MAX_INLINE_ARTIFACT_BYTES } from '../orchestration/aorchestra/worker-artifact.js';

export const MAX_EVIDENCE_OBSERVATIONS = 100;
export const MAX_EVIDENCE_BYTES = 262_144;
const identity = z.string().min(1).max(2_048);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const byteCount = z.number().int().positive().max(MAX_INLINE_ARTIFACT_BYTES);
export const EvidenceAuthorizationSchema = z
  .object({
    obligationId: identity,
    artifactRef: identity,
    issuer: identity,
    operation: z.literal('artifact-content-digest'),
    expectedDigest: digest,
    expectedBytes: byteCount,
  })
  .strict();
export type EvidenceAuthorization = z.infer<typeof EvidenceAuthorizationSchema>;

export const EvidenceBindingSchema = z
  .object({
    taskId: identity,
    attemptId: identity,
    subjectRevision: digest,
  })
  .strict();
export type EvidenceBinding = z.infer<typeof EvidenceBindingSchema>;

export const EvidenceObservationSchema = EvidenceBindingSchema.extend({
  obligationId: identity,
  artifactRef: identity,
  issuer: identity,
  operation: z.literal('artifact-content-digest'),
  digest,
  bytes: byteCount,
  coverage: z
    .object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() })
    .strict(),
});
export type EvidenceObservation = z.infer<typeof EvidenceObservationSchema>;

export interface EvidenceVerificationRequest {
  readonly binding: Readonly<EvidenceBinding>;
  readonly authorizations: readonly EvidenceAuthorization[];
  readonly signal: AbortSignal;
}

export interface EvidenceVerificationConfig {
  readonly authorizations: readonly EvidenceAuthorization[];
  /** Trusted host code must perform the claimed content operation; no model JSON receipts. */
  readonly verify: (
    request: EvidenceVerificationRequest
  ) => Promise<readonly EvidenceObservation[]> | readonly EvidenceObservation[];
}

export interface EvidenceReport {
  readonly status: 'not_applicable' | 'complete' | 'incomplete' | 'unmeasured';
  readonly criteria: number;
  readonly acceptedReceipts: number;
  readonly rejectedReceipts: number;
  readonly fulfilledObligations: readonly string[];
  readonly missing: readonly string[];
  readonly unmetAdvisory: readonly string[];
  readonly diagnostics: readonly string[];
}
