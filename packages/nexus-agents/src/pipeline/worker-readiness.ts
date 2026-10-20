/**
 * Worker Boundary Readiness Verifier (Task T06, Issue #5129 / Milestone M1)
 *
 * Implements worker/session-scoped capability resolution, actual resource probes,
 * safe write-probe confinement, and revocation/context-bound proof caching.
 *
 * Conformance cases: C01, C02, C03, C04, C33.
 * @module pipeline/worker-readiness
 */
import { isAbsolute } from 'node:path';
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

const DEFAULT_PROOF_TTL_MS = 300_000;
const DEFAULT_PROBE_TIMEOUT_MS = 30_000;

/** Token patterns that represent mutating/write operations across dot, colon, dash, or underscore delimiters. */
const WRITE_TOKEN_REGEX =
  /(?:^|[.:/_-])(write|mutate|publish|push|delete|remove|create|update|modify|patch|commit|merge|append|overwrite|drop|truncate)(?:$|[.:/_-])/i;

/** Classifies whether an operation string represents a write/mutating capability (C33). */
export function isWriteOperation(operation: string): boolean {
  return WRITE_TOKEN_REGEX.test(operation.trim());
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
  readonly signal?: AbortSignal | undefined;
}

/** Outcome returned by an actual worker resource probe. */
export type WorkerProbeOutcome =
  | { readonly ok: true; readonly latencyMs?: number | undefined }
  | { readonly ok: false; readonly errorClass: string; readonly message: string };

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
  readonly probeTimeoutMs?: number | undefined;
  readonly signal?: AbortSignal | undefined;
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

function matchesGrantAndRevisionTuple(p: ReadinessProof, c: WorkerBoundaryContext): boolean {
  return (
    p.toolSchemaDigest === c.toolSchemaDigest &&
    p.grantDigest === c.grantDigest &&
    p.subjectRevision === c.subjectRevision &&
    p.policyVersion === c.policyVersion
  );
}

function matchesRequirementTuple(p: ReadinessProof, req: CapabilityRequirement): boolean {
  return (
    p.requirementId === req.id &&
    p.operation === req.operation &&
    p.resourceRef === req.resourceRef &&
    p.scope === req.scope
  );
}

/** Checks whether a cached ReadinessProof remains valid for the given worker context, requirement, and time (C01, C04). */
export function isProofValidForContext(
  proof: ReadinessProof,
  context: WorkerBoundaryContext,
  requirement: CapabilityRequirement,
  now: number,
  revokedProofIds?: ReadonlySet<string>
): boolean {
  if (revokedProofIds?.has(proof.proofId) === true || now >= proof.expiresAt) {
    return false;
  }
  return (
    matchesIdentityTuple(proof, context) &&
    matchesGrantAndRevisionTuple(proof, context) &&
    matchesRequirementTuple(proof, requirement)
  );
}

/** Scoped cache of worker readiness proofs keyed by worker/session/requirement/resource/scope tuple. */
export class ReadinessProofCache {
  private readonly store = new Map<string, ReadinessProof>();
  private readonly revokedIds = new Set<string>();

  private buildKey(
    workerId: string,
    sessionId: string,
    req: {
      readonly id: string;
      readonly operation: string;
      readonly resourceRef?: string | undefined;
      readonly scope?: string | undefined;
    }
  ): string {
    return `${workerId}::${sessionId}::${req.id}::${req.operation}::${req.resourceRef ?? ''}::${req.scope ?? ''}`;
  }

  /** Stores a verified readiness proof. */
  putProof(proof: ReadinessProof): void {
    const key = this.buildKey(proof.workerId, proof.sessionId, {
      id: proof.requirementId,
      operation: proof.operation,
      resourceRef: proof.resourceRef,
      scope: proof.scope,
    });
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
    const key = this.buildKey(context.workerId, context.sessionId, requirement);
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

function makeFailure(
  requirement: CapabilityRequirement,
  workerId: string,
  levelReached: ReadinessLevel | 'unadvertised',
  errorClass: string,
  message: string
): ReadinessFailure {
  return {
    requirementId: requirement.id,
    operation: requirement.operation,
    resourceRef: requirement.resourceRef,
    mode: requirement.mode,
    workerId,
    levelReached,
    errorClass,
    message,
  };
}

function checkStaticBindLevel(
  requirement: CapabilityRequirement,
  context: WorkerBoundaryContext
): ReadinessFailure | null {
  if (!context.advertisedOperations.includes(requirement.operation)) {
    return makeFailure(
      requirement,
      context.workerId,
      'unadvertised',
      'UnadvertisedOperationError',
      `Operation "${requirement.operation}" is not advertised on worker "${context.workerId}"`
    );
  }
  if (!context.authorizedOperations.includes(requirement.operation)) {
    return makeFailure(
      requirement,
      context.workerId,
      'advertised',
      'UnauthorizedOperationError',
      `Operation "${requirement.operation}" is advertised but not authorized for worker "${context.workerId}"`
    );
  }
  return null;
}

function isSafeScratchPath(scratchDir: string | undefined): scratchDir is string {
  if (scratchDir === undefined) return false;
  const trimmed = scratchDir.trim();
  if (trimmed.length === 0 || !isAbsolute(trimmed)) return false;
  return !trimmed.split(/[\\/]+/).includes('..');
}

function buildProbeOptions(
  requirement: CapabilityRequirement,
  context: WorkerBoundaryContext,
  signal?: AbortSignal
): WorkerProbeExecutionOptions | ReadinessFailure {
  if (!isWriteOperation(requirement.operation)) {
    return { isScratchProbe: false, ...(signal !== undefined ? { signal } : {}) };
  }
  if (!isSafeScratchPath(context.approvedScratchDir)) {
    return makeFailure(
      requirement,
      context.workerId,
      'bound-to-worker',
      'UnsafeWriteProbeRejectedError',
      `Write capability "${requirement.operation}" cannot be probed without a safe absolute approvedScratchDir on worker "${context.workerId}"`
    );
  }
  return {
    isScratchProbe: true,
    scratchDir: context.approvedScratchDir.trim(),
    ...(signal !== undefined ? { signal } : {}),
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

function normalizeThrownProbeError(err: unknown): WorkerProbeOutcome {
  if (err instanceof Error) {
    const errorClass = err.name !== '' && err.name !== 'Error' ? err.name : 'ProbeExecutionError';
    return { ok: false, errorClass, message: err.message };
  }
  return { ok: false, errorClass: 'ProbeExecutionError', message: String(err) };
}

async function invokeProbeSafely(
  requirement: CapabilityRequirement,
  config: WorkerReadinessConfig,
  probeOptions: WorkerProbeExecutionOptions,
  signal: AbortSignal
): Promise<WorkerProbeOutcome> {
  try {
    return await config.probe(requirement, config.context, { ...probeOptions, signal });
  } catch (err: unknown) {
    return normalizeThrownProbeError(err);
  }
}

function createAbortOutcomeRace(
  requirementId: string,
  signal: AbortSignal | undefined
): Promise<WorkerProbeOutcome> {
  return new Promise<WorkerProbeOutcome>((resolve) => {
    signal?.addEventListener(
      'abort',
      () => {
        resolve({
          ok: false,
          errorClass: 'ProbeAbortedError',
          message: `Worker probe for "${requirementId}" aborted during execution`,
        });
      },
      { once: true }
    );
  });
}

async function runBoundedProbe(
  requirement: CapabilityRequirement,
  config: WorkerReadinessConfig,
  probeOptions: WorkerProbeExecutionOptions
): Promise<WorkerProbeOutcome> {
  if (config.signal?.aborted === true) {
    return {
      ok: false,
      errorClass: 'ProbeAbortedError',
      message: `Worker probe for "${requirement.id}" aborted before invocation`,
    };
  }
  const timeoutMs = config.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const controller = new AbortController();
  const onAbort = (): void => {
    controller.abort();
  };
  config.signal?.addEventListener('abort', onAbort, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutRace = new Promise<WorkerProbeOutcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({
        ok: false,
        errorClass: 'ProbeTimeoutError',
        message: `Worker probe for "${requirement.id}" timed out after ${String(timeoutMs)}ms`,
      });
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      invokeProbeSafely(requirement, config, probeOptions, controller.signal),
      timeoutRace,
      createAbortOutcomeRace(requirement.id, config.signal),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    config.signal?.removeEventListener('abort', onAbort);
  }
}

async function evaluateSingleRequirement(
  requirement: CapabilityRequirement,
  config: WorkerReadinessConfig,
  now: number,
  ttlMs: number
): Promise<{ proof?: ReadinessProof; failure?: ReadinessFailure }> {
  const cached = config.cache?.getValidProof(config.context, requirement, now);
  if (cached !== undefined) return { proof: cached };

  const staticFailure = checkStaticBindLevel(requirement, config.context);
  if (staticFailure !== null) return { failure: staticFailure };

  const probeOptionsOrFailure = buildProbeOptions(requirement, config.context, config.signal);
  if ('errorClass' in probeOptionsOrFailure) return { failure: probeOptionsOrFailure };

  const outcome = await runBoundedProbe(requirement, config, probeOptionsOrFailure);
  if (!outcome.ok) {
    return {
      failure: makeFailure(
        requirement,
        config.context.workerId,
        'bound-to-worker',
        outcome.errorClass,
        outcome.message
      ),
    };
  }
  const proof = createVerifiedProof(requirement, config.context, probeOptionsOrFailure, now, ttlMs);
  config.cache?.putProof(proof);
  return { proof };
}

/** Verifies worker readiness at the actual worker boundary across all capability requirements. */
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
      (req.mode === 'enforcing' ? failures : advisoryWarnings).push(evaluation.failure);
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
