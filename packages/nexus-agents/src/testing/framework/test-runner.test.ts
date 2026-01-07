/**
 * nexus-agents/testing/framework - Test Runner Tests
 *
 * Unit tests for the CLI evaluation test runner.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { CliName, ICliAdapter } from '../../cli-adapters/types.js';
import { DEFAULT_CAPABILITIES } from '../../cli-adapters/types.js';
import type { ITaskRouter, RoutingDecision } from '../../cli-adapters/router.js';
import type { Task } from '../../core/types/agent.js';
import type { TaskProfile } from '../../cli-adapters/task-analyzer.js';
import { createTestRunner, TestRunError } from './test-runner.js';
import { TaskRegistry, createTaskRegistry, SAMPLE_TASKS } from './task-registry.js';
import { RubricScorer, createRubricScorer, DEFAULT_RUBRICS } from './rubric-scorer.js';
import { RoutingScorer, createRoutingScorer } from './routing-scorer.js';
import type { EvaluationTask, TestProgress } from './types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Creates a mock CLI adapter for testing.
 */
function createMockAdapter(
  name: CliName,
  options?: {
    response?: string;
    error?: Error;
    latencyMs?: number;
  }
): ICliAdapter {
  const response = options?.response ?? `Mock response from ${name}`;
  const latencyMs = options?.latencyMs ?? 10;

  return {
    name,
    transport: 'subprocess',
    capabilities: DEFAULT_CAPABILITIES[name],
    execute: vi.fn().mockImplementation(async () => {
      if (latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
      }
      if (options?.error) {
        return {
          ok: false,
          error: {
            code: 'EXECUTION_ERROR',
            message: options.error.message,
            cli: name,
            retryable: false,
          },
        };
      }
      return {
        ok: true,
        value: {
          text: response,
          usage: { inputTokens: 100, outputTokens: 50 },
          model: `${name}-model`,
          durationMs: latencyMs,
        },
      };
    }),
    healthCheck: vi.fn().mockResolvedValue({
      healthy: true,
      version: '1.0.0',
      versionStatus: 'supported',
      lastChecked: new Date(),
    }),
    getCapacity: vi.fn().mockResolvedValue({
      remainingTokens: 100_000,
      remainingRequests: 100,
      resetTime: new Date(Date.now() + 3600000),
      utilizationPercent: 10,
      exhausted: false,
    }),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getModelInfo: vi.fn().mockReturnValue({
      id: `${name}-model`,
      name: `${name.charAt(0).toUpperCase()}${name.slice(1)} Model`,
      contextWindow: DEFAULT_CAPABILITIES[name].contextWindow,
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock router for testing.
 */
function createMockRouter(selectedCli: CliName = 'claude'): ITaskRouter {
  return {
    route: vi.fn().mockImplementation((_task: Task) => {
      return Promise.resolve({ ok: true, value: { name: selectedCli } as ICliAdapter });
    }),
    routeWithDetails: vi.fn().mockImplementation((_task: Task) => {
      const decision: RoutingDecision = {
        adapter: { name: selectedCli } as ICliAdapter,
        confidence: 0.85,
        reason: 'Best match for task type',
        alternatives: [],
        decisionTimeMs: 5,
      };
      return Promise.resolve({ ok: true, value: decision });
    }),
  };
}

/**
 * Mock task profile for testing routing scorer.
 */
const MOCK_TASK_PROFILE: TaskProfile = {
  contextRequired: 1000,
  reasoningComplexity: 5,
  codeGeneration: true,
  multimodal: false,
  parallelizable: false,
  budgetSensitive: false,
  taskType: 'code_implementation',
};

/**
 * Default base task for testing.
 */
const BASE_TEST_TASK: EvaluationTask = {
  id: 'test-task-1',
  name: 'Test Task',
  description: 'This is a test task with function and return keywords',
  category: 'code_generation',
  difficulty: 'easy',
  expectedTaskType: 'code_implementation',
  expectedPatterns: ['function', 'return'],
  minimumScore: 0.5,
  preferredClis: ['claude'],
};

/**
 * Applies optional properties to a task.
 */
function applyOptionalProps(
  task: EvaluationTask,
  overrides: Partial<EvaluationTask>,
  base: EvaluationTask
): EvaluationTask {
  let result = task;
  const patterns = overrides.expectedPatterns ?? base.expectedPatterns;
  if (patterns !== undefined) result = { ...result, expectedPatterns: patterns };
  const minScore = overrides.minimumScore ?? base.minimumScore;
  if (minScore !== undefined) result = { ...result, minimumScore: minScore };
  const preferred = overrides.preferredClis ?? base.preferredClis;
  if (preferred !== undefined) result = { ...result, preferredClis: preferred };
  if (overrides.contextFiles !== undefined)
    result = { ...result, contextFiles: overrides.contextFiles };
  if (overrides.timeoutMs !== undefined) result = { ...result, timeoutMs: overrides.timeoutMs };
  if (overrides.tags !== undefined) result = { ...result, tags: overrides.tags };
  return result;
}

/**
 * Creates a test evaluation task.
 */
function createTestTask(overrides?: Partial<EvaluationTask>): EvaluationTask {
  if (overrides === undefined) {
    return BASE_TEST_TASK;
  }

  const base: EvaluationTask = {
    id: overrides.id ?? BASE_TEST_TASK.id,
    name: overrides.name ?? BASE_TEST_TASK.name,
    description: overrides.description ?? BASE_TEST_TASK.description,
    category: overrides.category ?? BASE_TEST_TASK.category,
    difficulty: overrides.difficulty ?? BASE_TEST_TASK.difficulty,
    expectedTaskType: overrides.expectedTaskType ?? BASE_TEST_TASK.expectedTaskType,
  };

  return applyOptionalProps(base, overrides, BASE_TEST_TASK);
}

// ============================================================================
// TestRunner Tests
// ============================================================================

describe('TestRunner', () => {
  let adapters: Map<CliName, ICliAdapter>;
  let claudeAdapter: ICliAdapter;
  let geminiAdapter: ICliAdapter;
  let codexAdapter: ICliAdapter;
  let taskRegistry: TaskRegistry;
  let rubricScorer: RubricScorer;
  let routingScorer: RoutingScorer;

  beforeEach(() => {
    claudeAdapter = createMockAdapter('claude', {
      response: 'function example() { return 42; }',
    });
    geminiAdapter = createMockAdapter('gemini', {
      response: 'function test() { return "gemini"; }',
    });
    codexAdapter = createMockAdapter('codex', {
      response: 'const fn = () => { return true; }',
    });

    adapters = new Map<CliName, ICliAdapter>([
      ['claude', claudeAdapter],
      ['gemini', geminiAdapter],
      ['codex', codexAdapter],
    ]);

    taskRegistry = createTaskRegistry();
    rubricScorer = createRubricScorer(DEFAULT_RUBRICS);
    routingScorer = createRoutingScorer();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('runAll', () => {
    it('should execute all tasks in the registry', async () => {
      const task1 = createTestTask({ id: 'task-1', name: 'Task 1' });
      const task2 = createTestTask({ id: 'task-2', name: 'Task 2' });
      taskRegistry.registerAll([task1, task2]);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 1 },
      });

      const result = await runner.runAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskResults.length).toBe(2);
        expect(result.value.metrics.totalTasks).toBe(2);
      }
    });

    it('should filter tasks by category', async () => {
      const codeTask = createTestTask({ id: 'code-task', category: 'code_generation' });
      const reviewTask = createTestTask({ id: 'review-task', category: 'code_review' });
      taskRegistry.registerAll([codeTask, reviewTask]);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 1 },
      });

      const result = await runner.runAll({ categories: ['code_generation'] });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskResults.length).toBe(1);
        const firstResult = result.value.taskResults[0];
        expect(firstResult).toBeDefined();
        expect(firstResult?.task.id).toBe('code-task');
      }
    });

    it('should filter tasks by difficulty', async () => {
      const easyTask = createTestTask({ id: 'easy-task', difficulty: 'easy' });
      const hardTask = createTestTask({ id: 'hard-task', difficulty: 'hard' });
      taskRegistry.registerAll([easyTask, hardTask]);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 1 },
      });

      const result = await runner.runAll({ difficulties: ['easy'] });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskResults.length).toBe(1);
        const firstResult = result.value.taskResults[0];
        expect(firstResult).toBeDefined();
        expect(firstResult?.task.id).toBe('easy-task');
      }
    });

    it('should filter tasks by specific task IDs', async () => {
      const task1 = createTestTask({ id: 'task-1' });
      const task2 = createTestTask({ id: 'task-2' });
      const task3 = createTestTask({ id: 'task-3' });
      taskRegistry.registerAll([task1, task2, task3]);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 1 },
      });

      const result = await runner.runAll({ taskIds: ['task-1', 'task-3'] });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskResults.length).toBe(2);
        const ids = result.value.taskResults.map((r) => r.task.id);
        expect(ids).toContain('task-1');
        expect(ids).toContain('task-3');
      }
    });

    it('should execute tasks in parallel', async () => {
      const tasks = Array.from({ length: 5 }, (_, i) =>
        createTestTask({ id: `task-${String(i)}`, name: `Task ${String(i)}` })
      );
      taskRegistry.registerAll(tasks);

      // Use slow adapter to verify parallelism
      const slowAdapter = createMockAdapter('claude', { latencyMs: 50 });
      adapters.set('claude', slowAdapter);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 5 },
      });

      const startTime = Date.now();
      const result = await runner.runAll();
      const duration = Date.now() - startTime;

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskResults.length).toBe(5);
        // With parallelism=5 and 50ms latency, should complete in ~50-100ms, not 250ms
        expect(duration).toBeLessThan(200);
      }
    });

    it('should call progress callback', async () => {
      const task1 = createTestTask({ id: 'task-1' });
      const task2 = createTestTask({ id: 'task-2' });
      taskRegistry.registerAll([task1, task2]);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 1 },
      });

      const progressUpdates: TestProgress[] = [];
      const onProgress = (progress: TestProgress): void => {
        progressUpdates.push({ ...progress });
      };

      await runner.runAll(undefined, onProgress);

      expect(progressUpdates.length).toBeGreaterThan(0);
      // Should have at least initial and final progress
      expect(progressUpdates[0]?.completed).toBe(0);
    });

    it('should retry failed tasks when configured', async () => {
      let callCount = 0;
      const failingAdapter = createMockAdapter('claude');
      vi.mocked(failingAdapter.execute).mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            ok: false as const,
            error: {
              code: 'EXECUTION_ERROR' as const,
              message: 'Temporary failure',
              cli: 'claude' as const,
              retryable: true,
            },
          });
        }
        return Promise.resolve({
          ok: true as const,
          value: {
            text: 'function success() { return true; }',
            usage: { inputTokens: 100, outputTokens: 50 },
            model: 'claude-model',
            durationMs: 10,
          },
        });
      });
      adapters.set('claude', failingAdapter);

      const task = createTestTask({ id: 'retry-task' });
      taskRegistry.register(task);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 1, retryFailedTasks: true, maxRetries: 3 },
      });

      const result = await runner.runAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(callCount).toBe(3);
        const firstResult = result.value.taskResults[0];
        expect(firstResult).toBeDefined();
        expect(firstResult?.success).toBe(true);
      }
    });

    it('should stop on failure when configured', async () => {
      const failingAdapter = createMockAdapter('claude', {
        error: new Error('Fatal error'),
      });
      adapters.set('claude', failingAdapter);

      const tasks = Array.from({ length: 5 }, (_, i) =>
        createTestTask({ id: `task-${String(i)}` })
      );
      taskRegistry.registerAll(tasks);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 1, stopOnFailure: true, retryFailedTasks: false },
      });

      const result = await runner.runAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should have stopped after first failure
        expect(result.value.taskResults.length).toBeLessThanOrEqual(2);
        expect(result.value.success).toBe(false);
      }
    });

    it('should return error when no tasks match filter', async () => {
      const task = createTestTask({ id: 'task-1', category: 'code_generation' });
      taskRegistry.register(task);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
      });

      const result = await runner.runAll({ categories: ['architecture'] });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(TestRunError);
        expect(result.error.phase).toBe('setup');
      }
    });

    it('should return error when no healthy adapters', async () => {
      // Make all adapters unhealthy
      for (const adapter of adapters.values()) {
        vi.mocked(adapter.healthCheck).mockResolvedValue({
          healthy: false,
          version: '1.0.0',
          versionStatus: 'supported',
          lastChecked: new Date(),
          message: 'Unhealthy',
        });
      }

      const task = createTestTask({ id: 'task-1' });
      taskRegistry.register(task);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
      });

      const result = await runner.runAll();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.phase).toBe('setup');
      }
    });
  });

  describe('runTask', () => {
    it('should execute a single task', async () => {
      const task = createTestTask({ id: 'single-task' });

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
      });

      const result = await runner.runTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.task.id).toBe('single-task');
        expect(result.value.success).toBe(true);
      }
    });

    it('should use specified CLI', async () => {
      const task = createTestTask({ id: 'cli-test' });

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
      });

      const result = await runner.runTask(task, 'gemini');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.cli).toBe('gemini');
        expect(geminiAdapter.execute).toHaveBeenCalled();
      }
    });

    it('should score response with rubric', async () => {
      const task = createTestTask({
        id: 'scoring-test',
        expectedPatterns: ['function', 'return'],
      });

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
      });

      const result = await runner.runTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.rubricScore.overallScore).toBeGreaterThan(0);
        expect(result.value.rubricScore.criterionScores.length).toBeGreaterThan(0);
      }
    });
  });

  describe('validateAdapters', () => {
    it('should return health status for all adapters', async () => {
      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
      });

      const status = await runner.validateAdapters();

      expect(status.size).toBe(3);
      expect(status.get('claude')).toBe(true);
      expect(status.get('gemini')).toBe(true);
      expect(status.get('codex')).toBe(true);
    });

    it('should handle health check failures', async () => {
      vi.mocked(claudeAdapter.healthCheck).mockRejectedValue(new Error('Connection failed'));

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
      });

      const status = await runner.validateAdapters();

      expect(status.get('claude')).toBe(false);
      expect(status.get('gemini')).toBe(true);
    });
  });

  describe('routing integration', () => {
    it('should use router for task assignment when provided', async () => {
      const router = createMockRouter('gemini');
      const task = createTestTask({ id: 'routed-task' });
      taskRegistry.register(task);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 1 },
        router,
      });

      const result = await runner.runAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const firstResult = result.value.taskResults[0];
        expect(firstResult).toBeDefined();
        expect(firstResult?.cli).toBe('gemini');
        expect(firstResult?.routingDecision).toBeDefined();
        expect(firstResult?.routingScore).toBeDefined();
      }
    });

    it('should track routing accuracy in metrics', async () => {
      const router = createMockRouter('claude');
      const task = createTestTask({
        id: 'accuracy-test',
        preferredClis: ['claude'],
      });
      taskRegistry.register(task);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 1 },
        router,
      });

      const result = await runner.runAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metrics.routingAccuracy).toBeDefined();
        expect(result.value.metrics.averageRoutingConfidence).toBeDefined();
      }
    });
  });

  describe('metrics aggregation', () => {
    it('should compute correct success rate', async () => {
      const successTask = createTestTask({ id: 'success-task' });
      const failTask = createTestTask({
        id: 'fail-task',
        minimumScore: 1.0, // Impossible to achieve
        expectedPatterns: ['impossible_pattern_xyz123'],
      });
      taskRegistry.registerAll([successTask, failTask]);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 1 },
      });

      const result = await runner.runAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metrics.successRate).toBe(0.5);
        expect(result.value.metrics.successfulTasks).toBe(1);
        expect(result.value.metrics.failedTasks).toBe(1);
      }
    });

    it('should compute per-CLI metrics', async () => {
      const claudeTask = createTestTask({ id: 'claude-task', preferredClis: ['claude'] });
      const geminiTask = createTestTask({ id: 'gemini-task', preferredClis: ['gemini'] });
      taskRegistry.registerAll([claudeTask, geminiTask]);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 1 },
      });

      const result = await runner.runAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const claudeMetrics = result.value.metrics.byCliMetrics.get('claude');
        const geminiMetrics = result.value.metrics.byCliMetrics.get('gemini');

        expect(claudeMetrics).toBeDefined();
        expect(geminiMetrics).toBeDefined();
        expect(claudeMetrics?.taskCount).toBe(1);
        expect(geminiMetrics?.taskCount).toBe(1);
      }
    });

    it('should compute per-category metrics', async () => {
      const codeTask = createTestTask({ id: 'code-task', category: 'code_generation' });
      const reviewTask = createTestTask({ id: 'review-task', category: 'code_review' });
      taskRegistry.registerAll([codeTask, reviewTask]);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 1 },
      });

      const result = await runner.runAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const codeMetrics = result.value.metrics.byCategoryMetrics.get('code_generation');
        const reviewMetrics = result.value.metrics.byCategoryMetrics.get('code_review');

        expect(codeMetrics).toBeDefined();
        expect(reviewMetrics).toBeDefined();
        expect(codeMetrics?.taskCount).toBe(1);
        expect(reviewMetrics?.taskCount).toBe(1);
      }
    });

    it('should compute per-difficulty metrics', async () => {
      const easyTask = createTestTask({ id: 'easy-task', difficulty: 'easy' });
      const hardTask = createTestTask({ id: 'hard-task', difficulty: 'hard' });
      taskRegistry.registerAll([easyTask, hardTask]);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 1 },
      });

      const result = await runner.runAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        const easyMetrics = result.value.metrics.byDifficultyMetrics.get('easy');
        const hardMetrics = result.value.metrics.byDifficultyMetrics.get('hard');

        expect(easyMetrics).toBeDefined();
        expect(hardMetrics).toBeDefined();
        expect(easyMetrics?.taskCount).toBe(1);
        expect(hardMetrics?.taskCount).toBe(1);
      }
    });

    it('should track total tokens and cost', async () => {
      const task = createTestTask({ id: 'token-task' });
      taskRegistry.register(task);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 1 },
      });

      const result = await runner.runAll();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metrics.totalTokens).toBe(150); // 100 input + 50 output
        expect(result.value.metrics.totalCostUsd).toBeGreaterThan(0);
      }
    });
  });

  describe('abort', () => {
    it('should abort running test', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) =>
        createTestTask({ id: `task-${String(i)}` })
      );
      taskRegistry.registerAll(tasks);

      // Use slow adapter
      const slowAdapter = createMockAdapter('claude', { latencyMs: 100 });
      adapters.set('claude', slowAdapter);

      const runner = createTestRunner({
        adapters,
        taskRegistry,
        rubricScorer,
        routingScorer,
        config: { parallelism: 2 },
      });

      // Start run and abort after short delay
      const runPromise = runner.runAll();
      setTimeout(() => {
        runner.abort();
      }, 50);

      const result = await runPromise;

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should have executed fewer than all tasks
        expect(result.value.taskResults.length).toBeLessThan(10);
      }
    });
  });
});

// ============================================================================
// TaskRegistry Tests
// ============================================================================

describe('TaskRegistry', () => {
  let registry: TaskRegistry;

  beforeEach(() => {
    registry = createTaskRegistry();
  });

  it('should register and retrieve tasks', () => {
    const task = createTestTask({ id: 'test-task' });
    registry.register(task);

    const retrieved = registry.get('test-task');
    expect(retrieved).toEqual(task);
  });

  it('should throw on duplicate registration', () => {
    const task = createTestTask({ id: 'duplicate' });
    registry.register(task);

    expect(() => {
      registry.register(task);
    }).toThrow();
  });

  it('should filter by category', () => {
    const codeTask = createTestTask({ id: 't1', category: 'code_generation' });
    const reviewTask = createTestTask({ id: 't2', category: 'code_review' });
    registry.registerAll([codeTask, reviewTask]);

    const filtered = registry.getByCategory('code_generation');
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.id).toBe('t1');
  });

  it('should filter by difficulty', () => {
    const easyTask = createTestTask({ id: 't1', difficulty: 'easy' });
    const hardTask = createTestTask({ id: 't2', difficulty: 'hard' });
    registry.registerAll([easyTask, hardTask]);

    const filtered = registry.getByDifficulty('hard');
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.id).toBe('t2');
  });

  it('should provide category statistics', () => {
    registry.registerAll(SAMPLE_TASKS);

    const stats = registry.getCategoryStats();
    expect(stats.size).toBeGreaterThan(0);
  });
});

// ============================================================================
// RubricScorer Tests
// ============================================================================

describe('RubricScorer', () => {
  let scorer: RubricScorer;

  beforeEach(() => {
    scorer = createRubricScorer(DEFAULT_RUBRICS);
  });

  it('should score response with patterns', () => {
    const task = createTestTask({
      expectedPatterns: ['function', 'return'],
    });

    const score = scorer.score(task, 'function example() { return 42; }');

    expect(score.overallScore).toBeGreaterThan(0.5);
  });

  it('should score lower when patterns missing', () => {
    const task = createTestTask({
      expectedPatterns: ['function', 'return', 'async', 'await'],
    });

    const score = scorer.score(task, 'const x = 1;');

    expect(score.overallScore).toBeLessThan(0.5);
  });

  it('should use category-specific rubric', () => {
    const task = createTestTask({
      category: 'code_review',
      expectedPatterns: ['sql injection'],
    });

    const score = scorer.score(
      task,
      'This code has a sql injection vulnerability. You should fix this by using parameterized queries instead.'
    );

    expect(score.rubricId).toBe('code-review');
    expect(score.criterionScores.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// RoutingScorer Tests
// ============================================================================

describe('RoutingScorer', () => {
  let scorer: RoutingScorer;

  beforeEach(() => {
    scorer = createRoutingScorer();
  });

  it('should score matched preferred CLI highly', () => {
    const task = createTestTask({ preferredClis: ['claude'] });
    const decision = {
      selectedCli: 'claude' as CliName,
      confidence: 0.9,
      reason: 'Best match',
      alternatives: [],
      decisionTimeMs: 10,
      taskProfile: MOCK_TASK_PROFILE,
    };

    const score = scorer.score(task, decision, 0.9);

    expect(score.matchedPreferred).toBe(true);
    expect(score.overallScore).toBeGreaterThan(0.5);
  });

  it('should score reasonable choice appropriately', () => {
    const task = createTestTask({
      preferredClis: ['claude'],
      category: 'code_generation',
    });
    const decision = {
      selectedCli: 'codex' as CliName, // Codex is reasonable for code_generation
      confidence: 0.8,
      reason: 'Good for code',
      alternatives: [],
      decisionTimeMs: 10,
      taskProfile: MOCK_TASK_PROFILE,
    };

    const score = scorer.score(task, decision, 0.8);

    expect(score.matchedPreferred).toBe(false);
    expect(score.reasonableChoice).toBe(true);
  });

  it('should penalize slow decisions', () => {
    const task = createTestTask({ preferredClis: ['claude'] });
    const fastDecision = {
      selectedCli: 'claude' as CliName,
      confidence: 0.9,
      reason: 'Fast',
      alternatives: [],
      decisionTimeMs: 10,
      taskProfile: MOCK_TASK_PROFILE,
    };
    const slowDecision = {
      selectedCli: 'claude' as CliName,
      confidence: 0.9,
      reason: 'Slow',
      alternatives: [],
      decisionTimeMs: 150,
      taskProfile: MOCK_TASK_PROFILE,
    };

    const fastScore = scorer.score(task, fastDecision, 0.9);
    const slowScore = scorer.score(task, slowDecision, 0.9);

    expect(fastScore.decisionTimeScore).toBeGreaterThan(slowScore.decisionTimeScore);
  });
});
