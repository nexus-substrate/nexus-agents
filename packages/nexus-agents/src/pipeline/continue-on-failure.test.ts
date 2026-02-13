/**
 * Continue-on-failure mode tests for PipelineRunner.
 *
 * Tests that when continueOnFailure is enabled, independent steps
 * continue past failures while dependent steps are correctly skipped.
 *
 * @module pipeline/continue-on-failure.test
 * (Source: Issue #995 — PipelineRunner continue-on-failure mode)
 */

import { describe, it, expect } from 'vitest';

import { PipelineRunner } from './pipeline-runner.js';
import type { CompiledPipeline } from './pipeline-runner.js';
import type { PlanContract, TaskContract } from './task-contract.js';
import { GraphBuilder, overwrite, append } from '../orchestration/graph/graph-builder.js';
import { START, END } from '../orchestration/graph/graph-types.js';
import type { GraphState, CompiledGraph } from '../orchestration/graph/graph-types.js';

// ============================================================================
// Fixtures
// ============================================================================

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

function makePlan(): PlanContract {
  return {
    taskId: 'task-001',
    stages: [
      {
        id: 's1',
        type: 'analyze',
        pluginId: 'test',
        inputArtifacts: [],
        outputArtifacts: [],
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
    maxIterations: 10,
    timeoutMs: 120_000,
  };
}

function succeedHandler(id: string) {
  return (): Promise<Partial<GraphState>> =>
    Promise.resolve({ currentStage: id, results: [{ id, ok: true }] });
}

function failHandler(id: string) {
  return (): Promise<Partial<GraphState>> => {
    throw new Error(`${id} failed`);
  };
}

function buildPipeline(graph: CompiledGraph): CompiledPipeline {
  return { graph, plan: makePlan() };
}

function twoIndependentGraph(): CompiledGraph {
  const builder = new GraphBuilder();
  builder.addState('currentStage', overwrite(''));
  builder.addState('results', append<Record<string, unknown>>([]));
  builder.addNode('A', succeedHandler('A'));
  builder.addNode('B', failHandler('B'));
  builder.addEdge(START, 'A');
  builder.addEdge(START, 'B');
  builder.addEdge('A', END);
  builder.addEdge('B', END);
  const result = builder.compile();
  if (!result.ok) throw new Error('Graph compile failed');
  return result.value;
}

function diamondGraph(): CompiledGraph {
  const builder = new GraphBuilder();
  builder.addState('currentStage', overwrite(''));
  builder.addState('results', append<Record<string, unknown>>([]));
  builder.addNode('A', failHandler('A'));
  builder.addNode('B', succeedHandler('B'));
  builder.addNode('C', succeedHandler('C'));
  builder.addNode('D', succeedHandler('D'));
  builder.addEdge(START, 'A');
  builder.addEdge(START, 'B');
  builder.addEdge('A', 'C');
  builder.addEdge('B', 'D');
  builder.addEdge('C', END);
  builder.addEdge('D', END);
  const result = builder.compile();
  if (!result.ok) throw new Error('Graph compile failed');
  return result.value;
}

// ============================================================================
// Tests
// ============================================================================

describe('PipelineRunner continue-on-failure', () => {
  const runner = new PipelineRunner();
  const task = makeTask();

  describe('without continueOnFailure (default)', () => {
    it('reports failure when any step fails', async () => {
      const pipeline = buildPipeline(twoIndependentGraph());
      const result = await runner.execute(pipeline, task);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.success).toBe(false);
      expect(result.value.error).toBeDefined();
      expect(result.value.stepResults).toBeUndefined();
    });
  });

  describe('with continueOnFailure', () => {
    it('returns per-step breakdown', async () => {
      const pipeline = buildPipeline(twoIndependentGraph());
      const result = await runner.execute(pipeline, task, {
        continueOnFailure: true,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const steps = result.value.stepResults;
      expect(steps).toBeDefined();
      expect(steps?.length).toBeGreaterThanOrEqual(2);

      const stepA = steps?.find((s) => s.stepId === 'A');
      const stepB = steps?.find((s) => s.stepId === 'B');
      expect(stepA?.status).toBe('succeeded');
      expect(stepB?.status).toBe('failed');
    });

    it('reports partial success with error summary', async () => {
      const pipeline = buildPipeline(twoIndependentGraph());
      const result = await runner.execute(pipeline, task, {
        continueOnFailure: true,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.success).toBe(false);
      expect(result.value.error).toMatch(/\d+\/\d+ steps succeeded/);
    });

    it('skips dependents of failed steps', async () => {
      const pipeline = buildPipeline(diamondGraph());
      const result = await runner.execute(pipeline, task, {
        continueOnFailure: true,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const steps = result.value.stepResults;
      expect(steps).toBeDefined();

      const stepA = steps?.find((s) => s.stepId === 'A');
      expect(stepA?.status).toBe('failed');

      const stepB = steps?.find((s) => s.stepId === 'B');
      const stepD = steps?.find((s) => s.stepId === 'D');
      expect(stepB?.status).toBe('succeeded');
      expect(stepD?.status).toBe('succeeded');
    });

    it('all-success pipeline returns success=true', async () => {
      const compileResult = runner.compile(makePlan());
      expect(compileResult.ok).toBe(true);
      if (!compileResult.ok) return;

      const result = await runner.execute(compileResult.value, task, {
        continueOnFailure: true,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.success).toBe(true);
      expect(result.value.stepResults).toBeDefined();
    });
  });

  describe('retryFailed', () => {
    it('re-executes pipeline when previous had failures', async () => {
      const pipeline = buildPipeline(twoIndependentGraph());
      const firstResult = await runner.execute(pipeline, task, {
        continueOnFailure: true,
      });

      expect(firstResult.ok).toBe(true);
      if (!firstResult.ok) return;

      const retryResult = await runner.retryFailed(pipeline, firstResult.value, task);
      expect(retryResult.ok).toBe(true);
      if (!retryResult.ok) return;
      expect(retryResult.value.stepResults).toBeDefined();
    });

    it('returns same result when no failures to retry', async () => {
      const compileResult = runner.compile(makePlan());
      expect(compileResult.ok).toBe(true);
      if (!compileResult.ok) return;

      const firstResult = await runner.execute(compileResult.value, task, {
        continueOnFailure: true,
      });
      expect(firstResult.ok).toBe(true);
      if (!firstResult.ok) return;

      const retryResult = await runner.retryFailed(compileResult.value, firstResult.value, task);
      expect(retryResult.ok).toBe(true);
      if (!retryResult.ok) return;
      expect(retryResult.value.success).toBe(true);
    });

    it('returns original result when no stepResults', async () => {
      const compileResult = runner.compile(makePlan());
      expect(compileResult.ok).toBe(true);
      if (!compileResult.ok) return;

      const firstResult = await runner.execute(compileResult.value, task);
      expect(firstResult.ok).toBe(true);
      if (!firstResult.ok) return;

      const retryResult = await runner.retryFailed(compileResult.value, firstResult.value, task);
      expect(retryResult.ok).toBe(true);
      if (!retryResult.ok) return;
      expect(retryResult.value).toEqual(firstResult.value);
    });
  });
});
