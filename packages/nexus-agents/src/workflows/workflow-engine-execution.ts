/**
 * Workflow Engine Execution - Execution logic for WorkflowEngine.
 *
 * This module contains execution-related functions extracted from
 * workflow-engine.ts to keep files under 400 lines.
 */

import { ok, err, getTimeProvider } from '../core/index.js';
import type { Result, ILogger, StepResult } from '../core/index.js';
import type { WorkflowDefinition } from '../core/index.js';
import { WorkflowError } from '../core/index.js';
import { generateUUID } from '../utils/index.js';
import { ContextManager } from '../agents/context-manager.js';
import {
  applyBudgetEnforcement,
  enforceBudgetForStep,
  createWorkflowCircuitBreaker,
  type BudgetEnforcementConfig,
  type IBudgetCircuitBreaker,
} from './budget-enforcement.js';
import type { WorkflowStep } from './workflow-types.js';
import type { ExecutionContext, ResolvedConfig } from './workflow-engine-helpers.js';
import { MAX_TRACKED_EXECUTIONS } from './workflow-engine-helpers.js';
import type { ActiveExecution } from './workflow-engine-types.js';

/** Parameters for initializing execution. */
export interface InitExecutionParams {
  workflow: WorkflowDefinition;
  inputs: Record<string, unknown>;
  config: ResolvedConfig;
  logger: ILogger;
}

/** Result of execution initialization. */
export interface InitExecutionResult {
  executionId: string;
  context: ExecutionContext;
  startTime: number;
  execution: ActiveExecution;
}

/**
 * Create a context manager for workflow execution.
 */
export function createContextManagerForWorkflow(
  config: ResolvedConfig,
  workflow: WorkflowDefinition,
  logger: ILogger
): ContextManager | undefined {
  if (config.contextManagerConfig === undefined) return undefined;
  const budget = workflow.defaultBudget ?? config.defaultBudget;
  return new ContextManager({ ...config.contextManagerConfig, budget, logger });
}

/**
 * Create a budget circuit breaker for workflow execution.
 */
export function createBudgetCircuitBreakerForWorkflow(
  contextManager: ContextManager | undefined,
  workflow: WorkflowDefinition,
  config: ResolvedConfig,
  logger: ILogger
): IBudgetCircuitBreaker | undefined {
  const budgetConfig: BudgetEnforcementConfig = {
    engineDefaultBudget: config.defaultBudget,
    logger,
  };
  if (workflow.defaultBudget !== undefined) {
    budgetConfig.workflowDefaultBudget = workflow.defaultBudget;
  }
  if (config.budgetCircuitBreakerConfig !== undefined) {
    budgetConfig.circuitBreakerConfig = config.budgetCircuitBreakerConfig;
  }
  return createWorkflowCircuitBreaker(contextManager, budgetConfig);
}

/**
 * Clean up old executions when limit is reached.
 */
export function cleanupOldExecutions(executions: Map<string, ActiveExecution>): void {
  if (executions.size < MAX_TRACKED_EXECUTIONS) return;
  const completed: Array<{ id: string; startTime: number }> = [];
  for (const [id, exec] of executions) {
    if (exec.status.state !== 'running' && exec.status.state !== 'pending') {
      completed.push({ id, startTime: exec.startTime });
    }
  }
  completed.sort((a, b) => a.startTime - b.startTime);
  const toRemove = Math.max(0, executions.size - MAX_TRACKED_EXECUTIONS + 1);
  for (let i = 0; i < toRemove && i < completed.length; i++) {
    const entry = completed[i];
    if (entry !== undefined) executions.delete(entry.id);
  }
}

/**
 * Merges user-provided inputs with defaults from the workflow definition.
 * User-provided values take precedence over defaults.
 */
export function applyInputDefaults(
  workflow: WorkflowDefinition,
  inputs: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...inputs };
  for (const def of workflow.inputs) {
    if (!(def.name in merged) && def.default !== undefined) {
      merged[def.name] = def.default;
    }
  }
  return merged;
}

/**
 * Initialize execution context and tracking.
 */
export function initializeExecution(params: InitExecutionParams): InitExecutionResult {
  const { workflow, inputs, config, logger } = params;
  const executionId = generateUUID();
  const startTime = getTimeProvider().now();

  // Apply input defaults from workflow definition before execution
  const resolvedInputs = applyInputDefaults(workflow, inputs);

  // Create context manager if configured
  const contextManager = createContextManagerForWorkflow(config, workflow, logger);

  // Create circuit breaker if enforcement is enabled
  const budgetCircuitBreaker = config.enableBudgetEnforcement
    ? createBudgetCircuitBreakerForWorkflow(contextManager, workflow, config, logger)
    : undefined;

  const context: ExecutionContext = {
    workflowId: workflow.name,
    executionId,
    inputs: resolvedInputs,
    stepResults: new Map(),
    variables: new Map(),
    abortController: new AbortController(),
    contextManager,
    budgetEvents: [],
    budgetCircuitBreaker,
  };

  const execution: ActiveExecution = {
    executionId,
    workflowName: workflow.name,
    status: { state: 'pending' },
    context,
    startTime,
  };

  if (contextManager !== undefined) {
    logger.debug('Context manager initialized for workflow execution', {
      executionId,
      workflowName: workflow.name,
      budget: workflow.defaultBudget ?? config.defaultBudget,
    });
  }

  return { executionId, context, startTime, execution };
}

/** Options for enforceStepBudgets. */
export interface EnforceStepBudgetsOptions {
  steps: WorkflowStep[];
  context: ExecutionContext;
  workflow: WorkflowDefinition;
  totalSteps: number;
  config: ResolvedConfig;
  logger: ILogger;
}

/**
 * Enforce budget for steps in a phase.
 */
export function enforceStepBudgets(
  options: EnforceStepBudgetsOptions
): Result<void, WorkflowError> {
  const { steps, context, workflow, totalSteps, config, logger } = options;
  const budgetConfig: BudgetEnforcementConfig = {
    engineDefaultBudget: config.defaultBudget,
    logger,
  };
  if (workflow.defaultBudget !== undefined) {
    budgetConfig.workflowDefaultBudget = workflow.defaultBudget;
  }
  if (config.budgetCircuitBreakerConfig !== undefined) {
    budgetConfig.circuitBreakerConfig = config.budgetCircuitBreakerConfig;
  }

  for (const step of steps) {
    // Use circuit breaker if available, otherwise fall back to logging-only
    if (context.budgetCircuitBreaker !== undefined) {
      const remainingSteps = totalSteps - context.stepResults.size;
      const allocation = context.budgetCircuitBreaker.allocateForStep(step.id, remainingSteps);
      const result = enforceBudgetForStep({
        step,
        contextManager: context.contextManager,
        circuitBreaker: context.budgetCircuitBreaker,
        budgetEvents: context.budgetEvents,
        config: budgetConfig,
        estimatedTokens: allocation.allocatedTokens,
      });
      if (!result.ok) {
        return err(
          new WorkflowError(`Budget exceeded for step '${step.id}': ${result.error.message}`, {
            context: { stepId: step.id, circuitState: result.error.circuitState },
            cause: result.error,
          })
        );
      }
    } else {
      // Legacy logging-only enforcement
      applyBudgetEnforcement(step, context.contextManager, context.budgetEvents, budgetConfig);
    }
  }
  return ok(undefined);
}

/**
 * Record token usage after phase completion.
 */
/**
 * What a phase's usage accounting actually covered (#4673).
 *
 * Returned rather than logged so the coverage is assertable: a caller enabling
 * budget enforcement can see whether the ledger it is enforcing against is
 * complete. `unmeasuredSteps > 0` means the recorded spend is a LOWER BOUND.
 */
interface PhaseUsageReport {
  /** Steps that reported real token usage and were recorded. */
  recordedSteps: number;
  /** Steps that reported no usage — not counted, and not treated as zero. */
  unmeasuredSteps: number;
  /** Total tokens recorded to the breaker for this phase. */
  tokensRecorded: number;
}

export function recordPhaseUsage(
  results: StepResult[],
  context: ExecutionContext
): PhaseUsageReport {
  if (context.budgetCircuitBreaker === undefined) {
    return { recordedSteps: 0, unmeasuredSteps: 0, tokensRecorded: 0 };
  }

  // #4673: record REAL token usage. This used to be
  // `Math.round(result.durationMs * 0.5)` — a wall-clock reading in a field
  // named tokens, with a comment conceding "in real usage, this would come
  // from actual token counting". A budget enforced against that would cap on
  // elapsed time, so a slow-but-cheap step could exhaust it while a fast
  // expensive one passed.
  //
  // The real count was already on the step's task metadata; `step-executor`
  // simply dropped it.
  let unmeasuredSteps = 0;
  let recordedSteps = 0;
  let tokensRecorded = 0;
  for (const result of results) {
    if (typeof result.tokensUsed !== 'number') {
      // Unmeasured is NOT zero. Recording zero would under-count spend, which
      // for a cap is the dangerous direction — so it is counted and reported
      // rather than letting absence quietly look free.
      unmeasuredSteps += 1;
      continue;
    }
    context.budgetCircuitBreaker.recordUsage(result.tokensUsed);
    recordedSteps += 1;
    tokensRecorded += result.tokensUsed;
  }

  return { recordedSteps, unmeasuredSteps, tokensRecorded };
}
