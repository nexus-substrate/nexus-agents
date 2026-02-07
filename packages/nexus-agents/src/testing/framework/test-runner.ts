/**
 * nexus-agents/testing/framework - Test Runner
 *
 * Main test orchestrator for CLI evaluation testing.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 */

import { randomUUID } from 'node:crypto';
import type { Result } from '../../core/result.js';
import { ok, err } from '../../core/result.js';
import { getTimeProvider } from '../../core/index.js';
import type { ILogger } from '../../core/logger.js';
import { logger as defaultLogger } from '../../core/logger.js';
import type { ICliAdapter, CliName } from '../../cli-adapters/types.js';
import type { ITaskRouter } from '../../cli-adapters/router-types.js';
import type {
  EvaluationTask,
  TaskFilter,
  ProgressCallback,
  TestRunResult,
  TaskTestResult,
  TestRunnerConfig,
} from './types.js';
import { DEFAULT_TEST_RUNNER_CONFIG } from './types.js';
import type { TaskRegistry } from './task-registry.js';
import type { RubricScorer } from './rubric-scorer.js';
import type { RoutingScorer } from './routing-scorer.js';
import {
  createProgressReporter,
  createSingleTaskExecutor,
  runParallelLoop,
} from './parallel-executor.js';
import { buildTestRunResult } from './run-result-builder.js';
import { TestRunError, type TestRunnerOptions } from './test-runner-types.js';
import { filterTasksByCli, executeTaskCore, createRunCompleteLog } from './test-runner-helpers.js';

// Re-export types for backward compatibility
export { TestRunError, type TestRunnerOptions } from './test-runner-types.js';

/**
 * Main test orchestrator for CLI evaluation testing.
 */
export class TestRunner {
  private readonly adapters: Map<CliName, ICliAdapter>;
  private readonly config: TestRunnerConfig;
  private readonly taskRegistry: TaskRegistry;
  private readonly rubricScorer: RubricScorer;
  private readonly routingScorer: RoutingScorer;
  private readonly router?: ITaskRouter;
  private readonly logger: ILogger;
  private aborted = false;

  constructor(options: TestRunnerOptions) {
    this.adapters = options.adapters;
    this.taskRegistry = options.taskRegistry;
    this.rubricScorer = options.rubricScorer;
    this.routingScorer = options.routingScorer;
    this.config = { ...DEFAULT_TEST_RUNNER_CONFIG, ...options.config };
    if (options.router !== undefined) {
      this.router = options.router;
    }
    this.logger = options.logger ?? defaultLogger;
  }

  /**
   * Runs all evaluation tasks matching the filter.
   */
  async runAll(
    filter?: TaskFilter,
    onProgress?: ProgressCallback
  ): Promise<Result<TestRunResult, TestRunError>> {
    this.aborted = false;
    const runId = randomUUID();
    const startTime = new Date(getTimeProvider().now());

    this.logger.info('Starting test run', { runId, runName: this.config.runName, filter });

    // Validate adapters
    const validationResult = await this.validateAdaptersForRun();
    if (!validationResult.ok) {
      return err(validationResult.error);
    }

    // Get and filter tasks
    const tasksResult = this.getTasksForRun(filter);
    if (!tasksResult.ok) {
      return err(tasksResult.error);
    }

    // Execute tasks
    const executionResult = await this.executeTasksForRun(
      tasksResult.value,
      filter?.clis,
      onProgress
    );
    if (!executionResult.ok) {
      return err(executionResult.error);
    }

    // Build and return result - conditionally include filter for exactOptionalPropertyTypes
    const result = await buildTestRunResult(
      filter !== undefined
        ? {
            runId,
            config: this.config,
            startTime,
            endTime: new Date(getTimeProvider().now()),
            results: executionResult.value,
            adapters: this.adapters,
            filter,
          }
        : {
            runId,
            config: this.config,
            startTime,
            endTime: new Date(getTimeProvider().now()),
            results: executionResult.value,
            adapters: this.adapters,
          }
    );

    this.logRunComplete(runId, result);
    return ok(result);
  }

  /**
   * Validates adapters and returns error if none are healthy.
   */
  private async validateAdaptersForRun(): Promise<Result<void, TestRunError>> {
    try {
      const healthStatus = await this.validateAdapters();
      const healthyCount = Array.from(healthStatus.values()).filter((h) => h).length;

      if (healthyCount === 0) {
        return err(new TestRunError('No healthy adapters available', 'setup'));
      }

      this.logger.info('Adapter validation complete', {
        healthy: healthyCount,
        total: healthStatus.size,
      });
      return ok(undefined);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return err(new TestRunError('Failed to validate adapters', 'setup', cause));
    }
  }

  /**
   * Gets and filters tasks for the run.
   */
  private getTasksForRun(filter?: TaskFilter): Result<EvaluationTask[], TestRunError> {
    const tasks = this.taskRegistry.getFiltered(filter);
    if (tasks.length === 0) {
      return err(new TestRunError('No tasks match the provided filter', 'setup'));
    }

    const filteredTasks = filter?.clis ? filterTasksByCli(tasks, filter.clis) : tasks;
    this.logger.info('Tasks to execute', { total: filteredTasks.length, filter });
    // Convert readonly array to mutable for Result type compatibility
    return ok([...filteredTasks]);
  }

  /**
   * Executes tasks and returns results.
   */
  private async executeTasksForRun(
    tasks: EvaluationTask[],
    clis?: readonly CliName[],
    onProgress?: ProgressCallback
  ): Promise<Result<TaskTestResult[], TestRunError>> {
    try {
      const results = await this.executeTasksParallel(
        tasks,
        clis,
        onProgress,
        getTimeProvider().now()
      );
      return ok(results);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      return err(new TestRunError('Task execution failed', 'execution', cause));
    }
  }

  /**
   * Logs run completion.
   */
  private logRunComplete(runId: string, result: TestRunResult): void {
    const logData = createRunCompleteLog(runId, result);
    this.logger.info('Test run complete', logData);
  }

  /**
   * Runs a single evaluation task.
   */
  async runTask(
    task: EvaluationTask,
    cli?: CliName
  ): Promise<Result<TaskTestResult, TestRunError>> {
    try {
      const result = await this.executeTask(task, cli);
      return ok(result);
    } catch (error) {
      return err(
        new TestRunError(
          `Failed to execute task ${task.id}`,
          'execution',
          error instanceof Error ? error : new Error(String(error))
        )
      );
    }
  }

  /**
   * Validates all adapters are healthy.
   */
  async validateAdapters(): Promise<Map<CliName, boolean>> {
    const results = new Map<CliName, boolean>();

    const checks = Array.from(this.adapters.entries()).map(async ([name, adapter]) => {
      try {
        const health = await adapter.healthCheck();
        results.set(name, health.healthy);
      } catch {
        results.set(name, false);
      }
    });

    await Promise.all(checks);
    return results;
  }

  /**
   * Aborts the current test run.
   */
  abort(): void {
    this.aborted = true;
    this.logger.warn('Test run aborted');
  }

  /**
   * Executes tasks in parallel with configurable concurrency.
   */
  private async executeTasksParallel(
    tasks: readonly EvaluationTask[],
    clis?: readonly CliName[],
    onProgress?: ProgressCallback,
    startMs?: number
  ): Promise<TaskTestResult[]> {
    const taskQueue = [...tasks];
    const completed = { count: 0, successCount: 0 };
    const start = startMs ?? getTimeProvider().now();

    const reportProgress = createProgressReporter(onProgress, tasks, taskQueue, completed, start);

    const executeNext = createSingleTaskExecutor({
      taskQueue,
      clis,
      options: {
        parallelism: this.config.parallelism,
        stopOnFailure: this.config.stopOnFailure,
        logger: this.logger,
        adapters: this.adapters,
      },
      executeWithRetry: (task, cli) => this.executeTaskWithRetry(task, cli),
      completed,
      reportProgress,
      abortFn: () => {
        this.abort();
      },
      isAborted: () => this.aborted,
    });

    reportProgress();
    return runParallelLoop(executeNext, taskQueue, this.config.parallelism, () => this.aborted);
  }

  /**
   * Executes a task with retry logic.
   */
  private async executeTaskWithRetry(task: EvaluationTask, cli?: CliName): Promise<TaskTestResult> {
    let lastResult: TaskTestResult | undefined;
    let attempts = 0;
    const maxAttempts = this.config.retryFailedTasks ? this.config.maxRetries + 1 : 1;

    while (attempts < maxAttempts) {
      attempts++;
      lastResult = await this.executeTask(task, cli);

      if (lastResult.success || !this.config.retryFailedTasks) {
        return lastResult;
      }

      this.logger.warn('Task failed, retrying', {
        taskId: task.id,
        attempt: attempts,
        maxAttempts,
      });
    }

    // lastResult is guaranteed to be defined since maxAttempts >= 1
    if (lastResult === undefined) {
      throw new Error('No result after task execution');
    }
    return lastResult;
  }

  /**
   * Executes a single task.
   */
  private async executeTask(task: EvaluationTask, cli?: CliName): Promise<TaskTestResult> {
    // Build options conditionally for exactOptionalPropertyTypes
    // Use type assertion because ExecuteTaskOptions has readonly properties
    const baseOpts = {
      task,
      adapters: this.adapters,
      rubricScorer: this.rubricScorer,
      routingScorer: this.routingScorer,
    };

    if (cli !== undefined && this.router !== undefined) {
      return executeTaskCore({ ...baseOpts, cli, router: this.router });
    }
    if (cli !== undefined) {
      return executeTaskCore({ ...baseOpts, cli });
    }
    if (this.router !== undefined) {
      return executeTaskCore({ ...baseOpts, router: this.router });
    }
    return executeTaskCore(baseOpts);
  }
}

/**
 * Creates a new test runner using the options pattern.
 */
export function createTestRunner(options: TestRunnerOptions): TestRunner {
  return new TestRunner(options);
}
