/** Workflow Engine - Coordinates parsing, execution planning, and step execution. */

import { ok, err, createLogger } from '../core/index.js';
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
import { v4 as uuidv4 } from 'uuid';
import { ContextManager } from '../agents/context-manager.js';
import {
  applyBudgetEnforcement,
  copyBudgetEvents,
  type BudgetEnforcementEvent,
  type BudgetEnforcementConfig,
} from './budget-enforcement.js';
import type { WorkflowStep } from './workflow-types.js';
import {
  type WorkflowEngineConfig,
  type ResolvedConfig,
  type ExecutionPlan,
  type ExecutionContext,
  type ExecutionOptions,
  resolveConfig,
  buildFinalOutput,
  extractErrorMessage,
  MAX_TRACKED_EXECUTIONS,
} from './workflow-engine-helpers.js';

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

/** Dependencies for workflow engine. */
export interface WorkflowEngineDeps {
  parseWorkflow: (
    content: string,
    format: 'yaml' | 'json'
  ) => Result<WorkflowDefinition, ParseError>;
  loadWorkflowFile: (path: string) => Promise<Result<WorkflowDefinition, ParseError>>;
  createExecutionPlan: (workflow: WorkflowDefinition) => Result<ExecutionPlan, WorkflowError>;
  executePhase: (
    steps: WorkflowStep[],
    context: ExecutionContext,
    options: ExecutionOptions
  ) => Promise<Result<StepResult[], WorkflowError>>;
  getBuiltInTemplates: () => Map<string, WorkflowDefinition>;
}

/** Active workflow execution tracking. */
interface ActiveExecution {
  executionId: string;
  workflowName: string;
  status: ExecutionStatus;
  context: ExecutionContext;
  startTime: number;
}

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

  /**
   * Load workflow template from file.
   */
  async loadTemplate(path: string): Promise<Result<WorkflowDefinition, ParseError>> {
    return this.deps.loadWorkflowFile(path);
  }

  /**
   * Execute a workflow with inputs.
   */
  async execute(
    workflow: WorkflowDefinition,
    inputs: Record<string, unknown>
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

    // Initialize execution
    const { executionId, context, startTime } = this.initializeExecution(workflow, inputs);

    try {
      return await this.runExecution(workflow, planResult.value, context, executionId, startTime);
    } catch (error) {
      return this.handleExecutionError(error, executionId, workflow.name);
    }
  }

  /**
   * Initialize execution context and tracking.
   */
  private initializeExecution(
    workflow: WorkflowDefinition,
    inputs: Record<string, unknown>
  ): { executionId: string; context: ExecutionContext; startTime: number } {
    // Clean up old executions before adding new ones
    this.cleanupOldExecutions();

    const executionId = uuidv4();
    const startTime = Date.now();

    // Create context manager if configured
    const contextManager = this.createContextManager(workflow);

    const context: ExecutionContext = {
      workflowId: workflow.name,
      executionId,
      inputs,
      stepResults: new Map(),
      variables: new Map(),
      abortController: new AbortController(),
      contextManager,
      budgetEvents: [],
    };

    const execution: ActiveExecution = {
      executionId,
      workflowName: workflow.name,
      status: { state: 'pending' },
      context,
      startTime,
    };
    this.executions.set(executionId, execution);

    if (contextManager !== undefined) {
      this.logger.debug('Context manager initialized for workflow execution', {
        executionId,
        workflowName: workflow.name,
        budget: workflow.defaultBudget ?? this.config.defaultBudget,
      });
    }

    return { executionId, context, startTime };
  }

  private createContextManager(workflow: WorkflowDefinition): ContextManager | undefined {
    if (this.config.contextManagerConfig === undefined) return undefined;
    const budget = workflow.defaultBudget ?? this.config.defaultBudget;
    return new ContextManager({ ...this.config.contextManagerConfig, budget, logger: this.logger });
  }

  private cleanupOldExecutions(): void {
    if (this.executions.size < MAX_TRACKED_EXECUTIONS) return;
    const completed: Array<{ id: string; startTime: number }> = [];
    for (const [id, exec] of this.executions) {
      if (exec.status.state !== 'running' && exec.status.state !== 'pending') {
        completed.push({ id, startTime: exec.startTime });
      }
    }
    completed.sort((a, b) => a.startTime - b.startTime);
    const toRemove = Math.max(0, this.executions.size - MAX_TRACKED_EXECUTIONS + 1);
    for (let i = 0; i < toRemove && i < completed.length; i++) {
      const entry = completed[i];
      if (entry !== undefined) this.executions.delete(entry.id);
    }
  }

  private async runExecution(
    workflow: WorkflowDefinition,
    plan: ExecutionPlan,
    context: ExecutionContext,
    executionId: string,
    startTime: number
  ): Promise<Result<WorkflowResult, WorkflowError>> {
    const stepResults = await this.executePhases(plan, context, workflow);
    if (!stepResults.ok) {
      this.updateExecutionStatus(executionId, {
        state: 'failed',
        error: stepResults.error.message,
      });
      return stepResults;
    }
    const result: WorkflowResult = {
      executionId,
      workflowName: workflow.name,
      stepResults: stepResults.value,
      output: buildFinalOutput(stepResults.value),
      totalDurationMs: Date.now() - startTime,
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
      cancelledAt: new Date().toISOString(),
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
    workflow: WorkflowDefinition
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
      for (const step of phase.steps) {
        const budgetConfig: BudgetEnforcementConfig = {
          engineDefaultBudget: this.config.defaultBudget,
          logger: this.logger,
        };
        if (workflow.defaultBudget !== undefined) {
          budgetConfig.workflowDefaultBudget = workflow.defaultBudget;
        }
        applyBudgetEnforcement(step, context.contextManager, context.budgetEvents, budgetConfig);
      }
      const options: ExecutionOptions = {
        maxConcurrency: this.config.maxConcurrency,
        failFast: true,
        timeoutMs: workflow.timeout ?? this.config.defaultTimeoutMs,
      };
      const phaseResult = await this.deps.executePhase(phase.steps, context, options);
      if (!phaseResult.ok) return phaseResult;
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
