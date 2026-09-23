/**
 * The production executePhase applies the per-step dispatch gate (#4754).
 *
 * The engine hands its WorkflowBudgetTracker to executePhase via
 * `options.budget`; this pins that the factory's executePhase actually wraps
 * its step executor with it rather than ignoring the field.
 */
import { describe, it, expect } from 'vitest';

import type { StepResult } from '../core/index.js';
import { createWorkflowEngineDeps } from './workflow-engine-factory.js';
import { WorkflowBudgetTracker } from './workflow-budget.js';
import type { WorkflowStep } from './workflow-types.js';

function context(): Parameters<ReturnType<typeof createWorkflowEngineDeps>['executePhase']>[1] {
  return {
    workflowId: 'wf',
    executionId: 'exec-budget',
    inputs: {},
    stepResults: new Map<string, StepResult>(),
    variables: new Map<string, unknown>(),
    abortController: new AbortController(),
    contextManager: undefined,
  };
}

const steps = [
  { id: 'a', agent: 'code_expert', action: 'analyze', inputs: {} },
  { id: 'b', agent: 'code_expert', action: 'review', inputs: {} },
] as WorkflowStep[];

describe('createWorkflowEngineDeps executePhase × budget (#4754)', () => {
  it('does not dispatch any step of a phase once the run budget is exhausted', async () => {
    const deps = createWorkflowEngineDeps({ useMockExecutor: true });
    const tracker = new WorkflowBudgetTracker(100);
    tracker.record({
      stepId: 'earlier',
      output: null,
      durationMs: 1,
      status: 'success',
      tokensUsed: 900,
    });

    const result = await deps.executePhase(steps, context(), {
      maxConcurrency: 1,
      failFast: true,
      budget: tracker,
    });

    expect(result.ok).toBe(true);
    expect(tracker.outcome().skippedStepIds).toEqual(['a', 'b']);
    if (!result.ok) return;
    for (const step of result.value) expect(step.error).toMatch(/budget exhausted/);
  });

  it('dispatches normally while the budget holds', async () => {
    const deps = createWorkflowEngineDeps({ useMockExecutor: true });
    const tracker = new WorkflowBudgetTracker(10_000);

    await deps.executePhase(steps, context(), {
      maxConcurrency: 1,
      failFast: true,
      budget: tracker,
    });

    expect(tracker.outcome().skippedStepIds).toEqual([]);
    // The mock executor runs nothing and reports `skipped`: the gate recorded
    // both steps (measured zero), which proves it wrapped the executor.
    expect(tracker.outcome()).toMatchObject({ measuredSteps: 2, spentTokens: 0 });
  });
});
