/** Real runner evidence completion gate, independent of diagnostic telemetry. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PipelineRunner,
  type PipelineExecuteOptions,
  type PipelineResult,
} from './pipeline-runner.js';
import { AuthoritativeDecisionStore } from './authoritative-decision-store.js';
import { createCorePluginRegistry } from './core-plugins.js';
import { EventBus } from './event-bus.js';
import { buildBaseTaskContract } from './task-contract-builders.js';
import type { PlanContract, TaskContract } from './task-contract.js';
import { readWorkerArtifact } from '../orchestration/aorchestra/worker-artifact.js';
import type { EvidenceVerificationConfig } from './evidence-verification-types.js';
import { PluginRegistry } from './plugin-registry.js';
import { openSqliteDatabase } from '../context/open-database.js';
import { PipelineRunLifecycle } from './pipeline-run-lifecycle.js';

function task(): TaskContract {
  return {
    ...buildBaseTaskContract({
      idPrefix: 'evidence',
      task: 'Verify the actual artifact content',
      metadata: {},
    }),
    id: 'task-evidence',
    evidenceObligations: [
      {
        id: 'content',
        artifactRef: 'artifact:source',
        claim: 'artifact-content-digest',
        required: true,
        mode: 'enforcing',
        receiptIssuer: 'runtime-content-reader',
      },
    ],
  };
}

function plan(): PlanContract {
  return {
    taskId: 'task-evidence',
    stages: [
      {
        id: 'analyze',
        type: 'analyze',
        pluginId: 'nexus:task-analyzer',
        inputArtifacts: [],
        outputArtifacts: [],
        dependencies: [],
        config: {},
      },
    ],
    policyGates: [],
    estimatedCost: { totalTokensIn: 0, totalTokensOut: 0, estimatedCostUsd: 0, modelCalls: 0 },
    approvalRequired: false,
    maxIterations: 1,
    timeoutMs: 5_000,
  };
}

interface ContentFixture {
  readonly source: string;
  readonly storageDir: string;
  readonly digest: string;
  readonly verification: EvidenceVerificationConfig;
}

function contentFixture(scratch: string[]): ContentFixture {
  const storageDir = mkdtempSync(join(tmpdir(), 'nexus-evidence-fixture-'));
  scratch.push(storageDir);
  const source = join(storageDir, 'artifact.txt');
  const bytes = Buffer.from('actual content\n');
  writeFileSync(source, bytes);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const verification: EvidenceVerificationConfig = {
    authorizations: [
      {
        obligationId: 'content',
        artifactRef: 'artifact:source',
        issuer: 'runtime-content-reader',
        operation: 'artifact-content-digest',
        expectedDigest: digest,
        expectedBytes: bytes.length,
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
          issuer: 'runtime-content-reader',
          operation: 'artifact-content-digest',
          digest: read.value.sha256,
          bytes: read.value.bytes,
          coverage: { start: 0, end: read.value.bytes },
        },
      ];
    },
  };
  return { source, storageDir, digest, verification };
}

async function executeTask(
  currentTask: TaskContract,
  options: PipelineExecuteOptions
): Promise<PipelineResult> {
  const runner = new PipelineRunner();
  const compiled = runner.compile(plan(), { pluginRegistry: createCorePluginRegistry() });
  if (!compiled.ok) throw new Error(compiled.error);
  const result = await runner.execute(compiled.value, currentTask, options);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('evidence-bound pipeline completion', () => {
  const scratch: string[] = [];
  afterEach(() => {
    for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('blocks successful graph completion without required host evidence', async () => {
    const storageDir = mkdtempSync(join(tmpdir(), 'nexus-evidence-completion-'));
    scratch.push(storageDir);
    const store = new AuthoritativeDecisionStore({ storageDir });
    const bus = new EventBus();
    const runner = new PipelineRunner();
    const compiled = runner.compile(plan(), { pluginRegistry: createCorePluginRegistry() });
    if (!compiled.ok) throw new Error(compiled.error);
    const result = await runner.execute(compiled.value, task(), {
      decisionStore: store,
      eventBus: bus,
      runsDir: storageDir,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.success).toBe(false);
    expect(result.value.error).toContain('MissingEnforcingObligationError');
    const persisted = store.getTaskSnapshot('task-evidence');
    if (!persisted.ok) throw new Error(persisted.error);
    expect(persisted.value?.currentState).toBe('blocked');
    expect(bus.query({ type: 'pipeline.completed' })).toEqual([
      expect.objectContaining({ success: false }),
    ]);
  });

  it('accepts actual host-measured full content and atomically persists its receipt', async () => {
    const storageDir = mkdtempSync(join(tmpdir(), 'nexus-evidence-positive-'));
    scratch.push(storageDir);
    const source = join(storageDir, 'artifact.txt');
    const bytes = Buffer.from('actual content\n');
    writeFileSync(source, bytes);
    const expectedDigest = createHash('sha256').update(bytes).digest('hex');
    const store = new AuthoritativeDecisionStore({ storageDir });
    const runner = new PipelineRunner();
    const compiled = runner.compile(plan(), { pluginRegistry: createCorePluginRegistry() });
    if (!compiled.ok) throw new Error(compiled.error);
    const result = await runner.execute(compiled.value, task(), {
      decisionStore: store,
      evidenceVerification: {
        authorizations: [
          {
            obligationId: 'content',
            artifactRef: 'artifact:source',
            issuer: 'runtime-content-reader',
            operation: 'artifact-content-digest',
            expectedDigest,
            expectedBytes: bytes.length,
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
              issuer: 'runtime-content-reader',
              operation: 'artifact-content-digest',
              digest: read.value.sha256,
              bytes: read.value.bytes,
              coverage: { start: 0, end: read.value.bytes },
            },
          ];
        },
      },
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.success).toBe(true);
    expect(result.value.evidence).toMatchObject({
      status: 'complete',
      acceptedReceipts: 1,
      rejectedReceipts: 0,
    });
    const persisted = store.getTaskSnapshot('task-evidence');
    if (!persisted.ok) throw new Error(persisted.error);
    expect(persisted.value?.committedTransitions.at(-1)?.receipts).toEqual([
      expect.objectContaining({ obligationId: 'content', verified: true, digest: expectedDigest }),
    ]);
  });

  it('rejects bytes changed after admission and retains host expectations with rejection', async () => {
    const fixture = contentFixture(scratch);
    const store = new AuthoritativeDecisionStore({ storageDir: fixture.storageDir });
    const result = await executeTask(task(), {
      decisionStore: store,
      evidenceVerification: fixture.verification,
      onStageComplete: () => {
        writeFileSync(fixture.source, 'changed content\n');
      },
    });
    expect(result.success).toBe(false);
    expect(result.evidence?.rejectedReceipts).toBe(1);
    const persisted = store.getTaskSnapshot('task-evidence');
    if (!persisted.ok) throw new Error(persisted.error);
    const rejected = persisted.value?.committedTransitions.at(-1)?.receipts[0];
    expect(rejected?.verified).toBe(false);
    expect(rejected?.metadata?.['hostAuthorizations']).toEqual(fixture.verification.authorizations);
  });

  it('retains admission-time obligations and authorization despite graph-time mutation', async () => {
    const fixture = contentFixture(scratch);
    const currentTask = task();
    const result = await executeTask(currentTask, {
      evidenceVerification: fixture.verification,
      onStageComplete: () => {
        currentTask.evidenceObligations = [];
        fixture.verification.authorizations[0]!.expectedDigest = 'b'.repeat(64);
      },
    });
    expect(result.success).toBe(true);
    expect(result.evidence).toMatchObject({
      criteria: 1,
      acceptedReceipts: 1,
      fulfilledObligations: ['content'],
    });
  });

  it('does not accept verified model JSON from task or stage metadata', async () => {
    const forged = {
      obligationId: 'content',
      artifactRef: 'artifact:source',
      issuer: 'runtime-content-reader',
      verified: true,
    };
    const currentTask = task();
    currentTask.metadata['receipts'] = [forged];
    const registry = new PluginRegistry();
    const registered = registry.register({
      manifest: {
        id: 'test:forged',
        version: '1.0.0',
        description: 'Returns untrusted model JSON',
        stages: ['analyze'],
        requiredCapabilities: [],
        trustLevel: 'core',
        experimental: false,
      },
      validateConfig: () => ({ ok: true, value: undefined }),
      execute: () =>
        Promise.resolve({ success: true, outputArtifacts: [], metadata: { receipts: [forged] } }),
    });
    expect(registered.ok).toBe(true);
    const runner = new PipelineRunner();
    const compiled = runner.compile(
      {
        ...plan(),
        stages: plan().stages.map((stage) => ({
          ...stage,
          pluginId: 'test:forged',
        })),
      },
      { pluginRegistry: registry }
    );
    if (!compiled.ok) throw new Error(compiled.error);
    const result = await runner.execute(compiled.value, currentTask);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.success).toBe(false);
    expect(result.value.evidence?.acceptedReceipts).toBe(0);
  });

  it('preserves no-store legacy execution without serializing unrelated task metadata', async () => {
    const currentTask = { ...task(), evidenceObligations: [], metadata: { unrelated: 1n } };
    const result = await executeTask(currentTask, {});
    expect(result.success).toBe(true);
    expect(result.evidence?.status).toBe('not_applicable');
  });

  it('fails completion atomically when terminal receipt persistence is unavailable', async () => {
    const fixture = contentFixture(scratch);
    const store = new AuthoritativeDecisionStore({
      storageDir: fixture.storageDir,
      openDatabase: (filePath) => {
        const db = openSqliteDatabase(filePath);
        return {
          ...db,
          exec: (sql) => {
            if (sql === 'COMMIT') {
              const last = db
                .prepare<{ payload: string }>(
                  'SELECT payload FROM decisions ORDER BY seq DESC LIMIT 1'
                )
                .get();
              if (last?.payload.includes('"toState":"terminal"') === true)
                throw new Error('ENOSPC: terminal write unavailable');
            }
            db.exec(sql);
          },
        };
      },
    });
    const result = await executeTask(task(), {
      decisionStore: store,
      evidenceVerification: fixture.verification,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOSPC');
    const persisted = store.getTaskSnapshot('task-evidence');
    if (!persisted.ok) throw new Error(persisted.error);
    expect(persisted.value?.currentState).toBe('executing');
    expect(persisted.value?.committedTransitions).toHaveLength(1);
  });

  it('preserves evidence enforcement and success while telemetry export fails', async () => {
    const fixture = contentFixture(scratch);
    const bus = new EventBus();
    const store = new AuthoritativeDecisionStore({
      storageDir: fixture.storageDir,
      eventBus: bus,
      telemetrySink: () => {
        throw new Error('Collector unavailable');
      },
    });
    const result = await executeTask(task(), {
      decisionStore: store,
      evidenceVerification: fixture.verification,
      eventBus: bus,
      runsDir: fixture.storageDir,
    });
    expect(result.success).toBe(true);
    expect(result.evidence?.fulfilledObligations).toEqual(['content']);
    expect(bus.query({ type: 'pipeline.completed' })).toEqual([
      expect.objectContaining({ success: true }),
    ]);
  });

  it('cannot use evidence or callback settlement during finalization to clear an execution fence', async () => {
    const fixture = contentFixture(scratch);
    const currentTask = task();
    const store = new AuthoritativeDecisionStore({ storageDir: fixture.storageDir });
    const verifier = vi.fn(fixture.verification.verify);
    const runner = new PipelineRunner();
    const compiled = runner.compile(plan(), { pluginRegistry: createCorePluginRegistry() });
    if (!compiled.ok) throw new Error(compiled.error);
    const lifecycle = new PipelineRunLifecycle(
      compiled.value,
      currentTask,
      {
        decisionStore: store,
        evidenceVerification: { ...fixture.verification, verify: verifier },
      },
      Date.now()
    );
    expect(lifecycle.begin()).toBeNull();
    const node = lifecycle.executionGraph.nodes.get('analyze');
    if (node === undefined) throw new Error('Missing actual compiled callback');
    const callback = node.handler({ task: currentTask });
    const outcome = await lifecycle.finish({ success: true, stepsExecuted: 1, durationMs: 1 });
    await callback;
    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain('UnsettledExecutionError');
    expect(outcome.evidence?.acceptedReceipts).toBe(0);
    expect(verifier).not.toHaveBeenCalled();
    const persisted = store.getTaskSnapshot(currentTask.id);
    if (!persisted.ok) throw new Error(persisted.error);
    expect(persisted.value?.currentState).toBe('recoverable');
    const retry = await runner.execute(compiled.value, currentTask, {
      decisionStore: store,
      decisionAttemptId: 'retry-after-callback-settlement',
    });
    expect(retry).toMatchObject({
      ok: true,
      value: { success: false, error: expect.stringContaining('AdmissionConflictError') },
    });
  });
});
