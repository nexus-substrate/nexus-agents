/**
 * nexus-agents/testing/framework - Test Runner
 *
 * Main test orchestrator for CLI evaluation testing.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 *
 * File length justification: Core TestRunner class with types in types.ts,
 * scorers in rubric-scorer.ts and routing-scorer.ts, task execution in
 * task-executor.ts. Remaining code is test orchestration flow.
 */

import { randomUUID } from 'node:crypto';
import type { Result } from '../../core/result.js';
import { ok, err } from '../../core/result.js';
import type { ILogger } from '../../core/logger.js';
import { logger as defaultLogger } from '../../core/logger.js';
import type { ICliAdapter, CliName } from '../../cli-adapters/types.js';
import type { ITaskRouter } from '../../cli-adapters/router.js';
import type {
  EvaluationTask,
  TaskFilter,
  ProgressCallback,
  TestRunResult,
  TaskTestResult,
  TestRunnerConfig,
  RoutingDecisionDetails,
} from './types.js';
import { DEFAULT_TEST_RUNNER_CONFIG } from './types.js';
import type { TaskRegistry } from './task-registry.js';
import type { RubricScorer } from './rubric-scorer.js';
import type { RoutingScorer } from './routing-scorer.js';
import { estimateCost } from './test-metrics.js';
import {
  createAgentTask,
  createCliTask,
  createRoutingDecisionDetails,
  createFailedRubricScore,
  checkSuccess,
  selectCli,
  buildTaskResult,
  createErrorResult,
} from './task-executor.js';
import {
  createProgressReporter,
  createSingleTaskExecutor,
  runParallelLoop,
} from './parallel-executor.js';
import { buildTestRunResult } from './run-result-builder.js';

/**
 * Test run error for runner failures.
 */
export class TestRunError extends Error {
  constructor(
    message: string,
    readonly phase: 'setup' | 'execution' | 'teardown',
    override readonly cause?: Error
  ) {
    super(message);
    this.name = 'TestRunError';
  }
}

/**
 * Options for creating a TestRunner.
 */
export interface TestRunnerOptions {
  /** CLI adapters keyed by name */
  readonly adapters: Map<CliName, ICliAdapter>;
  /** Task registry containing evaluation tasks */
  readonly taskRegistry: TaskRegistry;
  /** Rubric scorer for evaluating responses */
  readonly rubricScorer: RubricScorer;
  /** Routing scorer for evaluating routing decisions */
  readonly routingScorer: RoutingScorer;
  /** Optional configuration */
  readonly config?: Partial<TestRunnerConfig>;
  /** Optional task router */
  readonly router?: ITaskRouter;
  /** Optional logger */
  readonly logger?: ILogger;
}

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
    const startTime = new Date();

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
            endTime: new Date(),
            results: executionResult.value,
            adapters: this.adapters,
            filter,
          }
        : {
            runId,
            config: this.config,
            startTime,
            endTime: new Date(),
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

    const filteredTasks = filter?.clis ? this.filterTasksByCli(tasks, filter.clis) : tasks;
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
      const results = await this.executeTasksParallel(tasks, clis, onProgress, Date.now());
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
    const successCount = result.taskResults.filter((r) => r.success).length;
    this.logger.info('Test run complete', {
      runId,
      success: result.success,
      totalTasks: result.taskResults.length,
      successCount,
      failureCount: result.taskResults.length - successCount,
      durationMs: result.durationMs,
    });
  }

  /**
   * Runs a single evaluation task.
   * @param task - Task to execute
   * @param cli - Optional specific CLI to use
   * @returns Task test result
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
   * @returns Map of CLI name to health status
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
   * Filters tasks by CLI availability.
   */
  private filterTasksByCli(
    tasks: readonly EvaluationTask[],
    clis: readonly CliName[]
  ): EvaluationTask[] {
    // Include tasks that have at least one preferred CLI in the filter,
    // or tasks with no preference (can run on any CLI)
    return tasks.filter((task) => {
      if (task.preferredClis === undefined || task.preferredClis.length === 0) {
        return true;
      }
      return task.preferredClis.some((cli) => clis.includes(cli));
    });
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
    const start = startMs ?? Date.now();

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
    const startTime = Date.now();
    const { selectedCli, routingDecision } = await this.resolveCliForTask(task, cli);

    const adapter = this.adapters.get(selectedCli);
    if (adapter === undefined) {
      return createErrorResult(task, selectedCli, new Error(`Adapter ${selectedCli} not found`));
    }

    const cliTask = createCliTask(task);
    const result = await adapter.execute(cliTask);
    const durationMs = Date.now() - startTime;

    if (!result.ok) {
      return this.buildFailureResult(
        task,
        selectedCli,
        durationMs,
        routingDecision,
        result.error.message
      );
    }

    return this.buildSuccessResult(task, selectedCli, durationMs, result.value, routingDecision);
  }

  /**
   * Resolves which CLI to use for a task.
   */
  private async resolveCliForTask(
    task: EvaluationTask,
    cli?: CliName
  ): Promise<{ selectedCli: CliName; routingDecision?: RoutingDecisionDetails }> {
    if (this.router !== undefined && cli === undefined) {
      const agentTask = createAgentTask(task);
      const routeResult = await this.router.routeWithDetails(agentTask);
      if (routeResult.ok) {
        return {
          selectedCli: routeResult.value.adapter.name,
          routingDecision: createRoutingDecisionDetails(routeResult.value, agentTask),
        };
      }
    }
    return { selectedCli: cli ?? selectCli(task, this.adapters) };
  }

  /**
   * Builds a failure result for a task.
   */
  private buildFailureResult(
    task: EvaluationTask,
    cli: CliName,
    durationMs: number,
    routingDecision: RoutingDecisionDetails | undefined,
    errorMessage: string
  ): TaskTestResult {
    // Build params conditionally for exactOptionalPropertyTypes
    const params: Parameters<typeof buildTaskResult>[0] = {
      task,
      cli,
      response: '',
      durationMs,
      tokenUsage: { inputTokens: 0, outputTokens: 0 },
      costUsd: 0,
      rubricScore: createFailedRubricScore(),
      success: false,
      error: errorMessage,
    };
    if (routingDecision !== undefined) {
      params.routingDecision = routingDecision;
    }
    return buildTaskResult(params);
  }

  /**
   * Builds a success result for a task.
   */
  private buildSuccessResult(
    task: EvaluationTask,
    cli: CliName,
    durationMs: number,
    response: { text: string; usage?: { inputTokens: number; outputTokens: number } },
    routingDecision?: RoutingDecisionDetails
  ): TaskTestResult {
    const rubricScore = this.rubricScorer.score(task, response.text);
    const tokenUsage = {
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
    };
    const costUsd = estimateCost(cli, tokenUsage);

    // Build params conditionally for exactOptionalPropertyTypes
    const params: Parameters<typeof buildTaskResult>[0] = {
      task,
      cli,
      response: response.text,
      durationMs,
      tokenUsage,
      costUsd,
      rubricScore,
      success: checkSuccess(task, rubricScore),
    };

    if (routingDecision !== undefined) {
      params.routingDecision = routingDecision;
      params.routingScore = this.routingScorer.score(
        task,
        routingDecision,
        rubricScore.overallScore
      );
    }

    return buildTaskResult(params);
  }
}

/**
 * Creates a new test runner using the options pattern.
 * @param options - Test runner options
 * @returns TestRunner instance
 */
export function createTestRunner(options: TestRunnerOptions): TestRunner {
  return new TestRunner(options);
}
