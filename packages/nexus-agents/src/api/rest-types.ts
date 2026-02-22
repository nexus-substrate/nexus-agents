/**
 * nexus-agents/api - REST API Types
 *
 * Type definitions for the REST API gateway.
 * Mirrors MCP tool interfaces with REST-specific extensions.
 *
 * (Source: Issue #184 - REST API gateway for non-MCP clients)
 *
 * @module api/rest-types
 */

import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ============================================================================
// Server Configuration
// ============================================================================

/**
 * REST API server configuration.
 */
export const RestApiConfigSchema = z.object({
  /** Server port. 0 = OS-assigned ephemeral port (useful for tests). Default: 3000. */
  port: z.number().min(0).max(65535).optional().default(3000),
  /** Host to bind to (default: 0.0.0.0) */
  host: z.string().optional().default('0.0.0.0'),
  /** API base path (default: /api/v1) */
  basePath: z.string().optional().default('/api/v1'),
  /** Enable CORS (default: true) */
  enableCors: z.boolean().optional().default(true),
  /** CORS allowed origins (default: localhost only — configure explicitly for production) */
  corsOrigins: z
    .array(z.string())
    .optional()
    .default(['http://localhost:3000', 'http://127.0.0.1:3000']),
  /** Enable Swagger UI (default: true) */
  enableSwagger: z.boolean().optional().default(true),
  /** Rate limit: requests per minute (default: 60) */
  rateLimitPerMinute: z.number().positive().optional().default(60),
  /** API key header name (default: X-API-Key) */
  apiKeyHeader: z.string().optional().default('X-API-Key'),
  /** Trust proxy headers (default: false) */
  trustProxy: z.boolean().optional().default(false),
  /** Maximum request body size in bytes (default: 1MB) */
  maxBodySize: z.number().positive().optional().default(1_048_576),
});
export type RestApiConfig = z.infer<typeof RestApiConfigSchema>;

// ============================================================================
// Authentication
// ============================================================================

/**
 * API key configuration.
 */
export interface ApiKeyConfig {
  /** API key value */
  key: string;
  /** Optional name/label */
  name?: string | undefined;
  /** Allowed endpoints (empty = all) */
  allowedEndpoints?: string[] | undefined;
  /** Rate limit override */
  rateLimitOverride?: number | undefined;
}

/**
 * Authenticated request context.
 */
export interface AuthContext {
  /** Whether request is authenticated */
  authenticated: boolean;
  /** API key name if authenticated */
  keyName?: string | undefined;
  /** Client ID for tracking */
  clientId: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Standard API error response.
 */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
  requestId: z.string(),
  timestamp: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Standard API success response wrapper.
 */
export function createApiSuccessSchema<T extends z.ZodTypeAny>(
  dataSchema: T
): z.ZodObject<{
  data: T;
  requestId: z.ZodString;
  timestamp: z.ZodString;
  metadata: z.ZodOptional<z.ZodObject<{ durationMs: z.ZodNumber; version: z.ZodString }>>;
}> {
  return z.object({
    data: dataSchema,
    requestId: z.string(),
    timestamp: z.string(),
    metadata: z
      .object({
        durationMs: z.number(),
        version: z.string(),
      })
      .optional(),
  });
}

// ============================================================================
// Orchestrate Endpoint
// ============================================================================

/**
 * POST /orchestrate request body.
 */
export const OrchestrateRequestSchema = z.object({
  task: z.string().min(1).describe('Task description to orchestrate'),
  context: z.record(z.unknown()).optional().describe('Additional context'),
  constraints: z
    .object({
      maxTokens: z.number().positive().optional(),
      maxCostUsd: z.number().positive().optional(),
      maxDurationMs: z.number().positive().optional(),
    })
    .optional(),
});
export type OrchestrateRequest = z.infer<typeof OrchestrateRequestSchema>;

/**
 * POST /orchestrate response body.
 */
export const OrchestrateResponseSchema = z.object({
  taskId: z.string(),
  analysis: z.object({
    complexity: z.number(),
    taskType: z.string(),
    requirements: z.array(z.string()),
    approach: z.string(),
  }),
  result: z.unknown(),
  metadata: z.object({
    durationMs: z.number(),
    tokensUsed: z.number(),
    expertsUsed: z.array(z.string()),
  }),
});
export type OrchestrateResponse = z.infer<typeof OrchestrateResponseSchema>;

// ============================================================================
// Delegate Endpoint
// ============================================================================

/**
 * POST /delegate request body.
 */
export const DelegateRequestSchema = z.object({
  task: z.string().min(1).describe('Task to delegate'),
  preferredModel: z.enum(['claude', 'gemini', 'codex', 'opencode']).optional(),
  constraints: z
    .object({
      maxTokens: z.number().positive().optional(),
      maxCostUsd: z.number().positive().optional(),
      maxLatencyMs: z.number().positive().optional(),
    })
    .optional(),
});
export type DelegateRequest = z.infer<typeof DelegateRequestSchema>;

/**
 * POST /delegate response body.
 */
export const DelegateResponseSchema = z.object({
  selectedModel: z.string(),
  confidence: z.number(),
  reason: z.string(),
  result: z.unknown().optional(),
  alternatives: z.array(z.string()),
});
export type DelegateResponse = z.infer<typeof DelegateResponseSchema>;

// ============================================================================
// Workflow Endpoint
// ============================================================================

/**
 * POST /workflow request body.
 */
export const WorkflowRequestSchema = z.object({
  workflowId: z.string().optional().describe('ID of saved workflow'),
  workflowYaml: z.string().optional().describe('Inline workflow YAML'),
  inputs: z.record(z.unknown()).optional().describe('Workflow inputs'),
});
export type WorkflowRequest = z.infer<typeof WorkflowRequestSchema>;

/**
 * POST /workflow response body.
 */
export const WorkflowResponseSchema = z.object({
  executionId: z.string(),
  status: z.enum(['completed', 'failed', 'timeout']),
  stepResults: z.array(
    z.object({
      stepId: z.string(),
      status: z.string(),
      output: z.unknown().optional(),
      durationMs: z.number(),
    })
  ),
  finalOutput: z.unknown().optional(),
  metadata: z.object({
    totalDurationMs: z.number(),
    stepsCompleted: z.number(),
    stepsFailed: z.number(),
  }),
});
export type WorkflowResponse = z.infer<typeof WorkflowResponseSchema>;

// ============================================================================
// Expert Endpoint
// ============================================================================

/**
 * POST /expert request body.
 */
export const ExpertRequestSchema = z.object({
  type: z.enum(['code', 'security', 'architecture', 'testing', 'documentation']),
  task: z.string().min(1).describe('Task for the expert'),
  options: z.record(z.unknown()).optional(),
});
export type ExpertRequest = z.infer<typeof ExpertRequestSchema>;

/**
 * POST /expert response body.
 */
export const ExpertResponseSchema = z.object({
  expertId: z.string(),
  expertType: z.string(),
  result: z.unknown(),
  metadata: z.object({
    durationMs: z.number(),
    tokensUsed: z.number(),
  }),
});
export type ExpertResponse = z.infer<typeof ExpertResponseSchema>;

// ============================================================================
// Health and Metrics
// ============================================================================

/**
 * GET /health response.
 */
export const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  uptime: z.number(),
  checks: z.record(
    z.object({
      status: z.enum(['pass', 'fail']),
      message: z.string().optional(),
    })
  ),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * GET /metrics response (Prometheus format handled separately).
 */
export const MetricsResponseSchema = z.object({
  requestsTotal: z.number(),
  requestsPerEndpoint: z.record(z.number()),
  avgResponseTimeMs: z.number(),
  errorRate: z.number(),
  activeConnections: z.number(),
});
export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;

// ============================================================================
// Server Interface
// ============================================================================

/**
 * REST API server interface.
 */
export interface IRestApiServer {
  /** Start the server */
  start(): Promise<void>;
  /** Stop the server */
  stop(): Promise<void>;
  /** Get the Fastify instance */
  getInstance(): FastifyInstance;
  /** Check if server is running */
  isRunning(): boolean;
  /** Get server address */
  getAddress(): string | null;
}

// ============================================================================
// Route Handler Types
// ============================================================================

export type ApiRouteHandler<TBody, TReply> = (
  request: FastifyRequest<{ Body: TBody }>,
  reply: FastifyReply
) => Promise<TReply>;
