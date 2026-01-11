/**
 * nexus-agents/api - Route Registration
 *
 * Registers all API routes with the Fastify instance.
 *
 * @module api/routes
 */

import type { FastifyInstance } from 'fastify';
import type { ILogger } from '../../core/logger.js';
import { registerHealthRoutes } from './health.js';
import { registerOrchestrateRoutes } from './orchestrate.js';
import { registerDelegateRoutes } from './delegate.js';
import { registerWorkflowRoutes } from './workflow.js';
import { registerExpertRoutes } from './expert.js';

/**
 * Register all API routes.
 */
export async function registerRoutes(fastify: FastifyInstance, logger: ILogger): Promise<void> {
  // Register routes under /api/v1 prefix
  await fastify.register(
    (instance, _opts, done) => {
      registerHealthRoutes(instance, logger);
      registerOrchestrateRoutes(instance, logger);
      registerDelegateRoutes(instance, logger);
      registerWorkflowRoutes(instance, logger);
      registerExpertRoutes(instance, logger);
      done();
    },
    { prefix: '/api/v1' }
  );

  // Also register health at root for load balancers
  registerHealthRoutes(fastify, logger);

  logger.debug('All routes registered');
}
