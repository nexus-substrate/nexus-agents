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
  // execute_expert tool (Issue #437)
  registerExecuteExpertTool,
  ExecuteExpertInputSchema,
  type ExecuteExpertInput,
  type ExecuteExpertDeps,
  type ExecuteExpertResponse,
  // consensus_vote tool (Issue #435)
  registerConsensusVoteTool,
  ConsensusVoteInputSchema,
  type ConsensusVoteInput,
  type ConsensusVoteDeps,
  type ConsensusVoteResponse,
  type AgentVoteSummary,
  type VoteDecisionStatus,
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
  OrchestrationUnavailableError,
  type OrchestrateInput,
  type OrchestrateOutput,
  type OrchestrateDeps,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Intentional: re-export deprecated API for backwards compat
  type ITechLead,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Intentional: re-export deprecated API for backwards compat
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
  // list_experts tool (Issue #436)
  registerListExpertsTool,
  ListExpertsInputSchema,
  type ListExpertsInput,
  type ListExpertsDeps,
  type ListExpertsResponse,
  type ExpertInfo,
  // list_workflows tool (Issue #436)
  registerListWorkflowsTool,
  ListWorkflowsInputSchema,
  type ListWorkflowsInput,
  type ListWorkflowsDeps,
  type ListWorkflowsResponse,
  type WorkflowInfo,
  // research tools (Research System Enhancement)
  registerResearchQueryTool,
  ResearchQueryInputSchema,
  type ResearchQueryInput,
  type ResearchQueryDeps,
  type ResearchQueryResponse,
  registerResearchAddTool,
  ResearchAddInputSchema,
  type ResearchAddInput,
  type ResearchAddDeps,
  type ResearchAddResponse,
  registerResearchDiscoverTool,
  ResearchDiscoverInputSchema,
  type ResearchDiscoverInput,
  type ResearchDiscoverDeps,
  type ResearchDiscoverResponse,
  type DiscoveredItem,
  type DiscoverySource,
  registerResearchAnalyzeTool,
  ResearchAnalyzeInputSchema,
  type ResearchAnalyzeInput,
  type ResearchAnalyzeDeps,
  type ResearchAnalyzeResponse,
  type AnalysisFocus,
  registerResearchCatalogReviewTool,
  ResearchCatalogReviewInputSchema,
  type ResearchCatalogReviewInput,
  type ResearchCatalogReviewDeps,
  type ResearchCatalogReviewResponse,
  ResearchAutoCatalog,
  getAutoCatalog,
  type CatalogedReference,
  // Memory observability tools (Issue #751, #753)
  registerMemoryQueryTool,
  MemoryQueryInputSchema,
  type MemoryQueryInput,
  type MemoryQueryDeps,
  type MemoryQueryResponse,
  registerMemoryStatsTool,
  MemoryStatsInputSchema,
  type MemoryStatsInput,
  type MemoryStatsDeps,
  type MemoryStatsResponse,
  // Weather report tool (Issue #865)
  registerWeatherReportTool,
  type WeatherReportDeps,
  WeatherReportInputSchema,
  type WeatherReportInput,
  type WeatherReportResponse,
  generateWeatherReport,
  // Delegate helpers (Issue #872 — TUI)
  analyzeTask,
  selectModel,
  type TaskRequirements,
  // Graph workflow templates (Issue #841, #866)
  getGraphWorkflowList,
  getGraphRegistry,
  type GraphWorkflowInfo,
} from './tools/index.js';

// Gateway — Tiered Orchestration Routing (Issue #888, #892, #893)
export {
  classifyRequestTier,
  RequestTier,
  TOOL_TIER_MAP,
  type TierOverrides,
  createGateway,
  type GatewayConfig,
  type GatewayInstance,
  type GatewayToolHandler,
  type GatewayToolResult,
  type GatewayLogEntry,
} from './gateway/index.js';

// STPA Safety Analysis Framework (Issue #328)
export {
  // Types and Enums
  HazardCategory,
  HazardSeverity,
  HazardLikelihood,
  UnsafeControlActionType,
  ConstraintEnforcement,
  ConstraintPriority,
  RiskLevel,
  ToolCategory,
  type Hazard,
  type UnsafeControlAction,
  type TriggerPattern,
  type SafetyConstraint,
  type ToolAnalysisResult,
  type StpaAnalysisResult,
  type AnalysisSummary,
  type HazardInteraction,
  type AnalysisMetadata,
  type AnalysisConfiguration,
  type AnalysisConfigurationInput,
  type ToolDefinition,
  type ToolInputSchema,
  type PropertySchema,
  type ValidationResult,
  type ConstraintViolation,
  type ValidationWarning,
  // Schemas
  HazardCategorySchema,
  ToolDefinitionSchema,
  AnalysisConfigurationSchema,
  DEFAULT_ANALYSIS_CONFIG,
  // Hazard Catalog
  classifyTool,
  classifyToolMultiple,
  getHazardsForTool,
  getTriggerPatternsForCategory,
  FILE_READ_HAZARDS,
  FILE_WRITE_HAZARDS,
  FILE_DELETE_HAZARDS,
  SHELL_EXECUTE_HAZARDS,
  NETWORK_HAZARDS,
  DATABASE_HAZARDS,
  AUTH_HAZARDS,
  ORCHESTRATION_HAZARDS,
  PATH_TRIGGER_PATTERNS,
  SHELL_TRIGGER_PATTERNS,
  NETWORK_TRIGGER_PATTERNS,
  HAZARD_CATALOG,
  // Analyzer
  analyzeToolForHazards,
  generateUnsafeControlActions,
  generateSafetyConstraints,
  validateToolAgainstConstraints,
  analyzeTools,
  StpaAnalysisError,
} from './safety/index.js';
