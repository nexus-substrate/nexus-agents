/**
 * nexus-agents/api - Orchestrate Route
 *
 * POST /api/v1/orchestrate endpoint for task orchestration.
 * Uses unified IOrchestrator interface via factory (ADR-0014, Issue #595).
 *
 * @module api/routes/orchestrate
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ILogger } from '../../core/logger.js';
import type { Result } from '../../core/result.js';
import { getTimeProvider, type TaskConstraints, type Task } from '../../core/index.js';
import type { IOrchestrator, OrchestratorDefinition } from '../../core/types/orchestrator.js';
import { OrchestratorFactory } from '../../orchestration/orchestrator-factory.js';
import { createOrchestratorWithSica } from '../../mcp/tools/orchestrate-sica.js';
import {
  OrchestrateRequestSchema,
  type OrchestrateRequest,
  type OrchestrateResponse,
  type ApiError,
} from '../rest-types.js';
import {
  createValidationError,
  createInternalError,
  createOrchestrationError,
} from '../error-helpers.js';

/**
 * Extract analysis from output if available.
 */
function extractAnalysis(output: unknown): OrchestrateResponse['analysis'] {
  const defaultAnalysis = {
    complexity: 5,
    taskType: 'general',
    requirements: [] as string[],
    approach: 'Orchestrator',
  };

  if (typeof output !== 'object' || output === null) {
    return defaultAnalysis;
  }

  const outputObj = output as Record<string, unknown>;
  const analysis = outputObj.analysis;

  if (typeof analysis !== 'object' || analysis === null) {
    return defaultAnalysis;
  }

  const analysisObj = analysis as Record<string, unknown>;

  // Extract requirements with type-safe filtering
  const reqs = Array.isArray(analysisObj.requirements)
    ? (analysisObj.requirements as unknown[]).filter((r): r is string => typeof r === 'string')
    : [];

  return {
    complexity: typeof analysisObj.complexity === 'number' ? analysisObj.complexity : 5,
    taskType: typeof analysisObj.taskType === 'string' ? analysisObj.taskType : 'general',
    requirements: reqs,
    approach:
      typeof analysisObj.approach === 'string' ? analysisObj.approach : 'TechLead orchestration',
  };
}

/**
 * Build successful orchestration response from OrchestratorResult.
 * Uses unified IOrchestrator result format (Issue #595).
 */
function buildOrchestrateResponse(
  taskId: string,
  output: unknown,
  durationMs: number,
  orchResult?: import('../../core/types/orchestrator.js').OrchestratorResult
): OrchestrateResponse {
  return {
    taskId,
    analysis: extractAnalysis(output),
    result: output,
    metadata: {
      durationMs,
      tokensUsed: orchResult?.totalTokensUsed ?? 0,
      expertsUsed: orchResult?.agentsUsed ?? [],
    },
  };
}

/** Request constraints type matching Zod output with exactOptionalPropertyTypes. */
interface RequestConstraints {
  maxTokens?: number | undefined;
  maxCostUsd?: number | undefined;
  maxDurationMs?: number | undefined;
}

/**
 * Build task object with proper typing for exactOptionalPropertyTypes.
 * Only includes constraints property if constraints are provided.
 */
function buildTaskObject(
  id: string,
  description: string,
  context: Record<string, unknown>,
  constraints: RequestConstraints | undefined
): {
  id: string;
  description: string;
  context: Record<string, unknown>;
  constraints?: TaskConstraints;
} {
  const baseTask = { id, description, context };

  // Only add constraints if at least one is defined
  if (constraints === undefined) return baseTask;

  const taskConstraints: TaskConstraints = {};
  if (constraints.maxDurationMs !== undefined) {
    taskConstraints.maxDuration = constraints.maxDurationMs;
  }
  if (constraints.maxTokens !== undefined) {
    taskConstraints.maxTokens = constraints.maxTokens;
  }

  // Only add constraints if any were actually set
  if (Object.keys(taskConstraints).length === 0) return baseTask;

  return { ...baseTask, constraints: taskConstraints };
}

/**
 * Creates an IOrchestrator instance for REST API usage.
 * Uses factory pattern with SICA-wrapped orchestrator (ADR-0014, Issue #595, #759).
 */
function createOrchestratorForRest(logger: ILogger): IOrchestrator {
  // Create orchestrator agent (SICA-wrapped when enabled - Issue #558)
  const orchestratorAgent = createOrchestratorWithSica(logger);

  // Create factory with orchestrator agent wired (ADR-0014, Issue #759)
  const factory = new OrchestratorFactory({
    logger,
    orchestratorAgent: orchestratorAgent as {
      execute: (task: unknown) => Promise<Result<unknown, unknown>>;
    },
  });

  // Return orchestrator adapter
  return factory.create('tech_lead');
}

/**
 * Build OrchestratorDefinition from task for IOrchestrator.execute().
 */
function buildOrchestratorDefinition(task: Task): OrchestratorDefinition {
  return { type: 'task', task };
}

/** Orchestrate route schema. */
const ORCHESTRATE_SCHEMA = {
  description: 'Orchestrate a task using Orchestrator agent',
  tags: ['Orchestration'],
  body: {
    type: 'object',
    required: ['task'],
    properties: {
      task: { type: 'string', minLength: 1, description: 'Task description' },
      context: {
        type: 'object',
        additionalProperties: true,
        description: 'Additional context',
      },
      constraints: {
        type: 'object',
        properties: {
          maxTokens: { type: 'number' },
          maxCostUsd: { type: 'number' },
          maxDurationMs: { type: 'number' },
        },
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        analysis: { type: 'object' },
        result: {},
        metadata: { type: 'object' },
      },
    },
    400: {
      type: 'object',
      properties: { error: { type: 'object' }, requestId: { type: 'string' } },
    },
    500: {
      type: 'object',
      properties: { error: { type: 'object' }, requestId: { type: 'string' } },
    },
  },
} as const;

/**
 * Register orchestrate routes.
 */
export function registerOrchestrateRoutes(fastify: FastifyInstance, logger: ILogger): void {
  fastify.post<{ Body: OrchestrateRequest; Reply: OrchestrateResponse | ApiError }>(
    '/orchestrate',
    { schema: ORCHESTRATE_SCHEMA },
    (request: FastifyRequest<{ Body: OrchestrateRequest }>, reply: FastifyReply) => {
      void handleOrchestrateRequest(request, reply, logger);
    }
  );

  logger.debug('Orchestrate routes registered');
}

/**
 * Handle orchestration request.
 */
async function handleOrchestrateRequest(
  request: FastifyRequest<{ Body: OrchestrateRequest }>,
  reply: FastifyReply,
  logger: ILogger
): Promise<void> {
  const time = getTimeProvider();
  const startTime = time.now();
  const requestId = request.id;

  const parseResult = OrchestrateRequestSchema.safeParse(request.body);
  if (!parseResult.success) {
    await reply.status(400).send(createValidationError(requestId, parseResult.error.issues));
    return;
  }

  const { task, context, constraints } = parseResult.data;
  logger.info('Orchestrate request', { requestId, taskLength: task.length });

  try {
    // Use unified IOrchestrator via factory (ADR-0014, Issue #595)
    const orchestrator = createOrchestratorForRest(logger);

    // Build task object, only including constraints if provided
    const taskObj = buildTaskObject(requestId, task, context ?? {}, constraints);

    // Create orchestrator definition for task execution
    const definition = buildOrchestratorDefinition(taskObj as Task);

    const result = await orchestrator.execute(definition, {});

    if (!result.ok) {
      await reply.status(500).send(createOrchestrationError(requestId, result.error.message));
      return;
    }

    const durationMs = time.now() - startTime;

    // Build response from OrchestratorResult
    const orchResult = result.value;
    const response = buildOrchestrateResponse(
      orchResult.executionId,
      orchResult.output,
      durationMs,
      orchResult
    );

    logger.info('Orchestrate complete', { requestId, durationMs });
    await reply.send(response);
  } catch (err) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    logger.error('Orchestrate failed', errorObj, { requestId });
    await reply.status(500).send(createInternalError(requestId, errorObj.message));
  }
}
