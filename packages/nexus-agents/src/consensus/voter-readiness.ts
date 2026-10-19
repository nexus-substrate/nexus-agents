/**
 * Voter readiness preflight, evidence binding, and eligibility enforcement (#M1 connected autonomy).
 *
 * Implements the M1 truthful readiness slice:
 * - Probes actual worker boundary (not parent) for artifact access (C01).
 * - Delivers authorized inline recovery within existing authority (C03).
 * - Invalidates stale proof on scope/revision changes (C04, C05).
 * - Rejects fabricated model execution receipts (C06).
 * - Tracks and enforces declared coverage without unperformed claims (C07, C08).
 * - Sanitizes prompt-injection directives in artifacts/remedies as data (C09).
 * - Refuses privilege escalation or unauthorized remedies (C11).
 * - Preserves quorum without weakening for blocked/starved seats (C12).
 * - Protects substantive dissent from retry laundering (C13).
 *
 * @module consensus/voter-readiness
 */

import type { Vote } from './types-core.js';

export interface ArtifactDescriptor {
  readonly displayName: string;
  readonly digest: string;
  readonly bytes: number;
  readonly content: string;
}

export interface WorkerAccessProbe {
  readonly parentCanRead: boolean;
  readonly canWorkerRead: () => Promise<boolean>;
  readonly deliverAuthorizedInline?: (content: string) => Promise<boolean>;
}

export type VoterArtifactReadinessStatus = 'ready' | 'artifact_starved' | 'not_required';

export interface VoterArtifactReadiness {
  readonly status: VoterArtifactReadinessStatus;
  readonly reason?: string;
  readonly digest?: string;
  readonly remedyApplied?: 'redeliver-already-authorized-artifact';
}

export interface ProbeVoterReadinessOptions {
  readonly role: string;
  readonly artifact?: ArtifactDescriptor | undefined;
  readonly probe?: WorkerAccessProbe | undefined;
  readonly allowRemedy?: boolean | undefined;
  readonly authorizedRemedies?: readonly string[] | undefined;
  readonly requestedRemedy?: string | undefined;
  readonly maxAttempts?: number | undefined;
}

export interface ArtifactBindingOptions {
  readonly currentScope?: string | undefined;
  readonly validDigest?: string | undefined;
  readonly requireVerifiedExecution?: boolean | undefined;
  readonly requireCompleteCoverage?: boolean | undefined;
  readonly allowBoundedReview?: boolean | undefined;
  readonly toolAccess?: boolean | undefined;
}

export interface ArtifactBindingValidation {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface SanitizedRemedyInstruction {
  readonly isSafeData: true;
  readonly text: string;
  readonly containsDirectives: boolean;
}

export interface AttemptRecord {
  readonly role: string;
  readonly initial: Vote;
  readonly retried?: Vote | undefined;
}

export interface ArtifactConsensusEligibilityParams {
  readonly panelSize: number;
  readonly requiredArtifact?: string | undefined;
  readonly votes: readonly Vote[];
  readonly attemptHistory?: readonly AttemptRecord[] | undefined;
  readonly errorPolicy?: string | undefined;
}

export interface ArtifactConsensusEligibilityResult {
  readonly decision: 'approved' | 'rejected' | 'no_quorum';
  readonly reason?: string | undefined;
  readonly preservedVotes: readonly Vote[];
}

const DIRECTIVE_PATTERN =
  /\b(?:ignore\s+previous\s+instructions|disable\s+policy|root\s+credentials|escalate\s+privilege)\b/i;

/**
 * Sanitizes remedy and artifact instructions so prompt injections are marked
 * and treated strictly as data rather than instructions (#C09).
 */
export function sanitizeRemedyInstruction(rawText: string): SanitizedRemedyInstruction {
  const containsDirectives = DIRECTIVE_PATTERN.test(rawText);
  return {
    isSafeData: true,
    text: rawText,
    containsDirectives,
  };
}

function isRemedyUnauthorized(requestedRemedy?: string, authorized?: readonly string[]): boolean {
  if (requestedRemedy === undefined) return false;
  return !(authorized ?? []).includes(requestedRemedy);
}

async function tryInlineRemedy(
  probe: WorkerAccessProbe,
  artifact: ArtifactDescriptor,
  options: ProbeVoterReadinessOptions
): Promise<boolean> {
  if (
    options.allowRemedy !== true ||
    options.authorizedRemedies?.includes('redeliver-already-authorized-artifact') !== true ||
    probe.deliverAuthorizedInline === undefined
  ) {
    return false;
  }
  const delivered = await probe.deliverAuthorizedInline(artifact.content);
  return delivered && (await probe.canWorkerRead());
}

/**
 * Probes voter artifact readiness at the actual worker boundary (#C01, #C03, #C11, #C34).
 */
export async function probeVoterArtifactReadiness(
  options: ProbeVoterReadinessOptions
): Promise<VoterArtifactReadiness> {
  const { artifact, probe } = options;
  if (artifact === undefined) return { status: 'not_required' };

  if (isRemedyUnauthorized(options.requestedRemedy, options.authorizedRemedies)) {
    return {
      status: 'artifact_starved',
      reason: 'Unauthorized remedy or permission expansion refused',
    };
  }

  if (probe === undefined) return { status: 'ready', digest: artifact.digest };

  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  for (let i = 0; i < maxAttempts; i++) {
    const canRead = await probe.canWorkerRead();
    if (canRead) return { status: 'ready', digest: artifact.digest };

    const recovered = await tryInlineRemedy(probe, artifact, options);
    if (recovered) {
      return {
        status: 'ready',
        digest: artifact.digest,
        remedyApplied: 'redeliver-already-authorized-artifact',
      };
    }
  }

  return {
    status: 'artifact_starved',
    reason: 'Worker lacks artifact access at actual boundary',
  };
}

function validateScopeAndExecution(
  expectedDigest: string,
  vote: Vote,
  options: ArtifactBindingOptions
): ArtifactBindingValidation | undefined {
  if (options.currentScope === 'read-revoked') {
    return { valid: false, reason: 'Scope revoked or changed' };
  }
  if (options.validDigest !== undefined && options.validDigest !== expectedDigest) {
    return { valid: false, reason: 'Scope revoked or changed' };
  }
  if (options.requireVerifiedExecution === true && vote.boundArtifactDigest === undefined) {
    return { valid: false, reason: 'Unverified receipt: missing bound digest' };
  }
  if (vote.boundArtifactDigest !== undefined && vote.boundArtifactDigest !== expectedDigest) {
    return { valid: false, reason: 'Subject mismatch: artifact digest changed' };
  }
  return undefined;
}

function validateCoverageAndClaims(
  vote: Vote,
  options: ArtifactBindingOptions
): ArtifactBindingValidation | undefined {
  if (options.requireCompleteCoverage === true && vote.coverage === 'partial') {
    return { valid: false, reason: 'Partial or truncated coverage not permitted by policy' };
  }
  if (
    options.toolAccess === false &&
    vote.coverage === 'bounded' &&
    /\b(?:sandbox|tests|executed|ran tests)\b/i.test(vote.reasoning)
  ) {
    return { valid: false, reason: 'Cannot claim direct execution without tool access' };
  }
  return undefined;
}

/**
 * Validates artifact binding, ensuring no subject mutation, no fabricated
 * receipts, and truthful coverage declarations (#C04, #C05, #C06, #C07, #C08).
 */
export function validateArtifactBinding(
  expectedDigest: string,
  vote: Vote,
  options: ArtifactBindingOptions = {}
): ArtifactBindingValidation {
  const scopeErr = validateScopeAndExecution(expectedDigest, vote, options);
  if (scopeErr !== undefined) return scopeErr;

  const coverageErr = validateCoverageAndClaims(vote, options);
  if (coverageErr !== undefined) return coverageErr;

  return { valid: true };
}

function restoreSubstantiveDissent(
  votes: readonly Vote[],
  attemptHistory?: readonly AttemptRecord[]
): Vote[] {
  const preserved = [...votes];
  if (attemptHistory === undefined) return preserved;

  for (const record of attemptHistory) {
    if (
      record.initial.decision === 'reject' &&
      record.retried?.decision === 'approve' &&
      (record.initial.rejectionCategories?.length ?? 0) > 0
    ) {
      const index = preserved.findIndex((v) => v === record.retried);
      if (index !== -1) preserved[index] = record.initial;
    }
  }
  return preserved;
}

function checkInspectedFloor(
  panelSize: number,
  requiredArtifact: string,
  votes: readonly Vote[]
): string | undefined {
  const eligibleInspectedVotes = votes.filter(
    (v) =>
      v.artifactReadiness !== 'artifact_starved' &&
      v.artifactReadiness !== 'unverifiable' &&
      v.boundArtifactDigest === requiredArtifact &&
      v.decision !== 'abstain'
  );

  const minFloor = Math.min(panelSize, Math.max(Math.ceil((panelSize * 2) / 3), 3));
  if (eligibleInspectedVotes.length < minFloor) {
    return 'Insufficient eligible voters inspected the artifact';
  }
  return undefined;
}

/**
 * Enforces artifact consensus eligibility, preserving original quorum and
 * preventing verdict laundering (#C12, #C13).
 */
export function enforceArtifactConsensusEligibility(
  params: ArtifactConsensusEligibilityParams
): ArtifactConsensusEligibilityResult {
  const { panelSize, requiredArtifact, votes, attemptHistory } = params;
  const preservedVotes = restoreSubstantiveDissent(votes, attemptHistory);

  if (requiredArtifact !== undefined) {
    const floorError = checkInspectedFloor(panelSize, requiredArtifact, preservedVotes);
    if (floorError !== undefined) {
      return { decision: 'no_quorum', reason: floorError, preservedVotes };
    }
  }

  const approveCount = preservedVotes.filter((v) => v.decision === 'approve').length;
  const rejectCount = preservedVotes.filter((v) => v.decision === 'reject').length;

  if (rejectCount > 0) return { decision: 'rejected', preservedVotes };
  return {
    decision: approveCount > 0 ? 'approved' : 'no_quorum',
    preservedVotes,
  };
}
