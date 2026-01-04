/**
 * @nexus-agents/workflows - Workflow Engine
 *
 * Main workflow engine implementation that coordinates parsing,
 * execution planning, and step execution.
 */

import { ok, err } from '@nexus-agents/core';
import type { Result } from '@nexus-agents/core';
import type {
  IWorkflowEngine,
  WorkflowDefinition,
  WorkflowResult,
  WorkflowTemplate,
  ExecutionStatus,
  StepResult,
} from '@nexus-agents/core';
import { WorkflowError } from '@nexus-agents/core';
import { ParseError } from '@nexus-agents/core';
import { v4 as uuidv4 } from 'uuid';

/**
 * Configuration for workflow engine.
 */
export interface WorkflowEngineConfig {
  /** Default timeout in ms */
  defaultTimeoutMs?: number;
  /** Maximum concurrent steps */
  maxConcurrency?: number;
  /** Template search paths */
  templatePaths?: string[];
}

/**
 * Dependencies for workflow engine.
 */
export interface WorkflowEngineDeps {
  /** Parse workflow from string */
  parseWorkflow: (
    content: string,
    format: 'yaml' | 'json'
  ) => Result<WorkflowDefinition, ParseError>;
  /** Load workflow from file */
  loadWorkflowFile: (path: string) => Promise<Result<WorkflowDefinition, ParseError>>;
  /** Create execution plan */
  createExecutionPlan: (workflow: WorkflowDefinition) => Result<ExecutionPlan, WorkflowError>;
  /** Execute steps in parallel */
  executePhase: (
    steps: WorkflowStep[],
    context: ExecutionContext,
    options: ExecutionOptions
  ) => Promise<Result<StepResult[], WorkflowError>>;
  /** Get built-in templates */
  getBuiltInTemplates: () => Map<string, WorkflowDefinition>;
}

/**
 * Execution plan with phases.
 */
export interface ExecutionPlan {
  phases: ExecutionPhase[];
}

/**
 * Single execution phase (all steps run concurrently).
 */
export interface ExecutionPhase {
  steps: WorkflowStep[];
}

/**
 * Workflow step type (re-export for convenience).
 */
export interface WorkflowStep {
  id: string;
  agent: string;
  action: string;
  inputs: Record<string, unknown>;
  dependsOn?: string[];
  parallel?: boolean;
  retries?: number;
  timeout?: number;
  condition?: string;
}

/**
 * Execution context for workflow.
 */
export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  inputs: Record<string, unknown>;
  stepResults: Map<string, StepResult>;
  variables: Map<string, unknown>;
  abortController: AbortController;
}

/**
 * Options for phase execution.
 */
export interface ExecutionOptions {
  maxConcurrency: number;
  failFast: boolean;
  timeoutMs?: number;
}

/**
 * Active workflow execution tracking.
 */
interface ActiveExecution {
  executionId: string;
  workflowName: string;
  status: ExecutionStatus;
  context: ExecutionContext;
  startTime: number;
}

const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes
const DEFAULT_MAX_CONCURRENCY = 5;

/**
 * Workflow engine implementation.
 */
export class WorkflowEngine implements IWorkflowEngine {
  private readonly config: Required<WorkflowEngineConfig>;
  private readonly deps: WorkflowEngineDeps;
  private readonly executions: Map<string, ActiveExecution> = new Map();
  private readonly customTemplates: Map<string, WorkflowDefinition> = new Map();

  constructor(deps: WorkflowEngineDeps, config?: WorkflowEngineConfig) {
    this.deps = deps;
    this.config = {
      defaultTimeoutMs: config?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxConcurrency: config?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
      templatePaths: config?.templatePaths ?? [],
    };
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
    const executionId = uuidv4();
    const startTime = Date.now();

    const context: ExecutionContext = {
      workflowId: workflow.name,
      executionId,
      inputs,
      stepResults: new Map(),
      variables: new Map(),
      abortController: new AbortController(),
    };

    const execution: ActiveExecution = {
      executionId,
      workflowName: workflow.name,
      status: { state: 'pending' },
      context,
      startTime,
    };
    this.executions.set(executionId, execution);

    return { executionId, context, startTime };
  }

  /**
   * Run the workflow execution.
   */
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
      output: this.buildFinalOutput(stepResults.value),
      totalDurationMs: Date.now() - startTime,
    };

    this.updateExecutionStatus(executionId, { state: 'completed', result });
    return ok(result);
  }

  /**
   * Handle execution errors.
   */
  private handleExecutionError(
    error: unknown,
    executionId: string,
    workflowName: string
  ): Result<WorkflowResult, WorkflowError> {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.updateExecutionStatus(executionId, { state: 'failed', error: message });
    return err(new WorkflowError(message, { context: { executionId, workflowName } }));
  }

  /**
   * Get execution status.
   */
  getStatus(executionId: string): ExecutionStatus {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return { state: 'failed', error: 'Execution not found' };
    }
    return execution.status;
  }

  /**
   * Cancel a running workflow.
   */
  cancel(executionId: string): Promise<Result<void, WorkflowError>> {
    const execution = this.executions.get(executionId);
    if (execution === undefined) {
      return Promise.resolve(
        err(
          new WorkflowError('Execution not found', {
            context: { executionId },
          })
        )
      );
    }

    if (execution.status.state !== 'running' && execution.status.state !== 'pending') {
      return Promise.resolve(
        err(
          new WorkflowError('Cannot cancel completed or failed workflow', {
            context: { executionId, currentState: execution.status.state },
          })
        )
      );
    }

    // Signal cancellation
    execution.context.abortController.abort();
    this.updateExecutionStatus(executionId, {
      state: 'cancelled',
      cancelledAt: new Date().toISOString(),
    });

    return Promise.resolve(ok(undefined));
  }

  /**
   * List available workflow templates.
   */
  listTemplates(): Promise<WorkflowTemplate[]> {
    const templates: WorkflowTemplate[] = [];

    // Add built-in templates
    const builtIn = this.deps.getBuiltInTemplates();
    for (const [name, workflow] of builtIn) {
      templates.push(this.createTemplate(workflow, `builtin:${name}`, 'built-in'));
    }

    // Add custom templates
    for (const [name, workflow] of this.customTemplates) {
      templates.push(this.createTemplate(workflow, `custom:${name}`, 'custom'));
    }

    return Promise.resolve(templates);
  }

  /**
   * Create a template entry from a workflow definition.
   */
  private createTemplate(
    workflow: WorkflowDefinition,
    path: string,
    category: string
  ): WorkflowTemplate {
    const template: WorkflowTemplate = {
      name: workflow.name,
      version: workflow.version,
      path,
      category,
    };
    if (workflow.description !== undefined) {
      template.description = workflow.description;
    }
    return template;
  }

  /**
   * Register a custom template.
   */
  registerTemplate(id: string, workflow: WorkflowDefinition): void {
    this.customTemplates.set(id, workflow);
  }

  /**
   * Get a template by ID.
   */
  getTemplate(id: string): WorkflowDefinition | undefined {
    // Check built-in first
    const builtIn = this.deps.getBuiltInTemplates();
    if (builtIn.has(id)) {
      return builtIn.get(id);
    }
    // Check custom
    return this.customTemplates.get(id);
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private validateInputs(
    workflow: WorkflowDefinition,
    inputs: Record<string, unknown>
  ): Result<void, WorkflowError> {
    for (const inputDef of workflow.inputs) {
      const value = inputs[inputDef.name];
      const isRequired = inputDef.required === true;
      const hasValue = value !== undefined;
      const hasDefault = inputDef.default !== undefined;

      if (isRequired && !hasValue && !hasDefault) {
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
      // Check for cancellation
      if (context.abortController.signal.aborted) {
        return err(
          new WorkflowError('Workflow cancelled', {
            context: { executionId: context.executionId },
          })
        );
      }

      // Update status
      const currentStep = phase.steps[0]?.id ?? 'unknown';
      this.updateExecutionStatus(context.executionId, {
        state: 'running',
        currentStep,
        progress: completedSteps / totalSteps,
      });

      // Execute phase
      const options: ExecutionOptions = {
        maxConcurrency: this.config.maxConcurrency,
        failFast: true,
        timeoutMs: workflow.timeout ?? this.config.defaultTimeoutMs,
      };

      const phaseResult = await this.deps.executePhase(phase.steps, context, options);

      if (!phaseResult.ok) {
        return phaseResult;
      }

      // Store results
      for (const result of phaseResult.value) {
        context.stepResults.set(result.stepId, result);
        allResults.push(result);
      }

      completedSteps += phase.steps.length;
    }

    return ok(allResults);
  }

  private updateExecutionStatus(executionId: string, status: ExecutionStatus): void {
    const execution = this.executions.get(executionId);
    if (execution) {
      execution.status = status;
    }
  }

  private buildFinalOutput(stepResults: StepResult[]): unknown {
    // Return the output of the last successful step
    const successfulSteps = stepResults.filter((r) => r.status === 'success');
    if (successfulSteps.length === 0) {
      return null;
    }
    const lastStep = successfulSteps[successfulSteps.length - 1];
    return lastStep?.output ?? null;
  }
}

/**
 * Create a workflow engine with default dependencies.
 * This is a factory function that should be called after all
 * component modules are implemented.
 */
export function createWorkflowEngine(_config?: WorkflowEngineConfig): IWorkflowEngine {
  // This will be implemented once all dependencies are available
  // For now, throw an error indicating dependencies are needed
  throw new Error(
    'createWorkflowEngine requires dependencies. Use WorkflowEngine constructor directly.'
  );
}
