/**
 * nexus-agents/mcp
 *
 * MCP server implementation for Nexus Agents.
 * Provides tools for orchestrating multi-agent workflows.
 *
 * (Source: MCP Protocol 2025-11-25)
 */

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
  // Policy firewall
  type Artifact,
  type ExecutionMode,
  type PolicyMode,
  type PolicyDecision,
  type PolicyContext,
  type PolicyRule,
  type IPolicyFirewall,
  type PolicyFirewallConfig,
  type PolicyConfig,
  PolicyFirewall,
  PolicyError,
  PolicyConfigSchema,
  denyMutationsWithoutModeRule,
  safePathsRule,
  createDefaultPolicyFirewall,
  evaluatePolicy,
  createPolicyContext,
} from './middleware/index.js';

// EventBus Bridge (Issue #307)
export {
  initializeEventBusBridge,
  getEventBusStats,
  type EventBusBridgeResult,
} from './eventbus-bridge.js';

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
  // delegate_to_model tool
  registerDelegateToModelTool,
  DelegateInputSchema,
  DelegateOutputSchema,
  MODEL_CAPABILITIES,
  type DelegateInput,
  type DelegateOutput,
  type DelegateDeps,
  type CapabilityProfile,
  type PreferredCapability,
} from './tools/index.js';
