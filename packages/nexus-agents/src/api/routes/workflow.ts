/**
 * nexus-agents/api - Workflow Route
 *
 * POST /api/v1/workflow endpoint for workflow execution.
 *
 * @module api/routes/workflow
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ILogger } from '../../core/logger.js';
import { getTimeProvider } from '../../core/index.js';
import {
  WorkflowRequestSchema,
  type WorkflowRequest,
  type WorkflowResponse,
  type ApiError,
} from '../rest-types.js';

/**
 * Create validation error response.
 */
function createValidationError(requestId: string, message: string, issues?: unknown): ApiError {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message,
      details: issues !== undefined ? { issues } : undefined,
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
 * Build workflow response.
 */
function buildWorkflowResponse(durationMs: number): WorkflowResponse {
  return {
    executionId: 'exec-' + String(getTimeProvider().now()),
    status: 'completed',
    stepResults: [
      {
        stepId: 'step-1',
        status: 'completed',
        output: { message: 'Step completed' },
        durationMs: 100,
      },
    ],
    finalOutput: { success: true },
    metadata: {
      totalDurationMs: durationMs,
      stepsCompleted: 1,
      stepsFailed: 0,
    },
  };
}

/**
 * Register workflow routes.
 */
export function registerWorkflowRoutes(fastify: FastifyInstance, logger: ILogger): void {
  fastify.post<{ Body: WorkflowRequest; Reply: WorkflowResponse | ApiError }>(
    '/workflow',
    {
      schema: {
        description: 'Execute a workflow',
        tags: ['Workflow'],
        body: {
          type: 'object',
          properties: {
            workflowId: { type: 'string', description: 'ID of saved workflow' },
            workflowYaml: { type: 'string', description: 'Inline workflow YAML' },
            inputs: { type: 'object', additionalProperties: true, description: 'Workflow inputs' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              executionId: { type: 'string' },
              status: { type: 'string' },
              stepResults: { type: 'array' },
              finalOutput: {},
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
    (request: FastifyRequest<{ Body: WorkflowRequest }>, reply: FastifyReply) => {
      void handleWorkflowRequest(request, reply, logger);
    }
  );

  logger.debug('Workflow routes registered');
}

/**
 * Handle workflow request.
 */
async function handleWorkflowRequest(
  request: FastifyRequest<{ Body: WorkflowRequest }>,
  reply: FastifyReply,
  logger: ILogger
): Promise<void> {
  const time = getTimeProvider();
  const startTime = time.now();
  const requestId = request.id;

  const parseResult = WorkflowRequestSchema.safeParse(request.body);
  if (!parseResult.success) {
    await reply
      .status(400)
      .send(createValidationError(requestId, 'Invalid request body', parseResult.error.issues));
    return;
  }

  const { workflowId, workflowYaml } = parseResult.data;

  if (workflowId === undefined && workflowYaml === undefined) {
    await reply
      .status(400)
      .send(createValidationError(requestId, 'Either workflowId or workflowYaml is required'));
    return;
  }

  logger.info('Workflow request', { requestId, workflowId, hasYaml: workflowYaml !== undefined });

  try {
    // Simulated execution - in full implementation, would use WorkflowEngine
    const durationMs = time.now() - startTime;
    const response = buildWorkflowResponse(durationMs);

    logger.info('Workflow complete', { requestId, executionId: response.executionId, durationMs });
    await reply.send(response);
  } catch (err) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    logger.error('Workflow failed', errorObj, { requestId });
    await reply.status(500).send(createInternalError(requestId, errorObj.message));
  }
}
