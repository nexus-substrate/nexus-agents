/**
 * Worker Boundary Readiness Verifier (Task T06, Issue #5129 / Milestone M1)
 *
 * Implements worker/session-scoped capability resolution, actual resource probes,
 * safe write-probe confinement, and revocation/context-bound proof caching.
 *
 * Conformance cases:
 * - C01: Parent can read, worker cannot (worker/session scoped capability resolution)
 * - C02: Advertised tool does not work (distinguish advertised from usable; preserve error class)
 * - C03: Authorized artifact recovery (re-probe actual worker on new attempt without broadening scope)
 * - C04: Revoked or changed grant (stale proof invalidated on grant/schema/subject/expiry change)
 * - C33: Unsafe write-capability probe (no unapproved target mutation; scratch proof or explicit rejection)
 *
 * @module pipeline/worker-readiness
 */
import { getTimeProvider } from '../core/index.js';
import type { CapabilityRequirement } from './task-contract.js';

// ============================================================================
// Constants & Types
// ============================================================================

/** Canonical readiness progression levels (PLAN.md §5). */
export const READINESS_LEVELS = [
  'advertised',
  'authorized',
  'bound-to-worker',
  'probed',
  'used',
] as const;

export type ReadinessLevel = (typeof READINESS_LEVELS)[number];

/** Default TTL for a cached readiness proof (5 minutes). */
const DEFAULT_PROOF_TTL_MS = 300_000;

/** Prefixes and exact operation patterns that perform state or repository mutations. */
const WRITE_OPERATION_PATTERNS = [
  /^write\./,
  /\.write$/,
  /\.mutate$/,
  /\.publish$/,
  /\.push$/,
  /\.delete$/,
  /\.create$/,
] as const;

/**
 * Classifies whether an operation string represents a write/mutating capability (C33).
 */
export function isWriteOperation(operation: string): boolean {
  return WRITE_OPERATION_PATTERNS.some((pattern) => pattern.test(operation));
}

/** Identity, grant, and environment context for a specific worker boundary. */
export interface WorkerBoundaryContext {
  readonly workerId: string;
  readonly sessionId: string;
  readonly adapterId: string;
  readonly toolSchemaDigest: string;
  readonly grantDigest: string;
  readonly subjectRevision: string;
  readonly policyVersion: string;
  readonly approvedScratchDir?: string | undefined;
  readonly advertisedOperations: readonly string[];
  readonly authorizedOperations: readonly string[];
}

/** Options passed to a worker resource probe execution. */
export interface WorkerProbeExecutionOptions {
  readonly isScratchProbe: boolean;
  readonly scratchDir?: string | undefined;
}

/** Outcome returned by an actual worker resource probe. */
export type WorkerProbeOutcome =
  | {
      readonly ok: true;
      readonly latencyMs?: number | undefined;
    }
  | {
      readonly ok: false;
      readonly errorClass: string;
      readonly message: string;
    };

/** Function signature for executing a capability probe at the worker boundary. */
export type WorkerResourceProbe = (
  requirement: CapabilityRequirement,
  context: WorkerBoundaryContext,
  options: WorkerProbeExecutionOptions
) => Promise<WorkerProbeOutcome> | WorkerProbeOutcome;

/** Scoped proof of an observed readiness probe under stated conditions. */
export interface ReadinessProof {
  readonly proofId: string;
  readonly requirementId: string;
  readonly operation: string;
  readonly resourceRef?: string | undefined;
  readonly scope?: string | undefined;
  readonly level: ReadinessLevel;
  readonly workerId: string;
  readonly sessionId: string;
  readonly adapterId: string;
  readonly toolSchemaDigest: string;
  readonly grantDigest: string;
  readonly subjectRevision: string;
  readonly policyVersion: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly probedInScratch?: boolean | undefined;
  readonly narrowerThanTargetWrite?: boolean | undefined;
}

/** Structured readiness failure preserving the original error class and level reached. */
export interface ReadinessFailure {
  readonly requirementId: string;
  readonly operation: string;
  readonly resourceRef?: string | undefined;
  readonly mode: 'advisory' | 'enforcing';
  readonly workerId: string;
  readonly levelReached: ReadinessLevel | 'unadvertised';
  readonly errorClass: string;
  readonly message: string;
}

/** Complete report from verifying worker readiness across capability requirements. */
export interface WorkerReadinessReport {
  readonly ready: boolean;
  readonly workerId: string;
  readonly proofs: readonly ReadinessProof[];
  readonly failures: readonly ReadinessFailure[];
  readonly advisoryWarnings: readonly ReadinessFailure[];
}

/** Configuration for verifying worker readiness. */
export interface WorkerReadinessConfig {
  readonly context: WorkerBoundaryContext;
  readonly probe: WorkerResourceProbe;
  readonly cache?: ReadinessProofCache | undefined;
  readonly now?: number | undefined;
  readonly proofTtlMs?: number | undefined;
}

// ============================================================================
// Proof Validation & Cache (C01, C04)
// ============================================================================

function matchesIdentityTuple(proof: ReadinessProof, context: WorkerBoundaryContext): boolean {
  return (
    proof.workerId === context.workerId &&
    proof.sessionId === context.sessionId &&
    proof.adapterId === context.adapterId
  );
}

function matchesGrantAndRevisionTuple(
  proof: ReadinessProof,
  context: WorkerBoundaryContext
): boolean {
  return (
    proof.toolSchemaDigest === context.toolSchemaDigest &&
    proof.grantDigest === context.grantDigest &&
    proof.subjectRevision === context.subjectRevision &&
    proof.policyVersion === context.policyVersion
  );
}

function matchesRequirementTuple(
  proof: ReadinessProof,
  requirement: CapabilityRequirement
): boolean {
  return (
    proof.requirementId === requirement.id &&
    proof.operation === requirement.operation &&
    proof.resourceRef === requirement.resourceRef &&
    proof.scope === requirement.scope
  );
}

/**
 * Checks whether a cached ReadinessProof remains valid for the given worker context,
 * capability requirement, and timestamp (Conformance Cases C01 and C04).
 */
export function isProofValidForContext(
  proof: ReadinessProof,
  context: WorkerBoundaryContext,
  requirement: CapabilityRequirement,
  now: number,
  revokedProofIds?: ReadonlySet<string>
): boolean {
  if (revokedProofIds?.has(proof.proofId) === true) {
    return false;
  }
  if (now >= proof.expiresAt) {
    return false;
  }
  return (
    matchesIdentityTuple(proof, context) &&
    matchesGrantAndRevisionTuple(proof, context) &&
    matchesRequirementTuple(proof, requirement)
  );
}

/**
 * Scoped cache of worker readiness proofs keyed by worker/session/requirement tuple.
 * Never allows parent proofs to satisfy child workers (C01) and invalidates on
 * grant/schema/subject/expiry/revocation changes (C04).
 */
export class ReadinessProofCache {
  private readonly store = new Map<string, ReadinessProof>();
  private readonly revokedIds = new Set<string>();

  private buildKey(workerId: string, sessionId: string, requirementId: string): string {
    return `${workerId}::${sessionId}::${requirementId}`;
  }

  /** Stores a verified readiness proof. */
  putProof(proof: ReadinessProof): void {
    const key = this.buildKey(proof.workerId, proof.sessionId, proof.requirementId);
    this.store.set(key, proof);
  }

  /** Explicitly revokes a proof by ID (C04). */
  revokeProof(proofId: string): void {
    this.revokedIds.add(proofId);
  }

  /** Retrieves a proof only if it is valid for the exact worker context, requirement, and time. */
  getValidProof(
    context: WorkerBoundaryContext,
    requirement: CapabilityRequirement,
    now: number
  ): ReadinessProof | undefined {
    const key = this.buildKey(context.workerId, context.sessionId, requirement.id);
    const candidate = this.store.get(key);
    if (candidate === undefined) {
      return undefined;
    }
    if (!isProofValidForContext(candidate, context, requirement, now, this.revokedIds)) {
      this.store.delete(key);
      return undefined;
    }
    return candidate;
  }
}

// ============================================================================
// Worker Readiness Verification (C01, C02, C03, C04, C33)
// ============================================================================

function checkStaticBindLevel(
  requirement: CapabilityRequirement,
  context: WorkerBoundaryContext
): ReadinessFailure | null {
  const isAdvertised = context.advertisedOperations.includes(requirement.operation);
  if (!isAdvertised) {
    return {
      requirementId: requirement.id,
      operation: requirement.operation,
      resourceRef: requirement.resourceRef,
      mode: requirement.mode,
      workerId: context.workerId,
      levelReached: 'unadvertised',
      errorClass: 'UnadvertisedOperationError',
      message: `Operation "${requirement.operation}" is not advertised on worker "${context.workerId}"`,
    };
  }

  const isAuthorized = context.authorizedOperations.includes(requirement.operation);
  if (!isAuthorized) {
    return {
      requirementId: requirement.id,
      operation: requirement.operation,
      resourceRef: requirement.resourceRef,
      mode: requirement.mode,
      workerId: context.workerId,
      levelReached: 'advertised',
      errorClass: 'UnauthorizedOperationError',
      message: `Operation "${requirement.operation}" is advertised but not authorized for worker "${context.workerId}"`,
    };
  }

  return null;
}

function buildProbeOptions(
  requirement: CapabilityRequirement,
  context: WorkerBoundaryContext
): WorkerProbeExecutionOptions | ReadinessFailure {
  if (!isWriteOperation(requirement.operation)) {
    return { isScratchProbe: false };
  }

  if (context.approvedScratchDir === undefined || context.approvedScratchDir.trim().length === 0) {
    return {
      requirementId: requirement.id,
      operation: requirement.operation,
      resourceRef: requirement.resourceRef,
      mode: requirement.mode,
      workerId: context.workerId,
      levelReached: 'bound-to-worker',
      errorClass: 'UnsafeWriteProbeRejectedError',
      message: `Write capability "${requirement.operation}" cannot be probed without an approvedScratchDir on worker "${context.workerId}"`,
    };
  }

  return {
    isScratchProbe: true,
    scratchDir: context.approvedScratchDir,
  };
}

function createVerifiedProof(
  requirement: CapabilityRequirement,
  context: WorkerBoundaryContext,
  probeOptions: WorkerProbeExecutionOptions,
  now: number,
  ttlMs: number
): ReadinessProof {
  return {
    proofId: `proof-${context.workerId}-${requirement.id}-${String(now)}`,
    requirementId: requirement.id,
    operation: requirement.operation,
    resourceRef: requirement.resourceRef,
    scope: requirement.scope,
    level: 'probed',
    workerId: context.workerId,
    sessionId: context.sessionId,
    adapterId: context.adapterId,
    toolSchemaDigest: context.toolSchemaDigest,
    grantDigest: context.grantDigest,
    subjectRevision: context.subjectRevision,
    policyVersion: context.policyVersion,
    issuedAt: now,
    expiresAt: now + ttlMs,
    ...(probeOptions.isScratchProbe
      ? { probedInScratch: true, narrowerThanTargetWrite: true }
      : {}),
  };
}

async function evaluateSingleRequirement(
  requirement: CapabilityRequirement,
  config: WorkerReadinessConfig,
  now: number,
  ttlMs: number
): Promise<{ proof?: ReadinessProof; failure?: ReadinessFailure }> {
  const cached = config.cache?.getValidProof(config.context, requirement, now);
  if (cached !== undefined) {
    return { proof: cached };
  }

  const staticFailure = checkStaticBindLevel(requirement, config.context);
  if (staticFailure !== null) {
    return { failure: staticFailure };
  }

  const probeOptionsOrFailure = buildProbeOptions(requirement, config.context);
  if ('errorClass' in probeOptionsOrFailure) {
    return { failure: probeOptionsOrFailure };
  }

  const outcome = await config.probe(requirement, config.context, probeOptionsOrFailure);
  if (!outcome.ok) {
    return {
      failure: {
        requirementId: requirement.id,
        operation: requirement.operation,
        resourceRef: requirement.resourceRef,
        mode: requirement.mode,
        workerId: config.context.workerId,
        levelReached: 'bound-to-worker',
        errorClass: outcome.errorClass,
        message: outcome.message,
      },
    };
  }

  const proof = createVerifiedProof(requirement, config.context, probeOptionsOrFailure, now, ttlMs);
  config.cache?.putProof(proof);
  return { proof };
}

/**
 * Verifies worker readiness at the actual worker boundary across all capability requirements.
 */
export async function verifyWorkerReadiness(
  requirements: readonly CapabilityRequirement[],
  config: WorkerReadinessConfig
): Promise<WorkerReadinessReport> {
  const now = config.now ?? getTimeProvider().now();
  const ttlMs = config.proofTtlMs ?? DEFAULT_PROOF_TTL_MS;

  const proofs: ReadinessProof[] = [];
  const failures: ReadinessFailure[] = [];
  const advisoryWarnings: ReadinessFailure[] = [];

  for (const req of requirements) {
    const evaluation = await evaluateSingleRequirement(req, config, now, ttlMs);
    if (evaluation.proof !== undefined) {
      proofs.push(evaluation.proof);
    } else if (evaluation.failure !== undefined) {
      if (req.mode === 'enforcing') {
        failures.push(evaluation.failure);
      } else {
        advisoryWarnings.push(evaluation.failure);
      }
    }
  }

  return {
    ready: failures.length === 0,
    workerId: config.context.workerId,
    proofs,
    failures,
    advisoryWarnings,
  };
}
