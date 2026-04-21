/* eslint-disable max-lines -- Cohesive factory: adapters, validators, engine creation (governance §Refactor Threshold) */
/**
 * nexus-agents/workflows - Workflow Engine Factory
 *
 * Factory function to create WorkflowEngine with real dependencies.
 * Wires up the parser, loader, planner, and executor components.
 *
 * @module workflows/workflow-engine-factory
 */

import type { Result, WorkflowDefinition, StepResult, IModelAdapter } from '../core/index.js';
import { getErrorMessage } from '../core/index.js';

import type { WorkflowStep as CoreWorkflowStep } from '../core/index.js';
import {
  ok,
  err,
  WorkflowError,
  ParseError,
  createLogger,
  getTimeProvider,
  type ILogger,
} from '../core/index.js';

/**
 * Error thrown when workflow execution cannot proceed due to missing expert factory.
 * (Source: Issue #507 - Fail-safe workflow execution)
 */
export class WorkflowExecutionUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `Workflow execution cannot proceed: ${reason}. ` +
        'To use mock execution (NOT RECOMMENDED), set useMockExecutor: true'
    );
    this.name = 'WorkflowExecutionUnavailableError';
  }
}
import type { WorkflowEngineDeps } from './workflow-engine-types.js';
import type {
  ExecutionContext,
  ExecutionOptions,
  ExecutionPlan,
  ExecutionPhase,
} from './workflow-engine-helpers.js';
import type { WorkflowStep } from './workflow-types.js';
import { WorkflowEngine, type WorkflowEngineConfig } from './workflow-engine.js';
import { parseWorkflowYaml, parseWorkflowJson, loadWorkflowFile } from './workflow-parser.js';
import {
  createExecutionPlan as createPlannerExecutionPlan,
  type ExecutionPlan as PlannerExecutionPlan,
} from './execution-planner.js';
import { getBuiltInTemplates } from './template-loader.js';
import { executeParallel, type ExecutionContext as ParallelContext } from './parallel-executor.js';
import type { IWorkflowEngine } from '../core/index.js';
import { ExpertFactory } from '../agents/index.js';
import { createStepExecutor, ExpertFactoryAdapter, type IExpertFactory } from './step-executor.js';
import type { WorkflowExecutionContext } from './execution-context.js';
import { getGlobalRegistry } from '../adapters/unified-registry.js';

/**
 * Configuration for the workflow engine factory.
 */
export interface WorkflowEngineFactoryConfig extends WorkflowEngineConfig {
  /** Pre-loaded built-in templates (if not provided, loads at creation time) */
  builtInTemplates?: Map<string, WorkflowDefinition>;
  /** Optional pre-configured model adapter for expert agents */
  modelAdapter?: IModelAdapter;
  /** Optional expert factory for dependency injection (useful for testing) */
  expertFactory?: IExpertFactory;
  /** Use mock executor instead of real StepExecutor (default: false when expertFactory provided) */
  useMockExecutor?: boolean;
}

/**
 * Cached built-in templates (loaded once at startup).
 */
let cachedBuiltInTemplates: Map<string, WorkflowDefinition> | null = null;

/** Inflight template-loading promise for coalescing concurrent calls. */
let templateLoadPromise: Promise<Map<string, WorkflowDefinition>> | undefined;

/**
 * Creates a simple step executor that returns mock results.
 * This is a placeholder - in production, this would use the StepExecutor
 * with a real ExpertFactory.
 *
 * @param step - Step to execute
 * @param startTime - Execution start time
 * @returns Step result
 */
function createSimpleStepResult(step: CoreWorkflowStep, startTime: number): StepResult {
  return {
    stepId: step.id,
    output: {
      action: step.action,
      agent: step.agent,
      message: `Executed step ${step.id} with action ${step.action}`,
      mock: true, // Indicates this was mock execution, not real
    },
    durationMs: getTimeProvider().now() - startTime,
    status: 'success',
  };
}

/**
 * Bridges ParallelContext to WorkflowExecutionContext.
 * The parallel executor uses a simplified context, but the StepExecutor
 * requires the full WorkflowExecutionContext with additional fields.
 *
 * @param parallelCtx - Context from parallel executor
 * @param workflowId - Workflow definition ID
 * @returns WorkflowExecutionContext for step executor
 */
function bridgeToWorkflowContext(
  parallelCtx: ParallelContext,
  workflowId: string
): WorkflowExecutionContext {
  return {
    workflowId,
    executionId: parallelCtx.executionId,
    inputs: parallelCtx.inputs,
    stepResults: parallelCtx.stepResults,
    variables: new Map(),
    startedAt: new Date(getTimeProvider().now()),
    cancelled: parallelCtx.signal?.aborted === true,
  };
}

/**
 * Creates an IExpertFactory adapter that wraps ExpertFactory with an optional model adapter.
 * This allows expert agents to be created with the correct adapter configuration.
 *
 * @param adapter - Optional model adapter to use for created experts
 * @returns IExpertFactory that creates experts with the provided adapter
 */
function createExpertFactoryWithAdapter(adapter?: IModelAdapter): IExpertFactory {
  // Create a wrapper that injects the adapter into createBuiltIn calls
  const factoryWrapper = {
    createBuiltIn: (type: 'code' | 'architecture' | 'security' | 'documentation' | 'testing') =>
      ExpertFactory.createBuiltIn(type, adapter !== undefined ? { adapter } : undefined),
  };

  return new ExpertFactoryAdapter(factoryWrapper as typeof ExpertFactory);
}

/**
 * Adapts ILogger to the simpler logger interface expected by StepExecutorDeps.
 * The StepExecutorDeps.logger has a simpler error signature.
 *
 * @param logger - ILogger instance
 * @returns Logger compatible with StepExecutorDeps
 */
function adaptLoggerForStepExecutor(logger: ILogger): {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
} {
  return {
    debug: (message, data) => {
      logger.debug(message, data);
    },
    info: (message, data) => {
      logger.info(message, data);
    },
    warn: (message, data) => {
      logger.warn(message, data);
    },
    error: (message, data) => {
      // Convert data to an Error if present, otherwise just log the message
      if (data !== undefined) {
        const errorContext = { ...data };
        logger.error(message, undefined, errorContext);
      } else {
        logger.error(message);
      }
    },
  };
}

/**
 * Creates a step executor callback that uses the real StepExecutor with ExpertFactory.
 *
 * @param expertFactory - Factory for creating expert agents
 * @param logger - Logger instance
 * @param workflowId - Workflow definition ID
 * @returns Step executor callback for parallel executor
 */
function createRealStepExecutorCallback(
  expertFactory: IExpertFactory,
  logger: ILogger,
  workflowId: string
): (step: CoreWorkflowStep, ctx: ParallelContext) => Promise<StepResult> {
  const adaptedLogger = adaptLoggerForStepExecutor(logger);
  const executor = createStepExecutor({ expertFactory, logger: adaptedLogger });

  return async (step, ctx) => {
    const startTime = getTimeProvider().now();
    const workflowCtx = bridgeToWorkflowContext(ctx, workflowId);

    // Wire abort signal to cancellation
    if (ctx.signal !== undefined) {
      ctx.signal.addEventListener(
        'abort',
        () => {
          workflowCtx.cancelled = true;
        },
        { once: true }
      );
    }

    // step is already CoreWorkflowStep which is the same as core's WorkflowStep
    // that step-executor expects (both imported from core/types/workflow.ts)
    const result = await executor.execute(step, workflowCtx);

    if (!result.ok) {
      logger.warn('Step execution failed', {
        stepId: step.id,
        error: result.error.message,
      });
      return {
        stepId: step.id,
        output: null,
        durationMs: getTimeProvider().now() - startTime,
        status: 'failed',
        error: result.error.message,
      };
    }

    return result.value;
  };
}

/**
 * Adapts a PlannerExecutionPlan to the ExecutionPlan type expected by WorkflowEngine.
 *
 * @param plannerPlan - Plan from execution-planner
 * @returns Adapted plan for workflow engine
 */
/**
 * Adapts a CoreWorkflowStep to the Zod-validated WorkflowStep type.
 *
 * Both types represent the same concept but the `agent` field uses different
 * string unions: CoreWorkflowStep uses AgentRole (core/types/agent.ts, 15+ roles)
 * while WorkflowStep uses AgentRoleType (workflow-types.ts Zod schema, 8 roles + 'custom').
 * The `as` cast on agent is safe because workflow steps always use Zod-valid roles.
 */
function adaptCoreStepToWorkflowStep(step: CoreWorkflowStep): WorkflowStep {
  const result: WorkflowStep = {
    id: step.id,
    agent: step.agent as WorkflowStep['agent'],
    action: step.action,
    inputs: step.inputs,
  };
  if (step.dependsOn !== undefined) result.dependsOn = step.dependsOn;
  if (step.parallel !== undefined) result.parallel = step.parallel;
  if (step.retries !== undefined) result.retries = step.retries;
  if (step.timeout !== undefined) result.timeout = step.timeout;
  if (step.condition !== undefined) result.condition = step.condition;
  if (step.contextBudget !== undefined) result.contextBudget = step.contextBudget;
  return result;
}

/** Adapt Zod contextBudget (fields may be number|undefined) to core Partial<ContextBudget>. */
function adaptContextBudget(
  source: NonNullable<WorkflowStep['contextBudget']>
): NonNullable<CoreWorkflowStep['contextBudget']> {
  const budget: NonNullable<CoreWorkflowStep['contextBudget']> = {};
  if (source.system !== undefined) budget.system = source.system;
  if (source.task !== undefined) budget.task = source.task;
  if (source.active !== undefined) budget.active = source.active;
  if (source.reserved !== undefined) budget.reserved = source.reserved;
  return budget;
}

/**
 * Adapts a Zod-validated WorkflowStep to CoreWorkflowStep for parallel executor.
 *
 * The agent field's AgentRoleType is a subset of AgentRole (plus 'custom'),
 * so the `as` cast is safe — all Zod-validated roles are valid AgentRoles.
 */
function workflowStepToCoreStep(step: WorkflowStep): CoreWorkflowStep {
  const result: CoreWorkflowStep = {
    id: step.id,
    agent: step.agent,
    action: step.action,
    inputs: step.inputs,
  };
  if (step.dependsOn !== undefined) result.dependsOn = step.dependsOn;
  if (step.parallel !== undefined) result.parallel = step.parallel;
  if (step.retries !== undefined) result.retries = step.retries;
  if (step.timeout !== undefined) result.timeout = step.timeout;
  if (step.condition !== undefined) result.condition = step.condition;
  if (step.contextBudget !== undefined)
    result.contextBudget = adaptContextBudget(step.contextBudget);
  return result;
}

function adaptExecutionPlan(plannerPlan: PlannerExecutionPlan): ExecutionPlan {
  const phases: ExecutionPhase[] = plannerPlan.phases.map((phase) => ({
    steps: phase.steps.map(adaptCoreStepToWorkflowStep),
  }));
  return { phases };
}

/**
 * Options for creating the executePhase function.
 */
interface CreateExecutePhaseOptions {
  /** Logger instance */
  logger: ILogger;
  /** Optional expert factory for real step execution */
  expertFactory?: IExpertFactory | undefined;
  /** Workflow ID for context bridging (required when using expertFactory) */
  workflowId?: string | undefined;
  /** Use mock executor even when expertFactory is provided */
  useMockExecutor?: boolean | undefined;
}

/**
 * Creates a mock step executor that returns simple success results.
 */
function createMockStepExecutor(
  logger: ILogger
): (step: CoreWorkflowStep, ctx: ParallelContext) => Promise<StepResult> {
  return (step: CoreWorkflowStep, _ctx: ParallelContext): Promise<StepResult> => {
    const startTime = getTimeProvider().now();
    logger.debug('Executing step (mock)', {
      stepId: step.id,
      agent: step.agent,
      action: step.action,
    });
    return Promise.resolve(createSimpleStepResult(step, startTime));
  };
}

/**
 * Resolves the step executor based on configuration.
 *
 * By default, this function FAILS if expertFactory is missing to prevent
 * workflows from proceeding with mock/placeholder execution.
 * (Source: Issue #507 - Fail-safe workflow execution)
 */
function resolveStepExecutor(
  options: CreateExecutePhaseOptions
): (step: CoreWorkflowStep, ctx: ParallelContext) => Promise<StepResult> {
  const { logger, expertFactory, workflowId, useMockExecutor } = options;

  // Explicit mock execution requested - allow it with warning
  if (useMockExecutor === true) {
    logger.warn(
      'useMockExecutor enabled; workflow steps will return mock results (NOT RECOMMENDED)'
    );
    return createMockStepExecutor(logger);
  }

  // Use real executor when we have expertFactory and workflowId
  if (expertFactory !== undefined && workflowId !== undefined) {
    logger.info('Using real StepExecutor with ExpertFactory', { workflowId });
    return createRealStepExecutorCallback(expertFactory, logger, workflowId);
  }

  // Fail-fast when expertFactory is provided but workflowId is missing (Issue #507)
  if (expertFactory !== undefined && workflowId === undefined) {
    throw new WorkflowExecutionUnavailableError('expertFactory provided but workflowId missing');
  }

  // Fail-fast when expertFactory is missing (Issue #507)
  throw new WorkflowExecutionUnavailableError(
    'No expertFactory provided. Configure expertFactory or modelAdapter to enable real execution'
  );
}

/**
 * Creates the executePhase function that bridges workflow engine context
 * to the parallel executor.
 *
 * When expertFactory is provided (and useMockExecutor is not true), uses the real
 * StepExecutor to execute steps with agent experts. Otherwise, uses a mock executor
 * that returns simple success results.
 *
 * @param options - Configuration options
 * @returns executePhase function
 */
function createExecutePhase(
  options: CreateExecutePhaseOptions
): (
  steps: WorkflowStep[],
  context: ExecutionContext,
  options: ExecutionOptions
) => Promise<Result<StepResult[], WorkflowError>> {
  const stepExecutor = resolveStepExecutor(options);
  const { logger } = options;

  return async (
    steps: WorkflowStep[],
    context: ExecutionContext,
    executionOptions: ExecutionOptions
  ): Promise<Result<StepResult[], WorkflowError>> => {
    logger.debug('Executing phase', {
      stepCount: steps.length,
      executionId: context.executionId,
      maxConcurrency: executionOptions.maxConcurrency,
    });

    // Convert workflow engine context to parallel executor context
    const parallelContext: ParallelContext = {
      executionId: context.executionId,
      stepResults: context.stepResults,
      inputs: context.inputs,
      signal: context.abortController.signal,
    };

    // WorkflowStep (Zod-validated) -> CoreWorkflowStep for parallel executor.
    // The agent field's AgentRoleType is a subset of AgentRole, so this is safe.
    const coreSteps: CoreWorkflowStep[] = steps.map(workflowStepToCoreStep);

    // Build options, only including timeoutMs if it's defined
    const parallelOptions: { maxConcurrency: number; failFast: boolean; timeoutMs?: number } = {
      maxConcurrency: executionOptions.maxConcurrency,
      failFast: executionOptions.failFast,
    };
    if (executionOptions.timeoutMs !== undefined) {
      parallelOptions.timeoutMs = executionOptions.timeoutMs;
    }

    return executeParallel(coreSteps, parallelContext, stepExecutor, parallelOptions);
  };
}

/**
 * Creates the parseWorkflow function that handles both YAML and JSON.
 *
 * @returns parseWorkflow function
 */
function createParseWorkflow(): (
  content: string,
  format: 'yaml' | 'json'
) => Result<WorkflowDefinition, ParseError> {
  return (content: string, format: 'yaml' | 'json'): Result<WorkflowDefinition, ParseError> => {
    if (format === 'json') {
      return parseWorkflowJson(content);
    }
    return parseWorkflowYaml(content);
  };
}

/**
 * Creates the loadWorkflowFile function wrapper.
 *
 * @returns loadWorkflowFile function
 */
function createLoadWorkflowFile(): (
  path: string
) => Promise<Result<WorkflowDefinition, ParseError>> {
  return async (path: string): Promise<Result<WorkflowDefinition, ParseError>> => {
    const result = await loadWorkflowFile(path);
    if (!result.ok) {
      // Convert SecurityError to ParseError if needed
      if (result.error instanceof ParseError) {
        return result as Result<WorkflowDefinition, ParseError>;
      }
      return err(new ParseError(result.error.message));
    }
    return ok(result.value);
  };
}

/**
 * Creates the createExecutionPlan function that adapts the planner output.
 *
 * @returns createExecutionPlan function
 */
function createAdaptedExecutionPlan(): (
  workflow: WorkflowDefinition
) => Result<ExecutionPlan, WorkflowError> {
  return (workflow: WorkflowDefinition): Result<ExecutionPlan, WorkflowError> => {
    const planResult = createPlannerExecutionPlan(workflow);
    if (!planResult.ok) {
      return planResult;
    }
    return ok(adaptExecutionPlan(planResult.value));
  };
}

/**
 * Resolves the expert factory from config, creating one if modelAdapter is provided.
 */
function resolveExpertFactory(
  config: WorkflowEngineFactoryConfig | undefined,
  logger: ILogger
): IExpertFactory | undefined {
  if (config?.expertFactory !== undefined) {
    return config.expertFactory;
  }
  if (config?.modelAdapter !== undefined) {
    logger.info('Created ExpertFactory with provided model adapter');
    return createExpertFactoryWithAdapter(config.modelAdapter);
  }
  return undefined;
}

/**
 * Creates WorkflowEngineDeps with real implementations.
 *
 * When expertFactory is provided in config, the workflow engine will use the real
 * StepExecutor to execute steps with agent experts. Otherwise, uses a mock executor.
 *
 * @param config - Factory configuration
 * @returns WorkflowEngineDeps instance
 */
export function createWorkflowEngineDeps(config?: WorkflowEngineFactoryConfig): WorkflowEngineDeps {
  const logger = config?.logger ?? createLogger({ component: 'WorkflowEngine' });
  const builtInTemplates = config?.builtInTemplates ?? cachedBuiltInTemplates ?? new Map();
  const expertFactory = resolveExpertFactory(config, logger);

  return {
    parseWorkflow: createParseWorkflow(),
    loadWorkflowFile: createLoadWorkflowFile(),
    createExecutionPlan: createAdaptedExecutionPlan(),
    executePhase: createExecutePhase({
      logger,
      expertFactory,
      workflowId: 'default',
      useMockExecutor: config?.useMockExecutor,
    }),
    getBuiltInTemplates: () => builtInTemplates,
  };
}

/**
 * Initializes and caches built-in templates.
 * Call this at startup before creating workflow engines.
 *
 * @returns Promise that resolves when templates are loaded
 */
export async function initializeBuiltInTemplates(): Promise<Map<string, WorkflowDefinition>> {
  if (cachedBuiltInTemplates !== null) return cachedBuiltInTemplates;
  templateLoadPromise ??= getBuiltInTemplates().finally(() => {
    templateLoadPromise = undefined;
  });
  cachedBuiltInTemplates = await templateLoadPromise;
  return cachedBuiltInTemplates;
}

/**
 * Clears the cached built-in templates.
 * Primarily for testing purposes.
 */
export function clearTemplateCache(): void {
  cachedBuiltInTemplates = null;
  templateLoadPromise = undefined;
}

/**
 * Creates a WorkflowEngine with real dependencies.
 *
 * @param config - Engine configuration
 * @returns WorkflowEngine instance
 */
export function createRealWorkflowEngine(config?: WorkflowEngineFactoryConfig): IWorkflowEngine {
  const deps = createWorkflowEngineDeps(config);
  return new WorkflowEngine(deps, config);
}

/**
 * Creates and initializes a WorkflowEngine with built-in templates loaded.
 * This is the recommended way to create a production workflow engine.
 *
 * Note: Requires modelAdapter, expertFactory, or useMockExecutor: true to be specified.
 * Without these, WorkflowExecutionUnavailableError will be thrown.
 * (Source: Issue #507 - Fail-safe workflow execution)
 *
 * @param config - Engine configuration
 * @returns Promise resolving to WorkflowEngine instance
 */
export async function createInitializedWorkflowEngine(
  config?: WorkflowEngineFactoryConfig
): Promise<IWorkflowEngine> {
  const builtInTemplates = await initializeBuiltInTemplates();
  return createRealWorkflowEngine({ ...config, builtInTemplates });
}

/**
 * Checks if adapter detection should be skipped.
 */
function shouldSkipAdapterDetection(config: WorkflowEngineFactoryConfig | undefined): boolean {
  return (
    config?.modelAdapter !== undefined ||
    config?.expertFactory !== undefined ||
    config?.useMockExecutor === true
  );
}

/**
 * Attempts to auto-detect a model adapter.
 * Returns the adapter on success, or undefined on failure.
 */
function tryAutoDetectAdapter(logger: ILogger): IModelAdapter | undefined {
  try {
    logger.info('Auto-detecting model adapter for workflow execution');
    const registry = getGlobalRegistry({ logger });
    const adapter = registry.getDefault();
    logger.info('Using unified registry default adapter');
    return adapter;
  } catch (error) {
    const message = getErrorMessage(error);
    logger.warn('No model adapter available, using mock executor', { error: message });
    return undefined;
  }
}

/**
 * Creates WorkflowEngineDeps asynchronously with auto-detected model adapter.
 *
 * This function attempts to auto-detect an available model adapter (CLI or API)
 * and configures the workflow engine to use the real StepExecutor with ExpertFactory.
 * Use this when you want production-ready workflow execution with real agent experts.
 *
 * @param config - Factory configuration (modelAdapter will be auto-detected if not provided)
 * @returns Promise resolving to WorkflowEngineDeps
 *
 * @example
 * ```typescript
 * // Auto-detect adapter and create deps with real execution
 * const deps = await createWorkflowEngineDepsAsync();
 * const engine = new WorkflowEngine(deps);
 *
 * // Or with custom config
 * const deps = await createWorkflowEngineDepsAsync({
 *   logger: customLogger,
 *   useMockExecutor: false,
 * });
 * ```
 */
export function createWorkflowEngineDepsAsync(
  config?: WorkflowEngineFactoryConfig
): Promise<WorkflowEngineDeps> {
  const logger = config?.logger ?? createLogger({ component: 'WorkflowEngine' });

  if (shouldSkipAdapterDetection(config)) {
    logger.debug('Skipping adapter detection - using provided config');
    return Promise.resolve(createWorkflowEngineDeps(config));
  }

  const adapter = tryAutoDetectAdapter(logger);
  if (adapter !== undefined) {
    return Promise.resolve(createWorkflowEngineDeps({ ...config, modelAdapter: adapter, logger }));
  }

  // Issue #551: Do NOT silently enable mock executor - require explicit opt-in
  if (config?.useMockExecutor === true) {
    logger.warn('Using mock executor as explicitly configured (no real adapter available)');
    return Promise.resolve(createWorkflowEngineDeps({ ...config, useMockExecutor: true, logger }));
  }

  return Promise.reject(
    new WorkflowExecutionUnavailableError(
      'No model adapter available and mock execution not explicitly enabled. ' +
        'Set useMockExecutor: true in config to use mock mode, or configure an API key.'
    )
  );
}

/**
 * Creates and initializes a WorkflowEngine with auto-detected model adapter.
 *
 * This is the most complete factory function - it:
 * 1. Loads built-in templates
 * 2. Auto-detects the best available model adapter (CLI or API)
 * 3. Creates the workflow engine with real step execution
 *
 * Falls back gracefully to mock execution if no adapter is available.
 *
 * @param config - Engine configuration
 * @returns Promise resolving to WorkflowEngine instance
 *
 * @example
 * ```typescript
 * // Create production-ready workflow engine
 * const engine = await createProductionWorkflowEngine();
 *
 * // Execute a workflow with real agent experts
 * const result = await engine.execute(workflow, inputs);
 * ```
 */
export async function createProductionWorkflowEngine(
  config?: WorkflowEngineFactoryConfig
): Promise<IWorkflowEngine> {
  const builtInTemplates = await initializeBuiltInTemplates();
  const deps = await createWorkflowEngineDepsAsync({ ...config, builtInTemplates });
  return new WorkflowEngine(deps, config);
}
