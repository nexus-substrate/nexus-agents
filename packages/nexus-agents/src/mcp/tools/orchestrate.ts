/* eslint-disable max-lines -- Cohesive orchestration tool (types already extracted to orchestrate-types.ts) */
/**
 * MCP tool for task orchestration with intelligent workflow pattern routing.
 * Types/schemas in orchestrate-types.ts (Issue #708). Routing via Issue #846.
 * @module mcp/tools/orchestrate
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger, Result, Task, TaskContext } from '../../core/index.js';
import { getErrorMessage } from '../../core/index.js';
import { MCP_TIMEOUTS } from '../../config/timeouts.js';

import {
  orchestrateInputToTaskContract,
  executeOrchestratePipeline,
} from '../../pipeline/v2-orchestrate.js';
import { resolveV2Config } from '../../pipeline/v2-config.js';
import {
  ok,
  err,
  createLogger,
  getTimeProvider,
  getRandomProvider,
  formatZodError,
} from '../../core/index.js';
import type {
  IOrchestrator,
  OrchestratorDefinition,
  OrchestratorType,
} from '../../core/types/orchestrator.js';
import { wrapToolWithTimeout, toSdkCallback } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { createMcpNotifier, NOOP_NOTIFIER } from '../mcp-notifier.js';
import type { ExecutionPlan } from '../../agents/index.js';
import { createOrchestratorWithSica } from './orchestrate-sica.js';
import { OrchestratorFactory } from '../../orchestration/orchestrator-factory.js';
import { createWorkflowRouter, type IWorkflowRouter } from '../../orchestration/workflow-router.js';
import { getToolMemory } from './tool-memory.js';
import { getAutoCatalog } from './research-auto-catalog.js';
import { computeAgentPlan } from './orchestrate-aorchestra.js';
import {
  getOutcomeStore,
  categorizeOutcomeErrorMessage,
} from '../../orchestration/outcomes/index.js';
import type { OutcomeFailureCategory } from '../../orchestration/outcomes/index.js';
import { detectTaskCategory } from '../../config/task-specialization.js';
import {
  OrchestrateInputSchema,
  ORCHESTRATE_TOOL_SCHEMA,
  OrchestrationError,
  mapPatternToOrchestratorType,
  type OrchestrateInput,
  type OrchestrateOutput,
  type OrchestrateDeps,
  type RoutingInfo,
} from './orchestrate-types.js';

// Re-export types and values for consumers
export {
  OrchestrateInputSchema,
  OrchestrateOutputSchema,
  OrchestrationError,
  OrchestrationUnavailableError,
  createMockOrchestrator,
  mapPatternToOrchestratorType,
  type OrchestrateInput,
  type OrchestrateOutput,
  type OrchestrateDeps,
  type RoutingInfo,
} from './orchestrate-types.js';
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Re-exporting deprecated types for backwards compat
export type { ITechLead, IExpertFactory } from './orchestrate-types.js';
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Re-exporting deprecated API for backwards compat
export { createMockTechLead } from './orchestrate-types.js';

// ============================================================================
// Task Creation & Output Building
// ============================================================================

function generateTaskId(): string {
  const timestamp = getTimeProvider().now().toString(36);
  const random = getRandomProvider().random().toString(36).substring(2, 8);
  return `orch-${timestamp}-${random}`;
}

async function createTaskFromInput(input: OrchestrateInput, taskId: string): Promise<Task> {
  const context: TaskContext = {};
  if (input.context !== undefined) {
    context.metadata = input.context;
  }

  // Inject relevant past learnings and beliefs into task context
  try {
    const mem = getToolMemory();
    const learnings = mem.getRelevantLearnings(input.task);
    if (learnings !== undefined) {
      context.metadata = { ...context.metadata, _pastLearnings: learnings };
    }
    const beliefs = await mem.getRelevantBeliefs(input.task.split(/\s+/).slice(0, 3).join(' '));
    if (beliefs !== undefined) {
      context.metadata = { ...context.metadata, _beliefs: beliefs };
    }
  } catch {
    // Memory retrieval is best-effort
  }

  return {
    id: taskId,
    description: input.task,
    context,
    constraints: { maxTokens: input.maxIterations * 1000 },
  };
}

function buildOutputFromOrchestratorResult(
  taskId: string,
  orchResult: import('../../core/types/orchestrator.js').OrchestratorResult,
  durationMs: number,
  routing?: RoutingInfo
): OrchestrateOutput {
  const raw = orchResult.output as Record<string, unknown>;
  const executionPlan =
    raw.output !== undefined && typeof raw.output === 'object'
      ? (raw.output as Partial<ExecutionPlan>)
      : (raw as Partial<ExecutionPlan>);

  const analysis = executionPlan.analysis ?? {
    taskId,
    complexity: 5,
    taskType: 'general',
    requirements: [],
    risks: [],
    needsDecomposition: false,
    approach: 'Direct execution',
    estimatedEffort: 1,
  };

  return {
    taskId,
    analysis: {
      taskId: analysis.taskId,
      complexity: analysis.complexity,
      taskType: analysis.taskType,
      requirements: analysis.requirements,
      risks: analysis.risks,
      needsDecomposition: analysis.needsDecomposition,
      approach: analysis.approach,
      estimatedEffort: analysis.estimatedEffort,
    },
    routing,
    result: orchResult.output,
    stepsCompleted: orchResult.steps.length,
    metadata: {
      durationMs,
      tokensUsed: orchResult.totalTokensUsed,
      expertsUsed: orchResult.agentsUsed,
    },
  };
}

// ============================================================================
// Orchestrator Factory & Error Helpers
// ============================================================================

function createOrchestratorFromDeps(
  deps: OrchestrateDeps,
  logger: ILogger,
  orchestratorType?: OrchestratorType
): IOrchestrator {
  if (deps.orchestrator !== undefined) return deps.orchestrator;
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Backwards compatibility
  const techLead = deps.techLead ?? createOrchestratorWithSica(logger, deps.modelAdapter);
  const factory = new OrchestratorFactory({
    logger,
    techLead: techLead as { execute: (task: unknown) => Promise<Result<unknown, unknown>> },
  });
  return factory.create(orchestratorType ?? 'tech_lead');
}

function createErrorOptions(
  taskId: string,
  cause: Error | undefined
): { cause?: Error; context: Record<string, unknown> } {
  const options: { cause?: Error; context: Record<string, unknown> } = { context: { taskId } };
  if (cause !== undefined) options.cause = cause;
  return options;
}

// ============================================================================
// Memory Recording (Issue #690)
// ============================================================================

/** Fire-and-forget promotion pipeline runner (Issue #753). */
function triggerPromotionPipeline(toolName: string): void {
  void getToolMemory()
    .runPromotionPipeline()
    .then((stats) => {
      if (stats.learningsPromotedToBelief > 0 || stats.beliefsPromotedToAgentic > 0) {
        createLogger({ tool: toolName }).debug('Promotion pipeline completed', {
          learningsPromoted: stats.learningsPromotedToBelief,
          beliefsPromoted: stats.beliefsPromotedToAgentic,
        });
      }
    })
    .catch((error: unknown) => {
      createLogger({ tool: toolName }).debug('Promotion pipeline failed', { error });
    });
}

/** Records orchestration outcome to OutcomeStore (Issue #1014). Best-effort, never throws. */
function recordToOutcomeStore(
  taskDescription: string,
  success: boolean,
  durationMs: number,
  failureCategory?: OutcomeFailureCategory
): void {
  try {
    const match = detectTaskCategory(taskDescription);
    getOutcomeStore().append({
      id: `orch-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
      cli: 'claude',
      category: match?.category ?? 'exploration',
      model: 'orchestrator',
      success,
      durationMs,
      timestamp: new Date(getTimeProvider().now()).toISOString(),
      source: 'delegate',
      ...(failureCategory !== undefined ? { failureCategory } : {}),
    });
  } catch (error: unknown) {
    createLogger({ tool: 'orchestrate' }).debug('Best-effort outcome recording failed', {
      error: getErrorMessage(error),
    });
  }
}

function recordOrchestrationSuccess(
  taskId: string,
  taskDescription: string,
  stepsCompleted: number,
  durationMs: number
): void {
  try {
    const memory = getToolMemory();
    memory.recordTask({
      approach: `Orchestrated: ${taskDescription.slice(0, 100)}`,
      challenges: [],
      durationMs,
    });
    memory.recordLearning({
      pattern: `Orchestration completed in ${String(stepsCompleted)} steps`,
      context: `task=${taskId}`,
      confidence: 0.7,
      source: 'orchestrate-tool',
    });
    void memory.recordBelief(
      taskDescription.split(/\s+/).slice(0, 3).join(' '),
      'orchestrated-successfully-in',
      `${String(stepsCompleted)} steps (${String(durationMs)}ms)`,
      'medium'
    );
  } catch (error: unknown) {
    createLogger({ tool: 'orchestrate' }).debug('Best-effort memory recording failed', {
      error: getErrorMessage(error),
      taskId,
    });
  }

  try {
    getAutoCatalog().scanAndRecord(taskDescription, 'orchestrate');
  } catch (error: unknown) {
    createLogger({ tool: 'orchestrate' }).debug('Best-effort auto-catalog scan failed', {
      error: getErrorMessage(error),
    });
  }

  recordToOutcomeStore(taskDescription, true, durationMs);
  triggerPromotionPipeline('orchestrate');
}

function recordOrchestrationError(
  errorMessage: string,
  taskDescription: string,
  durationMs?: number
): void {
  try {
    const memory = getToolMemory();
    memory.recordError({
      error: errorMessage.slice(0, 200),
      solution: 'Pending - orchestration failed',
      filePattern: 'mcp/tools/orchestrate',
    });
    memory.recordLearning({
      pattern: `Orchestration failure: ${errorMessage.slice(0, 80)}`,
      context: `task=${taskDescription.slice(0, 60)}`,
      confidence: 0.5,
      source: 'orchestrate-tool-error',
    });
  } catch (error: unknown) {
    createLogger({ tool: 'orchestrate' }).debug('Best-effort error recording failed', {
      error: getErrorMessage(error),
    });
  }
  const fc = categorizeOutcomeErrorMessage(errorMessage);
  recordToOutcomeStore(taskDescription, false, durationMs ?? 0, fc);
}

// ============================================================================
// Execution & Registration
// ============================================================================

/** Routes task and creates routing context for executeOrchestration (Issue #846). */
function routeAndPrepare(
  input: OrchestrateInput,
  deps: OrchestrateDeps,
  router?: IWorkflowRouter
): {
  workflowRouter: IWorkflowRouter;
  decision: import('../../orchestration/workflow-router-types.js').RoutingDecision;
  orchestrator: IOrchestrator;
  logger: ILogger;
} {
  const logger = deps.logger ?? createLogger({ tool: 'orchestrate' });
  const workflowRouter = router ?? createWorkflowRouter({ logger });
  const decision = workflowRouter.route({ description: input.task });
  const orchType = mapPatternToOrchestratorType(decision.pattern);
  logger.info('Workflow pattern selected', {
    pattern: decision.pattern,
    orchestratorType: orchType,
  });
  const orchestrator = createOrchestratorFromDeps(deps, logger, orchType);
  return { workflowRouter, decision, orchestrator, logger };
}

/** Builds RoutingInfo from decision + mapped type. */
function buildRoutingInfo(
  decision: import('../../orchestration/workflow-router-types.js').RoutingDecision
): RoutingInfo {
  return {
    pattern: decision.pattern,
    reasoning: decision.reasoning,
    confidence: decision.confidence,
    orchestratorType: mapPatternToOrchestratorType(decision.pattern),
  };
}

/** Records a workflow outcome to the router. */
function recordRouterOutcome(
  workflowRouter: IWorkflowRouter,
  decision: import('../../orchestration/workflow-router-types.js').RoutingDecision,
  success: boolean,
  durationMs: number
): void {
  workflowRouter.recordOutcome({
    pattern: decision.pattern,
    taskType: decision.analysis.taskType,
    success,
    durationMs,
    timestamp: getTimeProvider().now(),
  });
}

/** Handles unexpected exceptions during orchestration. */
function handleOrchestrationException(
  error: unknown,
  taskId: string,
  task: string,
  logger: import('../../core/index.js').ILogger
): Result<OrchestrateOutput, OrchestrationError> {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const cause = error instanceof Error ? error : undefined;
  logger.error('Orchestration exception', cause, { taskId });
  recordOrchestrationError(message, task);
  return err(
    new OrchestrationError(
      `Orchestration failed unexpectedly: ${message}`,
      createErrorOptions(taskId, cause)
    )
  );
}

async function executeOrchestration(
  input: OrchestrateInput,
  deps: OrchestrateDeps,
  router?: IWorkflowRouter
): Promise<Result<OrchestrateOutput, OrchestrationError>> {
  const { workflowRouter, decision, orchestrator, logger } = routeAndPrepare(input, deps, router);
  const taskId = generateTaskId();
  const startTime = getTimeProvider().now();

  logger.info('Starting orchestration', { taskId, taskLength: input.task.length });
  const task = await createTaskFromInput(input, taskId);
  const definition: OrchestratorDefinition = { type: 'task', task };

  try {
    const result = await orchestrator.execute(definition, {});
    if (!result.ok) {
      const failDuration = getTimeProvider().now() - startTime;
      logger.error('Orchestration failed', result.error, { taskId });
      const cause = result.error instanceof Error ? result.error : undefined;
      recordOrchestrationError(result.error.message, input.task, failDuration);
      recordRouterOutcome(workflowRouter, decision, false, failDuration);
      return err(
        new OrchestrationError(
          `Task execution failed: ${result.error.message}`,
          createErrorOptions(taskId, cause)
        )
      );
    }

    const durationMs = getTimeProvider().now() - startTime;
    const output = buildOutputFromOrchestratorResult(
      taskId,
      result.value,
      durationMs,
      buildRoutingInfo(decision)
    );
    recordOrchestrationSuccess(taskId, input.task, output.stepsCompleted, durationMs);
    recordRouterOutcome(workflowRouter, decision, true, durationMs);
    logger.info('Orchestration completed', {
      taskId,
      durationMs,
      stepsCompleted: output.stepsCompleted,
      pattern: decision.pattern,
    });
    return ok(output);
  } catch (error) {
    return handleOrchestrationException(error, taskId, input.task, logger);
  }
}

/** Fire-and-forget V2 pipeline instrumentation (Phase E, Issue #924). */
function instrumentV2Orchestrate(input: { task: string }, logger: ILogger): void {
  const tc = orchestrateInputToTaskContract(input);
  void executeOrchestratePipeline(tc).then((m) => {
    logger.info('V2 orchestrate pipeline', { ...m });
  });
}

function createOrchestrateHandler(deps: OrchestrateDeps) {
  const notifier = deps.notifier ?? NOOP_NOTIFIER;
  return async (args: unknown, ctx: HandlerContext) => {
    const validated = OrchestrateInputSchema.safeParse(args);
    if (!validated.success) {
      ctx.logger.warn('Invalid orchestrate input', { errors: validated.error.issues });
      return {
        isError: true,
        content: [
          { type: 'text' as const, text: `Validation error: ${formatZodError(validated.error)}` },
        ],
      };
    }
    ctx.logger.debug('Starting orchestration', { taskLength: validated.data.task.length });
    notifier.info('orchestrate', {
      event: 'orchestrate_start',
      taskLength: validated.data.task.length,
    });
    const startMs = getTimeProvider().now();
    const v2Config = resolveV2Config();
    if (v2Config.orchestrateEnabled) instrumentV2Orchestrate(validated.data, ctx.logger);

    // AOrchestra: compute agent plan when enabled (Issue #935)
    const agentPlan = v2Config.aorchestraEnabled
      ? computeAgentPlan(validated.data.task, ctx.logger)
      : undefined;

    const result = await executeOrchestration(validated.data, deps);
    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Orchestration error: ${result.error.message}` }],
      };
    }

    notifier.info('orchestrate', {
      event: 'orchestrate_complete',
      subtaskCount: result.value.stepsCompleted,
      durationMs: getTimeProvider().now() - startMs,
    });

    // Merge agent plan into output when available
    const output = agentPlan !== undefined ? { ...result.value, agentPlan } : result.value;
    return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
  };
}

/**
 * Registers the orchestrate tool with the MCP server.
 * Uses createSecureHandler (Issue #531) with timeout protection (Issue #271).
 */
export function registerOrchestrateTool(server: McpServer, deps: OrchestrateDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'orchestrate' });
  const notifier = deps.notifier ?? createMcpNotifier(server);
  const depsWithNotifier = { ...deps, notifier };
  const description =
    'Orchestrate a task by analyzing it, breaking it into subtasks if needed, and coordinating expert agents';

  const secureHandler = createSecureHandler(createOrchestrateHandler(depsWithNotifier), {
    toolName: 'orchestrate',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  // Canonical source: config/timeouts.ts (Issue #1046)
  const wrappedHandler = wrapToolWithTimeout('orchestrate', secureHandler, {
    timeoutMs: MCP_TIMEOUTS.perTool['orchestrate'] ?? MCP_TIMEOUTS.defaultMs,
    logger,
  });

  server.registerTool(
    'orchestrate',
    { description, inputSchema: ORCHESTRATE_TOOL_SCHEMA },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered orchestrate tool with secure handler and timeout protection');
}
