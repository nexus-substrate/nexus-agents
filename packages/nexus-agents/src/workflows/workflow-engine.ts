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
// WorkflowStep is used in workflow-engine-execution.ts
import {
  type WorkflowEngineConfig,
  type ResolvedConfig,
  type ExecutionPlan,
  type ExecutionContext,
  type ExecutionOptions,
  resolveConfig,
  buildFinalOutput,
  deriveWorkflowStatus,
  extractErrorMessage,
} from './workflow-engine-helpers.js';
import type { WorkflowEngineDeps, ActiveExecution } from './workflow-engine-types.js';
import {
  cleanupOldExecutions,
  initializeExecution,
  recordPhaseUsage,
} from './workflow-engine-execution.js';
import { WorkflowBudgetTracker } from './workflow-budget.js';

// Re-export types from helpers for backward compatibility
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
    options?: {
      phaseTimeoutMs?: number;
      onPhaseComplete?: () => void;
      budget?: { readonly maxTokens: number };
    }
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
        ...(options?.onPhaseComplete !== undefined
          ? { onPhaseComplete: options.onPhaseComplete }
          : {}),
        // #4754: one tracker per execution; absent → the run is uncapped.
        ...(options?.budget !== undefined
          ? { budget: new WorkflowBudgetTracker(options.budget.maxTokens) }
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
    /** #6162: async-job heartbeat, fired after each phase settles. */
    onPhaseComplete?: () => void;
    /** #4754: the run's token ceiling. */
    budget?: WorkflowBudgetTracker;
  }): Promise<Result<WorkflowResult, WorkflowError>> {
    const { workflow, executionId, startTime } = args;
    const stepResults = await this.executePhases(args);
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
      ...(args.budget !== undefined ? { budget: args.budget.outcome() } : {}),
    };
    this.storeExecutionResult(executionId, result);
    return ok(result);
  }

  private storeExecutionResult(executionId: string, result: WorkflowResult): void {
    const verdict = deriveWorkflowStatus(result.stepResults);
    if (verdict === 'completed') {
      this.updateExecutionStatus(executionId, { state: verdict, result });
      return;
    }
    const error = result.stepResults.some((step) => step.status === 'failed')
      ? 'One or more workflow steps failed'
      : 'No workflow step succeeded';
    this.updateExecutionStatus(executionId, { state: verdict, error });
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

  /**
   * Surface incomplete budget accounting (#4673).
   *
   * `recordPhaseUsage` returns which steps it could actually account for. A
   * ledger containing unmeasured steps is a LOWER BOUND on spend, and that is
   * precisely what anyone enabling enforcement needs to know before trusting
   * the cap — so it is reported rather than dropped.
   */
  private reportUsageCoverage(
    usage: ReturnType<typeof recordPhaseUsage>,
    workflowName: string
  ): void {
    if (usage.unmeasuredSteps === 0) return;
    this.logger.warn('Budget ledger is incomplete — recorded spend is a lower bound', {
      workflow: workflowName,
      unmeasuredSteps: usage.unmeasuredSteps,
      recordedSteps: usage.recordedSteps,
      tokensRecorded: usage.tokensRecorded,
    });
  }

  private async executePhases(args: {
    plan: ExecutionPlan;
    context: ExecutionContext;
    workflow: WorkflowDefinition;
    phaseTimeoutMs?: number;
    onPhaseComplete?: () => void;
    budget?: WorkflowBudgetTracker;
  }): Promise<Result<StepResult[], WorkflowError>> {
    const { plan, context, workflow, phaseTimeoutMs, onPhaseComplete, budget } = args;
    const allResults: StepResult[] = [];
    const totalSteps = plan.phases.reduce((sum, p) => sum + p.steps.length, 0);
    let completedSteps = 0;

    for (const [phaseIndex, phase] of plan.phases.entries()) {
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

      const options = this.phaseOptions(workflow, phaseTimeoutMs, budget);
      const phaseResult = await this.deps.executePhase(phase.steps, context, options);
      if (!phaseResult.ok) return phaseResult;

      // #4673: usage accounting is measurement, not enforcement — it no longer
      // needs a circuit breaker, so it runs on every phase instead of only when
      // an unreachable enforcement flag was set. The coverage report is
      // consumed, not discarded — see reportUsageCoverage.
      this.reportUsageCoverage(recordPhaseUsage(phaseResult.value), workflow.name);

      for (const result of phaseResult.value) {
        context.stepResults.set(result.stepId, result);
        allResults.push(result);
      }
      completedSteps += phase.steps.length;
      // #6162: one heartbeat per settled phase — the unit of progress an
      // async run_workflow job can prove.
      onPhaseComplete?.();
      // #4754: stop before the next phase dispatches anything once the ceiling
      // is crossed. Steps already running in THIS phase were not halted — see
      // workflows/workflow-budget.ts.
      const hasMorePhases = phaseIndex < plan.phases.length - 1;
      const halt = budget?.settlePhase(phaseResult.value, hasMorePhases, allResults);
      if (halt !== undefined) return err(halt);
    }
    return ok(allResults);
  }

  /**
   * Per-phase execution options. #3017: a per-call `phaseTimeoutMs` from the
   * run_workflow MCP input wins over both `workflow.timeout` and
   * `this.config.defaultTimeoutMs`. #4754: `budget` is included only when the
   * run has a ceiling, so an uncapped run passes exactly the options it did.
   */
  private phaseOptions(
    workflow: WorkflowDefinition,
    phaseTimeoutMs: number | undefined,
    budget: WorkflowBudgetTracker | undefined
  ): ExecutionOptions {
    return {
      maxConcurrency: this.config.maxConcurrency,
      failFast: true,
      timeoutMs: phaseTimeoutMs ?? workflow.timeout ?? this.config.defaultTimeoutMs,
      ...(budget !== undefined ? { budget } : {}),
    };
  }

  private updateExecutionStatus(executionId: string, status: ExecutionStatus): void {
    const exec = this.executions.get(executionId);
    if (exec) exec.status = status;
  }
}
