/**
 * nexus-agents/api - Delegate Route
 *
 * POST /api/v1/delegate endpoint for model routing.
 *
 * @module api/routes/delegate
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ILogger } from '../../core/logger.js';
import {
  DelegateRequestSchema,
  type DelegateRequest,
  type DelegateResponse,
  type ApiError,
} from '../rest-types.js';
import { createValidationError, createInternalError } from '../error-helpers.js';

/**
 * Build delegate response.
 */
function buildDelegateResponse(
  selectedModel: string,
  preferredModel: string | undefined
): DelegateResponse {
  const alternatives = ['claude', 'gemini', 'codex', 'opencode'].filter((m) => m !== selectedModel);
  return {
    selectedModel,
    confidence: 0.85,
    reason:
      preferredModel !== undefined
        ? `User preferred model: ${preferredModel}`
        : 'Default routing based on task analysis',
    alternatives,
  };
}

/** Delegate route schema. */
const DELEGATE_SCHEMA = {
  description: 'Delegate a task to the optimal model via routing',
  tags: ['Routing'],
  body: {
    type: 'object',
    required: ['task'],
    properties: {
      task: { type: 'string', minLength: 1, description: 'Task to delegate' },
      preferredModel: {
        type: 'string',
        enum: ['claude', 'gemini', 'codex', 'opencode'],
        description: 'Preferred model (optional)',
      },
      constraints: {
        type: 'object',
        properties: {
          maxTokens: { type: 'number' },
          maxCostUsd: { type: 'number' },
          maxLatencyMs: { type: 'number' },
        },
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        selectedModel: { type: 'string' },
        confidence: { type: 'number' },
        reason: { type: 'string' },
        alternatives: { type: 'array', items: { type: 'string' } },
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
 * Register delegate routes.
 */
export function registerDelegateRoutes(fastify: FastifyInstance, logger: ILogger): void {
  fastify.post<{ Body: DelegateRequest; Reply: DelegateResponse | ApiError }>(
    '/delegate',
    { schema: DELEGATE_SCHEMA },
    (request: FastifyRequest<{ Body: DelegateRequest }>, reply: FastifyReply) => {
      void handleDelegateRequest(request, reply, logger);
    }
  );

  logger.debug('Delegate routes registered');
}

/**
 * Handle delegate request.
 */
async function handleDelegateRequest(
  request: FastifyRequest<{ Body: DelegateRequest }>,
  reply: FastifyReply,
  logger: ILogger
): Promise<void> {
  const requestId = request.id;

  const parseResult = DelegateRequestSchema.safeParse(request.body);
  if (!parseResult.success) {
    await reply.status(400).send(createValidationError(requestId, parseResult.error.issues));
    return;
  }

  const { task, preferredModel } = parseResult.data;
  logger.info('Delegate request', { requestId, taskLength: task.length, preferredModel });

  try {
    // Simulated routing - in full implementation, would use CompositeRouter
    const selectedModel = preferredModel ?? 'claude';
    const response = buildDelegateResponse(selectedModel, preferredModel);

    logger.info('Delegate complete', { requestId, selectedModel });
    await reply.send(response);
  } catch (err) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    logger.error('Delegate failed', errorObj, { requestId });
    await reply.status(500).send(createInternalError(requestId, errorObj.message));
  }
}
