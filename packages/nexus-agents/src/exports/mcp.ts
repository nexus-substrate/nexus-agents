/**
 * MCP exports - MCP server implementation
 * Split from index.ts for file size compliance (Issue #285)
 * Updated Issue #538: Added missing tool registration exports
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
  // Policy firewall (Issue #538)
  type Artifact as FirewallArtifact, // Renamed: pipeline.ts exports pipeline Artifact
  type ExecutionMode,
  type PolicyMode,
  type PolicyDecision as FirewallPolicyDecision, // Renamed: pipeline.ts exports pipeline PolicyDecision
  type PolicyContext as FirewallPolicyContext, // Renamed: pipeline.ts exports pipeline PolicyContext
  type PolicyRule as FirewallPolicyRule, // Renamed: pipeline.ts exports pipeline PolicyRule
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
  // MCP Notifier (Issue #974 — Claude Code Observability)
  createMcpNotifier,
  NOOP_NOTIFIER,
  type IMcpNotifier,
  type McpLogLevel,
  // EventBus Bridge (Issue #307, #538)
  initializeEventBusBridge,
  getEventBusStats,
  type EventBusBridgeResult,
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
  // execute_expert tool (Issue #437, #538)
  registerExecuteExpertTool,
  ExecuteExpertInputSchema,
  type ExecuteExpertInput,
  type ExecuteExpertDeps,
  type ExecuteExpertResponse,
  // consensus_vote tool (Issue #435, #538)
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
  // delegate_to_model tool (Issue #538)
  registerDelegateToModelTool,
  DelegateInputSchema,
  DelegateOutputSchema,
  MODEL_CAPABILITIES,
  analyzeTask as analyzeDelegateTask,
  selectModel,
  type DelegateInput,
  type DelegateOutput,
  type DelegateDeps,
  type CapabilityProfile,
  type PreferredCapability,
  type TaskRequirements,
  // Weather report tool (Issue #865)
  generateWeatherReport,
  // Graph workflow templates (Issue #841, #866)
  getGraphWorkflowList,
  getGraphRegistry,
  type GraphWorkflowInfo,
  // list_experts tool (Issue #436, #538)
  registerListExpertsTool,
  ListExpertsInputSchema,
  type ListExpertsInput,
  type ListExpertsDeps,
  type ListExpertsResponse,
  type ExpertInfo,
  // list_workflows tool (Issue #436, #538)
  registerListWorkflowsTool,
  ListWorkflowsInputSchema,
  type ListWorkflowsInput,
  type ListWorkflowsDeps,
  type ListWorkflowsResponse,
  type WorkflowInfo,
  // Issue triage tool (Issue #828, #900)
  registerIssueTriageTool,
  IssueTriageInputSchema,
  type IssueTriageInput,
  type IssueTriageDeps,
  type IssueTriageResponse,
  // Graph workflow tool (Issue #840, #900)
  registerRunGraphWorkflowTool,
  RunGraphWorkflowInputSchema,
  type RunGraphWorkflowInput,
  type RunGraphWorkflowDeps,
  type RunGraphWorkflowResponse,
  // Execute spec tool (Issue #853, #900)
  registerExecuteSpecTool,
  ExecuteSpecInputSchema,
  type ExecuteSpecInput,
  type ExecuteSpecDeps,
  // Repo analyze tool (Issue #1074)
  registerRepoAnalyzeTool,
  RepoAnalyzeInputSchema,
  type RepoAnalyzeInput,
  type RepoAnalysis,
  type RepoAnalyzeDeps,
  analyzeRepo,
  analyzeGitHubRepo,
  normalizeRepoId,
} from '../mcp/index.js';
