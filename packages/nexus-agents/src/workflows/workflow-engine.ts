/** Workflow Engine - Coordinates parsing, execution planning, and step execution. */

import { ok, err, createLogger, getTimeProvider } from '../core/index.js';
import type { Result, ILogger } from '../core/index.js';
import type {
  IWorkflowEngine,
  WorkflowDefinition,
  WorkflowResult,
  WorkflowTemplate,
  ExecutionStatus,
  StepResult,
} from '../core/index.js';
import { WorkflowError, ParseError } from '../core/index.js';
import type { ContextManager } from '../agents/context-manager.js';
import {
  copyBudgetEvents,
  type BudgetEnforcementEvent,
  type IBudgetCircuitBreaker,
} from './budget-enforcement.js';
// WorkflowStep is used in workflow-engine-execution.ts
import {
  type WorkflowEngineConfig,
  type ResolvedConfig,
  type ExecutionPlan,
  type ExecutionContext,
  type ExecutionOptions,
  resolveConfig,
  buildFinalOutput,
  extractErrorMessage,
} from './workflow-engine-helpers.js';
import type { WorkflowEngineDeps, ActiveExecution } from './workflow-engine-types.js';
import {
  cleanupOldExecutions,
  initializeExecution,
  enforceStepBudgets,
  recordPhaseUsage,
} from './workflow-engine-execution.js';

// Re-export types from helpers for backward compatibility
export type { BudgetEnforcementEvent } from './budget-enforcement.js';
export type { WorkflowStep } from './workflow-types.js';
export type {
  WorkflowEngineConfig,
  ExecutionPlan,
  ExecutionPhase,
  ExecutionContext,
  ExecutionOptions,
} from './workflow-engine-helpers.js';
export type { WorkflowEngineDeps } from './workflow-engine-types.js';

/** Workflow engine implementation. */
export class WorkflowEngine implements IWorkflowEngine {
  private readonly config: ResolvedConfig;
  private readonly deps: WorkflowEngineDeps;
  private readonly executions: Map<string, ActiveExecution> = new Map();
  private readonly customTemplates: Map<string, WorkflowDefinition> = new Map();
  private readonly logger: ILogger;

  constructor(deps: WorkflowEngineDeps, config?: WorkflowEngineConfig) {
    this.deps = deps;
    this.logger = config?.logger ?? createLogger({ component: 'WorkflowEngine' });
    this.config = resolveConfig(config);
  }

  /** Load workflow template from file. */
  async loadTemplate(path: string): Promise<Result<WorkflowDefinition, ParseError>> {
    return this.deps.loadWorkflowFile(path);
  }

  /**
   * Execute a workflow with inputs.
   *
   * `options.phaseTimeoutMs` (added in #3017) overrides the per-phase
   * execution timeout for this run only — wins over both `workflow.timeout`
   * (set in the template YAML) and the engine's `defaultTimeoutMs`. Used
   * by the `run_workflow` MCP tool to expose a caller-supplied `timeoutMs`
   * for known-long templates (e.g. security-audit over a large repo).
   */
  async execute(
    workflow: WorkflowDefinition,
    inputs: Record<string, unknown>,
    options?: { phaseTimeoutMs?: number }
  ): Promise<Result<WorkflowResult, WorkflowError>> {
    // Validate inputs and create execution plan
    const inputValidation = this.validateInputs(workflow, inputs);
    if (!inputValidation.ok) {
      return inputValidation;
    }

    const planResult = this.deps.createExecutionPlan(workflow);
    if (!planResult.ok) {
      return planResult;
    }

    // Clean up old executions before adding new ones
    cleanupOldExecutions(this.executions);

    // Initialize execution
    const initResult = initializeExecution({
      workflow,
      inputs,
      config: this.config,
      logger: this.logger,
    });
    this.executions.set(initResult.executionId, initResult.execution);

    try {
      return await this.runExecution({
        workflow,
        plan: planResult.value,
        context: initResult.context,
        executionId: initResult.executionId,
        startTime: initResult.startTime,
        ...(options?.phaseTimeoutMs !== undefined
          ? { phaseTimeoutMs: options.phaseTimeoutMs }
          : {}),
      });
    } catch (error) {
      return this.handleExecutionError(error, initResult.executionId, workflow.name);
    }
  }

  private async runExecution(args: {
    workflow: WorkflowDefinition;
    plan: ExecutionPlan;
    context: ExecutionContext;
    executionId: string;
    startTime: number;
    phaseTimeoutMs?: number;
  }): Promise<Result<WorkflowResult, WorkflowError>> {
    const { workflow, plan, context, executionId, startTime, phaseTimeoutMs } = args;
    const stepResults = await this.executePhases(plan, context, workflow, phaseTimeoutMs);
    if (!stepResults.ok) {
      this.updateExecutionStatus(executionId, {
        state: 'failed',
        error: stepResults.error.message,
      });
      // #2931: enrich the inner error's context with `executionId` and
      // `durationMs` so the run-workflow MCP tool can surface a real,
      // queryable id + elapsed time in the failure envelope instead of
      // the previous `executionId: "unknown"` / `durationMs: 0` shape.
      // Preserves the original message + existing context (stepId, etc.)
      // so parallel-executor's per-step diagnostic stays intact.
      const elapsedMs = getTimeProvider().now() - startTime;
      const innerErr = stepResults.error;
      const enriched = new WorkflowError(innerErr.message, {
        context: { ...(innerErr.context ?? {}), executionId, durationMs: elapsedMs },
      });
      return err(enriched);
    }
    const result: WorkflowResult = {
      executionId,
      workflowName: workflow.name,
      stepResults: stepResults.value,
      output: buildFinalOutput(stepResults.value),
      totalDurationMs: getTimeProvider().now() - startTime,
    };
    this.updateExecutionStatus(executionId, { state: 'completed', result });
    return ok(result);
  }

  private handleExecutionError(
    error: unknown,
    executionId: string,
    workflowName: string
  ): Result<WorkflowResult, WorkflowError> {
    const message = extractErrorMessage(error);
    this.updateExecutionStatus(executionId, { state: 'failed', error: message });
    return err(new WorkflowError(message, { context: { executionId, workflowName } }));
  }

  getStatus(executionId: string): ExecutionStatus {
    const exec = this.executions.get(executionId);
    return exec ? exec.status : { state: 'failed', error: 'Execution not found' };
  }

  getBudgetEvents(executionId: string): BudgetEnforcementEvent[] {
    const exec = this.executions.get(executionId);
    return exec ? copyBudgetEvents(exec.context.budgetEvents) : [];
  }

  getContextManager(executionId: string): ContextManager | undefined {
    return this.executions.get(executionId)?.context.contextManager;
  }

  getBudgetCircuitBreaker(executionId: string): IBudgetCircuitBreaker | undefined {
    return this.executions.get(executionId)?.context.budgetCircuitBreaker;
  }

  cancel(executionId: string): Promise<Result<void, WorkflowError>> {
    const exec = this.executions.get(executionId);
    if (!exec) {
      return Promise.resolve(
        err(new WorkflowError('Execution not found', { context: { executionId } }))
      );
    }
    if (exec.status.state !== 'running' && exec.status.state !== 'pending') {
      return Promise.resolve(
        err(
          new WorkflowError('Cannot cancel completed or failed workflow', {
            context: { executionId, currentState: exec.status.state },
          })
        )
      );
    }
    exec.context.abortController.abort();
    this.updateExecutionStatus(executionId, {
      state: 'cancelled',
      cancelledAt: getTimeProvider().nowIso(),
    });
    return Promise.resolve(ok(undefined));
  }

  listTemplates(): Promise<WorkflowTemplate[]> {
    const templates: WorkflowTemplate[] = [];
    const builtIn = this.deps.getBuiltInTemplates();
    for (const [name, workflow] of builtIn) {
      templates.push(this.createTemplate(workflow, `builtin:${name}`, 'built-in'));
    }
    for (const [name, workflow] of this.customTemplates) {
      templates.push(this.createTemplate(workflow, `custom:${name}`, 'custom'));
    }
    return Promise.resolve(templates);
  }

  private createTemplate(
    workflow: WorkflowDefinition,
    path: string,
    category: string
  ): WorkflowTemplate {
    const t: WorkflowTemplate = { name: workflow.name, version: workflow.version, path, category };
    if (workflow.description !== undefined) t.description = workflow.description;
    return t;
  }

  getTemplateByName(name: string): Promise<WorkflowDefinition | undefined> {
    // Check custom templates first
    const custom = this.customTemplates.get(name);
    if (custom !== undefined) return Promise.resolve(custom);

    // Check built-in templates
    const builtIn = this.deps.getBuiltInTemplates();
    for (const [, workflow] of builtIn) {
      if (workflow.name === name) return Promise.resolve(workflow);
    }
    return Promise.resolve(undefined);
  }

  registerTemplate(id: string, workflow: WorkflowDefinition): void {
    this.customTemplates.set(id, workflow);
  }

  getTemplate(id: string): WorkflowDefinition | undefined {
    const builtIn = this.deps.getBuiltInTemplates();
    return builtIn.get(id) ?? this.customTemplates.get(id);
  }

  private validateInputs(
    workflow: WorkflowDefinition,
    inputs: Record<string, unknown>
  ): Result<void, WorkflowError> {
    for (const inputDef of workflow.inputs) {
      const value = inputs[inputDef.name];
      const isRequired = inputDef.required === true;
      if (isRequired && value === undefined && inputDef.default === undefined) {
        return err(
          new WorkflowError(`Missing required input: ${inputDef.name}`, {
            context: { input: inputDef.name },
          })
        );
      }
    }
    return ok(undefined);
  }

  private async executePhases(
    plan: ExecutionPlan,
    context: ExecutionContext,
    workflow: WorkflowDefinition,
    phaseTimeoutMs?: number
  ): Promise<Result<StepResult[], WorkflowError>> {
    const allResults: StepResult[] = [];
    const totalSteps = plan.phases.reduce((sum, p) => sum + p.steps.length, 0);
    let completedSteps = 0;

    for (const phase of plan.phases) {
      if (context.abortController.signal.aborted) {
        return err(
          new WorkflowError('Workflow cancelled', { context: { executionId: context.executionId } })
        );
      }

      const currentStep = phase.steps[0]?.id ?? 'unknown';
      this.updateExecutionStatus(context.executionId, {
        state: 'running',
        currentStep,
        progress: completedSteps / totalSteps,
      });

      // Check budget enforcement for each step
      const enforceResult = enforceStepBudgets({
        steps: phase.steps,
        context,
        workflow,
        totalSteps,
        config: this.config,
        logger: this.logger,
      });
      if (!enforceResult.ok) return enforceResult;

      // #3017: per-call `phaseTimeoutMs` from run_workflow MCP input wins
      // over both `workflow.timeout` and `this.config.defaultTimeoutMs`.
      const options: ExecutionOptions = {
        maxConcurrency: this.config.maxConcurrency,
        failFast: true,
        timeoutMs: phaseTimeoutMs ?? workflow.timeout ?? this.config.defaultTimeoutMs,
      };

      const phaseResult = await this.deps.executePhase(phase.steps, context, options);
      if (!phaseResult.ok) return phaseResult;

      // Record usage in circuit breaker after phase completion
      recordPhaseUsage(phaseResult.value, context);

      for (const result of phaseResult.value) {
        context.stepResults.set(result.stepId, result);
        allResults.push(result);
      }
      completedSteps += phase.steps.length;
    }
    return ok(allResults);
  }

  private updateExecutionStatus(executionId: string, status: ExecutionStatus): void {
    const exec = this.executions.get(executionId);
    if (exec) exec.status = status;
  }
}

/** Create a workflow engine with default dependencies. */
export function createWorkflowEngine(_config?: WorkflowEngineConfig): IWorkflowEngine {
  throw new Error(
    'createWorkflowEngine requires dependencies. Use WorkflowEngine constructor directly.'
  );
}
