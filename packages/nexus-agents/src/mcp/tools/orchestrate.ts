/**
 * nexus-agents/mcp - Orchestrate Tool
 *
 * MCP tool for task orchestration using TechLead agent.
 * Analyzes tasks, coordinates with experts, and returns structured results.
 *
 * @module mcp/tools/orchestrate
 * (Source: MCP Protocol 2025-11-25)
 * (Refactored: Issue #531 - Use createSecureHandlerFactory)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Result, ILogger, Task, TaskContext } from '../../core/index.js';
import {
  ok,
  err,
  AgentError,
  createLogger,
  getTimeProvider,
  getRandomProvider,
} from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import { wrapToolWithTimeout, toSdkCallback } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import type { ExecutionPlan, Expert } from '../../agents/index.js';
import { createTechLeadWithSica } from './orchestrate-sica.js';

/**
 * Input schema for the orchestrate tool.
 * Validated using Zod at the tool boundary.
 */
export const OrchestrateInputSchema = z.object({
  task: z.string().min(1).describe('Task description to orchestrate'),
  context: z.record(z.unknown()).optional().describe('Additional context for the task'),
  maxIterations: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Maximum iterations for orchestration'),
});

export type OrchestrateInput = z.infer<typeof OrchestrateInputSchema>;

/**
 * Output schema for the orchestrate tool response.
 */
export const OrchestrateOutputSchema = z.object({
  taskId: z.string().describe('Unique execution ID'),
  analysis: z.object({
    taskId: z.string(),
    complexity: z.number().min(1).max(10),
    taskType: z.string(),
    requirements: z.array(z.string()),
    risks: z.array(z.string()),
    needsDecomposition: z.boolean(),
    approach: z.string(),
    estimatedEffort: z.number(),
  }),
  result: z.unknown().describe('Final execution result'),
  stepsCompleted: z.number().describe('Number of steps completed'),
  metadata: z.object({
    durationMs: z.number(),
    tokensUsed: z.number(),
    expertsUsed: z.array(z.string()),
  }),
});

export type OrchestrateOutput = z.infer<typeof OrchestrateOutputSchema>;

/**
 * Interface for TechLead operations.
 * Allows for dependency injection and mocking.
 */
export interface ITechLead {
  execute(
    task: Task
  ): Promise<Result<{ taskId: string; output: unknown; metadata: unknown }, AgentError>>;
}

/**
 * Interface for expert factory operations.
 */
export interface IExpertFactory {
  createBuiltIn(type: string): Result<Expert, AgentError>;
}

/**
 * Dependencies for the orchestrate tool.
 */
export interface OrchestrateDeps {
  techLead?: ITechLead;
  expertFactory?: IExpertFactory;
  logger?: ILogger;
  /** Rate limiter for throttling tool calls (required) */
  rateLimiter: RateLimiter;
  /** Security configuration (includes timeout settings - Issue #271, CVE-2026-0621) */
  security?: SecurityConfig | undefined;
}

/**
 * Error class for orchestration-specific errors.
 */
export class OrchestrationError extends AgentError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, options);
    this.name = 'OrchestrationError';
  }
}

/**
 * Error thrown when orchestration is unavailable (no model adapter configured).
 * (Source: Issue #554 - Fix silent mock fallback)
 */
export class OrchestrationUnavailableError extends AgentError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, options);
    this.name = 'OrchestrationUnavailableError';
  }
}

/**
 * Generates a unique task ID for tracking execution.
 */
function generateTaskId(): string {
  const timestamp = getTimeProvider().now().toString(36);
  const random = getRandomProvider().random().toString(36).substring(2, 8);
  return `orch-${timestamp}-${random}`;
}

/**
 * Creates a Task object from orchestrate input.
 */
function createTaskFromInput(input: OrchestrateInput, taskId: string): Task {
  const context: TaskContext = {};

  // Only set metadata if context is defined
  if (input.context !== undefined) {
    context.metadata = input.context;
  }

  return {
    id: taskId,
    description: input.task,
    context,
    constraints: {
      maxTokens: input.maxIterations * 1000,
    },
  };
}

/**
 * Extracts expert names from execution plan assignments.
 */
function extractExpertsUsed(output: unknown): string[] {
  if (typeof output !== 'object' || output === null) {
    return [];
  }

  const plan = output as Partial<ExecutionPlan>;
  if (!Array.isArray(plan.assignments)) {
    return [];
  }

  return plan.assignments.map((a) => a.expertRole);
}

/**
 * Builds the orchestration output from execution result.
 */
function buildOutput(
  taskId: string,
  result: { output: unknown; metadata: unknown },
  durationMs: number
): OrchestrateOutput {
  const output = result.output as Partial<ExecutionPlan>;
  const metadata = result.metadata as { tokensUsed?: number } | undefined;

  const analysis = output.analysis ?? {
    taskId,
    complexity: 5,
    taskType: 'general',
    requirements: [],
    risks: [],
    needsDecomposition: false,
    approach: 'Direct execution',
    estimatedEffort: 1,
  };

  const stepsCompleted = Array.isArray(output.subtasks) ? output.subtasks.length : 0;
  const expertsUsed = extractExpertsUsed(result.output);

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
    result: result.output,
    stepsCompleted,
    metadata: {
      durationMs,
      tokensUsed: metadata?.tokensUsed ?? 0,
      expertsUsed,
    },
  };
}

/**
 * Executes the orchestration logic.
 */
async function executeOrchestration(
  input: OrchestrateInput,
  deps: OrchestrateDeps
): Promise<Result<OrchestrateOutput, OrchestrationError>> {
  const logger = deps.logger ?? createLogger({ tool: 'orchestrate' });
  // Use SICA-wrapped TechLead when enabled (Issue #558)
  const techLead = deps.techLead ?? createTechLeadWithSica(logger);
  const taskId = generateTaskId();
  const startTime = getTimeProvider().now();

  logger.info('Starting orchestration', { taskId, taskLength: input.task.length });

  const task = createTaskFromInput(input, taskId);

  try {
    const result = await techLead.execute(task);

    if (!result.ok) {
      logger.error('Orchestration failed', result.error, { taskId });
      return err(
        new OrchestrationError(`Task execution failed: ${result.error.message}`, {
          cause: result.error,
          context: { taskId },
        })
      );
    }

    const durationMs = getTimeProvider().now() - startTime;
    const output = buildOutput(taskId, result.value, durationMs);

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

    const errorOptions: { cause?: Error; context: Record<string, unknown> } = {
      context: { taskId },
    };
    if (cause !== undefined) {
      errorOptions.cause = cause;
    }

    return err(
      new OrchestrationError(`Orchestration failed unexpectedly: ${message}`, errorOptions)
    );
  }
}

/**
 * Tool input schema definition.
 */
const TOOL_SCHEMA = {
  task: z.string().min(1).describe('Task description to orchestrate'),
  context: z.record(z.unknown()).optional().describe('Additional context for the task'),
  maxIterations: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum iterations for orchestration (default: 10)'),
};

/**
 * Creates the core handler logic for orchestrate tool.
 * Rate limiting is handled by createSecureHandler wrapper.
 */
function createOrchestrateHandler(deps: OrchestrateDeps) {
  return async (args: unknown, ctx: HandlerContext) => {
    const validated = OrchestrateInputSchema.safeParse(args);
    if (!validated.success) {
      const errorMessage = validated.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      ctx.logger.warn('Invalid orchestrate input', { errors: validated.error.issues });
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Validation error: ${errorMessage}` }],
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
 *
 * Uses createSecureHandler for standardized security middleware (Issue #531).
 * Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).
 *
 * @param server - MCP server instance
 * @param deps - Dependencies including TechLead and optional expert factory
 */
export function registerOrchestrateTool(server: McpServer, deps: OrchestrateDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'orchestrate' });
  const description =
    'Orchestrate a task by analyzing it, breaking it into subtasks if needed, and coordinating expert agents';

  // Wrap handler with secure handler for rate limiting and request context (Issue #531)
  const secureHandler = createSecureHandler(createOrchestrateHandler(deps), {
    toolName: 'orchestrate',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  // Wrap with timeout protection (Issue #271, CVE-2026-0621)
  const timeoutMs = deps.security?.timeout?.defaultTimeoutMs;
  const wrappedHandler = wrapToolWithTimeout(
    'orchestrate',
    secureHandler,
    timeoutMs !== undefined ? { timeoutMs, logger } : { logger }
  );

  server.registerTool(
    'orchestrate',
    { description, inputSchema: TOOL_SCHEMA },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered orchestrate tool with secure handler and timeout protection');
}

/**
 * Creates a mock TechLead for testing purposes.
 * Uses heuristic analysis without model adapter.
 */
export function createMockTechLead(): ITechLead {
  return {
    execute(task: Task) {
      // Simulate basic analysis without model
      const complexity = Math.min(10, Math.max(1, Math.floor(task.description.length / 50)));
      const needsDecomposition = complexity > 5;

      const analysis = {
        taskId: task.id,
        complexity,
        taskType: 'implementation',
        requirements: ['Basic implementation required'],
        risks: [],
        needsDecomposition,
        approach: 'Standard execution',
        estimatedEffort: complexity,
      };

      const output: Partial<ExecutionPlan> = {
        taskId: task.id,
        analysis,
        subtasks: [],
        assignments: [],
        parallelGroups: [],
        estimatedDuration: complexity * 10,
      };

      return Promise.resolve(
        ok({
          taskId: task.id,
          output,
          metadata: {
            durationMs: 100,
            tokensUsed: 0,
            toolsUsed: [],
            model: 'mock-tech-lead',
          },
        })
      );
    },
  };
}
