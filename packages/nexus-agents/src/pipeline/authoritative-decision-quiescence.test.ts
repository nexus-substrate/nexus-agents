/** A deadline is not proof that an admitted plugin has stopped executing. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthoritativeDecisionStore } from './authoritative-decision-store.js';
import { EventBus } from './event-bus.js';
import { PipelineRunner } from './pipeline-runner.js';
import { PluginRegistry } from './plugin-registry.js';
import type { PlanContract, TaskContract } from './task-contract.js';
import type { NodeHook } from '../orchestration/graph/graph-types.js';
import { ok } from '../core/index.js';

const PIPELINE_TIMEOUT_MS = 1_000;

function taskFixture(): TaskContract {
  return {
    id: 'unsettled-plugin',
    description: 'Fence an actual timed-out plugin',
    status: 'approved',
    analysis: { complexity: 'medium', taskType: 'code', ambiguityScore: 0 },
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
    createdAt: 1,
    updatedAt: 1,
  };
}

function planFixture(): PlanContract {
  return {
    taskId: taskFixture().id,
    stages: [
      {
        id: 'pending-plugin',
        type: 'execute',
        pluginId: 'test:pending',
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
    timeoutMs: PIPELINE_TIMEOUT_MS,
  };
}

describe('authoritative attempt ownership after node timeout', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });

  it('cannot announce success for an explicitly unsettled finish', () => {
    const storageDir = mkdtempSync(join(tmpdir(), 'nexus-unsettled-finish-'));
    directories.push(storageDir);
    const eventBus = new EventBus();
    const store = new AuthoritativeDecisionStore({ storageDir, eventBus });
    const task = taskFixture();
    const context = { attemptId: 'pending', subjectRevision: 'subject', scope: 'pipeline-attempt' };
    expect(store.recordPipelineStart(task, context)).toBeNull();
    expect(
      store.recordPipelineFinish(task, context, {
        success: true,
        durationMs: 1,
        executionSettled: false,
      })
    ).toBeNull();
    store.flushPendingOutbox(task.id);
    const completed = eventBus.query({ type: 'pipeline.completed' });
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ success: false });
    const state = store.getTaskSnapshot(task.id);
    expect(state.ok && state.value?.currentState).toBe('recoverable');
  });

  it('refuses a new attempt while the original plugin promise remains unsettled', async () => {
    const storageDir = mkdtempSync(join(tmpdir(), 'nexus-unsettled-'));
    directories.push(storageDir);
    let release: () => void = () => {
      throw new Error('Missing test barrier');
    };
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let maxActive = 0;
    let effects = 0;
    const registry = new PluginRegistry();
    registry.register({
      manifest: {
        id: 'test:pending',
        version: '1.0.0',
        description: 'Controlled pending plugin',
        stages: ['execute'],
        requiredCapabilities: [],
        trustLevel: 'core',
        experimental: false,
      },
      validateConfig: () => ({ ok: true, value: undefined }),
      execute: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        try {
          await barrier;
          effects++;
          return { success: true, outputArtifacts: [], metadata: {} };
        } finally {
          active--;
        }
      },
    });
    const runner = new PipelineRunner();
    const task = taskFixture();
    const compiled = runner.compile(planFixture(), { pluginRegistry: registry });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) throw new Error(compiled.error);
    const store = new AuthoritativeDecisionStore({ storageDir });
    const eventBus = new EventBus();
    try {
      const first = await runner.execute(compiled.value, task, {
        decisionStore: store,
        decisionAttemptId: 'first',
        eventBus,
        runsDir: join(storageDir, 'runs'),
      });
      expect(first.ok && first.value.success).toBe(false);
      expect(active).toBe(1);
      const retry = await runner.execute(compiled.value, task, {
        decisionStore: new AuthoritativeDecisionStore({ storageDir }),
        decisionAttemptId: 'second',
      });
      expect(maxActive, 'a timed-out plugin must not overlap another admitted attempt').toBe(1);
      expect(retry).toMatchObject({
        ok: true,
        value: { success: false, error: expect.stringContaining('AdmissionConflictError') },
      });
      const state = store.getTaskSnapshot(task.id);
      expect(state).toMatchObject({
        ok: true,
        value: { currentState: 'recoverable', latestAttemptId: 'first' },
      });
      expect(effects).toBe(0);
      expect(
        eventBus
          .query({ type: 'pipeline.completed' })
          .some((event) => event.type === 'pipeline.completed' && event.success)
      ).toBe(false);
    } finally {
      release();
      await barrier;
      // Drain the plugin/compiler continuations without relying on another timer.
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
    expect(active).toBe(0);
    expect(effects).toBe(1);
    const afterSettlement = await runner.execute(compiled.value, task, {
      decisionStore: new AuthoritativeDecisionStore({ storageDir }),
      decisionAttemptId: 'third',
    });
    expect(afterSettlement).toMatchObject({
      ok: true,
      value: { success: false, error: expect.stringContaining('AdmissionConflictError') },
    });
  });

  it('keeps a timed-out graph hook owned until it settles through PipelineRunner', async () => {
    const storageDir = mkdtempSync(join(tmpdir(), 'nexus-unsettled-hook-'));
    directories.push(storageDir);
    let release: () => void = () => {
      throw new Error('Missing hook test barrier');
    };
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let markEntered: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const registry = new PluginRegistry();
    registry.register({
      manifest: {
        id: 'test:pending',
        version: '1.0.0',
        description: 'Hook timeout owner fixture',
        stages: ['execute'],
        requiredCapabilities: [],
        trustLevel: 'core',
        experimental: false,
      },
      validateConfig: () => ({ ok: true, value: undefined }),
      execute: () => Promise.resolve({ success: true, outputArtifacts: [], metadata: {} }),
    });
    const runner = new PipelineRunner();
    const compiled = runner.compile(planFixture(), { pluginRegistry: registry });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) throw new Error(compiled.error);

    const nodes = new Map(compiled.value.graph.nodes);
    const stageNode = nodes.get('pending-plugin');
    if (stageNode === undefined) throw new Error('Missing compiled test stage');
    const pendingHook: NodeHook = async () => {
      active++;
      markEntered?.();
      try {
        await barrier;
        return ok(undefined);
      } finally {
        active--;
      }
    };
    nodes.set(stageNode.id, {
      ...stageNode,
      preconditions: [{ name: 'pending-hook', hook: pendingHook }],
    });
    const pipeline = {
      ...compiled.value,
      graph: { ...compiled.value.graph, nodes },
    };
    const task = taskFixture();
    const store = new AuthoritativeDecisionStore({ storageDir });

    try {
      const firstExecution = runner.execute(pipeline, task, {
        decisionStore: store,
        decisionAttemptId: 'hook-first',
        timeout: 25,
      });
      await entered;
      const first = await firstExecution;
      expect(first).toMatchObject({
        ok: true,
        value: {
          success: false,
          error: expect.stringContaining('UnsettledExecutionError'),
        },
      });
      expect(active).toBe(1);

      const retry = await runner.execute(pipeline, task, {
        decisionStore: store,
        decisionAttemptId: 'hook-retry',
        timeout: 25,
      });
      expect(retry).toMatchObject({
        ok: true,
        value: { success: false, error: expect.stringContaining('AdmissionConflictError') },
      });
      expect(active).toBe(1);
    } finally {
      release();
      await barrier;
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
    expect(active).toBe(0);
  });

  it('times out a finite precondition through PipelineRunner before invoking the stage', async () => {
    const storageDir = mkdtempSync(join(tmpdir(), 'nexus-slow-precondition-'));
    directories.push(storageDir);
    let stageCalls = 0;
    const registry = new PluginRegistry();
    registry.register({
      manifest: {
        id: 'test:pending',
        version: '1.0.0',
        description: 'Precondition deadline fixture',
        stages: ['execute'],
        requiredCapabilities: [],
        trustLevel: 'core',
        experimental: false,
      },
      validateConfig: () => ({ ok: true, value: undefined }),
      execute: () => {
        stageCalls++;
        return Promise.resolve({ success: true, outputArtifacts: [], metadata: {} });
      },
    });
    const runner = new PipelineRunner();
    const compiled = runner.compile(planFixture(), { pluginRegistry: registry });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) throw new Error(compiled.error);

    const nodes = new Map(compiled.value.graph.nodes);
    const stageNode = nodes.get('pending-plugin');
    if (stageNode === undefined) throw new Error('Missing compiled test stage');
    nodes.set(stageNode.id, {
      ...stageNode,
      preconditions: [
        {
          name: 'finite-slow-precondition',
          hook: async () => {
            await new Promise<void>((resolve) => setTimeout(resolve, 100));
            return ok(undefined);
          },
        },
      ],
    });
    const pipeline = {
      ...compiled.value,
      graph: { ...compiled.value.graph, nodes },
    };
    const result = await runner.execute(pipeline, taskFixture(), {
      decisionStore: new AuthoritativeDecisionStore({ storageDir }),
      decisionAttemptId: 'slow-precondition',
      timeout: 25,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { success: false, error: expect.stringContaining('UnsettledExecutionError') },
    });
    expect(stageCalls).toBe(0);
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  });

  it('reports a slow verification through PipelineRunner without announcing success', async () => {
    const storageDir = mkdtempSync(join(tmpdir(), 'nexus-slow-verification-'));
    directories.push(storageDir);
    const registry = new PluginRegistry();
    registry.register({
      manifest: {
        id: 'test:pending',
        version: '1.0.0',
        description: 'Verification deadline fixture',
        stages: ['execute'],
        requiredCapabilities: [],
        trustLevel: 'core',
        experimental: false,
      },
      validateConfig: () => ({ ok: true, value: undefined }),
      execute: () => Promise.resolve({ success: true, outputArtifacts: [], metadata: {} }),
    });
    const runner = new PipelineRunner();
    const compiled = runner.compile(planFixture(), { pluginRegistry: registry });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) throw new Error(compiled.error);

    const nodes = new Map(compiled.value.graph.nodes);
    const stageNode = nodes.get('pending-plugin');
    if (stageNode === undefined) throw new Error('Missing compiled test stage');
    nodes.set(stageNode.id, {
      ...stageNode,
      verify: async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
        return ok(undefined);
      },
    });
    const pipeline = {
      ...compiled.value,
      graph: { ...compiled.value.graph, nodes },
    };
    const eventBus = new EventBus();
    const result = await runner.execute(pipeline, taskFixture(), {
      decisionStore: new AuthoritativeDecisionStore({ storageDir, eventBus }),
      decisionAttemptId: 'slow-verification',
      eventBus,
      timeout: 150,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { success: false, error: expect.stringContaining('UnsettledExecutionError') },
    });
    const completedEvents = eventBus.query({ type: 'pipeline.completed' });
    expect(completedEvents).toHaveLength(1);
    expect(completedEvents[0]).toMatchObject({ type: 'pipeline.completed', success: false });
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
  });
});
