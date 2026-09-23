/**
 * WorkflowEngine × per-run token ceiling (#4754).
 *
 * The engine owns one WorkflowBudgetTracker per execution: it hands it to
 * every phase (for the per-step dispatch gate), records each settled phase,
 * and stops before the next phase once the ceiling is crossed.
 */
import { describe, it, expect, vi } from 'vitest';

import type { StepResult, WorkflowDefinition } from '../core/index.js';
import { ok } from '../core/index.js';
import { WorkflowEngine, type WorkflowEngineDeps, type WorkflowStep } from './workflow-engine.js';

const steps: WorkflowStep[] = [
  { id: 'phase1-step', agent: 'code_expert', action: 'analyze', inputs: {} },
  {
    id: 'phase2-step',
    agent: 'code_expert',
    action: 'review',
    inputs: {},
    dependsOn: ['phase1-step'],
  },
] as WorkflowStep[];

const workflow: WorkflowDefinition = {
  name: 'budget-workflow',
  version: '1.0.0',
  inputs: [],
  steps,
} as WorkflowDefinition;

function result(stepId: string, tokensUsed?: number): StepResult {
  return {
    stepId,
    output: stepId,
    durationMs: 1,
    status: 'success',
    ...(tokensUsed !== undefined ? { tokensUsed } : {}),
  };
}

/** Two single-step phases; `usage[i]` is what phase i's step reports. */
function depsWithUsage(usage: (number | undefined)[]): WorkflowEngineDeps {
  let phase = 0;
  return {
    parseWorkflow: vi.fn(),
    loadWorkflowFile: vi.fn(),
    createExecutionPlan: vi
      .fn()
      .mockReturnValue(ok({ phases: steps.map((s) => ({ steps: [s] })) })),
    executePhase: vi.fn((phaseSteps: WorkflowStep[]) => {
      const tokens = usage[phase];
      phase += 1;
      return Promise.resolve(ok(phaseSteps.map((s) => result(s.id, tokens))));
    }),
    getBuiltInTemplates: vi.fn().mockReturnValue(new Map()),
  };
}

describe('WorkflowEngine token ceiling (#4754)', () => {
  it('never runs phase 2 after phase 1 overspends, and names spent vs ceiling', async () => {
    const deps = depsWithUsage([500, 10]);
    const engine = new WorkflowEngine(deps);

    const run = await engine.execute(workflow, {}, { budget: { maxTokens: 100 } });

    expect(deps.executePhase).toHaveBeenCalledTimes(1);
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.error.message).toContain('500');
    expect(run.error.message).toContain('100');
    expect(run.error.context?.['budget']).toMatchObject({
      status: 'exhausted',
      ceilingTokens: 100,
      spentTokens: 500,
    });
    // The completed phase's results travel with the halt, for the caller.
    expect(run.error.context?.['completedSteps']).toEqual([result('phase1-step', 500)]);
  });

  it('hands the same tracker to every phase so steps are gated at dispatch', async () => {
    const deps = depsWithUsage([10, 10]);
    const engine = new WorkflowEngine(deps);

    await engine.execute(workflow, {}, { budget: { maxTokens: 10_000 } });

    const calls = vi.mocked(deps.executePhase).mock.calls;
    expect(calls).toHaveLength(2);
    const first = calls[0]?.[2].budget;
    expect(first).toBeDefined();
    expect(calls[1]?.[2].budget).toBe(first);
  });

  it('reports within_budget only when every step was measured under the ceiling', async () => {
    const engine = new WorkflowEngine(depsWithUsage([10, 20]));
    const run = await engine.execute(workflow, {}, { budget: { maxTokens: 10_000 } });
    expect(run.ok && run.value.budget).toEqual({
      status: 'within_budget',
      ceilingTokens: 10_000,
      spentTokens: 30,
      measuredSteps: 2,
      unmeasuredSteps: 0,
      skippedStepIds: [],
    });
  });

  it('an unmeasured step makes the outcome unmeasured, not within budget', async () => {
    const engine = new WorkflowEngine(depsWithUsage([10, undefined]));
    const run = await engine.execute(workflow, {}, { budget: { maxTokens: 10_000 } });
    expect(run.ok && run.value.budget).toMatchObject({
      status: 'unmeasured',
      spentTokens: 10,
      unmeasuredSteps: 1,
    });
  });

  it('empty case: a plan with zero phases reports unmeasured', async () => {
    const deps = depsWithUsage([]);
    deps.createExecutionPlan = vi.fn().mockReturnValue(ok({ phases: [] }));
    const engine = new WorkflowEngine(deps);
    const run = await engine.execute(workflow, {}, { budget: { maxTokens: 100 } });
    expect(run.ok && run.value.budget?.status).toBe('unmeasured');
  });

  it('without a budget the run is unchanged: no tracker, no budget field', async () => {
    const deps = depsWithUsage([500, 500]);
    const engine = new WorkflowEngine(deps);

    const run = await engine.execute(workflow, {});

    expect(deps.executePhase).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(deps.executePhase).mock.calls) {
      expect(Object.keys(call[2]).sort()).toEqual(['failFast', 'maxConcurrency', 'timeoutMs']);
    }
    expect(run.ok).toBe(true);
    expect(run.ok && 'budget' in run.value).toBe(false);
  });
});
