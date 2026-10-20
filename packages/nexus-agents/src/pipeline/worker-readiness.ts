/**
 * Worker Boundary Readiness Verifier (Task T06, Issue #5129 / Milestone M1)
 * Conformance cases: C01, C02, C03, C04, C33.
 * @module pipeline/worker-readiness
 */
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { getTimeProvider } from '../core/index.js';
import type { CapabilityRequirement } from './task-contract.js';

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
const WRITE_TOKEN_REGEX =
  /(?:^|[.:/_-])(write|mutate|publish|push|delete|remove|create|update|modify|patch|commit|merge|append|overwrite|drop|truncate)(?:$|[.:/_-])/i;

export function isWriteOperation(operation: string): boolean {
  return WRITE_TOKEN_REGEX.test(operation.trim());
}

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

export interface WorkerProbeExecutionOptions {
  readonly isScratchProbe: boolean;
  readonly scratchDir?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

export type WorkerProbeOutcome =
  | { readonly ok: true; readonly latencyMs?: number | undefined }
  | { readonly ok: false; readonly errorClass: string; readonly message: string };

export type WorkerResourceProbe = (
  requirement: CapabilityRequirement,
  context: WorkerBoundaryContext,
  options: WorkerProbeExecutionOptions
) => Promise<WorkerProbeOutcome> | WorkerProbeOutcome;

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

export interface WorkerReadinessReport {
  readonly ready: boolean;
  readonly workerId: string;
  readonly proofs: readonly ReadinessProof[];
  readonly failures: readonly ReadinessFailure[];
  readonly advisoryWarnings: readonly ReadinessFailure[];
}

export interface WorkerReadinessConfig {
  readonly context: WorkerBoundaryContext;
  readonly probe: WorkerResourceProbe;
  readonly cache?: ReadinessProofCache | undefined;
  readonly now?: number | (() => number) | undefined;
  readonly proofTtlMs?: number | undefined;
  readonly probeTimeoutMs?: number | undefined;
  readonly totalTimeoutMs?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}

type ContextIdentity = Pick<
  WorkerBoundaryContext,
  | 'workerId'
  | 'sessionId'
  | 'adapterId'
  | 'toolSchemaDigest'
  | 'grantDigest'
  | 'subjectRevision'
  | 'policyVersion'
>;

type ReqKeyInput = Pick<CapabilityRequirement, 'id' | 'operation' | 'resourceRef' | 'scope'>;

function contextTuple(c: ContextIdentity): string {
  return `${c.workerId}::${c.sessionId}::${c.adapterId}::${c.toolSchemaDigest}::${c.grantDigest}::${c.subjectRevision}::${c.policyVersion}`;
}

function reqTuple(r: ReqKeyInput): string {
  return `${r.id}::${r.operation}::${r.resourceRef ?? ''}::${r.scope ?? ''}`;
}

export function isProofValidForContext(
  p: ReadinessProof,
  c: WorkerBoundaryContext,
  req: CapabilityRequirement,
  now: number,
  revokedProofIds?: ReadonlySet<string>
): boolean {
  if (revokedProofIds?.has(p.proofId) === true || now >= p.expiresAt) return false;
  const pReq: ReqKeyInput = {
    id: p.requirementId,
    operation: p.operation,
    resourceRef: p.resourceRef,
    scope: p.scope,
  };
  return contextTuple(p) === contextTuple(c) && reqTuple(pReq) === reqTuple(req);
}

export class ReadinessProofCache {
  private readonly store = new Map<string, ReadinessProof>();
  private readonly revokedIds = new Set<string>();

  putProof(p: ReadinessProof): void {
    const pReq: ReqKeyInput = {
      id: p.requirementId,
      operation: p.operation,
      resourceRef: p.resourceRef,
      scope: p.scope,
    };
    this.store.set(`${p.workerId}::${p.sessionId}::${reqTuple(pReq)}`, p);
  }

  revokeProof(proofId: string): void {
    this.revokedIds.add(proofId);
  }

  getValidProof(
    ctx: WorkerBoundaryContext,
    req: CapabilityRequirement,
    now: number
  ): ReadinessProof | undefined {
    const k = `${ctx.workerId}::${ctx.sessionId}::${reqTuple(req)}`;
    const candidate = this.store.get(k);
    if (candidate === undefined) return undefined;
    if (!isProofValidForContext(candidate, ctx, req, now, this.revokedIds)) {
      this.store.delete(k);
      return undefined;
    }
    return candidate;
  }
}

function makeFailure(
  req: CapabilityRequirement,
  workerId: string,
  levelReached: ReadinessLevel | 'unadvertised',
  errorClass: string,
  message: string
): ReadinessFailure {
  return {
    requirementId: req.id,
    operation: req.operation,
    resourceRef: req.resourceRef,
    mode: req.mode,
    workerId,
    levelReached,
    errorClass,
    message,
  };
}

function checkStaticBindLevel(
  req: CapabilityRequirement,
  ctx: WorkerBoundaryContext
): ReadinessFailure | null {
  if (!ctx.advertisedOperations.includes(req.operation)) {
    return makeFailure(
      req,
      ctx.workerId,
      'unadvertised',
      'UnadvertisedOperationError',
      `Operation "${req.operation}" is not advertised on worker "${ctx.workerId}"`
    );
  }
  if (!ctx.authorizedOperations.includes(req.operation)) {
    return makeFailure(
      req,
      ctx.workerId,
      'advertised',
      'UnauthorizedOperationError',
      `Operation "${req.operation}" is advertised but not authorized for worker "${ctx.workerId}"`
    );
  }
  return null;
}

function isSafeScratchPath(scratchDir: string | undefined): scratchDir is string {
  if (scratchDir === undefined) return false;
  const trimmed = scratchDir.trim();
  return trimmed.length > 0 && isAbsolute(trimmed) && !trimmed.split(/[\\/]+/).includes('..');
}

function buildProbeOptions(
  req: CapabilityRequirement,
  ctx: WorkerBoundaryContext,
  signal?: AbortSignal
): WorkerProbeExecutionOptions | ReadinessFailure {
  if (!isWriteOperation(req.operation)) {
    return { isScratchProbe: false, ...(signal !== undefined ? { signal } : {}) };
  }
  if (!isSafeScratchPath(ctx.approvedScratchDir)) {
    return makeFailure(
      req,
      ctx.workerId,
      'bound-to-worker',
      'UnsafeWriteProbeRejectedError',
      `Write capability "${req.operation}" cannot be probed without a safe absolute approvedScratchDir on worker "${ctx.workerId}"`
    );
  }
  return {
    isScratchProbe: true,
    scratchDir: ctx.approvedScratchDir.trim(),
    ...(signal !== undefined ? { signal } : {}),
  };
}

function createVerifiedProof(
  req: CapabilityRequirement,
  ctx: WorkerBoundaryContext,
  probeOptions: WorkerProbeExecutionOptions,
  issuedAt: number,
  ttlMs: number
): ReadinessProof {
  const tuple = `${ctx.workerId}::${ctx.sessionId}::${reqTuple(req)}::${String(issuedAt)}`;
  const digest = createHash('sha256').update(tuple).digest('hex').slice(0, 12);
  return {
    proofId: `proof-${ctx.workerId}-${req.id}-${digest}-${String(issuedAt)}`,
    requirementId: req.id,
    operation: req.operation,
    resourceRef: req.resourceRef,
    scope: req.scope,
    level: 'probed',
    workerId: ctx.workerId,
    sessionId: ctx.sessionId,
    adapterId: ctx.adapterId,
    toolSchemaDigest: ctx.toolSchemaDigest,
    grantDigest: ctx.grantDigest,
    subjectRevision: ctx.subjectRevision,
    policyVersion: ctx.policyVersion,
    issuedAt,
    expiresAt: issuedAt + ttlMs,
    ...(probeOptions.isScratchProbe
      ? { probedInScratch: true, narrowerThanTargetWrite: true }
      : {}),
  };
}

async function invokeProbeSafely(
  req: CapabilityRequirement,
  config: WorkerReadinessConfig,
  probeOptions: WorkerProbeExecutionOptions,
  signal: AbortSignal
): Promise<WorkerProbeOutcome> {
  try {
    return await config.probe(req, config.context, { ...probeOptions, signal });
  } catch (err: unknown) {
    const errorClass =
      err instanceof Error && err.name !== '' && err.name !== 'Error'
        ? err.name
        : 'ProbeExecutionError';
    return { ok: false, errorClass, message: err instanceof Error ? err.message : String(err) };
  }
}

function makeAbortRace(reqId: string, signal?: AbortSignal): Promise<WorkerProbeOutcome> {
  return new Promise<WorkerProbeOutcome>((resolve) => {
    signal?.addEventListener(
      'abort',
      () => {
        resolve({
          ok: false,
          errorClass: 'ProbeAbortedError',
          message: `Worker probe for "${reqId}" aborted during execution`,
        });
      },
      { once: true }
    );
  });
}

async function runBoundedProbe(
  req: CapabilityRequirement,
  config: WorkerReadinessConfig,
  probeOptions: WorkerProbeExecutionOptions,
  effectiveTimeoutMs: number
): Promise<WorkerProbeOutcome> {
  if (config.signal?.aborted === true) {
    return {
      ok: false,
      errorClass: 'ProbeAbortedError',
      message: `Worker probe for "${req.id}" aborted before invocation`,
    };
  }
  if (effectiveTimeoutMs <= 0) {
    return {
      ok: false,
      errorClass: 'ProbeTimeoutError',
      message: `Worker preflight deadline exhausted before probing "${req.id}"`,
    };
  }
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
        message: `Worker probe for "${req.id}" timed out after ${String(effectiveTimeoutMs)}ms`,
      });
    }, effectiveTimeoutMs);
  });
  try {
    return await Promise.race([
      invokeProbeSafely(req, config, probeOptions, controller.signal),
      timeoutRace,
      makeAbortRace(req.id, config.signal),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    config.signal?.removeEventListener('abort', onAbort);
  }
}

function resolveClock(nowConfig: number | (() => number) | undefined): () => number {
  if (typeof nowConfig === 'function') return nowConfig;
  if (typeof nowConfig === 'number') {
    const startWall = getTimeProvider().now();
    return () => nowConfig + Math.max(0, getTimeProvider().now() - startWall);
  }
  return () => getTimeProvider().now();
}

async function evaluateSingleRequirement(
  req: CapabilityRequirement,
  config: WorkerReadinessConfig,
  clock: () => number,
  ttlMs: number,
  deadlineAt: number | undefined
): Promise<{ proof?: ReadinessProof; failure?: ReadinessFailure }> {
  const stepStart = clock();
  const cached = config.cache?.getValidProof(config.context, req, stepStart);
  if (cached !== undefined) return { proof: cached };
  const staticFailure = checkStaticBindLevel(req, config.context);
  if (staticFailure !== null) return { failure: staticFailure };
  const probeOptionsOrFailure = buildProbeOptions(req, config.context, config.signal);
  if ('errorClass' in probeOptionsOrFailure) return { failure: probeOptionsOrFailure };

  const perProbe = config.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const budgetMs = deadlineAt !== undefined ? Math.min(perProbe, deadlineAt - stepStart) : perProbe;
  const outcome = await runBoundedProbe(req, config, probeOptionsOrFailure, budgetMs);
  if (!outcome.ok) {
    return {
      failure: makeFailure(
        req,
        config.context.workerId,
        'bound-to-worker',
        outcome.errorClass,
        outcome.message
      ),
    };
  }
  const proof = createVerifiedProof(req, config.context, probeOptionsOrFailure, clock(), ttlMs);
  config.cache?.putProof(proof);
  return { proof };
}

function revalidateProofsAtCompletion(
  entries: readonly { readonly req: CapabilityRequirement; readonly proof: ReadinessProof }[],
  config: WorkerReadinessConfig,
  completionTime: number,
  failures: ReadinessFailure[],
  advisoryWarnings: ReadinessFailure[]
): ReadinessProof[] {
  const validProofs: ReadinessProof[] = [];
  for (const { req, proof } of entries) {
    const isFresh =
      config.cache !== undefined
        ? config.cache.getValidProof(config.context, req, completionTime) !== undefined
        : isProofValidForContext(proof, config.context, req, completionTime);
    if (isFresh) {
      validProofs.push(proof);
      continue;
    }
    const fail = makeFailure(
      req,
      config.context.workerId,
      'bound-to-worker',
      'ProofExpiredDuringPreflightError',
      `Cached readiness proof "${proof.proofId}" expired before preflight completed`
    );
    (req.mode === 'enforcing' ? failures : advisoryWarnings).push(fail);
  }
  return validProofs;
}

export async function verifyWorkerReadiness(
  requirements: readonly CapabilityRequirement[],
  config: WorkerReadinessConfig
): Promise<WorkerReadinessReport> {
  const clock = resolveClock(config.now);
  const startTime = clock();
  const ttlMs = config.proofTtlMs ?? DEFAULT_PROOF_TTL_MS;
  const deadlineAt =
    config.totalTimeoutMs !== undefined ? startTime + config.totalTimeoutMs : undefined;
  const entries: { readonly req: CapabilityRequirement; readonly proof: ReadinessProof }[] = [];
  const failures: ReadinessFailure[] = [];
  const advisoryWarnings: ReadinessFailure[] = [];

  for (const req of requirements) {
    const evaluation = await evaluateSingleRequirement(req, config, clock, ttlMs, deadlineAt);
    if (evaluation.proof !== undefined) entries.push({ req, proof: evaluation.proof });
    else if (evaluation.failure !== undefined) {
      (req.mode === 'enforcing' ? failures : advisoryWarnings).push(evaluation.failure);
    }
  }
  const proofs = revalidateProofsAtCompletion(entries, config, clock(), failures, advisoryWarnings);
  return {
    ready: failures.length === 0,
    workerId: config.context.workerId,
    proofs,
    failures,
    advisoryWarnings,
  };
}
