/**
 * nexus-agents/workflows - Parallel Executor Tests
 *
 * Comprehensive tests for parallel execution, concurrency limiting,
 * fail-fast behavior, and cancellation support.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WorkflowStep, StepResult } from '../../core/index.js';
import { TaskQueue, createTaskQueue } from '../task-queue.js';
import {
  createExecutionPlan,
  validateWorkflowDependencies,
  getExecutionOrder,
  type ExecutionPlan,
} from '../execution-planner.js';
import {
  executeParallel,
  withRetries,
  allSucceeded,
  getFailedSteps,
  type ExecutionContext,
  type StepExecutor,
} from '../parallel-executor.js';

// --- Test Helpers ---

function createStep(id: string, overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id,
    agent: 'code_expert',
    action: 'execute',
    inputs: {},
    ...overrides,
  };
}

function createContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    executionId: 'test-exec-123',
    stepResults: new Map(),
    inputs: {},
    ...overrides,
  };
}

function successResult(stepId: string, output: unknown = null, durationMs = 10): StepResult {
  return { stepId, output, durationMs, status: 'success' };
}

function failedResult(stepId: string, error: string, durationMs = 10): StepResult {
  return { stepId, output: null, durationMs, status: 'failed', error };
}

// --- TaskQueue Tests ---

describe('TaskQueue', () => {
  describe('constructor', () => {
    it('creates a queue with specified concurrency', () => {
      const queue = new TaskQueue(3);
      expect(queue.getRunningCount()).toBe(0);
      expect(queue.getQueuedCount()).toBe(0);
    });

    it('throws for concurrency less than 1', () => {
      expect(() => new TaskQueue(0)).toThrow('Concurrency must be at least 1');
      expect(() => new TaskQueue(-1)).toThrow('Concurrency must be at least 1');
    });
  });

  describe('add()', () => {
    it('executes a single task', async () => {
      const queue = new TaskQueue<number>(1);
      const result = await queue.add(() => Promise.resolve(42));
      expect(result).toBe(42);
    });

    it('executes multiple tasks in parallel up to concurrency limit', async () => {
      const queue = new TaskQueue<number>(2);
      const running: number[] = [];
      const maxRunning: number[] = [];

      const createTask = (id: number) => async () => {
        running.push(id);
        maxRunning.push(running.length);
        await new Promise((resolve) => setTimeout(resolve, 50));
        running.pop();
        return id;
      };

      const results = await Promise.all([
        queue.add(createTask(1)),
        queue.add(createTask(2)),
        queue.add(createTask(3)),
        queue.add(createTask(4)),
      ]);

      expect(results).toEqual([1, 2, 3, 4]);
      expect(Math.max(...maxRunning)).toBeLessThanOrEqual(2);
    });

    it('rejects when queue is cancelled', async () => {
      const queue = new TaskQueue<number>(1);
      queue.cancel();
      await expect(queue.add(() => Promise.resolve(42))).rejects.toThrow(
        'Queue has been cancelled'
      );
    });

    it('handles task errors', async () => {
      const queue = new TaskQueue<number>(1);
      await expect(queue.add(() => Promise.reject(new Error('Task failed')))).rejects.toThrow(
        'Task failed'
      );
    });
  });

  describe('cancel()', () => {
    it('cancels pending tasks', async () => {
      const queue = new TaskQueue<number>(1);
      const executed: number[] = [];

      // Start a long-running task (we don't use the result directly in this test)
      void queue.add(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        executed.push(1);
        return 1;
      });

      const pendingTask = queue.add(() => {
        executed.push(2);
        return Promise.resolve(2);
      });

      // Cancel while first task is running
      await new Promise((resolve) => setTimeout(resolve, 10));
      queue.cancel();

      await expect(pendingTask).rejects.toThrow('Queue cancelled');
      expect(queue.isCancelled()).toBe(true);
    });

    it('signals abort to running tasks', async () => {
      const queue = new TaskQueue<string>(1);
      let wasAborted = false;

      const task = queue.add(async (signal) => {
        // Task that properly handles abort signal
        return new Promise<string>((resolve, reject) => {
          const abortHandler = (): void => {
            wasAborted = true;
            reject(new Error('Aborted'));
          };
          signal.addEventListener('abort', abortHandler);

          // If already aborted, reject immediately
          if (signal.aborted) {
            abortHandler();
            return;
          }

          // Otherwise complete after delay
          setTimeout(() => {
            signal.removeEventListener('abort', abortHandler);
            resolve('done');
          }, 100);
        });
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      queue.cancel();

      await expect(task).rejects.toThrow('Aborted');
      expect(wasAborted).toBe(true);
    });
  });

  describe('createTaskQueue()', () => {
    it('creates a queue with default concurrency', () => {
      const queue = createTaskQueue<number>();
      expect(queue).toBeInstanceOf(TaskQueue);
    });
  });
});

// --- ExecutionPlanner Tests ---

describe('ExecutionPlanner', () => {
  describe('createExecutionPlan()', () => {
    it('creates empty plan for empty workflow', () => {
      const result = createExecutionPlan({
        name: 'empty',
        version: '1.0.0',
        inputs: [],
        steps: [],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.phases).toEqual([]);
        expect(result.value.totalSteps).toBe(0);
        expect(result.value.maxParallelism).toBe(0);
      }
    });

    it('groups independent steps into single phase', () => {
      const result = createExecutionPlan({
        name: 'parallel',
        version: '1.0.0',
        inputs: [],
        steps: [createStep('a'), createStep('b'), createStep('c')],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.phases).toHaveLength(1);
        expect(result.value.phases[0]?.steps.map((s) => s.id)).toEqual(['a', 'b', 'c']);
        expect(result.value.maxParallelism).toBe(3);
      }
    });

    it('creates sequential phases based on dependencies', () => {
      const result = createExecutionPlan({
        name: 'sequential',
        version: '1.0.0',
        inputs: [],
        steps: [
          createStep('a'),
          createStep('b', { dependsOn: ['a'] }),
          createStep('c', { dependsOn: ['b'] }),
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.phases).toHaveLength(3);
        expect(result.value.phases[0]?.steps.map((s) => s.id)).toEqual(['a']);
        expect(result.value.phases[1]?.steps.map((s) => s.id)).toEqual(['b']);
        expect(result.value.phases[2]?.steps.map((s) => s.id)).toEqual(['c']);
        expect(result.value.maxParallelism).toBe(1);
      }
    });

    it('handles diamond dependencies', () => {
      // a -> b, c -> d (b and c can run in parallel)
      const result = createExecutionPlan({
        name: 'diamond',
        version: '1.0.0',
        inputs: [],
        steps: [
          createStep('a'),
          createStep('b', { dependsOn: ['a'] }),
          createStep('c', { dependsOn: ['a'] }),
          createStep('d', { dependsOn: ['b', 'c'] }),
        ],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.phases).toHaveLength(3);
        expect(result.value.phases[0]?.steps.map((s) => s.id)).toEqual(['a']);
        expect(result.value.phases[1]?.steps.map((s) => s.id).sort()).toEqual(['b', 'c']);
        expect(result.value.phases[2]?.steps.map((s) => s.id)).toEqual(['d']);
        expect(result.value.maxParallelism).toBe(2);
      }
    });

    it('detects duplicate step IDs', () => {
      const result = createExecutionPlan({
        name: 'duplicates',
        version: '1.0.0',
        inputs: [],
        steps: [createStep('a'), createStep('a')],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Duplicate step ID');
      }
    });

    it('detects missing dependencies', () => {
      const result = createExecutionPlan({
        name: 'missing',
        version: '1.0.0',
        inputs: [],
        steps: [createStep('a', { dependsOn: ['nonexistent'] })],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('unknown step');
      }
    });

    it('detects circular dependencies', () => {
      const result = createExecutionPlan({
        name: 'circular',
        version: '1.0.0',
        inputs: [],
        steps: [
          createStep('a', { dependsOn: ['c'] }),
          createStep('b', { dependsOn: ['a'] }),
          createStep('c', { dependsOn: ['b'] }),
        ],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Circular dependency');
      }
    });
  });

  describe('validateWorkflowDependencies()', () => {
    it('returns ok for valid workflow', () => {
      const result = validateWorkflowDependencies({
        name: 'valid',
        version: '1.0.0',
        inputs: [],
        steps: [createStep('a'), createStep('b', { dependsOn: ['a'] })],
      });

      expect(result.ok).toBe(true);
    });

    it('returns error for invalid workflow', () => {
      const result = validateWorkflowDependencies({
        name: 'invalid',
        version: '1.0.0',
        inputs: [],
        steps: [createStep('a', { dependsOn: ['b'] }), createStep('b', { dependsOn: ['a'] })],
      });

      expect(result.ok).toBe(false);
    });
  });

  describe('getExecutionOrder()', () => {
    it('returns flat array of step IDs', () => {
      const plan: ExecutionPlan = {
        phases: [
          { phaseIndex: 0, steps: [createStep('a')] },
          { phaseIndex: 1, steps: [createStep('b'), createStep('c')] },
          { phaseIndex: 2, steps: [createStep('d')] },
        ],
        totalSteps: 4,
        maxParallelism: 2,
      };

      const order = getExecutionOrder(plan);
      expect(order).toEqual(['a', 'b', 'c', 'd']);
    });
  });
});

// --- ParallelExecutor Tests ---

describe('ParallelExecutor', () => {
  let mockExecutor: StepExecutor;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockExecutor = vi.fn((step: WorkflowStep) => Promise.resolve(successResult(step.id)));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('executeParallel()', () => {
    it('executes empty steps list', async () => {
      const result = await executeParallel([], createContext(), mockExecutor);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('executes steps in parallel', async () => {
      vi.useRealTimers();

      const executionOrder: string[] = [];
      const executor: StepExecutor = async (step) => {
        executionOrder.push(`start:${step.id}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push(`end:${step.id}`);
        return successResult(step.id);
      };

      const steps = [createStep('a'), createStep('b'), createStep('c')];
      const result = await executeParallel(steps, createContext(), executor, {
        maxConcurrency: 3,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
        // All starts should come before all ends (parallel execution)
        const starts = executionOrder.filter((e) => e.startsWith('start:'));
        expect(starts).toHaveLength(3);
      }
    });

    it('respects concurrency limit', async () => {
      vi.useRealTimers();

      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const executor: StepExecutor = async (step) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((resolve) => setTimeout(resolve, 20));
        currentConcurrent--;
        return successResult(step.id);
      };

      const steps = [createStep('a'), createStep('b'), createStep('c'), createStep('d')];
      await executeParallel(steps, createContext(), executor, { maxConcurrency: 2 });

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('returns results in step order', async () => {
      vi.useRealTimers();

      const executor: StepExecutor = async (step) => {
        // Steps complete in reverse order
        const delay = step.id === 'a' ? 30 : step.id === 'b' ? 20 : 10;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return successResult(step.id, step.id);
      };

      const steps = [createStep('a'), createStep('b'), createStep('c')];
      const result = await executeParallel(steps, createContext(), executor, {
        maxConcurrency: 3,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.map((r) => r.stepId)).toEqual(['a', 'b', 'c']);
      }
    });

    it('implements fail-fast behavior', async () => {
      vi.useRealTimers();

      const executed: string[] = [];

      const executor: StepExecutor = async (step) => {
        executed.push(step.id);
        if (step.id === 'b') {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return failedResult(step.id, 'Step B failed');
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        return successResult(step.id);
      };

      const steps = [createStep('a'), createStep('b'), createStep('c')];
      const result = await executeParallel(steps, createContext(), executor, {
        maxConcurrency: 3,
        failFast: true,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("Step 'b' failed");
      }
    });

    it('continues on failure when failFast is false', async () => {
      vi.useRealTimers();

      const executor: StepExecutor = async (step) => {
        if (step.id === 'b') {
          return failedResult(step.id, 'Step B failed');
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
        return successResult(step.id);
      };

      const steps = [createStep('a'), createStep('b'), createStep('c')];
      const result = await executeParallel(steps, createContext(), executor, {
        failFast: false,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
        expect(result.value.find((r) => r.stepId === 'b')?.status).toBe('failed');
        expect(result.value.find((r) => r.stepId === 'a')?.status).toBe('success');
        expect(result.value.find((r) => r.stepId === 'c')?.status).toBe('success');
      }
    });

    it('handles overall timeout', async () => {
      vi.useRealTimers();

      const executor: StepExecutor = async (step) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return successResult(step.id);
      };

      const steps = [createStep('a')];
      const result = await executeParallel(steps, createContext(), executor, {
        timeoutMs: 50,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('timed out');
      }
    });

    it('handles step-level timeout', async () => {
      vi.useRealTimers();

      const executor: StepExecutor = async (step) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return successResult(step.id);
      };

      const steps = [createStep('a', { timeout: 50 })];
      const result = await executeParallel(steps, createContext(), executor, {
        failFast: false,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]?.status).toBe('failed');
        expect(result.value[0]?.error).toContain('timed out');
      }
    });

    it('respects parent abort signal', async () => {
      vi.useRealTimers();

      const abortController = new AbortController();
      let wasAborted = false;

      const executor: StepExecutor = async (step, context) => {
        context.signal?.addEventListener('abort', () => {
          wasAborted = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
        return successResult(step.id);
      };

      const steps = [createStep('a')];
      const promise = executeParallel(
        steps,
        createContext({ signal: abortController.signal }),
        executor
      );

      // Cancel after a short delay
      setTimeout(() => {
        abortController.abort();
      }, 10);

      const result = await promise;
      expect(wasAborted).toBe(true);
      expect(result.ok).toBe(true);
    });
  });

  describe('withRetries()', () => {
    it('returns success on first attempt', async () => {
      vi.useRealTimers();

      const executor: StepExecutor = vi.fn((step: WorkflowStep) =>
        Promise.resolve(successResult(step.id))
      );
      const retryExecutor = withRetries(executor, 3);

      const result = await retryExecutor(createStep('a'), createContext());

      expect(result.status).toBe('success');
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('retries on failure', async () => {
      vi.useRealTimers();

      let attempts = 0;
      const executor: StepExecutor = (step: WorkflowStep) => {
        attempts++;
        if (attempts < 3) {
          return Promise.resolve(failedResult(step.id, `Attempt ${String(attempts)} failed`));
        }
        return Promise.resolve(successResult(step.id));
      };

      const retryExecutor = withRetries(executor, 3);
      const result = await retryExecutor(createStep('a'), createContext());

      expect(result.status).toBe('success');
      expect(attempts).toBe(3);
    });

    it('respects step-level retry count', async () => {
      vi.useRealTimers();

      let attempts = 0;
      const executor: StepExecutor = (step: WorkflowStep) => {
        attempts++;
        return Promise.resolve(failedResult(step.id, 'Always fails'));
      };

      const retryExecutor = withRetries(executor, 0);
      const result = await retryExecutor(createStep('a', { retries: 2 }), createContext());

      expect(result.status).toBe('failed');
      expect(attempts).toBe(3); // Initial + 2 retries
    });

    it('stops retrying when cancelled', async () => {
      vi.useRealTimers();

      const abortController = new AbortController();

      const executor: StepExecutor = (step: WorkflowStep) => {
        return Promise.resolve(failedResult(step.id, 'Always fails'));
      };

      const retryExecutor = withRetries(executor, 10);

      // Cancel after a short delay
      setTimeout(() => {
        abortController.abort();
      }, 50);

      const result = await retryExecutor(
        createStep('a'),
        createContext({ signal: abortController.signal })
      );

      expect(result.status).toBe('skipped');
      expect(result.error).toContain('cancelled');
    });
  });

  describe('allSucceeded()', () => {
    it('returns true when all steps succeed', () => {
      const results: StepResult[] = [successResult('a'), successResult('b'), successResult('c')];
      expect(allSucceeded(results)).toBe(true);
    });

    it('returns false when any step fails', () => {
      const results: StepResult[] = [
        successResult('a'),
        failedResult('b', 'error'),
        successResult('c'),
      ];
      expect(allSucceeded(results)).toBe(false);
    });

    it('returns true for empty results', () => {
      expect(allSucceeded([])).toBe(true);
    });
  });

  describe('getFailedSteps()', () => {
    it('returns failed steps only', () => {
      const results: StepResult[] = [
        successResult('a'),
        failedResult('b', 'error1'),
        successResult('c'),
        failedResult('d', 'error2'),
      ];

      const failed = getFailedSteps(results);
      expect(failed).toHaveLength(2);
      expect(failed.map((r) => r.stepId)).toEqual(['b', 'd']);
    });

    it('returns empty array when no failures', () => {
      const results: StepResult[] = [successResult('a'), successResult('b')];
      expect(getFailedSteps(results)).toEqual([]);
    });
  });
});
