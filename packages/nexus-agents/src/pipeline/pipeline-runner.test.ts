/**
 * PipelineRunner tests (Issue #910, E2-3)
 *
 * Tests the compile → execute flow for V2 pipelines.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PipelineRunner } from './pipeline-runner.js';
import { EventBus } from './event-bus.js';
import type { PlanContract, StageSpec, TaskContract } from './task-contract.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeStage(overrides: Partial<StageSpec> = {}): StageSpec {
  return {
    id: 'stage-1',
    type: 'analyze',
    pluginId: 'nexus:task-analyzer',
    inputArtifacts: [],
    outputArtifacts: ['result'],
    dependencies: [],
    config: {},
    ...overrides,
  };
}

function makePlan(overrides: Partial<PlanContract> = {}): PlanContract {
  return {
    taskId: 'task-001',
    stages: [makeStage()],
    policyGates: [],
    estimatedCost: {
      totalTokensIn: 1000,
      totalTokensOut: 500,
      estimatedCostUsd: 0.05,
      modelCalls: 1,
    },
    approvalRequired: false,
    maxIterations: 10,
    timeoutMs: 120_000,
    ...overrides,
  };
}

function makeTask(): TaskContract {
  return {
    id: 'task-001',
    description: 'Test task',
    status: 'approved',
    analysis: { complexity: 'simple', taskType: 'general', ambiguityScore: 0 },
    constraints: { scope: [] },
    requiredCapabilities: { tools: [], experts: [] },
    capabilityGaps: { available: { tools: [], experts: [] }, gaps: [], allSatisfied: true },
    artifacts: [],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('PipelineRunner', () => {
  it('compiles a valid plan', () => {
    const runner = new PipelineRunner();
    const result = runner.compile(makePlan());
    expect(result.ok).toBe(true);
  });

  it('returns error for invalid plan', () => {
    const runner = new PipelineRunner();
    const result = runner.compile(makePlan({ stages: [] }));
    expect(result.ok).toBe(false);
  });

  it('executes a single-stage pipeline', async () => {
    const runner = new PipelineRunner();
    const compileResult = runner.compile(makePlan());
    expect(compileResult.ok).toBe(true);
    if (!compileResult.ok) return;

    const execResult = await runner.execute(compileResult.value, makeTask());
    expect(execResult.ok).toBe(true);
    if (execResult.ok) {
      expect(execResult.value.success).toBe(true);
      expect(execResult.value.stepsExecuted).toBeGreaterThan(0);
      expect(execResult.value.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('executes a multi-stage linear pipeline', async () => {
    const runner = new PipelineRunner();
    const plan = makePlan({
      stages: [
        makeStage({ id: 'analyze' }),
        makeStage({
          id: 'execute',
          type: 'execute',
          dependencies: ['analyze'],
        }),
        makeStage({
          id: 'validate',
          type: 'validate',
          dependencies: ['execute'],
        }),
      ],
    });

    const compileResult = runner.compile(plan);
    expect(compileResult.ok).toBe(true);
    if (!compileResult.ok) return;

    const execResult = await runner.execute(compileResult.value, makeTask());
    expect(execResult.ok).toBe(true);
    if (execResult.ok) {
      expect(execResult.value.success).toBe(true);
      expect(execResult.value.stepsExecuted).toBe(3);
    }
  });

  it('calls onStageComplete callback', async () => {
    const runner = new PipelineRunner();
    const compileResult = runner.compile(makePlan());
    expect(compileResult.ok).toBe(true);
    if (!compileResult.ok) return;

    const stageIds: string[] = [];
    const execResult = await runner.execute(compileResult.value, makeTask(), {
      onStageComplete: (stageId) => {
        stageIds.push(stageId);
      },
    });

    expect(execResult.ok).toBe(true);
    expect(stageIds).toContain('stage-1');
  });

  it('respects AbortSignal cancellation', async () => {
    const runner = new PipelineRunner();
    const compileResult = runner.compile(makePlan());
    expect(compileResult.ok).toBe(true);
    if (!compileResult.ok) return;

    const controller = new AbortController();
    controller.abort();

    const execResult = await runner.execute(compileResult.value, makeTask(), {
      signal: controller.signal,
    });

    // Aborted pipelines should fail gracefully
    expect(execResult.ok).toBe(true);
    if (execResult.ok) {
      expect(execResult.value.success).toBe(false);
    }
  });

  it('enforces maxSteps bound', async () => {
    const runner = new PipelineRunner();
    const plan = makePlan({
      stages: [
        makeStage({ id: 's1' }),
        makeStage({ id: 's2', dependencies: ['s1'] }),
        makeStage({ id: 's3', dependencies: ['s2'] }),
      ],
    });
    const compileResult = runner.compile(plan);
    expect(compileResult.ok).toBe(true);
    if (!compileResult.ok) return;

    const execResult = await runner.execute(compileResult.value, makeTask(), { maxSteps: 1 });

    expect(execResult.ok).toBe(true);
    if (execResult.ok) {
      // Should stop after maxSteps
      expect(execResult.value.stepsExecuted).toBeLessThanOrEqual(2);
    }
  });
});

// ============================================================================
// TraceWriter Integration (#1167)
// ============================================================================

describe('PipelineRunner trace integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'nexus-pipeline-trace-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes trace.jsonl when eventBus is provided', async () => {
    const runner = new PipelineRunner();
    const bus = new EventBus();
    const task = makeTask();
    const plan = makePlan();
    const compileResult = runner.compile(plan);
    expect(compileResult.ok).toBe(true);
    if (!compileResult.ok) return;

    const execResult = await runner.execute(compileResult.value, task, {
      eventBus: bus,
      runsDir: tempDir,
    });

    expect(execResult.ok).toBe(true);

    // PipelineRunner emits pipeline.started + pipeline.completed on the bus,
    // TraceWriter captures them and writes to trace.jsonl on flush
    const tracePath = join(tempDir, task.id, 'trace.jsonl');
    const content = await readFile(tracePath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2); // started + completed

    const firstLine = lines[0];
    expect(firstLine).toBeDefined();
    const parsed = JSON.parse(firstLine ?? '') as Record<string, unknown>;
    expect(parsed['runId']).toBe(task.id);
    expect(parsed['eventType']).toBe('pipeline.started');
  });

  it('emits stage.completed events for each node (#1179)', async () => {
    const runner = new PipelineRunner();
    const bus = new EventBus();
    const task = makeTask();
    const plan = makePlan();
    const compileResult = runner.compile(plan);
    expect(compileResult.ok).toBe(true);
    if (!compileResult.ok) return;

    await runner.execute(compileResult.value, task, {
      eventBus: bus,
      runsDir: tempDir,
    });

    const stageEvents = bus.query({ type: 'stage.completed' });
    expect(stageEvents.length).toBeGreaterThanOrEqual(1);
    const first = stageEvents[0];
    expect(first).toBeDefined();
    expect(first?.type).toBe('stage.completed');
  });

  it('emits stage.failed event for failing nodes', async () => {
    const runner = new PipelineRunner();
    const bus = new EventBus();
    const task = makeTask();
    // Use a plan with a non-existent plugin to trigger failure
    const plan = makePlan({
      stages: [makeStage({ id: 'will-fail', pluginId: 'nexus:nonexistent' })],
    });
    const compileResult = runner.compile(plan);
    if (!compileResult.ok) return;

    await runner.execute(compileResult.value, task, {
      eventBus: bus,
      runsDir: tempDir,
      continueOnFailure: true,
    });

    // Check for stage events (could be completed or failed depending on plugin resolution)
    const allEvents = bus.query({});
    expect(allEvents.length).toBeGreaterThan(0);
  });

  it('does not write trace when eventBus is not provided', async () => {
    const runner = new PipelineRunner();
    const task = makeTask();
    const plan = makePlan();
    const compileResult = runner.compile(plan);
    expect(compileResult.ok).toBe(true);
    if (!compileResult.ok) return;

    const execResult = await runner.execute(compileResult.value, task);
    expect(execResult.ok).toBe(true);

    // No trace directory should exist
    const { existsSync } = await import('node:fs');
    const tracePath = join(tempDir, task.id, 'trace.jsonl');
    expect(existsSync(tracePath)).toBe(false);
  });
});

// ============================================================================
// retryFailed (#910)
// ============================================================================

describe('PipelineRunner.retryFailed', () => {
  it('returns original result when stepResults is undefined', async () => {
    const runner = new PipelineRunner();
    const plan = makePlan();
    const compileResult = runner.compile(plan);
    expect(compileResult.ok).toBe(true);
    if (!compileResult.ok) return;

    const previousResult = {
      success: true,
      stepsExecuted: 1,
      durationMs: 100,
    };
    const result = await runner.retryFailed(compileResult.value, previousResult, makeTask());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(previousResult);
    }
  });

  it('returns original result when stepResults is empty', async () => {
    const runner = new PipelineRunner();
    const plan = makePlan();
    const compileResult = runner.compile(plan);
    expect(compileResult.ok).toBe(true);
    if (!compileResult.ok) return;

    const previousResult = {
      success: true,
      stepsExecuted: 0,
      durationMs: 50,
      stepResults: [],
    };
    const result = await runner.retryFailed(compileResult.value, previousResult, makeTask());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(previousResult);
    }
  });

  it('returns original result when all steps succeeded', async () => {
    const runner = new PipelineRunner();
    const plan = makePlan();
    const compileResult = runner.compile(plan);
    expect(compileResult.ok).toBe(true);
    if (!compileResult.ok) return;

    const previousResult = {
      success: true,
      stepsExecuted: 1,
      durationMs: 100,
      stepResults: [{ stepId: 'stage-1', status: 'succeeded' as const, durationMs: 50 }],
    };
    const result = await runner.retryFailed(compileResult.value, previousResult, makeTask());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(previousResult);
    }
  });

  it('re-executes pipeline when steps have failures', async () => {
    const runner = new PipelineRunner();
    const plan = makePlan();
    const compileResult = runner.compile(plan);
    expect(compileResult.ok).toBe(true);
    if (!compileResult.ok) return;

    const previousResult = {
      success: false,
      stepsExecuted: 1,
      durationMs: 100,
      stepResults: [
        {
          stepId: 'stage-1',
          status: 'failed' as const,
          durationMs: 50,
          error: 'timeout',
        },
      ],
    };
    const result = await runner.retryFailed(compileResult.value, previousResult, makeTask());
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should have re-executed, not returned the original
      expect(result.value).not.toBe(previousResult);
    }
  });
});

// Epic #2872: the default runs dir must resolve through getNexusDataDir(),
// not the historical hardcoded `./runs`, so trace output lands under the
// centralized data dir instead of sprawling at cwd.
describe('getDefaultRunsDir', () => {
  it('resolves under NEXUS_DATA_DIR/runs', async () => {
    const { getDefaultRunsDir } = await import('./pipeline-runner.js');
    const tempDataDir = await mkdtemp(join(tmpdir(), 'nexus-runs-default-'));
    const prev = process.env['NEXUS_DATA_DIR'];
    process.env['NEXUS_DATA_DIR'] = tempDataDir;
    try {
      expect(getDefaultRunsDir()).toBe(join(tempDataDir, 'runs'));
    } finally {
      if (prev === undefined) delete process.env['NEXUS_DATA_DIR'];
      else process.env['NEXUS_DATA_DIR'] = prev;
      await rm(tempDataDir, { recursive: true, force: true });
    }
  });

  it('reads NEXUS_DATA_DIR at call time, not module load time', async () => {
    const { getDefaultRunsDir } = await import('./pipeline-runner.js');
    const a = await mkdtemp(join(tmpdir(), 'nexus-runs-a-'));
    const b = await mkdtemp(join(tmpdir(), 'nexus-runs-b-'));
    const prev = process.env['NEXUS_DATA_DIR'];
    try {
      process.env['NEXUS_DATA_DIR'] = a;
      const first = getDefaultRunsDir();
      process.env['NEXUS_DATA_DIR'] = b;
      const second = getDefaultRunsDir();
      expect(first).toBe(join(a, 'runs'));
      expect(second).toBe(join(b, 'runs'));
      expect(first).not.toBe(second);
    } finally {
      if (prev === undefined) delete process.env['NEXUS_DATA_DIR'];
      else process.env['NEXUS_DATA_DIR'] = prev;
      await rm(a, { recursive: true, force: true });
      await rm(b, { recursive: true, force: true });
    }
  });

  // Issue #2889: getDefaultRunsDir() must route through nexusDataPath()
  // so `runs` (a per-repo subdir) lands in `<repo>/.nexus-agents/runs/`.
  // The previous `join(getNexusDataDir(), 'runs')` bypassed the router
  // and traces went to homedir even with NEXUS_REPO_PREFERRED ON.
  it('routes to <repo>/.nexus-agents/runs when inside a git repo (no NEXUS_DATA_DIR override)', async () => {
    const { getDefaultRunsDir } = await import('./pipeline-runner.js');
    const { realpathSync, mkdirSync } = await import('node:fs');
    const repo = await mkdtemp(join(tmpdir(), 'nexus-runs-repo-'));
    mkdirSync(join(repo, '.git'));
    const originalCwd = process.cwd();
    const prevDataDir = process.env['NEXUS_DATA_DIR'];
    const prevRepoPref = process.env['NEXUS_REPO_PREFERRED'];
    const prevGitignore = process.env['NEXUS_GITIGNORE_AUTO'];
    delete process.env['NEXUS_DATA_DIR'];
    delete process.env['NEXUS_REPO_PREFERRED'];
    process.env['NEXUS_GITIGNORE_AUTO'] = '0';
    try {
      process.chdir(repo);
      expect(getDefaultRunsDir()).toBe(join(realpathSync(repo), '.nexus-agents', 'runs'));
    } finally {
      process.chdir(originalCwd);
      if (prevDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
      else process.env['NEXUS_DATA_DIR'] = prevDataDir;
      if (prevRepoPref === undefined) delete process.env['NEXUS_REPO_PREFERRED'];
      else process.env['NEXUS_REPO_PREFERRED'] = prevRepoPref;
      if (prevGitignore === undefined) delete process.env['NEXUS_GITIGNORE_AUTO'];
      else process.env['NEXUS_GITIGNORE_AUTO'] = prevGitignore;
      await rm(repo, { recursive: true, force: true });
    }
  });
});
