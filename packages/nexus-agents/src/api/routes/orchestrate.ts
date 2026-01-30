/**
 * nexus-agents/api - Orchestrate Route
 *
 * POST /api/v1/orchestrate endpoint for task orchestration.
 *
 * @module api/routes/orchestrate
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ILogger } from '../../core/logger.js';
import type { TaskConstraints } from '../../core/index.js';
import { createTechLeadWithSica } from '../../mcp/tools/orchestrate-sica.js';
import {
  OrchestrateRequestSchema,
  type OrchestrateRequest,
  type OrchestrateResponse,
  type ApiError,
} from '../rest-types.js';

/**
 * Create validation error response.
 */
function createValidationError(requestId: string, issues: unknown): ApiError {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details: { issues },
    },
    requestId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create internal error response.
 */
function createInternalError(requestId: string, message: string): ApiError {
  return {
    error: { code: 'INTERNAL_ERROR', message },
    requestId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create orchestration error response.
 */
function createOrchestrationError(requestId: string, message: string): ApiError {
  return {
    error: { code: 'ORCHESTRATION_ERROR', message },
    requestId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build successful orchestration response.
 */
function buildOrchestrateResponse(
  taskId: string,
  output: unknown,
  durationMs: number
): OrchestrateResponse {
  return {
    taskId,
    analysis: {
      complexity: 5,
      taskType: 'general',
      requirements: [],
      approach: 'TechLead orchestration',
    },
    result: output,
    metadata: {
      durationMs,
      tokensUsed: 0,
      expertsUsed: [],
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

/** Orchestrate route schema. */
const ORCHESTRATE_SCHEMA = {
  description: 'Orchestrate a task using TechLead agent',
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
  const startTime = Date.now();
  const requestId = request.id;

  const parseResult = OrchestrateRequestSchema.safeParse(request.body);
  if (!parseResult.success) {
    await reply.status(400).send(createValidationError(requestId, parseResult.error.issues));
    return;
  }

  const { task, context, constraints } = parseResult.data;
  logger.info('Orchestrate request', { requestId, taskLength: task.length });

  try {
    // Use SICA-wrapped TechLead when enabled (Issue #558)
    const techLead = createTechLeadWithSica(logger);

    // Build task object, only including constraints if provided
    const taskObj = buildTaskObject(requestId, task, context ?? {}, constraints);

    const result = await techLead.execute(taskObj);

    if (!result.ok) {
      await reply.status(500).send(createOrchestrationError(requestId, result.error.message));
      return;
    }

    const durationMs = Date.now() - startTime;
    const response = buildOrchestrateResponse(result.value.taskId, result.value.output, durationMs);

    logger.info('Orchestrate complete', { requestId, durationMs });
    await reply.send(response);
  } catch (err) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    logger.error('Orchestrate failed', errorObj, { requestId });
    await reply.status(500).send(createInternalError(requestId, errorObj.message));
  }
}
