/**
 * Authoritative Decision & Outbox Store Tests (Task T10, Issue #5129 / Milestone M1)
 *
 * Conformance cases covered:
 * - C15: OTel disabled or collector unavailable (governed state/recovery remains intact; observability degraded explicitly)
 * - C16: Required durable audit/state write fails (no committed approval/effect; fails closed)
 * - C20: Crash around transition/outbox (recoverable consistent state; no lost committed intent or fabricated completed effect)
 * - C21: Duplicate job/event delivery (one accepted logical outcome/effect; retries recorded; consumer idempotent)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  AUTHORITATIVE_DECISION_STATES,
  AuthoritativeDecisionStore,
  type AuthoritativeTaskSnapshot,
} from './authoritative-decision-store.js';
import { EventBus } from './event-bus.js';
import { openSqliteDatabase } from '../context/open-database.js';
import type { ISQLiteDatabase } from '../core/types/database-types.js';
import { PipelineRunner } from './pipeline-runner.js';
import { createCorePluginRegistry } from './core-plugins.js';
import { PluginRegistry } from './plugin-registry.js';
import type { PlanContract, TaskContract } from './task-contract.js';
import type { PipelineEvent } from './event-types.js';

function snapshot(
  store: AuthoritativeDecisionStore,
  taskId: string
): AuthoritativeTaskSnapshot | null {
  const result = store.getTaskSnapshot(taskId);
  expect(result.ok, result.ok ? '' : result.error).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function rejectCommits(shouldReject: () => boolean): (filePath: string) => ISQLiteDatabase {
  return (filePath) => {
    const db = openSqliteDatabase(filePath);
    return {
      ...db,
      exec: (sql: string) => {
        if (sql.trim() === 'COMMIT' && shouldReject()) throw new Error('ENOSPC: commit rejected');
        db.exec(sql);
      },
    };
  };
}

function createSampleEvent(taskId: string, toState = 'approved'): PipelineEvent {
  return {
    type: 'task.status_changed',
    taskId,
    from: 'executing',
    to: toState,
    timestamp: 1_700_000_000_000,
  };
}

function createSampleTask(id = 'task-t10-1'): TaskContract {
  return {
    id,
    description: 'Test task for authoritative decision store',
    status: 'approved',
    analysis: {
      complexity: 'medium',
      taskType: 'code',
      ambiguityScore: 0.1,
    },
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
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    contractVersion: '1.0.0',
  };
}

function createSamplePlan(taskId = 'task-t10-1'): PlanContract {
  return {
    taskId,
    stages: [
      {
        id: 'analyze-1',
        type: 'analyze',
        pluginId: 'nexus:task-analyzer',
        inputArtifacts: [],
        outputArtifacts: ['analysis-out'],
        dependencies: [],
        config: {},
      },
    ],
    policyGates: [],
    estimatedCost: {
      totalTokensIn: 100,
      totalTokensOut: 100,
      estimatedCostUsd: 0.01,
      modelCalls: 1,
    },
    approvalRequired: false,
    maxIterations: 1,
    timeoutMs: 10_000,
  };
}

describe('AuthoritativeDecisionStore (Task T10 — C15, C16, C20, C21)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-t10-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exposes the canonical authoritative decision state enum', () => {
    expect(AUTHORITATIVE_DECISION_STATES).toContain('planned');
    expect(AUTHORITATIVE_DECISION_STATES).toContain('approved');
    expect(AUTHORITATIVE_DECISION_STATES).toContain('blocked');
    expect(AUTHORITATIVE_DECISION_STATES).toContain('terminal');
  });

  describe('C15: OTel disabled or collector unavailable', () => {
    it('commits authoritative decision and receipts while marking observability degraded when telemetrySink throws', () => {
      const bus = new EventBus();
      const store = new AuthoritativeDecisionStore({
        storageDir: tmpDir,
        eventBus: bus,
        telemetrySink: () => {
          throw new Error('OTLP HTTP 503 Collector Unavailable');
        },
        now: () => 1_700_000_001_000,
      });

      const outcome = store.commitTransition({
        taskId: 'task-c15',
        attemptId: 'attempt-1',
        idempotencyKey: 'idem-c15-1',
        toState: 'approved',
        mode: 'enforcing',
        contractVersion: '1.0.0',
        policyVersion: '2026.10',
        subjectRevision: 'sha-abc123',
        receipts: [
          {
            obligationId: 'ob-1',
            artifactRef: 'art-1',
            digest: 'sha256:1111',
            issuer: 'executor',
            verified: true,
          },
        ],
        outboxIntents: [
          {
            intentId: 'intent-c15-1',
            event: createSampleEvent('task-c15', 'approved'),
          },
        ],
      });

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      expect(outcome.value.record.toState).toBe('approved');
      expect(outcome.value.record.receipts).toHaveLength(1);
      expect(outcome.value.observabilityDegraded).toBe(true);
      expect(outcome.value.observabilityError).toContain('OTLP HTTP 503 Collector Unavailable');
      expect(outcome.value.dispatchedIntentIds).toEqual(['intent-c15-1']);

      // Collector failure does not undo the committed diagnostic bus acknowledgement
      const state = snapshot(store, 'task-c15');
      expect(state?.currentState).toBe('approved');
      expect(state?.committedTransitions).toHaveLength(1);
      expect(state?.pendingOutboxIntents).toHaveLength(0);
      expect(state?.dispatchedOutboxIntents).toHaveLength(1);
    });

    it('succeeds when both OTel collector and EventBus are omitted (OTel disabled)', () => {
      const store = new AuthoritativeDecisionStore({
        storageDir: tmpDir,
        now: () => 1_700_000_002_000,
      });

      const outcome = store.commitTransition({
        taskId: 'task-otel-off',
        attemptId: 'attempt-1',
        idempotencyKey: 'idem-otel-off',
        toState: 'reviewed',
        mode: 'enforcing',
        outboxIntents: [
          {
            intentId: 'intent-otel-off-1',
            event: createSampleEvent('task-otel-off', 'reviewed'),
          },
        ],
      });

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.value.observabilityDegraded).toBe(false);
      expect(outcome.value.dispatchedIntentIds).toEqual([]);
      expect(snapshot(store, 'task-otel-off')?.pendingOutboxIntents).toHaveLength(1);
    });
  });

  describe('C16: Required durable audit/state write fails', () => {
    it('fails closed without committing approval or emitting downstream events when journal persistence fails', () => {
      const emittedEvents: PipelineEvent[] = [];
      const store = new AuthoritativeDecisionStore({
        storageDir: tmpDir,
        eventBus: new EventBus(),
        telemetrySink: (ev) => emittedEvents.push(ev),
        openDatabase: rejectCommits(() => true),
      });

      const outcome = store.commitTransition({
        taskId: 'task-c16',
        attemptId: 'attempt-1',
        idempotencyKey: 'idem-c16-approve',
        toState: 'approved',
        mode: 'enforcing',
        outboxIntents: [
          {
            intentId: 'intent-c16-1',
            event: createSampleEvent('task-c16', 'approved'),
          },
        ],
      });

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error).toContain('DurablePersistenceWriteError');
      expect(outcome.error).toContain('ENOSPC');

      // Negative control / oracle: no downstream effect emitted and no state committed
      expect(emittedEvents).toHaveLength(0);
      expect(
        snapshot(new AuthoritativeDecisionStore({ storageDir: tmpDir }), 'task-c16')
      ).toBeNull();
    });

    it('rejects transitions when current state conflicts with expected fromState', () => {
      const store = new AuthoritativeDecisionStore({ storageDir: tmpDir });
      const first = store.commitTransition({
        taskId: 'task-conflict',
        attemptId: 'attempt-1',
        idempotencyKey: 'idem-1',
        toState: 'blocked',
        mode: 'enforcing',
      });
      expect(first.ok).toBe(true);

      const second = store.commitTransition({
        taskId: 'task-conflict',
        attemptId: 'attempt-1',
        idempotencyKey: 'idem-2',
        fromState: 'ready',
        toState: 'executing',
        mode: 'enforcing',
      });
      expect(second.ok).toBe(false);
      if (second.ok) return;
      expect(second.error).toContain('StateTransitionConflictError');
    });

    it('rejects path-traversal task or attempt identifiers', () => {
      const store = new AuthoritativeDecisionStore({ storageDir: tmpDir });
      const badTask = store.commitTransition({
        taskId: '../escape',
        attemptId: 'attempt-1',
        idempotencyKey: 'idem-1',
        toState: 'ready',
        mode: 'enforcing',
      });
      expect(badTask.ok).toBe(false);

      const badAttempt = store.commitTransition({
        taskId: 'task-valid',
        attemptId: '../escape',
        idempotencyKey: 'idem-1',
        toState: 'ready',
        mode: 'enforcing',
      });
      expect(badAttempt.ok).toBe(false);
    });
  });

  describe('C20: Crash around transition/outbox', () => {
    it('recovers committed transition and replays pending outbox intent after crash between transition write and outbox dispatch', () => {
      let writeCount = 0;
      const originalEvents: PipelineEvent[] = [];
      const bus = new EventBus();
      bus.subscribe({}, (event) => originalEvents.push(event));
      const crashStore = new AuthoritativeDecisionStore({
        storageDir: tmpDir,
        eventBus: bus,
        openDatabase: rejectCommits(() => ++writeCount === 2),
      });

      const initialCommit = crashStore.commitTransition({
        taskId: 'task-c20',
        attemptId: 'attempt-1',
        idempotencyKey: 'idem-c20-1',
        toState: 'verifying',
        mode: 'enforcing',
        outboxIntents: [
          {
            intentId: 'intent-c20-verify',
            event: createSampleEvent('task-c20', 'verifying'),
          },
        ],
      });

      expect(initialCommit.ok).toBe(true);
      if (!initialCommit.ok) return;
      expect(initialCommit.value.observabilityDegraded).toBe(true);

      // Restart with a fresh store instance pointing at the same durable directory
      const replayedEvents: PipelineEvent[] = [];
      const recoveredStore = new AuthoritativeDecisionStore({
        storageDir: tmpDir,
        eventBus: new EventBus(),
        telemetrySink: (ev) => replayedEvents.push(ev),
      });

      const snapshotBeforeFlush = snapshot(recoveredStore, 'task-c20');
      expect(snapshotBeforeFlush?.currentState).toBe('verifying');
      expect(snapshotBeforeFlush?.pendingOutboxIntents).toHaveLength(1);
      expect(snapshotBeforeFlush?.dispatchedOutboxIntents).toHaveLength(0);

      const flushResult = recoveredStore.flushPendingOutbox('task-c20');
      expect(flushResult.observabilityDegraded).toBe(false);
      expect(flushResult.dispatchedIntentIds).toEqual(['intent-c20-verify']);
      expect(replayedEvents).toHaveLength(1);
      expect(originalEvents).toHaveLength(1);
      expect(replayedEvents[0]?.intentId).toBe(originalEvents[0]?.intentId);
      expect(replayedEvents[0]?.attemptId).toBe('attempt-1');

      const snapshotAfterFlush = snapshot(recoveredStore, 'task-c20');
      expect(snapshotAfterFlush?.pendingOutboxIntents).toHaveLength(0);
      expect(snapshotAfterFlush?.dispatchedOutboxIntents).toHaveLength(1);

      // Subsequent flush does not re-emit already-dispatched intents
      const secondFlush = recoveredStore.flushPendingOutbox('task-c20');
      expect(secondFlush.dispatchedIntentIds).toEqual([]);
      expect(replayedEvents).toHaveLength(1);
    });

    it('reports corrupted authoritative storage as an error rather than absent state', () => {
      fs.writeFileSync(path.join(tmpDir, 'decisions.db'), 'invalid database bytes');
      const store = new AuthoritativeDecisionStore({ storageDir: tmpDir });
      expect(store.getTaskSnapshot('task-corrupt').ok).toBe(false);
      expect(
        store.commitTransition({
          taskId: 'task-corrupt',
          attemptId: 'attempt-1',
          idempotencyKey: 'record',
          toState: 'ready',
          mode: 'enforcing',
        }).ok
      ).toBe(false);
    });
  });

  describe('C21: Duplicate job/event delivery', () => {
    it('rejects conflicting reuse of a transition idempotency identity', () => {
      const store = new AuthoritativeDecisionStore({ storageDir: tmpDir });
      const input = {
        taskId: 'conflicting-delivery',
        attemptId: 'attempt-1',
        idempotencyKey: 'one-decision',
        toState: 'ready' as const,
        mode: 'enforcing' as const,
      };
      expect(store.commitTransition(input).ok).toBe(true);
      const conflict = store.commitTransition({ ...input, toState: 'approved' });
      expect(conflict.ok).toBe(false);
      expect(snapshot(store, input.taskId)?.currentState).toBe('ready');
    });

    it('rejects an intent identity reused for a different decision', () => {
      const store = new AuthoritativeDecisionStore({ storageDir: tmpDir });
      const input = {
        taskId: 'conflicting-intent',
        attemptId: 'attempt-1',
        idempotencyKey: 'first-decision',
        toState: 'ready' as const,
        mode: 'enforcing' as const,
        outboxIntents: [
          { intentId: 'one-intent', event: createSampleEvent('conflicting-intent', 'ready') },
        ],
      };
      expect(store.commitTransition(input).ok).toBe(true);
      expect(
        store.commitTransition({ ...input, idempotencyKey: 'second-decision', toState: 'approved' })
          .ok
      ).toBe(false);
      expect(snapshot(store, input.taskId)?.committedTransitions).toHaveLength(1);
    });

    it('fails closed when duplicate delivery evidence cannot be persisted', () => {
      let rejectWrites = false;
      const store = new AuthoritativeDecisionStore({
        storageDir: tmpDir,
        openDatabase: rejectCommits(() => rejectWrites),
      });
      const input = {
        taskId: 'retry-evidence',
        attemptId: 'attempt-1',
        idempotencyKey: 'duplicate-record',
        toState: 'executing' as const,
        mode: 'enforcing' as const,
      };
      expect(store.commitTransition(input).ok).toBe(true);
      rejectWrites = true;
      expect(store.commitTransition(input).ok).toBe(false);
    });

    it('does not replay a bus delivery because the diagnostic collector failed', () => {
      const bus = new EventBus();
      let deliveries = 0;
      bus.subscribe({}, () => {
        deliveries++;
      });
      const store = new AuthoritativeDecisionStore({
        storageDir: tmpDir,
        eventBus: bus,
        telemetrySink: () => {
          throw new Error('collector unavailable');
        },
      });
      expect(
        store.commitTransition({
          taskId: 'collector-independent',
          attemptId: 'attempt-1',
          idempotencyKey: 'collector-independent',
          toState: 'ready',
          mode: 'enforcing',
          outboxIntents: [
            { intentId: 'one-notification', event: createSampleEvent('collector-independent') },
          ],
        }).ok
      ).toBe(true);
      store.flushPendingOutbox('collector-independent');
      expect(deliveries).toBe(1);
    });

    it('deduplicates repeated transition deliveries by idempotencyKey while incrementing deliveryAttempts and emitting once', () => {
      const emittedEvents: PipelineEvent[] = [];
      const store = new AuthoritativeDecisionStore({
        storageDir: tmpDir,
        eventBus: new EventBus(),
        telemetrySink: (ev) => emittedEvents.push(ev),
      });

      const payload = {
        taskId: 'task-c21',
        attemptId: 'attempt-1',
        idempotencyKey: 'idem-c21-once',
        toState: 'approved' as const,
        mode: 'enforcing' as const,
        outboxIntents: [
          {
            intentId: 'intent-c21-1',
            event: createSampleEvent('task-c21', 'approved'),
          },
        ],
      };

      const first = store.commitTransition(payload);
      const second = store.commitTransition(payload);
      const third = store.commitTransition(payload);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      expect(third.ok).toBe(true);
      if (!first.ok || !second.ok || !third.ok) return;

      expect(first.value.deduplicated).toBe(false);
      expect(first.value.deliveryAttempts).toBe(1);

      expect(second.value.deduplicated).toBe(true);
      expect(second.value.deliveryAttempts).toBe(2);

      expect(third.value.deduplicated).toBe(true);
      expect(third.value.deliveryAttempts).toBe(3);

      // Outbox event was emitted only once across 3 deliveries
      expect(emittedEvents).toHaveLength(1);

      const state = snapshot(store, 'task-c21');
      expect(state?.committedTransitions).toHaveLength(1);
      expect(state?.committedTransitions[0]?.deliveryAttempts).toBe(3);
    });
  });

  describe('PipelineRunner integration (real execution entrypoint)', () => {
    it.each(['bigint', 'cycle'] as const)(
      'returns a failed admission for nonserializable %s metadata',
      async (kind) => {
        const metadata: Record<string, unknown> = {};
        metadata['value'] = kind === 'bigint' ? 1n : metadata;
        const task = { ...createSampleTask(`unserializable-${kind}`), metadata };
        const runner = new PipelineRunner();
        const store = new AuthoritativeDecisionStore({ storageDir: tmpDir });
        const compiled = runner.compile(createSamplePlan(task.id), {
          pluginRegistry: createCorePluginRegistry(),
        });
        expect(compiled.ok).toBe(true);
        if (!compiled.ok) return;
        const result = await runner.execute(compiled.value, task, { decisionStore: store });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.success).toBe(false);
        expect(result.value.stepsExecuted).toBe(0);
        expect(result.value.error).toMatch(/subject|serializ/i);
        expect(snapshot(store, task.id)).toBeNull();
      }
    );

    it('rechecks cancellation after asynchronous preflight before admitting work', async () => {
      const store = new AuthoritativeDecisionStore({ storageDir: tmpDir });
      const runner = new PipelineRunner();
      const task = createSampleTask('aborted-before-admission');
      const compiled = runner.compile(createSamplePlan(task.id), {
        pluginRegistry: createCorePluginRegistry(),
      });
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;
      const controller = new AbortController();
      const pending = runner.execute(compiled.value, task, {
        decisionStore: store,
        signal: controller.signal,
      });
      controller.abort();
      const result = await pending;
      expect(result.ok && result.value.success).toBe(false);
      expect(snapshot(store, task.id)).toBeNull();
    });

    it('does not run graph effects after admission consumes the execution deadline', async () => {
      const storageDelayMs = 25;
      const timeoutMs = 10;
      const store = new AuthoritativeDecisionStore({
        storageDir: tmpDir,
        openDatabase: (filePath) => {
          const deadline = Date.now() + storageDelayMs;
          while (Date.now() < deadline) {
            /* Simulate synchronous durable IO latency. */
          }
          return openSqliteDatabase(filePath);
        },
      });
      const runner = new PipelineRunner();
      const task = createSampleTask('deadline-during-admission');
      const compiled = runner.compile(createSamplePlan(task.id), {
        pluginRegistry: createCorePluginRegistry(),
      });
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;
      let effects = 0;
      const result = await runner.execute(compiled.value, task, {
        decisionStore: store,
        timeout: timeoutMs,
        onStageComplete: () => {
          effects++;
        },
      });
      expect(effects).toBe(0);
      expect(result.ok && result.value.success).toBe(false);
      expect(snapshot(store, task.id)?.currentState).toBe('blocked');
    });

    it('keeps prior history and the latest correct outcome for an explicit retry attempt', async () => {
      const registry = new PluginRegistry();
      let executions = 0;
      registry.register({
        manifest: {
          id: 'test:attempt-outcome',
          version: '1.0.0',
          description: 'Fails once',
          stages: ['analyze'],
          requiredCapabilities: [],
          trustLevel: 'core',
          experimental: false,
        },
        validateConfig: () => ({ ok: true, value: undefined }),
        execute: () =>
          Promise.resolve({
            success: ++executions > 1,
            outputArtifacts: [],
            metadata: {},
            ...(executions === 1 ? { error: 'first attempt failed' } : {}),
          }),
      });
      const store = new AuthoritativeDecisionStore({ storageDir: tmpDir });
      const runner = new PipelineRunner();
      const task = createSampleTask('explicit-retry');
      const plan = createSamplePlan(task.id);
      const compiled = runner.compile(
        {
          ...plan,
          stages: plan.stages.map((stage) => ({ ...stage, pluginId: 'test:attempt-outcome' })),
        },
        { pluginRegistry: registry }
      );
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;
      const failed = await runner.execute(compiled.value, task, {
        decisionStore: store,
        decisionAttemptId: 'first',
      });
      expect(failed.ok && failed.value.success).toBe(false);
      const retried = await runner.execute(compiled.value, task, {
        decisionStore: store,
        decisionAttemptId: 'second',
      });
      expect(retried.ok && retried.value.success).toBe(true);
      const state = snapshot(store, task.id);
      expect(state?.latestAttemptId).toBe('second');
      expect(state?.currentState).toBe('terminal');
      expect(state?.committedTransitions.map((record) => record.toState)).toEqual([
        'executing',
        'blocked',
        'executing',
        'terminal',
      ]);
    });

    it('does not emit completed success when its mandatory terminal write fails', async () => {
      let commits = 0;
      const eventBus = new EventBus();
      const store = new AuthoritativeDecisionStore({
        storageDir: tmpDir,
        openDatabase: rejectCommits(() => ++commits === 3),
      });
      const runner = new PipelineRunner();
      const task = createSampleTask('finish-write-fails');
      const compiled = runner.compile(createSamplePlan(task.id), {
        pluginRegistry: createCorePluginRegistry(),
      });
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;
      const result = await runner.execute(compiled.value, task, {
        decisionStore: store,
        eventBus,
        runsDir: path.join(tmpDir, 'runs'),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.success).toBe(false);
      expect(result.value.error).toContain('ENOSPC');
      expect(result.value.stepsExecuted).toBe(1);
      expect(eventBus.query({ type: 'pipeline.completed' })).toHaveLength(0);
      expect(snapshot(store, task.id)?.currentState).toBe('executing');
    });

    it('does not repeat graph work for a duplicate accepted task', async () => {
      const store = new AuthoritativeDecisionStore({ storageDir: tmpDir });
      const runner = new PipelineRunner();
      const task = createSampleTask('duplicate-run');
      const compiled = runner.compile(createSamplePlan(task.id), {
        pluginRegistry: createCorePluginRegistry(),
      });
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;
      let effects = 0;
      const options = {
        decisionStore: store,
        onStageComplete: () => {
          effects++;
        },
      };
      await runner.execute(compiled.value, task, options);
      const duplicate = await runner.execute(compiled.value, task, options);
      expect(effects).toBe(1);
      expect(duplicate.ok && duplicate.value.success).toBe(false);
    });

    it('emits each pipeline lifecycle event once when store and runner share a bus', async () => {
      const eventBus = new EventBus();
      const store = new AuthoritativeDecisionStore({ storageDir: tmpDir, eventBus });
      const runner = new PipelineRunner();
      const task = createSampleTask('shared-bus');
      const compiled = runner.compile(createSamplePlan(task.id), {
        pluginRegistry: createCorePluginRegistry(),
      });
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;
      await runner.execute(compiled.value, task, { decisionStore: store, eventBus });
      expect(eventBus.query({ type: 'pipeline.started' })).toHaveLength(1);
      expect(eventBus.query({ type: 'pipeline.completed' })).toHaveLength(1);
    });

    it('persists executing and terminal transitions on successful pipeline execution', async () => {
      const store = new AuthoritativeDecisionStore({ storageDir: tmpDir });
      const runner = new PipelineRunner();
      const plan = createSamplePlan('task-runner-ok');
      const task = createSampleTask('task-runner-ok');

      const compiled = runner.compile(plan, { pluginRegistry: createCorePluginRegistry() });
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;

      const execResult = await runner.execute(compiled.value, task, {
        decisionStore: store,
      });
      expect(execResult.ok).toBe(true);
      if (!execResult.ok) return;
      expect(execResult.value.success).toBe(true);

      const state = snapshot(store, 'task-runner-ok');
      expect(state?.currentState).toBe('terminal');
      expect(state?.committedTransitions.map((t) => t.toState)).toEqual(['executing', 'terminal']);
      expect(state?.pendingOutboxIntents).toHaveLength(2);
      expect(state?.dispatchedOutboxIntents).toHaveLength(0);
    });

    it('fails closed before graph execution if authoritative decision store fails to persist start transition (C16)', async () => {
      const store = new AuthoritativeDecisionStore({
        storageDir: tmpDir,
        openDatabase: rejectCommits(() => true),
      });
      const runner = new PipelineRunner();
      const plan = createSamplePlan('task-runner-fail');
      const task = createSampleTask('task-runner-fail');

      const compiled = runner.compile(plan, { pluginRegistry: createCorePluginRegistry() });
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;

      const execResult = await runner.execute(compiled.value, task, {
        decisionStore: store,
      });
      expect(execResult.ok).toBe(true);
      if (!execResult.ok) return;
      expect(execResult.value.success).toBe(false);
      expect(execResult.value.stepsExecuted).toBe(0);
      expect(execResult.value.error).toContain('DurablePersistenceWriteError');
    });
  });
});
