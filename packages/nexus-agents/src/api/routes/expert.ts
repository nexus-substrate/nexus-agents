/**
 * nexus-agents/api - Expert Route
 *
 * POST /api/v1/expert endpoint for expert task execution.
 *
 * @module api/routes/expert
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ILogger } from '../../core/logger.js';
import { getTimeProvider } from '../../core/index.js';
import {
  ExpertRequestSchema,
  type ExpertRequest,
  type ExpertResponse,
  type ApiError,
} from '../rest-types.js';

/** Available expert types. */
const EXPERT_TYPES = ['code', 'security', 'architecture', 'testing', 'documentation'] as const;

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
    timestamp: new Date(getTimeProvider().now()).toISOString(),
  };
}

/**
 * Create internal error response.
 */
function createInternalError(requestId: string, message: string): ApiError {
  return {
    error: { code: 'INTERNAL_ERROR', message },
    requestId,
    timestamp: new Date(getTimeProvider().now()).toISOString(),
  };
}

/**
 * Build expert response.
 */
function buildExpertResponse(expertType: string, durationMs: number): ExpertResponse {
  return {
    expertId: 'expert-' + expertType + '-' + String(getTimeProvider().now()),
    expertType,
    result: {
      analysis: `${expertType} analysis of the task`,
      recommendations: [`Consider ${expertType} best practices`],
    },
    metadata: {
      durationMs,
      tokensUsed: 0,
    },
  };
}

/**
 * Register expert routes.
 */
export function registerExpertRoutes(fastify: FastifyInstance, logger: ILogger): void {
  registerExpertPostRoute(fastify, logger);
  registerExpertTypesRoute(fastify);
  logger.debug('Expert routes registered');
}

/**
 * Register POST /expert route.
 */
function registerExpertPostRoute(fastify: FastifyInstance, logger: ILogger): void {
  fastify.post<{ Body: ExpertRequest; Reply: ExpertResponse | ApiError }>(
    '/expert',
    {
      schema: {
        description: 'Execute a task using a specialized expert',
        tags: ['Expert'],
        body: {
          type: 'object',
          required: ['type', 'task'],
          properties: {
            type: { type: 'string', enum: [...EXPERT_TYPES], description: 'Expert type' },
            task: { type: 'string', minLength: 1, description: 'Task for the expert' },
            options: {
              type: 'object',
              additionalProperties: true,
              description: 'Expert-specific options',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              expertId: { type: 'string' },
              expertType: { type: 'string' },
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
      },
    },
    (request: FastifyRequest<{ Body: ExpertRequest }>, reply: FastifyReply) => {
      void handleExpertRequest(request, reply, logger);
    }
  );
}

/**
 * Register GET /expert/types route.
 */
function registerExpertTypesRoute(fastify: FastifyInstance): void {
  fastify.get<{ Reply: { types: string[] } }>(
    '/expert/types',
    {
      schema: {
        description: 'List available expert types',
        tags: ['Expert'],
        response: {
          200: {
            type: 'object',
            properties: { types: { type: 'array', items: { type: 'string' } } },
          },
        },
      },
    },
    (_request, reply) => {
      void reply.send({ types: [...EXPERT_TYPES] });
    }
  );
}

/**
 * Handle expert request.
 */
async function handleExpertRequest(
  request: FastifyRequest<{ Body: ExpertRequest }>,
  reply: FastifyReply,
  logger: ILogger
): Promise<void> {
  const time = getTimeProvider();
  const startTime = time.now();
  const requestId = request.id;

  const parseResult = ExpertRequestSchema.safeParse(request.body);
  if (!parseResult.success) {
    await reply.status(400).send(createValidationError(requestId, parseResult.error.issues));
    return;
  }

  const { type, task } = parseResult.data;
  logger.info('Expert request', { requestId, expertType: type, taskLength: task.length });

  try {
    // Simulated execution - in full implementation, would use ExpertFactory
    const durationMs = time.now() - startTime;
    const response = buildExpertResponse(type, durationMs);

    logger.info('Expert complete', { requestId, expertId: response.expertId, durationMs });
    await reply.send(response);
  } catch (err) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    logger.error('Expert failed', errorObj, { requestId });
    await reply.status(500).send(createInternalError(requestId, errorObj.message));
  }
}
