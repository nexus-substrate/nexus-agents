/**
 * nexus-agents/testing/framework - Task Executor
 *
 * Task execution utilities for the test runner.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 */

import {
  getErrorMessage,
  getTimeProvider,
  createSharedTaskAnalyzer,
  taskAnalysisResultToTaskProfile,
} from '../../core/index.js';
import type { CliName, CliTask, ICliAdapter } from '../../cli-adapters/types.js';
import type { Task } from '../../core/types/agent.js';
import type { ITaskRouter, RoutingDecision } from '../../cli-adapters/router-types.js';
import type {
  EvaluationTask,
  TaskTestResult,
  RoutingDecisionDetails,
  RubricScore,
  RoutingScore,
} from './types.js';
import type { RubricScorer } from './rubric-scorer.js';
import type { RoutingScorer } from './routing-scorer.js';

/** Module-level singleton — SharedTaskAnalyzer is stateless. */
const sharedAnalyzer = createSharedTaskAnalyzer();

/**
 * Creates an agent task from an evaluation task.
 */
export function createAgentTask(task: EvaluationTask): Task {
  const agentTask: Task = {
    id: task.id,
    description: task.description,
    context: {},
  };
  // Only add files if they exist
  if (task.contextFiles !== undefined && task.contextFiles.length > 0) {
    return {
      ...agentTask,
      context: { files: [...task.contextFiles] },
    };
  }
  return agentTask;
}

/**
 * Creates a CLI task from an evaluation task.
 */
export function createCliTask(task: EvaluationTask): CliTask {
  const cliTask: CliTask = {
    content: task.description,
  };
  // Only add timeout if specified
  if (task.timeoutMs !== undefined) {
    return { ...cliTask, timeoutMs: task.timeoutMs };
  }
  return cliTask;
}

/**
 * Creates routing decision details from a routing decision.
 */
export function createRoutingDecisionDetails(
  decision: RoutingDecision,
  task: Task
): RoutingDecisionDetails {
  const analysis = sharedAnalyzer.analyze(task);
  const taskProfile = taskAnalysisResultToTaskProfile(analysis);

  return {
    selectedCli: decision.adapter.name,
    confidence: decision.confidence,
    reason: decision.reason,
    taskProfile,
    decisionTimeMs: decision.decisionTimeMs,
    alternatives: decision.alternatives.map((alt) => alt.name),
  };
}

/**
 * Creates a failed rubric score.
 */
export function createFailedRubricScore(): RubricScore {
  return {
    overallScore: 0,
    criterionScores: [],
    rubricId: 'failed',
    timestamp: getTimeProvider().nowIso(),
  };
}

/**
 * Checks if a task succeeded based on rubric score.
 */
export function checkSuccess(task: EvaluationTask, rubricScore: RubricScore): boolean {
  const minScore = task.minimumScore ?? 0.5;
  return rubricScore.overallScore >= minScore;
}

/**
 * Selects a CLI for task execution.
 */
export function selectCli(
  task: EvaluationTask,
  adapters: Map<CliName, ICliAdapter>,
  clis?: readonly CliName[]
): CliName {
  // If specific CLIs are requested, use the first available
  if (clis !== undefined && clis.length > 0) {
    const preferredCli = task.preferredClis?.find((cli) => clis.includes(cli));
    if (preferredCli !== undefined) {
      return preferredCli;
    }
    const firstCli = clis[0];
    if (firstCli !== undefined) {
      return firstCli;
    }
  }

  // Use task preference
  if (task.preferredClis !== undefined && task.preferredClis.length > 0) {
    const firstPreferred = task.preferredClis[0];
    if (firstPreferred !== undefined) {
      return firstPreferred;
    }
  }

  // Default to first available adapter
  const firstKey = adapters.keys().next();
  return firstKey.done === true ? 'claude' : firstKey.value;
}

/**
 * Parameters for building a task test result.
 */
export interface TaskResultParams {
  task: EvaluationTask;
  cli: CliName;
  response: string;
  durationMs: number;
  tokenUsage: { inputTokens: number; outputTokens: number };
  costUsd: number;
  rubricScore: RubricScore;
  routingDecision?: RoutingDecisionDetails;
  routingScore?: RoutingScore;
  success: boolean;
  error?: string;
}

/**
 * Builds a TaskTestResult, omitting undefined optional properties.
 */
export function buildTaskResult(params: TaskResultParams): TaskTestResult {
  const base: TaskTestResult = {
    task: params.task,
    cli: params.cli,
    response: params.response,
    durationMs: params.durationMs,
    tokenUsage: params.tokenUsage,
    costUsd: params.costUsd,
    rubricScore: params.rubricScore,
    success: params.success,
    timestamp: getTimeProvider().nowIso(),
  };

  // Build result with only defined optional properties
  let result = base;
  if (params.routingDecision !== undefined) {
    result = { ...result, routingDecision: params.routingDecision };
  }
  if (params.routingScore !== undefined) {
    result = { ...result, routingScore: params.routingScore };
  }
  if (params.error !== undefined) {
    result = { ...result, error: params.error };
  }
  return result;
}

/**
 * Creates an error result for a failed task.
 */
export function createErrorResult(
  task: EvaluationTask,
  cli: CliName,
  error: unknown
): TaskTestResult {
  return {
    task,
    cli,
    response: '',
    durationMs: 0,
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
    costUsd: 0,
    rubricScore: createFailedRubricScore(),
    success: false,
    error: getErrorMessage(error),
    timestamp: getTimeProvider().nowIso(),
  };
}

/**
 * Routes a task using the provided router.
 */
export async function routeTask(
  router: ITaskRouter,
  agentTask: Task
): Promise<{ decision: RoutingDecision; details: RoutingDecisionDetails } | null> {
  const routeResult = await router.routeWithDetails(agentTask);
  if (!routeResult.ok) {
    return null;
  }
  const decision = routeResult.value;
  const details = createRoutingDecisionDetails(decision, agentTask);
  return { decision, details };
}

/**
 * Executes the CLI task and returns the response.
 */
export async function executeCliTask(
  adapter: ICliAdapter,
  cliTask: CliTask
): Promise<{ text: string; tokenUsage: { inputTokens: number; outputTokens: number } } | null> {
  const execResult = await adapter.execute(cliTask);
  if (!execResult.ok) {
    return null;
  }
  return {
    text: execResult.value.text,
    tokenUsage: execResult.value.usage ?? { inputTokens: 0, outputTokens: 0 },
  };
}

/**
 * Scores a task result using the rubric and routing scorers.
 */
export function scoreTaskResult(
  task: EvaluationTask,
  response: string,
  rubricScorer: RubricScorer,
  routingScorer: RoutingScorer,
  routingDetails?: RoutingDecisionDetails
): { rubricScore: RubricScore; routingScore?: RoutingScore } {
  const rubricScore = rubricScorer.score(task, response);

  if (routingDetails === undefined) {
    return { rubricScore };
  }

  // Score routing decision
  const routingScore = routingScorer.score(task, {
    selectedCli: routingDetails.selectedCli,
    confidence: routingDetails.confidence,
    reason: routingDetails.reason,
    alternatives: routingDetails.alternatives,
    decisionTimeMs: routingDetails.decisionTimeMs,
    taskProfile: routingDetails.taskProfile,
  });

  return { rubricScore, routingScore };
}
