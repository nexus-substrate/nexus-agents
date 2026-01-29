/**
 * MCP exports - MCP server implementation
 * Split from index.ts for file size compliance (Issue #285)
 */

export {
  // Server
  createServer,
  startStdioServer,
  connectTransport,
  closeServer,
  type ServerConfig,
  type ServerInstance,
  type ServerError,
  // Middleware
  validateToolInput,
  createValidator,
  isZodError,
  RateLimiter as McpRateLimiter,
  createDefaultRateLimiter,
  type RateLimiterConfig as McpRateLimiterConfig,
  type RateLimiterState,
  createMcpLogger,
  createToolLogger,
  logToolStart,
  logToolSuccess,
  logToolError,
  createTimer,
  withLogging,
  type McpLogContext,
  // Tools
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
  type IExpertFactory as McpExpertFactory,
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
  OrchestrateInputSchema,
  OrchestrateOutputSchema,
  OrchestrationError,
  type OrchestrateInput,
  type OrchestrateOutput,
  type OrchestrateDeps,
  type ITechLead,
  type IOrchestrateExpertFactory,
} from '../mcp/index.js';
