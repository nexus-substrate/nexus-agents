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
