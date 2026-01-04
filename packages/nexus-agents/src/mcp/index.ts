/**
 * nexus-agents/mcp
 *
 * MCP server implementation for Nexus Agents.
 * Provides tools for orchestrating multi-agent workflows.
 *
 * (Source: MCP Protocol 2025-11-25)
 */

export const VERSION = '0.0.1';

// Server
export {
  createServer,
  startStdioServer,
  connectTransport,
  closeServer,
  type ServerConfig,
  type ServerInstance,
  type ServerError,
} from './server.js';

// Middleware
export {
  // Validation
  validateToolInput,
  createValidator,
  isZodError,
  // Rate limiting
  RateLimiter,
  createDefaultRateLimiter,
  type RateLimiterConfig,
  type RateLimiterState,
  // Logging
  createMcpLogger,
  createToolLogger,
  logToolStart,
  logToolSuccess,
  logToolError,
  createTimer,
  withLogging,
  type McpLogContext,
} from './middleware/index.js';

// Tools
export {
  // Tool registration
  registerTools,
  toolSuccess,
  toolError,
  type ToolRegistrationOptions,
  type ToolRegistrationResult,
  type TextContent,
  type ToolResult,
  // create_expert tool
  registerCreateExpertTool,
  createDefaultDeps,
  getAvailableRoles,
  getCapabilitiesForRole,
  CreateExpertInputSchema,
  type CreateExpertInput,
  type CreateExpertDeps,
  type CreateExpertResponse,
  type IExpertFactory,
  // run_workflow tool
  registerRunWorkflowTool,
  RunWorkflowInputSchema,
  type RunWorkflowDeps,
  type RunWorkflowInput,
  type WorkflowToolResult,
  type StepResultSummary,
  type DryRunResult,
  // orchestrate tool
  registerOrchestrateTool,
  createMockTechLead,
  OrchestrateInputSchema,
  OrchestrateOutputSchema,
  OrchestrationError,
  type OrchestrateInput,
  type OrchestrateOutput,
  type OrchestrateDeps,
  type ITechLead,
  type IOrchestrateExpertFactory,
} from './tools/index.js';
