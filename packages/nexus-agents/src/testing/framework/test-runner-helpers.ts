/**
 * nexus-agents/testing/framework - Test Runner Helpers
 *
 * Helper functions for the test runner.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 */

import type { ICliAdapter, CliName } from '../../cli-adapters/types.js';
import type { ITaskRouter } from '../../cli-adapters/router.js';
import type {
  EvaluationTask,
  TaskFilter,
  TestRunResult,
  TaskTestResult,
  RoutingDecisionDetails,
} from './types.js';
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

/**
 * Filters tasks by CLI availability.
 */
export function filterTasksByCli(
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
 * Options for resolving CLI for a task.
 */
export interface ResolveCliOptions {
  readonly task: EvaluationTask;
  readonly cli?: CliName;
  readonly router?: ITaskRouter;
  readonly adapters: Map<CliName, ICliAdapter>;
}

/**
 * Resolves which CLI to use for a task.
 */
export async function resolveCliForTask(
  options: ResolveCliOptions
): Promise<{ selectedCli: CliName; routingDecision?: RoutingDecisionDetails }> {
  const { task, cli, router, adapters } = options;

  if (router !== undefined && cli === undefined) {
    const agentTask = createAgentTask(task);
    const routeResult = await router.routeWithDetails(agentTask);
    if (routeResult.ok) {
      return {
        selectedCli: routeResult.value.adapter.name,
        routingDecision: createRoutingDecisionDetails(routeResult.value, agentTask),
      };
    }
  }
  return { selectedCli: cli ?? selectCli(task, adapters) };
}

/**
 * Options for building failure result.
 */
export interface BuildFailureOptions {
  readonly task: EvaluationTask;
  readonly cli: CliName;
  readonly durationMs: number;
  readonly routingDecision: RoutingDecisionDetails | undefined;
  readonly errorMessage: string;
}

/**
 * Builds a failure result for a task.
 */
export function buildFailureResult(options: BuildFailureOptions): TaskTestResult {
  const { task, cli, durationMs, routingDecision, errorMessage } = options;

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
 * Options for building success result.
 */
export interface BuildSuccessOptions {
  readonly task: EvaluationTask;
  readonly cli: CliName;
  readonly durationMs: number;
  readonly response: { text: string; usage?: { inputTokens: number; outputTokens: number } };
  readonly routingDecision?: RoutingDecisionDetails;
  readonly rubricScorer: RubricScorer;
  readonly routingScorer: RoutingScorer;
}

/**
 * Builds a success result for a task.
 */
export function buildSuccessResult(options: BuildSuccessOptions): TaskTestResult {
  const { task, cli, durationMs, response, routingDecision, rubricScorer, routingScorer } = options;

  const rubricScore = rubricScorer.score(task, response.text);
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
    params.routingScore = routingScorer.score(task, routingDecision, rubricScore.overallScore);
  }

  return buildTaskResult(params);
}

/**
 * Options for executing a single task.
 */
export interface ExecuteTaskOptions {
  readonly task: EvaluationTask;
  readonly cli?: CliName;
  readonly adapters: Map<CliName, ICliAdapter>;
  readonly router?: ITaskRouter;
  readonly rubricScorer: RubricScorer;
  readonly routingScorer: RoutingScorer;
}

/**
 * Executes a single task.
 */
export async function executeTaskCore(options: ExecuteTaskOptions): Promise<TaskTestResult> {
  const { task, cli, adapters, router, rubricScorer, routingScorer } = options;

  const startTime = Date.now();

  // Build resolveCliOptions conditionally for exactOptionalPropertyTypes
  const resolveOpts: ResolveCliOptions = { task, adapters };
  if (cli !== undefined) {
    (resolveOpts as { cli: CliName }).cli = cli;
  }
  if (router !== undefined) {
    (resolveOpts as { router: ITaskRouter }).router = router;
  }

  const { selectedCli, routingDecision } = await resolveCliForTask(resolveOpts);

  const adapter = adapters.get(selectedCli);
  if (adapter === undefined) {
    return createErrorResult(task, selectedCli, new Error(`Adapter ${selectedCli} not found`));
  }

  const cliTask = createCliTask(task);
  const result = await adapter.execute(cliTask);
  const durationMs = Date.now() - startTime;

  if (!result.ok) {
    return buildFailureResult({
      task,
      cli: selectedCli,
      durationMs,
      routingDecision,
      errorMessage: result.error.message,
    });
  }

  // Build successOpts conditionally for exactOptionalPropertyTypes
  const successOpts: BuildSuccessOptions = {
    task,
    cli: selectedCli,
    durationMs,
    response: result.value,
    rubricScorer,
    routingScorer,
  };
  if (routingDecision !== undefined) {
    (successOpts as { routingDecision: RoutingDecisionDetails }).routingDecision = routingDecision;
  }

  return buildSuccessResult(successOpts);
}

/**
 * Options for getting tasks for a run.
 */
export interface GetTasksOptions {
  readonly taskRegistry: TaskRegistry;
  readonly filter?: TaskFilter;
}

/**
 * Gets filtered tasks from the registry.
 */
export function getFilteredTasks(options: GetTasksOptions): EvaluationTask[] {
  const { taskRegistry, filter } = options;

  const tasks = taskRegistry.getFiltered(filter);
  if (filter?.clis !== undefined && filter.clis.length > 0) {
    return filterTasksByCli(tasks, filter.clis);
  }
  return [...tasks];
}

/**
 * Logs run completion.
 */
export function createRunCompleteLog(
  runId: string,
  result: TestRunResult
): {
  runId: string;
  success: boolean;
  totalTasks: number;
  successCount: number;
  failureCount: number;
  durationMs: number;
} {
  const successCount = result.taskResults.filter((r) => r.success).length;
  return {
    runId,
    success: result.success,
    totalTasks: result.taskResults.length,
    successCount,
    failureCount: result.taskResults.length - successCount,
    durationMs: result.durationMs,
  };
}
