/**
 * nexus-agents/mcp - Orchestrate Tool
 *
 * MCP tool for task orchestration using TechLead agent.
 * Types and schemas extracted to orchestrate-types.ts (Issue #708).
 *
 * @module mcp/tools/orchestrate
 * (Source: MCP Protocol 2025-11-25, Issue #531, #595, #708)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Result, ILogger, Task, TaskContext } from '../../core/index.js';
import {
  ok,
  err,
  createLogger,
  getTimeProvider,
  getRandomProvider,
  formatZodError,
} from '../../core/index.js';
import type { IOrchestrator, OrchestratorDefinition } from '../../core/types/orchestrator.js';
import { wrapToolWithTimeout, toSdkCallback } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import type { ExecutionPlan } from '../../agents/index.js';
import { createTechLeadWithSica } from './orchestrate-sica.js';
import { OrchestratorFactory } from '../../orchestration/orchestrator-factory.js';
import { getToolMemory } from './tool-memory.js';
import { getAutoCatalog } from './research-auto-catalog.js';
import {
  OrchestrateInputSchema,
  ORCHESTRATE_TOOL_SCHEMA,
  OrchestrationError,
} from './orchestrate-types.js';
import type { OrchestrateInput, OrchestrateOutput, OrchestrateDeps } from './orchestrate-types.js';

// Re-export types for consumers
export type { OrchestrateInput, OrchestrateOutput, OrchestrateDeps } from './orchestrate-types.js';
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Re-exporting deprecated types for backwards compat
export type { ITechLead, IExpertFactory } from './orchestrate-types.js';
export {
  OrchestrateInputSchema,
  OrchestrateOutputSchema,
  OrchestrationError,
  OrchestrationUnavailableError,
  createMockOrchestrator,
} from './orchestrate-types.js';
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
  durationMs: number
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

function createOrchestratorFromDeps(deps: OrchestrateDeps, logger: ILogger): IOrchestrator {
  if (deps.orchestrator !== undefined) return deps.orchestrator;
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Backwards compatibility
  const techLead = deps.techLead ?? createTechLeadWithSica(logger);
  const factory = new OrchestratorFactory({
    logger,
    techLead: techLead as { execute: (task: unknown) => Promise<Result<unknown, unknown>> },
  });
  return factory.create('tech_lead');
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
    .catch(() => {
      /* Best-effort, ignore failures */
    });
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
      error: error instanceof Error ? error.message : String(error),
      taskId,
    });
  }

  try {
    getAutoCatalog().scanAndRecord(taskDescription, 'orchestrate');
  } catch (error: unknown) {
    createLogger({ tool: 'orchestrate' }).debug('Best-effort auto-catalog scan failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  triggerPromotionPipeline('orchestrate');
}

function recordOrchestrationError(errorMessage: string, taskDescription: string): void {
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
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Execution & Registration
// ============================================================================

async function executeOrchestration(
  input: OrchestrateInput,
  deps: OrchestrateDeps
): Promise<Result<OrchestrateOutput, OrchestrationError>> {
  const logger = deps.logger ?? createLogger({ tool: 'orchestrate' });
  const orchestrator = createOrchestratorFromDeps(deps, logger);
  const taskId = generateTaskId();
  const startTime = getTimeProvider().now();

  logger.info('Starting orchestration', { taskId, taskLength: input.task.length });
  const task = await createTaskFromInput(input, taskId);
  const definition: OrchestratorDefinition = { type: 'task', task };

  try {
    const result = await orchestrator.execute(definition, {});
    if (!result.ok) {
      logger.error('Orchestration failed', result.error, { taskId });
      const cause = result.error instanceof Error ? result.error : undefined;
      recordOrchestrationError(result.error.message, input.task);
      return err(
        new OrchestrationError(
          `Task execution failed: ${result.error.message}`,
          createErrorOptions(taskId, cause)
        )
      );
    }

    const durationMs = getTimeProvider().now() - startTime;
    const output = buildOutputFromOrchestratorResult(taskId, result.value, durationMs);
    recordOrchestrationSuccess(taskId, input.task, output.stepsCompleted, durationMs);
    logger.info('Orchestration completed', {
      taskId,
      durationMs,
      stepsCompleted: output.stepsCompleted,
    });
    return ok(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const cause = error instanceof Error ? error : undefined;
    logger.error('Orchestration exception', cause, { taskId });
    recordOrchestrationError(message, input.task);
    return err(
      new OrchestrationError(
        `Orchestration failed unexpectedly: ${message}`,
        createErrorOptions(taskId, cause)
      )
    );
  }
}

function createOrchestrateHandler(deps: OrchestrateDeps) {
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
    const result = await executeOrchestration(validated.data, deps);
    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Orchestration error: ${result.error.message}` }],
      };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(result.value, null, 2) }] };
  };
}

/**
 * Registers the orchestrate tool with the MCP server.
 * Uses createSecureHandler (Issue #531) with timeout protection (Issue #271).
 */
export function registerOrchestrateTool(server: McpServer, deps: OrchestrateDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'orchestrate' });
  const description =
    'Orchestrate a task by analyzing it, breaking it into subtasks if needed, and coordinating expert agents';

  const secureHandler = createSecureHandler(createOrchestrateHandler(deps), {
    toolName: 'orchestrate',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  const ORCHESTRATE_DEFAULT_TIMEOUT_MS = 120_000;
  const wrappedHandler = wrapToolWithTimeout('orchestrate', secureHandler, {
    timeoutMs: ORCHESTRATE_DEFAULT_TIMEOUT_MS,
    logger,
  });

  server.registerTool(
    'orchestrate',
    { description, inputSchema: ORCHESTRATE_TOOL_SCHEMA },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered orchestrate tool with secure handler and timeout protection');
}
