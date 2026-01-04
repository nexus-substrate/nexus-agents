/**
 * @nexus-agents/workflows - Step Executor
 *
 * Executes individual workflow steps using agent experts.
 * Handles input resolution, error handling, retries, timeouts, and conditions.
 */

import type { Result, WorkflowStep, StepResult, AgentRole, Task } from '../core/index.js';
import { ok, err, WorkflowError, TimeoutError, ErrorCode } from '../core/index.js';
import type { Expert, ExpertFactory as ExpertFactoryType } from '../agents/index.js';
import type { WorkflowExecutionContext } from './execution-context.js';
import { resolveInput, getReferencedSteps } from './expression-resolver.js';

/** Default timeout for step execution (5 minutes). */
const DEFAULT_TIMEOUT_MS = 300_000;

/** Default number of retries. */
const DEFAULT_RETRIES = 0;

/** Delay between retries in milliseconds. */
const DEFAULT_RETRY_DELAY_MS = 1000;

/** Maximum retry delay (capped with exponential backoff). */
const MAX_RETRY_DELAY_MS = 30_000;

/**
 * Interface for expert factory dependency.
 */
export interface IExpertFactory {
  createForRole(role: AgentRole): Result<Expert, Error>;
}

/**
 * Wrapper to adapt ExpertFactory to IExpertFactory interface.
 */
export class ExpertFactoryAdapter implements IExpertFactory {
  private readonly factory: typeof ExpertFactoryType;

  constructor(factory: typeof ExpertFactoryType) {
    this.factory = factory;
  }

  createForRole(role: AgentRole): Result<Expert, Error> {
    const roleToType: Record<string, string> = {
      code_expert: 'code',
      architecture_expert: 'architecture',
      security_expert: 'security',
      documentation_expert: 'documentation',
      testing_expert: 'testing',
    };

    const expertType = roleToType[role];
    if (expertType === undefined) {
      return err(new Error(`Unsupported agent role: ${role}`));
    }

    type BuiltInType = 'code' | 'architecture' | 'security' | 'documentation' | 'testing';
    return this.factory.createBuiltIn(expertType as BuiltInType);
  }
}

/** Dependencies for the step executor. */
export interface StepExecutorDeps {
  expertFactory: IExpertFactory;
  logger?: {
    debug: (message: string, data?: Record<string, unknown>) => void;
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
  };
}

/** Options for step execution. */
export interface StepExecutionOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

// ============================================================================
// Condition Evaluation Helpers
// ============================================================================

function checkSimpleCondition(condition: string): boolean | null {
  if (condition === 'always' || condition === 'true') return true;
  if (condition === 'never' || condition === 'false') return false;
  return null;
}

function checkStepStatusCondition(
  condition: string,
  context: WorkflowExecutionContext
): boolean | null {
  const match = condition.match(/^steps\.(\w+)\.status\s*==\s*['"](\w+)['"]$/i);
  if (match === null) return null;

  const stepId = match[1];
  const expectedStatus = match[2]?.toLowerCase();
  if (stepId === undefined || expectedStatus === undefined) return false;

  const stepResult = context.stepResults.get(stepId);
  return stepResult?.status === expectedStatus;
}

function checkStepOutputCondition(
  condition: string,
  context: WorkflowExecutionContext
): boolean | null {
  const match = condition.match(/^steps\.(\w+)\.output$/i);
  if (match === null) return null;

  const stepId = match[1];
  if (stepId === undefined) return false;

  const stepResult = context.stepResults.get(stepId);
  return stepResult?.output !== undefined;
}

function evaluateCondition(condition: string, context: WorkflowExecutionContext): boolean {
  const trimmed = condition.trim();
  const lower = trimmed.toLowerCase();

  const simple = checkSimpleCondition(lower);
  if (simple !== null) return simple;

  const status = checkStepStatusCondition(trimmed, context);
  if (status !== null) return status;

  const output = checkStepOutputCondition(trimmed, context);
  if (output !== null) return output;

  return true; // Default: treat unrecognized as truthy
}

// ============================================================================
// Utility Functions
// ============================================================================

function createTimeout(ms: number, stepId: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(`Step '${stepId}' timed out after ${String(ms)}ms`));
    }, ms);
  });
}

function calculateRetryDelay(attempt: number, baseDelayMs: number): number {
  const delay = baseDelayMs * Math.pow(2, attempt);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    return value.length > 100 ? `${value.substring(0, 100)}...` : value;
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return json.length > 100 ? `${json.substring(0, 100)}...` : json;
  }
  return typeof value === 'number' || typeof value === 'boolean' ? String(value) : '[complex]';
}

function buildTaskDescription(step: WorkflowStep, inputs: Record<string, unknown>): string {
  const inputSummary = Object.entries(inputs)
    .map(([key, value]) => `- ${key}: ${formatValue(value)}`)
    .join('\n');

  return `Execute action: ${step.action}\n\nInputs:\n${inputSummary}`;
}

function extractErrorMessage(error: Error | undefined): string {
  if (error === undefined) return 'Unknown error';
  if (error instanceof WorkflowError && error.cause instanceof Error) {
    return extractErrorMessage(error.cause);
  }
  return error.message;
}

function isNonRetryableError(error: Error): boolean {
  if (error.name === 'ValidationError') return true;
  if (error instanceof WorkflowError) {
    const code = error.code;
    return (
      code === ErrorCode.VALIDATION_ERROR ||
      code === ErrorCode.WORKFLOW_PARSE_ERROR ||
      code === ErrorCode.INVALID_INPUT
    );
  }
  return false;
}

// ============================================================================
// Step Executor Class
// ============================================================================

/**
 * Executor for individual workflow steps.
 */
export class StepExecutor {
  private readonly deps: StepExecutorDeps;

  constructor(deps: StepExecutorDeps) {
    this.deps = deps;
  }

  async execute(
    step: WorkflowStep,
    context: WorkflowExecutionContext,
    options?: StepExecutionOptions
  ): Promise<Result<StepResult, WorkflowError>> {
    const startTime = Date.now();

    // Pre-execution checks
    const preCheck = this.preExecutionChecks(step, context, startTime);
    if (preCheck !== null) return preCheck;

    // Resolve inputs
    const inputsResult = this.resolveStepInputs(step, context);
    if (!inputsResult.ok) return inputsResult;

    // Execute with retries
    return this.executeWithRetries(step, inputsResult.value, context, startTime, options);
  }

  private preExecutionChecks(
    step: WorkflowStep,
    context: WorkflowExecutionContext,
    startTime: number
  ): Result<StepResult, WorkflowError> | null {
    if (context.cancelled) {
      return err(
        new WorkflowError(`Execution cancelled before step '${step.id}'`, {
          context: { stepId: step.id },
        })
      );
    }

    const depCheck = this.checkDependencies(step, context);
    if (!depCheck.ok) return depCheck;

    if (step.condition !== undefined && !evaluateCondition(step.condition, context)) {
      return ok({
        stepId: step.id,
        output: null,
        durationMs: Date.now() - startTime,
        status: 'skipped',
      });
    }

    return null;
  }

  private resolveStepInputs(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Result<Record<string, unknown>, WorkflowError> {
    try {
      const resolved = resolveInput(step.inputs, context) as Record<string, unknown>;
      return ok(resolved);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const errorOptions: { context: Record<string, unknown>; cause?: Error } = {
        context: { stepId: step.id },
      };
      if (error instanceof Error) errorOptions.cause = error;
      return err(
        new WorkflowError(
          `Failed to resolve inputs for step '${step.id}': ${message}`,
          errorOptions
        )
      );
    }
  }

  private getRetryParams(
    step: WorkflowStep,
    options?: StepExecutionOptions
  ): {
    timeoutMs: number;
    retries: number;
    retryDelayMs: number;
  } {
    return {
      timeoutMs: options?.timeoutMs ?? step.timeout ?? DEFAULT_TIMEOUT_MS,
      retries: options?.retries ?? step.retries ?? DEFAULT_RETRIES,
      retryDelayMs: options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    };
  }

  private createCancelledError(
    step: WorkflowStep,
    attempt: number
  ): Result<StepResult, WorkflowError> {
    return err(
      new WorkflowError(`Execution cancelled during step '${step.id}'`, {
        context: { stepId: step.id, attempt },
      })
    );
  }

  private async executeWithRetries(
    step: WorkflowStep,
    resolvedInputs: Record<string, unknown>,
    context: WorkflowExecutionContext,
    startTime: number,
    options?: StepExecutionOptions
  ): Promise<Result<StepResult, WorkflowError>> {
    const { timeoutMs, retries, retryDelayMs } = this.getRetryParams(step, options);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(calculateRetryDelay(attempt - 1, retryDelayMs));
      if (context.cancelled) return this.createCancelledError(step, attempt);

      const result = await this.executeAttempt(step, resolvedInputs, timeoutMs, startTime);
      if (result.ok) return result;

      lastError = result.error;
      if (isNonRetryableError(lastError)) return result;
    }

    return ok({
      stepId: step.id,
      output: null,
      durationMs: Date.now() - startTime,
      status: 'failed',
      error: extractErrorMessage(lastError),
    });
  }

  private checkDependencies(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Result<void, WorkflowError> {
    const dependencies = step.dependsOn ?? [];
    const referencedSteps = getReferencedSteps(step.inputs);
    const allDeps = new Set([...dependencies, ...referencedSteps]);

    for (const depId of allDeps) {
      if (context.stepResults.get(depId) === undefined) {
        return err(
          new WorkflowError(`Dependency '${depId}' not completed for step '${step.id}'`, {
            context: { stepId: step.id, missingDependency: depId },
          })
        );
      }
    }

    return ok(undefined);
  }

  private async executeAttempt(
    step: WorkflowStep,
    resolvedInputs: Record<string, unknown>,
    timeoutMs: number,
    startTime: number
  ): Promise<Result<StepResult, WorkflowError>> {
    const expertResult = this.deps.expertFactory.createForRole(step.agent);
    if (!expertResult.ok) {
      return err(
        new WorkflowError(`Failed to create expert for role '${step.agent}'`, {
          context: { stepId: step.id, role: step.agent },
          cause: expertResult.error,
        })
      );
    }

    const expert = expertResult.value;
    const task: Task = {
      id: `${step.id}-${String(Date.now())}`,
      description: buildTaskDescription(step, resolvedInputs),
      context: { metadata: { stepId: step.id, action: step.action, inputs: resolvedInputs } },
    };

    try {
      return await this.runExpertWithTimeout(expert, task, step, timeoutMs, startTime);
    } finally {
      await this.cleanupExpert(expert);
    }
  }

  private async runExpertWithTimeout(
    expert: Expert,
    task: Task,
    step: WorkflowStep,
    timeoutMs: number,
    startTime: number
  ): Promise<Result<StepResult, WorkflowError>> {
    try {
      const taskResult = await Promise.race([
        expert.execute(task),
        createTimeout(timeoutMs, step.id),
      ]);

      if (!taskResult.ok) {
        return err(
          new WorkflowError(`Expert execution failed for step '${step.id}'`, {
            context: { stepId: step.id },
            cause: taskResult.error,
          })
        );
      }

      return ok({
        stepId: step.id,
        output: taskResult.value.output,
        durationMs: Date.now() - startTime,
        status: 'success',
      });
    } catch (error) {
      return this.handleExecutionError(error, step, timeoutMs);
    }
  }

  private handleExecutionError(
    error: unknown,
    step: WorkflowStep,
    timeoutMs: number
  ): Result<StepResult, WorkflowError> {
    if (error instanceof TimeoutError) {
      return err(
        new WorkflowError(error.message, {
          context: { stepId: step.id, timeout: timeoutMs },
        })
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    const errorOptions: { context: Record<string, unknown>; cause?: Error } = {
      context: { stepId: step.id },
    };
    if (error instanceof Error) errorOptions.cause = error;

    return err(
      new WorkflowError(`Unexpected error in step '${step.id}': ${message}`, errorOptions)
    );
  }

  private async cleanupExpert(expert: Expert): Promise<void> {
    if (typeof expert.cleanup === 'function') {
      try {
        await expert.cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Creates a new StepExecutor instance.
 */
export function createStepExecutor(deps: StepExecutorDeps): StepExecutor {
  return new StepExecutor(deps);
}
