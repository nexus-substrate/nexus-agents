/** Review repros: ambiguous criteria, actual verifier settlement, and absent observations. */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthoritativeDecisionStore } from './authoritative-decision-store.js';
import { PipelineRunner, type CompiledPipeline } from './pipeline-runner.js';
import { createDelegatePipeline } from './v2-delegate.js';
import { buildBaseTaskContract } from './task-contract-builders.js';
import type { EvidenceObligation, TaskContract } from './task-contract.js';
import type { EvidenceVerificationConfig } from './evidence-verification-types.js';
import { readWorkerArtifact } from '../orchestration/aorchestra/worker-artifact.js';

interface Fixture {
  readonly directory: string;
  readonly task: TaskContract;
  readonly pipeline: CompiledPipeline;
  readonly verification: EvidenceVerificationConfig;
}
function fixture(directories: string[]): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'nexus-evidence-integrity-'));
  directories.push(directory);
  const source = join(directory, 'artifact.txt');
  const bytes = Buffer.from('actual content\n');
  writeFileSync(source, bytes);
  const task: TaskContract = {
    ...buildBaseTaskContract({
      idPrefix: 'integrity',
      task: 'Verify artifact content',
      metadata: {},
    }),
    id: 'integrity-task',
    evidenceObligations: [
      {
        id: 'content',
        artifactRef: 'artifact:source',
        claim: 'artifact-content-digest',
        mode: 'enforcing',
        required: true,
        receiptIssuer: 'host-reader',
      },
    ],
  };
  const compiled = createDelegatePipeline(task);
  if (!compiled.ok) throw new Error(compiled.error);
  return {
    directory,
    task,
    pipeline: compiled.value,
    verification: {
      authorizations: [
        {
          obligationId: 'content',
          artifactRef: 'artifact:source',
          issuer: 'host-reader',
          operation: 'artifact-content-digest',
          expectedBytes: bytes.length,
          expectedDigest: createHash('sha256').update(bytes).digest('hex'),
        },
      ],
      verify: (request) => {
        const read = readWorkerArtifact(source);
        if (!read.ok) throw new Error(read.error);
        return [
          {
            ...request.binding,
            obligationId: 'content',
            artifactRef: 'artifact:source',
            issuer: 'host-reader',
            operation: 'artifact-content-digest',
            digest: read.value.sha256,
            bytes: read.value.bytes,
            coverage: { start: 0, end: read.value.bytes },
          },
        ];
      },
    },
  };
}

describe('reviewed evidence integrity regressions', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });

  it.each(['unsupported-second', 'unsupported-first', 'different-artifact'] as const)(
    'rejects duplicate obligation IDs before effects: %s',
    async (variant) => {
      const current = fixture(directories);
      const original = current.task.evidenceObligations?.[0];
      if (original === undefined) throw new Error('Missing declared criterion');
      const other: EvidenceObligation =
        variant === 'different-artifact'
          ? { ...original, artifactRef: 'artifact:other' }
          : { ...original, claim: 'worker-inspected-artifact' };
      current.task.evidenceObligations =
        variant === 'unsupported-first' ? [other, original] : [original, other];
      const effect = vi.fn();
      const verifier = vi.fn(current.verification.verify);
      const result = await new PipelineRunner().execute(current.pipeline, current.task, {
        evidenceVerification: { ...current.verification, verify: verifier },
        onStageComplete: effect,
      });
      expect(result).toMatchObject({
        ok: true,
        value: {
          success: false,
          error: expect.stringContaining('DuplicateEvidenceObligationIdError'),
        },
      });
      expect(effect).not.toHaveBeenCalled();
      expect(verifier).not.toHaveBeenCalled();
    }
  );

  it('retains ownership across verifier timeout, fresh-store retry, and later settlement', async () => {
    const current = fixture(directories);
    let release: () => void = () => {
      throw new Error('Missing verifier barrier');
    };
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let maximum = 0;
    const verifier: EvidenceVerificationConfig['verify'] = async (request) => {
      active++;
      maximum = Math.max(maximum, active);
      try {
        await barrier;
        return await current.verification.verify(request);
      } finally {
        active--;
      }
    };
    const runner = new PipelineRunner();
    const store = new AuthoritativeDecisionStore({ storageDir: current.directory });
    const options = {
      evidenceVerification: { ...current.verification, verify: verifier },
      timeout: 50,
    };
    try {
      const first = await runner.execute(current.pipeline, current.task, {
        ...options,
        decisionStore: store,
        decisionAttemptId: 'first',
      });
      expect(first.ok && first.value.success).toBe(false);
      expect(active).toBe(1);
      const retry = await runner.execute(current.pipeline, current.task, {
        ...options,
        decisionStore: new AuthoritativeDecisionStore({ storageDir: current.directory }),
        decisionAttemptId: 'second',
      });
      expect(maximum, 'a deadline must not admit a concurrent host verifier').toBe(1);
      expect(retry).toMatchObject({
        ok: true,
        value: { success: false, error: expect.stringContaining('AdmissionConflictError') },
      });
      expect(store.getTaskSnapshot(current.task.id)).toMatchObject({
        ok: true,
        value: { currentState: 'recoverable', latestAttemptId: 'first' },
      });
    } finally {
      release();
      await barrier;
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
    expect(active).toBe(0);
    const afterSettlement = await runner.execute(current.pipeline, current.task, {
      ...options,
      decisionStore: new AuthoritativeDecisionStore({ storageDir: current.directory }),
      decisionAttemptId: 'third',
    });
    expect(afterSettlement).toMatchObject({
      ok: true,
      value: { success: false, error: expect.stringContaining('AdmissionConflictError') },
    });
  });

  it('persists host expectations and an unverified absence summary when observations are empty', async () => {
    const current = fixture(directories);
    const store = new AuthoritativeDecisionStore({ storageDir: current.directory });
    const result = await new PipelineRunner().execute(current.pipeline, current.task, {
      decisionStore: store,
      evidenceVerification: { ...current.verification, verify: () => [] },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        success: false,
        evidence: {
          status: 'incomplete',
          acceptedReceipts: 0,
          rejectedReceipts: 0,
          fulfilledObligations: [],
          missing: ['content'],
        },
      },
    });
    const state = store.getTaskSnapshot(current.task.id);
    if (!state.ok) throw new Error(state.error);
    expect(state.value?.committedTransitions.at(-1)?.receipts).toEqual([
      expect.objectContaining({
        verified: false,
        metadata: expect.objectContaining({
          recordKind: 'authorization-absence-summary',
          observationStatus: 'absent',
          hostAuthorizations: current.verification.authorizations,
        }),
      }),
    ]);
  });
});
