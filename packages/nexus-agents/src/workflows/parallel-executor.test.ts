/**
 * Tests for parallel-executor.ts
 *
 * Covers allSucceeded, getFailedSteps, withRetries, and executeParallel.
 */

import { describe, it, expect, vi } from 'vitest';
import { allSucceeded, getFailedSteps, withRetries, executeParallel } from './parallel-executor.js';
import type { StepResult, WorkflowStep } from '../core/index.js';
import type { StepExecutor, ExecutionContext } from './parallel-executor.js';

// ============================================================================
// Fixtures
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeStep(id: string, overrides: Partial<WorkflowStep> = {}) {
  return { id, agent: 'code_expert', action: 'do', inputs: {}, ...overrides } as WorkflowStep;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeContext(overrides: Partial<ExecutionContext> = {}) {
  return {
    executionId: 'exec-1',
    stepResults: new Map(),
    inputs: {},
    ...overrides,
  } as ExecutionContext;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function successResult(stepId: string) {
  return { stepId, output: 'ok', durationMs: 10, status: 'success' as const };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function failResult(stepId: string, error = 'failed') {
  return { stepId, output: null, durationMs: 10, status: 'failed' as const, error };
}

// ============================================================================
// allSucceeded
// ============================================================================

describe('allSucceeded', () => {
  it('returns true when all results are success', () => {
    expect(allSucceeded([successResult('a'), successResult('b')])).toBe(true);
  });

  it('returns false when any result is failed', () => {
    expect(allSucceeded([successResult('a'), failResult('b')])).toBe(false);
  });

  it('returns true for empty array', () => {
    expect(allSucceeded([])).toBe(true);
  });

  it('returns false for skipped results', () => {
    const skipped: StepResult = { stepId: 'a', output: null, durationMs: 0, status: 'skipped' };
    expect(allSucceeded([skipped])).toBe(false);
  });
});

// ============================================================================
// getFailedSteps
// ============================================================================

describe('getFailedSteps', () => {
  it('returns only failed results', () => {
    const results = [successResult('a'), failResult('b'), successResult('c'), failResult('d')];
    const failed = getFailedSteps(results);
    expect(failed).toHaveLength(2);
    expect(failed[0]?.stepId).toBe('b');
    expect(failed[1]?.stepId).toBe('d');
  });

  it('returns empty array when no failures', () => {
    expect(getFailedSteps([successResult('a')])).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(getFailedSteps([])).toEqual([]);
  });
});

// ============================================================================
// withRetries
// ============================================================================

describe('withRetries', () => {
  it('returns success on first attempt', async () => {
    const base: StepExecutor = vi.fn() as unknown as StepExecutor;
    (base as ReturnType<typeof vi.fn>).mockImplementation((step: WorkflowStep) =>
      Promise.resolve(successResult(step.id))
    );

    const retrying = withRetries(base);
    const result = await retrying(makeStep('a'), makeContext());

    expect(result.status).toBe('success');
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('retries on failure', async () => {
    let attempt = 0;
    const base: StepExecutor = (step: WorkflowStep): Promise<StepResult> => {
      attempt++;
      if (attempt < 3) {
        return Promise.resolve(failResult(step.id));
      }
      return Promise.resolve(successResult(step.id));
    };

    const retrying = withRetries(base, 3);
    const result = await retrying(makeStep('a'), makeContext());

    expect(result.status).toBe('success');
    expect(attempt).toBe(3);
  });

  it('uses step retries over default', async () => {
    let callCount = 0;
    const base: StepExecutor = (step: WorkflowStep): Promise<StepResult> => {
      callCount++;
      return Promise.resolve(failResult(step.id));
    };

    const retrying = withRetries(base, 0);
    const result = await retrying(makeStep('a', { retries: 2 }), makeContext());

    expect(result.status).toBe('failed');
    // 1 initial + 2 retries = 3 total
    expect(callCount).toBe(3);
  });

  it('respects cancellation', async () => {
    const base: StepExecutor = (step: WorkflowStep): Promise<StepResult> =>
      Promise.resolve(failResult(step.id));
    const controller = new AbortController();
    controller.abort();

    const retrying = withRetries(base, 3);
    const result = await retrying(makeStep('a'), makeContext({ signal: controller.signal }));

    expect(result.status).toBe('skipped');
    expect(result.error).toContain('cancelled');
  });
});

// ============================================================================
// executeParallel
// ============================================================================

describe('executeParallel', () => {
  it('returns ok for empty steps', async () => {
    const executor: StepExecutor = () => Promise.resolve(successResult('x'));
    const result = await executeParallel([], makeContext(), executor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('executes steps in parallel', async () => {
    const order: string[] = [];
    const executor: StepExecutor = (step: WorkflowStep): Promise<StepResult> => {
      order.push(step.id);
      return Promise.resolve(successResult(step.id));
    };

    const steps = [makeStep('a'), makeStep('b'), makeStep('c')];
    const result = await executeParallel(steps, makeContext(), executor);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(3);
    }
  });

  it('returns results in original step order', async () => {
    const executor: StepExecutor = (step: WorkflowStep): Promise<StepResult> =>
      Promise.resolve(successResult(step.id));

    const steps = [makeStep('c'), makeStep('a'), makeStep('b')];
    const result = await executeParallel(steps, makeContext(), executor);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((r) => r.stepId)).toEqual(['c', 'a', 'b']);
    }
  });

  it('returns error with failFast on step failure', async () => {
    const executor: StepExecutor = (step: WorkflowStep): Promise<StepResult> => {
      if (step.id === 'b') {
        return Promise.resolve(failResult(step.id, 'boom'));
      }
      return Promise.resolve(successResult(step.id));
    };

    const steps = [makeStep('a'), makeStep('b'), makeStep('c')];
    const result = await executeParallel(steps, makeContext(), executor, { failFast: true });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('boom');
    }
  });

  it('respects maxConcurrency', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const executor: StepExecutor = (step: WorkflowStep): Promise<StepResult> => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      return new Promise((resolve) => {
        setTimeout(() => {
          concurrent--;
          resolve(successResult(step.id));
        }, 10);
      });
    };

    const steps = Array.from({ length: 6 }, (_, i) => makeStep(`s${String(i)}`));
    const result = await executeParallel(steps, makeContext(), executor, { maxConcurrency: 2 });

    expect(result.ok).toBe(true);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });
});
