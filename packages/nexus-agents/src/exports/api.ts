/**
 * API exports - REST API Gateway (Issue #184)
 * Split from index.ts for file size compliance (Issue #285)
 */

export {
  // Server
  RestApiServer,
  createRestApiServer,
  type RestApiServerOptions,
  // Types
  type RestApiConfig,
  type ApiKeyConfig,
  type AuthContext,
  type ApiError as RestApiError,
  type OrchestrateRequest as RestOrchestrateRequest,
  type OrchestrateResponse as RestOrchestrateResponse,
  type DelegateRequest as RestDelegateRequest,
  type DelegateResponse as RestDelegateResponse,
  type WorkflowRequest as RestWorkflowRequest,
  type WorkflowResponse as RestWorkflowResponse,
  type ExpertRequest as RestExpertRequest,
  type ExpertResponse as RestExpertResponse,
  type HealthResponse as RestHealthResponse,
  type MetricsResponse as RestMetricsResponse,
  type IRestApiServer,
  // Schemas
  RestApiConfigSchema,
  OrchestrateRequestSchema as RestOrchestrateRequestSchema,
  DelegateRequestSchema as RestDelegateRequestSchema,
  WorkflowRequestSchema as RestWorkflowRequestSchema,
  ExpertRequestSchema as RestExpertRequestSchema,
} from '../api/index.js';
