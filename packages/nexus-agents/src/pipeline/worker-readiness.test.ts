/**
 * Tests for Worker Boundary Readiness Verification (Task T06, Issue #5129 / Milestone M1)
 *
 * Conformance cases:
 * - C01: Parent can read, worker cannot (worker/session scoped capability resolution)
 * - C02: Advertised tool does not work (distinguish advertised from usable; preserve error class)
 * - C03: Authorized artifact recovery (re-probe actual worker on new attempt without broadening scope)
 * - C04: Revoked or changed grant (stale proof invalidated on grant/schema/subject/expiry change)
 * - C33: Unsafe write-capability probe (no unapproved target mutation; scratch proof or explicit rejection)
 *
 * Disciplines: Red/Green TDD, Zero `any` policy, non-vacuous verdicts.
 */
import { describe, it, expect } from 'vitest';
import {
  READINESS_LEVELS,
  ReadinessProofCache,
  isProofValidForContext,
  isWriteOperation,
  verifyWorkerReadiness,
  type WorkerBoundaryContext,
  type WorkerResourceProbe,
  type ReadinessProof,
} from './worker-readiness.js';
import type { CapabilityRequirement } from './task-contract.js';
import { PipelineRunner } from './pipeline-runner.js';
import type { PlanContract, TaskContract } from './task-contract.js';

function baseWorkerContext(overrides: Partial<WorkerBoundaryContext> = {}): WorkerBoundaryContext {
  return {
    workerId: 'worker-seat-devex',
    sessionId: 'session-001',
    adapterId: 'cli-codex',
    toolSchemaDigest: 'sha256-schema-v1',
    grantDigest: 'sha256-grant-v1',
    subjectRevision: 'ed8c25ab01',
    policyVersion: '1.0.0',
    advertisedOperations: ['artifact.read', 'file.read', 'file.write', 'repo.mutate'],
    authorizedOperations: ['artifact.read', 'file.read', 'file.write'],
    ...overrides,
  };
}

describe('Task T06: Readiness Levels & Write Operation Classification', () => {
  it('defines the canonical readiness progression levels', () => {
    expect(READINESS_LEVELS).toEqual([
      'advertised',
      'authorized',
      'bound-to-worker',
      'probed',
      'used',
    ]);
  });

  it('classifies mutating operations accurately as write operations', () => {
    expect(isWriteOperation('file.write')).toBe(true);
    expect(isWriteOperation('write.artifact')).toBe(true);
    expect(isWriteOperation('repo.mutate')).toBe(true);
    expect(isWriteOperation('release.publish')).toBe(true);
    expect(isWriteOperation('git.push')).toBe(true);
    expect(isWriteOperation('fs:write')).toBe(true);
    expect(isWriteOperation('repo_update')).toBe(true);
    expect(isWriteOperation('git-commit')).toBe(true);
    expect(isWriteOperation('artifact.modify')).toBe(true);
    expect(isWriteOperation('artifact.read')).toBe(false);
    expect(isWriteOperation('file.read')).toBe(false);
  });
});

describe('Task T06 / C01: Parent Can Read, Worker Cannot', () => {
  it('rejects parent-controller proof when verifying child worker readiness', async () => {
    const cache = new ReadinessProofCache();
    const now = 1_700_000_000_000;

    const requirement: CapabilityRequirement = {
      id: 'cap-read-fixture',
      operation: 'artifact.read',
      resourceRef: 'artifact:fixture-diff',
      scope: 'task-only',
      mode: 'enforcing',
    };

    const parentContext = baseWorkerContext({
      workerId: 'parent-controller',
      sessionId: 'session-parent',
    });

    const childContext = baseWorkerContext({
      workerId: 'child-voter-catfish',
      sessionId: 'session-child',
    });

    // Parent probes and succeeds
    const parentProbe: WorkerResourceProbe = (req, ctx) => {
      if (ctx.workerId === 'parent-controller') {
        return { ok: true, latencyMs: 5 };
      }
      return {
        ok: false,
        errorClass: 'MountUnavailableError',
        message: `Worker ${ctx.workerId} lacks bind mount for ${req.resourceRef ?? req.operation}`,
      };
    };

    const parentReport = await verifyWorkerReadiness([requirement], {
      context: parentContext,
      probe: parentProbe,
      cache,
      now,
    });
    expect(parentReport.ready).toBe(true);
    expect(parentReport.proofs).toHaveLength(1);
    expect(parentReport.proofs[0]?.workerId).toBe('parent-controller');

    // Child worker must NOT inherit parent's cached proof and must fail readiness
    const childReport = await verifyWorkerReadiness([requirement], {
      context: childContext,
      probe: parentProbe,
      cache,
      now: now + 100,
    });
    expect(childReport.ready).toBe(false);
    expect(childReport.failures).toHaveLength(1);
    expect(childReport.failures[0]?.requirementId).toBe('cap-read-fixture');
    expect(childReport.failures[0]?.workerId).toBe('child-voter-catfish');
    expect(childReport.failures[0]?.errorClass).toBe('MountUnavailableError');
    expect(childReport.failures[0]?.levelReached).toBe('bound-to-worker');
  });
});

describe('Task T06 / C02: Advertised Tool Does Not Work', () => {
  it('distinguishes advertised/bound tools from usable tools and preserves original error class', async () => {
    const requirement: CapabilityRequirement = {
      id: 'cap-mcp-read',
      operation: 'artifact.read',
      resourceRef: 'artifact:pr-7518',
      mode: 'enforcing',
    };

    const ctx = baseWorkerContext();
    const failingAuthProbe: WorkerResourceProbe = () => ({
      ok: false,
      errorClass: 'EACCES_RESOURCE_DENIED',
      message: 'Token scope insufficient for artifact:pr-7518',
    });

    const report = await verifyWorkerReadiness([requirement], {
      context: ctx,
      probe: failingAuthProbe,
      now: 1_700_000_000_000,
    });

    expect(report.ready).toBe(false);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]?.levelReached).toBe('bound-to-worker');
    expect(report.failures[0]?.errorClass).toBe('EACCES_RESOURCE_DENIED');
    expect(report.failures[0]?.message).toContain('Token scope insufficient');
  });

  it('marks un-authorized but advertised operations as stopping at advertised level', async () => {
    const requirement: CapabilityRequirement = {
      id: 'cap-unauth',
      operation: 'repo.mutate',
      mode: 'enforcing',
    };

    // repo.mutate is in advertisedOperations, but NOT in authorizedOperations
    const ctx = baseWorkerContext();
    const report = await verifyWorkerReadiness([requirement], {
      context: ctx,
      probe: () => ({ ok: true }),
      now: 1_700_000_000_000,
    });

    expect(report.ready).toBe(false);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]?.levelReached).toBe('advertised');
    expect(report.failures[0]?.errorClass).toBe('UnauthorizedOperationError');
  });
});

describe('Task T06 / C03: Authorized Artifact Recovery', () => {
  it('re-probes actual worker on a new attempt after bounded artifact delivery and succeeds', async () => {
    const cache = new ReadinessProofCache();
    const requirement: CapabilityRequirement = {
      id: 'cap-read-bundle',
      operation: 'artifact.read',
      resourceRef: 'artifact:review-bundle-001',
      mode: 'enforcing',
    };

    const ctx = baseWorkerContext();
    let artifactDeliveredToWorker = false;

    const workerProbe: WorkerResourceProbe = (req) => {
      if (!artifactDeliveredToWorker) {
        return {
          ok: false,
          errorClass: 'ArtifactMissingOnWorkerError',
          message: `${req.resourceRef ?? ''} not present in worker bundle`,
        };
      }
      return { ok: true, latencyMs: 3 };
    };

    // Attempt 1: artifact withheld -> worker not ready
    const attempt1 = await verifyWorkerReadiness([requirement], {
      context: ctx,
      probe: workerProbe,
      cache,
      now: 1_700_000_000_000,
    });
    expect(attempt1.ready).toBe(false);
    expect(attempt1.failures[0]?.errorClass).toBe('ArtifactMissingOnWorkerError');

    // Bounded remedy: deliver already-authorized artifact without expanding grant/scope
    artifactDeliveredToWorker = true;

    // Attempt 2: re-probes the actual worker and succeeds
    const attempt2 = await verifyWorkerReadiness([requirement], {
      context: ctx,
      probe: workerProbe,
      cache,
      now: 1_700_000_001_000,
    });
    expect(attempt2.ready).toBe(true);
    expect(attempt2.failures).toHaveLength(0);
    expect(attempt2.proofs).toHaveLength(1);
    expect(attempt2.proofs[0]?.level).toBe('probed');
  });
});

describe('Task T06 / C04: Revoked or Changed Grant Invalidates Proof', () => {
  it('invalidates cached readiness proof when grantDigest, toolSchemaDigest, subjectRevision, expiry, or revocation changes', async () => {
    const cache = new ReadinessProofCache();
    const now = 1_700_000_000_000;
    let probeCalls = 0;

    const requirement: CapabilityRequirement = {
      id: 'cap-read',
      operation: 'artifact.read',
      resourceRef: 'artifact:diff-1',
      mode: 'enforcing',
    };

    const ctx = baseWorkerContext();
    const countingProbe: WorkerResourceProbe = () => {
      probeCalls += 1;
      return { ok: true, latencyMs: 2 };
    };

    // Initial verification probes and caches proof
    const first = await verifyWorkerReadiness([requirement], {
      context: ctx,
      probe: countingProbe,
      cache,
      now,
      proofTtlMs: 60_000,
    });
    expect(first.ready).toBe(true);
    expect(probeCalls).toBe(1);
    const initialProof = first.proofs[0] as ReadinessProof;

    // Same context within TTL reuses cached proof without re-probing
    const second = await verifyWorkerReadiness([requirement], {
      context: ctx,
      probe: countingProbe,
      cache,
      now: now + 10_000,
    });
    expect(second.ready).toBe(true);
    expect(probeCalls).toBe(1);

    // Changed grantDigest invalidates proof and triggers re-probe
    const changedGrantCtx = baseWorkerContext({ grantDigest: 'sha256-grant-v2' });
    expect(isProofValidForContext(initialProof, changedGrantCtx, requirement, now + 15_000)).toBe(
      false
    );

    await verifyWorkerReadiness([requirement], {
      context: changedGrantCtx,
      probe: countingProbe,
      cache,
      now: now + 15_000,
    });
    expect(probeCalls).toBe(2);

    // Changed subjectRevision invalidates proof
    const changedSubjectCtx = baseWorkerContext({ subjectRevision: 'new-sha-9999' });
    expect(isProofValidForContext(initialProof, changedSubjectCtx, requirement, now + 15_000)).toBe(
      false
    );

    // Expired timestamp invalidates proof
    expect(isProofValidForContext(initialProof, ctx, requirement, now + 61_000)).toBe(false);

    // Explicit revocation invalidates proof
    cache.revokeProof(initialProof.proofId);
    expect(cache.getValidProof(ctx, requirement, now + 20_000)).toBeUndefined();
  });

  it('isolates cached proofs by resourceRef and scope so narrow proofs never satisfy broader requirements', async () => {
    const cache = new ReadinessProofCache();
    const now = 1_700_000_000_000;
    const ctx = baseWorkerContext();

    const narrowReq: CapabilityRequirement = {
      id: 'cap-shared-id',
      operation: 'artifact.read',
      resourceRef: 'artifact:public-readme',
      scope: 'public',
      mode: 'enforcing',
    };
    const restrictedReq: CapabilityRequirement = {
      id: 'cap-shared-id',
      operation: 'artifact.read',
      resourceRef: 'artifact:secret-diff',
      scope: 'restricted',
      mode: 'enforcing',
    };

    const first = await verifyWorkerReadiness([narrowReq], {
      context: ctx,
      probe: () => ({ ok: true }),
      cache,
      now,
    });
    expect(first.ready).toBe(true);

    // Narrow proof must NOT be overwritten or reused for restrictedReq, and narrowReq proof must remain intact
    const second = await verifyWorkerReadiness([restrictedReq], {
      context: ctx,
      probe: () => ({
        ok: false,
        errorClass: 'RestrictedScopeDeniedError',
        message: 'Denied restricted scope',
      }),
      cache,
      now: now + 100,
    });
    expect(second.ready).toBe(false);
    expect(cache.getValidProof(ctx, narrowReq, now + 200)).toBeDefined();

    // If restrictedReq later succeeds at the same timestamp, its proofId must be distinct from narrowReq
    const third = await verifyWorkerReadiness([restrictedReq], {
      context: ctx,
      probe: () => ({ ok: true }),
      cache,
      now,
    });
    expect(third.ready).toBe(true);
    expect(third.proofs[0]?.proofId).not.toBe(first.proofs[0]?.proofId);

    // Revoking restrictedReq's proof must NOT revoke narrowReq's proof
    cache.revokeProof(third.proofs[0]?.proofId ?? '');
    expect(cache.getValidProof(ctx, restrictedReq, now + 100)).toBeUndefined();
    expect(cache.getValidProof(ctx, narrowReq, now + 100)).toBeDefined();
  });

  it('rejects cached proofs that expire while subsequent requirements are being probed', async () => {
    const cache = new ReadinessProofCache();
    let clock = 1_700_000_000_000;
    const ctx = baseWorkerContext();

    const req1: CapabilityRequirement = {
      id: 'cap-short-ttl',
      operation: 'artifact.read',
      resourceRef: 'artifact:one',
      mode: 'enforcing',
    };
    const req2: CapabilityRequirement = {
      id: 'cap-slow-probe',
      operation: 'file.read',
      resourceRef: 'artifact:two',
      mode: 'enforcing',
    };

    // Prime cache for req1 with 50ms TTL
    await verifyWorkerReadiness([req1], {
      context: ctx,
      probe: () => ({ ok: true }),
      cache,
      now: () => clock,
      proofTtlMs: 50,
    });

    // Now verify [req1, req2]: req1 hits cache at t=0, req2 takes 60ms so clock advances past req1's expiry
    const report = await verifyWorkerReadiness([req1, req2], {
      context: ctx,
      probe: (req) => {
        if (req.id === 'cap-slow-probe') {
          clock += 60;
        }
        return { ok: true };
      },
      cache,
      now: () => clock,
      proofTtlMs: 50,
    });

    expect(report.ready).toBe(false);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]?.requirementId).toBe('cap-short-ttl');
    expect(report.failures[0]?.errorClass).toBe('ProofExpiredDuringPreflightError');
  });

  it('prevents delimiter-injected cache-key collisions and rejects expired proof when cache is concurrently refreshed', async () => {
    const cache = new ReadinessProofCache();
    let clock = 1_700_000_000_000;
    const ctx = baseWorkerContext();

    // Delimiter collision attempt: resourceRef="a::b" + scope="c" vs resourceRef="a" + scope="b::c"
    const reqDelimiterA: CapabilityRequirement = {
      id: 'cap-delim',
      operation: 'artifact.read',
      resourceRef: 'a::b',
      scope: 'c',
      mode: 'enforcing',
    };
    const reqDelimiterB: CapabilityRequirement = {
      id: 'cap-delim',
      operation: 'artifact.read',
      resourceRef: 'a',
      scope: 'b::c',
      mode: 'enforcing',
    };

    await verifyWorkerReadiness([reqDelimiterA], {
      context: ctx,
      probe: () => ({ ok: true }),
      cache,
      now: () => clock,
    });
    expect(cache.getValidProof(ctx, reqDelimiterB, clock)).toBeUndefined();

    // Concurrent cache replacement during preflight: expired proof1 must not be returned even if cache now has fresh proof2
    const reqConcurrent: CapabilityRequirement = {
      id: 'cap-concurrent',
      operation: 'artifact.read',
      resourceRef: 'artifact:concurrent',
      mode: 'enforcing',
    };
    const reqTrigger: CapabilityRequirement = {
      id: 'cap-trigger',
      operation: 'file.read',
      resourceRef: 'artifact:trigger',
      mode: 'enforcing',
    };

    const firstRun = await verifyWorkerReadiness([reqConcurrent], {
      context: ctx,
      probe: () => ({ ok: true }),
      cache,
      now: () => clock,
      proofTtlMs: 40,
    });
    const originalProof = firstRun.proofs[0];
    expect(originalProof).toBeDefined();

    const concurrentReport = await verifyWorkerReadiness([reqConcurrent, reqTrigger], {
      context: ctx,
      probe: (req) => {
        if (req.id === 'cap-trigger') {
          clock += 50; // originalProof is now expired (t=50 >= 40)
          // Another concurrent caller refreshes cache with a new proof
          cache.putProof({
            ...(originalProof as ReadinessProof),
            proofId: 'proof-refreshed-concurrent',
            issuedAt: clock,
            expiresAt: clock + 1000,
          });
        }
        return { ok: true };
      },
      cache,
      now: () => clock,
      proofTtlMs: 40,
    });

    // Must not return expired originalProof as valid evidence; should return the refreshed proof or fail
    expect(concurrentReport.proofs.some((p) => p.proofId === originalProof?.proofId)).toBe(false);

    // Unprobed cached proofs (e.g. level="advertised" or "authorized") must never satisfy readiness
    const unprobedProof: ReadinessProof = {
      ...(originalProof as ReadinessProof),
      proofId: 'proof-unprobed-advertised',
      level: 'advertised',
      issuedAt: clock,
      expiresAt: clock + 5000,
    };
    cache.putProof(unprobedProof);
    expect(isProofValidForContext(unprobedProof, ctx, reqConcurrent, clock)).toBe(false);
  });
});

describe('Task T06 / C33: Unsafe Write-Capability Probe Prevention', () => {
  it('detects camelCase, snake_case, and manifest mutating tools while keeping read operations read-only', () => {
    expect(isWriteOperation('writeFile')).toBe(true);
    expect(isWriteOperation('edit_file')).toBe(true);
    expect(isWriteOperation('save_file')).toBe(true);
    expect(isWriteOperation('gitCommit')).toBe(true);
    expect(isWriteOperation('uploadArtifact')).toBe(true);
    expect(isWriteOperation('db.upsert')).toBe(true);
    expect(isWriteOperation('fs:unlink')).toBe(true);
    expect(isWriteOperation('memory_write')).toBe(true);
    expect(isWriteOperation('artifact.read')).toBe(false);
    expect(isWriteOperation('output.read')).toBe(false);
    expect(isWriteOperation('git.list_commits')).toBe(false);
    expect(isWriteOperation('read_file')).toBe(false);
    expect(isWriteOperation('memory_query')).toBe(false);
    expect(isWriteOperation('readWriteLock')).toBe(true);
  });

  it('refuses write probe when no approvedScratchDir is configured', async () => {
    const writeReq: CapabilityRequirement = {
      id: 'cap-write-file',
      operation: 'file.write',
      resourceRef: 'packages/nexus-agents/src/index.ts',
      mode: 'enforcing',
    };

    const ctxWithoutScratch = baseWorkerContext({ approvedScratchDir: undefined });
    let probeExecuted = false;

    const report = await verifyWorkerReadiness([writeReq], {
      context: ctxWithoutScratch,
      probe: () => {
        probeExecuted = true;
        return { ok: true };
      },
      now: 1_700_000_000_000,
    });

    expect(report.ready).toBe(false);
    expect(probeExecuted).toBe(false);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]?.errorClass).toBe('UnsafeWriteProbeRejectedError');
    expect(report.failures[0]?.levelReached).toBe('bound-to-worker');
  });

  it('confines write probe to approvedScratchDir and marks proof as narrowerThanTargetWrite', async () => {
    const writeReq: CapabilityRequirement = {
      id: 'cap-write-file',
      operation: 'file.write',
      resourceRef: 'packages/nexus-agents/src/index.ts',
      mode: 'enforcing',
    };

    const ctxWithScratch = baseWorkerContext({
      approvedScratchDir: '/tmp/nexus-approved-scratch-001',
    });
    let observedTargetDir: string | undefined;
    let observedScratchFlag: boolean | undefined;

    const report = await verifyWorkerReadiness([writeReq], {
      context: ctxWithScratch,
      probe: (_req, _ctx, probeOpts) => {
        observedTargetDir = probeOpts.scratchDir;
        observedScratchFlag = probeOpts.isScratchProbe;
        return { ok: true };
      },
      now: 1_700_000_000_000,
    });

    expect(report.ready).toBe(true);
    expect(observedTargetDir).toBe('/tmp/nexus-approved-scratch-001');
    expect(observedScratchFlag).toBe(true);
    expect(report.proofs[0]?.probedInScratch).toBe(true);
    expect(report.proofs[0]?.narrowerThanTargetWrite).toBe(true);
  });

  it('rejects relative or traversal approvedScratchDir paths', async () => {
    const writeReq: CapabilityRequirement = {
      id: 'cap-write-file',
      operation: 'file.write',
      resourceRef: 'packages/nexus-agents/src/index.ts',
      mode: 'enforcing',
    };

    const traversalCtx = baseWorkerContext({ approvedScratchDir: '/tmp/scratch/../../etc' });
    const report = await verifyWorkerReadiness([writeReq], {
      context: traversalCtx,
      probe: () => ({ ok: true }),
      now: 1_700_000_000_000,
    });

    expect(report.ready).toBe(false);
    expect(report.failures[0]?.errorClass).toBe('UnsafeWriteProbeRejectedError');
  });

  it('captures thrown/rejected probe exceptions as structured ReadinessFailure without crashing advisory or enforcing checks', async () => {
    const advisoryReq: CapabilityRequirement = {
      id: 'cap-advisory-throw',
      operation: 'artifact.read',
      mode: 'advisory',
    };
    const enforcingReq: CapabilityRequirement = {
      id: 'cap-enforcing-throw',
      operation: 'file.read',
      mode: 'enforcing',
    };

    const report = await verifyWorkerReadiness([advisoryReq, enforcingReq], {
      context: baseWorkerContext(),
      probe: () => {
        const err = new Error('Socket hang up during worker probe');
        err.name = 'ECONNRESET';
        throw err;
      },
      now: 1_700_000_000_000,
    });

    expect(report.ready).toBe(false);
    expect(report.advisoryWarnings).toHaveLength(1);
    expect(report.advisoryWarnings[0]?.errorClass).toBe('ECONNRESET');
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]?.errorClass).toBe('ECONNRESET');
    expect(report.failures[0]?.message).toContain('Socket hang up');
  });

  it('bounds stalled worker probes via probeTimeoutMs and AbortSignal, including synchronous clock overruns', async () => {
    const req: CapabilityRequirement = {
      id: 'cap-stalled',
      operation: 'artifact.read',
      mode: 'enforcing',
    };

    const report = await verifyWorkerReadiness([req], {
      context: baseWorkerContext(),
      probeTimeoutMs: 15,
      probe: () =>
        new Promise(() => {
          // Never resolves
        }),
      now: 1_700_000_000_000,
    });

    expect(report.ready).toBe(false);
    expect(report.failures[0]?.errorClass).toBe('ProbeTimeoutError');

    // Synchronous probe that advances clock past probeTimeoutMs or totalTimeoutMs must also fail
    let syncClock = 1_700_000_000_000;
    const syncOverrun = await verifyWorkerReadiness([req], {
      context: baseWorkerContext(),
      probeTimeoutMs: 10,
      totalTimeoutMs: 25,
      now: () => syncClock,
      probe: () => {
        syncClock += 30;
        return { ok: true };
      },
    });
    expect(syncOverrun.ready).toBe(false);
    expect(syncOverrun.failures[0]?.errorClass).toBe('ProbeTimeoutError');
  });
});

describe('Task T06: PipelineRunner Worker Boundary Preflight Integration', () => {
  it('blocks PipelineRunner execution when enforcing worker capability probe fails', async () => {
    const runner = new PipelineRunner();
    const plan: PlanContract = {
      taskId: 'task-t06-test',
      stages: [
        {
          id: 'stage-1',
          type: 'analyze',
          pluginId: 'nexus:task-analyzer',
          inputArtifacts: [],
          outputArtifacts: ['result'],
          dependencies: [],
          config: {},
        },
      ],
      policyGates: [],
      estimatedCost: {
        totalTokensIn: 100,
        totalTokensOut: 50,
        estimatedCostUsd: 0.01,
        modelCalls: 1,
      },
      approvalRequired: false,
      maxIterations: 5,
      timeoutMs: 30_000,
    };

    const compiled = runner.compile(plan);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const task: TaskContract = {
      id: 'task-t06-test',
      description: 'Test worker boundary preflight',
      status: 'approved',
      analysis: { complexity: 'low', taskType: 'feature', ambiguityScore: 0.1 },
      constraints: { scope: [] },
      requiredCapabilities: { tools: [], experts: [] },
      capabilityGaps: {
        available: { tools: [], experts: [] },
        gaps: [],
        allSatisfied: true,
        gapsMeasured: true,
      },
      artifacts: [],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      contractVersion: '1.0.0',
      capabilityRequirements: [
        {
          id: 'req-artifact-access',
          operation: 'artifact.read',
          resourceRef: 'artifact:restricted-diff',
          mode: 'enforcing',
        },
      ],
      evidenceObligations: [],
    };

    const execResult = await runner.execute(compiled.value, task, {
      workerReadiness: {
        context: baseWorkerContext({ workerId: 'worker-starved' }),
        probe: () => ({
          ok: false,
          errorClass: 'ArtifactMountDeniedError',
          message: 'Worker cannot read artifact:restricted-diff',
        }),
      },
    });

    expect(execResult.ok).toBe(true);
    if (execResult.ok) {
      expect(execResult.value.success).toBe(false);
      expect(execResult.value.stepsExecuted).toBe(0);
      expect(execResult.value.error).toContain('ArtifactMountDeniedError');
      expect(execResult.value.error).toContain('req-artifact-access');
    }

    // Also verify PipelineRunner enforces aggregate deadline across multiple stalled probes,
    // prevents stage execution when advisory probes exhaust the pipeline budget, and combines AbortSignals.
    let stalledProbeCount = 0;
    const multiStalledTask: TaskContract = {
      ...task,
      capabilityRequirements: [
        { id: 'adv-1', operation: 'artifact.read', mode: 'advisory' },
        { id: 'adv-2', operation: 'file.read', mode: 'advisory' },
        { id: 'adv-3', operation: 'artifact.read', mode: 'advisory' },
        { id: 'adv-4', operation: 'file.read', mode: 'advisory' },
      ],
    };

    const startMulti = Date.now();
    const stalledExec = await runner.execute(compiled.value, multiStalledTask, {
      timeout: 30,
      workerReadiness: {
        context: baseWorkerContext({ workerId: 'worker-stalled-preflight' }),
        probe: () => {
          stalledProbeCount += 1;
          return new Promise(() => {
            // Never resolves
          });
        },
      },
    });
    const elapsedMulti = Date.now() - startMulti;
    expect(stalledExec.ok).toBe(true);
    if (stalledExec.ok) {
      expect(stalledExec.value.success).toBe(false);
      expect(stalledExec.value.stepsExecuted).toBe(0);
      expect(stalledProbeCount).toBe(1);
      expect(elapsedMulti).toBeLessThan(120);
    }

    // Verify pipeline options.signal cancels preflight even when workerReadiness.signal is also provided
    const pipelineAbort = new AbortController();
    const workerAbort = new AbortController();
    setTimeout(() => {
      pipelineAbort.abort();
    }, 10);

    const abortedExec = await runner.execute(compiled.value, task, {
      signal: pipelineAbort.signal,
      timeout: 5_000,
      workerReadiness: {
        context: baseWorkerContext({ workerId: 'worker-combined-signal' }),
        signal: workerAbort.signal,
        probe: () =>
          new Promise(() => {
            // Never resolves
          }),
      },
    });
    expect(abortedExec.ok).toBe(true);
    if (abortedExec.ok) {
      expect(abortedExec.value.success).toBe(false);
      expect(abortedExec.value.stepsExecuted).toBe(0);
    }

    // Verify pre-aborted workerReadiness.signal blocks stage execution even when cached proof exists
    const preAbortedWorker = new AbortController();
    preAbortedWorker.abort();
    const cachedAbortCache = new ReadinessProofCache();
    await verifyWorkerReadiness(task.capabilityRequirements ?? [], {
      context: baseWorkerContext({ workerId: 'worker-cached-abort' }),
      probe: () => ({ ok: true }),
      cache: cachedAbortCache,
    });

    const cachedAbortedExec = await runner.execute(compiled.value, task, {
      workerReadiness: {
        context: baseWorkerContext({ workerId: 'worker-cached-abort' }),
        signal: preAbortedWorker.signal,
        cache: cachedAbortCache,
        probe: () => ({ ok: true }),
      },
    });
    expect(cachedAbortedExec.ok).toBe(true);
    if (cachedAbortedExec.ok) {
      expect(cachedAbortedExec.value.success).toBe(false);
      expect(cachedAbortedExec.value.stepsExecuted).toBe(0);
    }
  });
});
