/**
 * nexus-agents/workflows - Step Executor
 *
 * Executes individual workflow steps using agent experts.
 * Handles input resolution, error handling, retries, timeouts, and conditions.
 *
 * Helper functions extracted to step-executor-helpers.ts.
 */

import type { Result, WorkflowStep, StepResult, AgentRole, Task } from '../core/index.js';
import { ok, err, WorkflowError, TimeoutError, getTimeProvider } from '../core/index.js';
import type { Expert, ExpertFactory as ExpertFactoryType } from '../agents/index.js';
import type { WorkflowExecutionContext } from './execution-context.js';
import { resolveInput, getReferencedSteps } from './expression-resolver.js';
import {
  evaluateCondition,
  createTimeout,
  calculateRetryDelay,
  sleep,
  buildTaskDescription,
  extractErrorMessage,
  isNonRetryableError,
} from './step-executor-helpers.js';

// Canonical source: config/timeouts.ts (Issue #1046)
import { STEP_EXECUTOR_TIMEOUTS } from '../config/timeouts.js';

const DEFAULT_TIMEOUT_MS: number = STEP_EXECUTOR_TIMEOUTS.defaultMs;

/** Default number of retries. */
const DEFAULT_RETRIES = 0;

const DEFAULT_RETRY_DELAY_MS = STEP_EXECUTOR_TIMEOUTS.retryDelayMs;

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
      devops_expert: 'devops',
      research_expert: 'research',
    };

    const expertType = roleToType[role];
    if (expertType === undefined) {
      return err(new Error(`Unsupported agent role: ${role}`));
    }

    type BuiltInType =
      'code' | 'architecture' | 'security' | 'documentation' | 'testing' | 'devops' | 'research';
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
    const startTime = getTimeProvider().now();

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
        durationMs: getTimeProvider().now() - startTime,
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
      durationMs: getTimeProvider().now() - startTime,
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
      id: `${step.id}-${String(getTimeProvider().now())}`,
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
    // Pair Promise.race's external timeout with an AbortSignal so the
    // race-LOSER (in-flight model call) cancels when the timer wins —
    // otherwise the SDK keeps running to its own 10-minute timeout (#3016).
    const controller = new AbortController();
    try {
      const taskResult = await Promise.race([
        expert.execute(task, { signal: controller.signal }),
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

      // #4673: carry the REAL token count through. It was already on
      // `taskResult.value.metadata` (populated from adapter usage) and was
      // dropped here, which is why the budget ledger had to estimate from
      // wall-clock duration.
      // #4734: `tokensUsed` is required on ResultMetadata, so an unmeasured
      // step still carries a placeholder 0. `tokensMeasured: false` is the
      // producer saying that 0 is not a count — drop it here so the ledger
      // counts the step as unmeasured rather than free. Absent (legacy
      // producer) is left alone: unknown is not the same as known-unmeasured.
      const { tokensUsed, tokensMeasured } = taskResult.value.metadata;
      const isMeasured = tokensMeasured !== false && typeof tokensUsed === 'number';
      return ok({
        stepId: step.id,
        output: taskResult.value.output,
        durationMs: getTimeProvider().now() - startTime,
        status: 'success',
        ...(isMeasured ? { tokensUsed } : {}),
      });
    } catch (error) {
      return this.handleExecutionError(error, step, timeoutMs);
    } finally {
      // Always abort: settles any in-flight model call regardless of which
      // arm of the race resolved. Safe to call after a clean resolution.
      controller.abort();
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
      } catch (error) {
        this.deps.logger?.debug('Expert cleanup failed', { error: String(error) });
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
