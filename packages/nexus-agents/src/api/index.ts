/**
 * nexus-agents/api - REST API Module
 *
 * Fastify-based REST API gateway for non-MCP clients.
 *
 * @module api
 */

// Server
export { RestApiServer, createRestApiServer, type RestApiServerOptions } from './rest-server.js';

// Types
export type {
  RestApiConfig,
  ApiKeyConfig,
  AuthContext,
  ApiError,
  OrchestrateRequest,
  OrchestrateResponse,
  DelegateRequest,
  DelegateResponse,
  WorkflowRequest,
  WorkflowResponse,
  ExpertRequest,
  ExpertResponse,
  HealthResponse,
  MetricsResponse,
  IRestApiServer,
  ApiRouteHandler,
} from './rest-types.js';

// Schemas (for runtime validation)
export {
  RestApiConfigSchema,
  ApiErrorSchema,
  OrchestrateRequestSchema,
  OrchestrateResponseSchema,
  DelegateRequestSchema,
  DelegateResponseSchema,
  WorkflowRequestSchema,
  WorkflowResponseSchema,
  ExpertRequestSchema,
  ExpertResponseSchema,
  HealthResponseSchema,
  MetricsResponseSchema,
  createApiSuccessSchema,
} from './rest-types.js';
