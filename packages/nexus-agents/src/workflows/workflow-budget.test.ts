/**
 * Tests for the per-run workflow token ceiling (#4754).
 */
import { describe, it, expect, vi } from 'vitest';

import type { StepResult, WorkflowStep } from '../core/index.js';
import { executeParallel } from './parallel-executor.js';
import { WorkflowBudgetTracker, gateStepExecutor } from './workflow-budget.js';

function spent(stepId: string, tokensUsed?: number): StepResult {
  return {
    stepId,
    output: 'ok',
    durationMs: 1,
    status: 'success',
    ...(tokensUsed !== undefined ? { tokensUsed } : {}),
  };
}

function step(id: string): WorkflowStep {
  return { id, agent: 'code_expert', action: 'analyze', inputs: {} };
}

describe('WorkflowBudgetTracker outcome', () => {
  it('empty case: zero executed steps is unmeasured, never within budget', () => {
    const tracker = new WorkflowBudgetTracker(1000);
    expect(tracker.outcome()).toEqual({
      status: 'unmeasured',
      ceilingTokens: 1000,
      spentTokens: 0,
      measuredSteps: 0,
      unmeasuredSteps: 0,
      skippedStepIds: [],
    });
  });

  it('is within_budget only when every step reported usage under the ceiling', () => {
    const tracker = new WorkflowBudgetTracker(1000);
    tracker.record(spent('a', 100));
    tracker.record(spent('b', 200));
    expect(tracker.outcome()).toMatchObject({
      status: 'within_budget',
      spentTokens: 300,
      measuredSteps: 2,
      unmeasuredSteps: 0,
    });
  });

  it('a step with no usage makes the spend a lower bound (unmeasured)', () => {
    const tracker = new WorkflowBudgetTracker(1000);
    tracker.record(spent('a', 100));
    tracker.record(spent('b'));
    expect(tracker.outcome()).toMatchObject({
      status: 'unmeasured',
      spentTokens: 100,
      measuredSteps: 1,
      unmeasuredSteps: 1,
    });
  });

  it('exhausted wins over unmeasured: the lower bound already crossed the ceiling', () => {
    const tracker = new WorkflowBudgetTracker(100);
    tracker.record(spent('a'));
    tracker.record(spent('b', 150));
    expect(tracker.isExhausted()).toBe(true);
    expect(tracker.outcome().status).toBe('exhausted');
  });

  // A condition-false step is `skipped` with no model call (step-executor):
  // it spent nothing, so it is measured zero, not a hole in the ledger.
  it('a condition-skipped step counts as measured zero, so the run can be within_budget', () => {
    const tracker = new WorkflowBudgetTracker(1000);
    tracker.record(spent('a', 100));
    tracker.record({ stepId: 'b', output: null, durationMs: 0, status: 'skipped' });
    expect(tracker.outcome()).toMatchObject({
      status: 'within_budget',
      spentTokens: 100,
      measuredSteps: 2,
      unmeasuredSteps: 0,
    });
  });

  it('a failed step with no usage is still unmeasured', () => {
    const tracker = new WorkflowBudgetTracker(1000);
    tracker.record(spent('a', 100));
    tracker.record({ stepId: 'b', output: null, durationMs: 5, status: 'failed' });
    expect(tracker.outcome().status).toBe('unmeasured');
  });

  it('records each step once, even when both the gate and the engine report it', () => {
    const tracker = new WorkflowBudgetTracker(1000);
    tracker.record(spent('a', 100));
    tracker.recordAll([spent('a', 100), spent('b', 50)]);
    expect(tracker.outcome().spentTokens).toBe(150);
  });
});

describe('WorkflowBudgetTracker.haltError', () => {
  it('is undefined while the ceiling holds', () => {
    const tracker = new WorkflowBudgetTracker(1000);
    tracker.record(spent('a', 10));
    expect(tracker.haltError(true)).toBeUndefined();
  });

  it('names spent vs ceiling when more phases remain', () => {
    const tracker = new WorkflowBudgetTracker(100);
    tracker.record(spent('a', 250));
    const error = tracker.haltError(true);
    expect(error?.message).toContain('250');
    expect(error?.message).toContain('100');
    expect(error?.context?.['budget']).toMatchObject({ status: 'exhausted', spentTokens: 250 });
  });

  it('does not fail a run whose final phase overran with nothing left to stop', () => {
    const tracker = new WorkflowBudgetTracker(100);
    tracker.record(spent('a', 250));
    expect(tracker.haltError(false)).toBeUndefined();
  });

  it('fails the run when the final phase had steps refused', () => {
    const tracker = new WorkflowBudgetTracker(100);
    tracker.record(spent('a', 250));
    expect(tracker.admit('b')).toBe(false);
    expect(tracker.haltError(false)?.context?.['budget']).toMatchObject({
      skippedStepIds: ['b'],
    });
  });
});

describe('gateStepExecutor — the check before each step is dispatched', () => {
  it('does not start a queued step once an earlier step in the same phase overspent', async () => {
    const tracker = new WorkflowBudgetTracker(100);
    const executor = vi.fn((s: WorkflowStep) => Promise.resolve(spent(s.id, 500)));
    const results = await executeParallel(
      [step('first'), step('second'), step('third')],
      { executionId: 'x', stepResults: new Map(), inputs: {} },
      gateStepExecutor(executor, tracker),
      { maxConcurrency: 1, failFast: true }
    );
    expect(executor).toHaveBeenCalledTimes(1);
    expect(results.ok).toBe(true);
    if (!results.ok) return;
    expect(results.value.map((r) => r.status)).toEqual(['success', 'skipped', 'skipped']);
    expect(tracker.outcome().skippedStepIds).toEqual(['second', 'third']);
  });

  // The documented overshoot: steps already in flight when the ceiling is
  // crossed are not halted. With maxConcurrency 3 all three dispatch before
  // the first settles, so all three run — and the next phase is still refused.
  it('pins the overshoot: in-flight steps run, the next phase is still halted', async () => {
    const tracker = new WorkflowBudgetTracker(100);
    const delays: Record<string, number> = { first: 0, second: 20, third: 20 };
    const executor = vi.fn(
      (s: WorkflowStep) =>
        new Promise<StepResult>((resolve) =>
          setTimeout(() => {
            resolve(spent(s.id, 500));
          }, delays[s.id] ?? 0)
        )
    );
    const results = await executeParallel(
      [step('first'), step('second'), step('third')],
      { executionId: 'x', stepResults: new Map(), inputs: {} },
      gateStepExecutor(executor, tracker),
      { maxConcurrency: 3, failFast: true }
    );
    expect(executor).toHaveBeenCalledTimes(3);
    expect(results.ok && results.value.every((r) => r.status === 'success')).toBe(true);
    expect(tracker.outcome()).toMatchObject({ spentTokens: 1500, skippedStepIds: [] });
    expect(tracker.haltError(true)).toBeDefined();
  });

  it('a budget-refused step still forces the halt even in the final phase', async () => {
    const tracker = new WorkflowBudgetTracker(100);
    const executor = vi.fn((s: WorkflowStep) => Promise.resolve(spent(s.id, 500)));
    const results = await executeParallel(
      [step('first'), step('second')],
      { executionId: 'x', stepResults: new Map(), inputs: {} },
      gateStepExecutor(executor, tracker),
      { maxConcurrency: 1, failFast: true }
    );
    // The engine then records the settled phase, refused step included.
    if (results.ok) tracker.recordAll(results.value);
    expect(tracker.outcome()).toMatchObject({ measuredSteps: 1, skippedStepIds: ['second'] });
    expect(tracker.haltError(false)).toBeDefined();
  });

  it('dispatches every step while the ceiling holds', async () => {
    const tracker = new WorkflowBudgetTracker(10_000);
    const executor = vi.fn((s: WorkflowStep) => Promise.resolve(spent(s.id, 5)));
    await executeParallel(
      [step('a'), step('b')],
      { executionId: 'x', stepResults: new Map(), inputs: {} },
      gateStepExecutor(executor, tracker),
      { maxConcurrency: 1, failFast: true }
    );
    expect(executor).toHaveBeenCalledTimes(2);
    expect(tracker.outcome()).toMatchObject({ status: 'within_budget', spentTokens: 10 });
  });
});
