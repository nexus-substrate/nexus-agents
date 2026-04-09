/**
 * nexus-agents/mcp - Tools
 *
 * MCP tool implementations for the Nexus Agents server.
 *
 * (Source: MCP Protocol 2025-11-25)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ILogger } from '../../core/index.js';

import { createMcpLogger } from '../middleware/logging.js';
import { RateLimiter, createDefaultRateLimiter } from '../middleware/rate-limiter.js';

// Tool implementations
export {
  registerCreateExpertTool,
  createDefaultDeps,
  getAvailableRoles,
  getCapabilitiesForRole,
  CreateExpertInputSchema,
  type CreateExpertInput,
  type CreateExpertDeps,
  type CreateExpertResponse,
  type IExpertFactory,
} from './create-expert.js';

export {
  registerRunWorkflowTool,
  RunWorkflowInputSchema,
  type RunWorkflowDeps,
  type RunWorkflowInput,
  type WorkflowToolResult,
  type StepResultSummary,
  type DryRunResult,
} from './run-workflow.js';

// Note: createMockWorkflowEngine is available for testing via direct import from run-workflow.js

export {
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
  type IExpertFactory as IOrchestrateExpertFactory,
} from './orchestrate.js';

// Note: createMockOrchestrator is available for testing via direct import from orchestrate.js

export {
  registerDelegateToModelTool,
  DelegateInputSchema,
  DelegateOutputSchema,
  MODEL_CAPABILITIES,
  type DelegateInput,
  type DelegateOutput,
  type DelegateDeps,
  type CapabilityProfile,
  type PreferredCapability,
} from './delegate-to-model.js';

// Delegate helpers for direct consumption (Issue #872 — TUI)
export { analyzeTask, selectModel } from './delegate-to-model-helpers.js';
export type { TaskRequirements } from './delegate-to-model-types.js';

// Graph workflow templates (Issue #841, #866)
export {
  getGraphWorkflowList,
  getGraphRegistry,
  type GraphWorkflowInfo,
} from './run-graph-workflow-templates.js';

export {
  registerListExpertsTool,
  ListExpertsInputSchema,
  type ListExpertsInput,
  type ListExpertsDeps,
  type ListExpertsResponse,
  type ExpertInfo,
} from './list-experts.js';

export {
  registerListWorkflowsTool,
  ListWorkflowsInputSchema,
  type ListWorkflowsInput,
  type ListWorkflowsDeps,
  type ListWorkflowsResponse,
  type WorkflowInfo,
} from './list-workflows.js';

export {
  registerExecuteExpertTool,
  ExecuteExpertInputSchema,
  type ExecuteExpertInput,
  type ExecuteExpertDeps,
  type ExecuteExpertResponse,
} from './execute-expert.js';

export {
  registerConsensusVoteTool,
  ConsensusVoteInputSchema,
  type ConsensusVoteInput,
  type ConsensusVoteDeps,
  type ConsensusVoteResponse,
  type AgentVoteSummary,
  type VoteDecisionStatus,
} from './consensus-vote.js';

// Research tools (Phase 1 - Research System Enhancement)
export {
  registerResearchQueryTool,
  ResearchQueryInputSchema,
  type ResearchQueryInput,
  type ResearchQueryDeps,
  type ResearchQueryResponse,
} from './research-query.js';

export {
  registerResearchAddTool,
  ResearchAddInputSchema,
  type ResearchAddInput,
  type ResearchAddDeps,
  type ResearchAddResponse,
} from './research-add.js';

export {
  registerResearchAddSourceTool,
  ResearchAddSourceInputSchema,
  type ResearchAddSourceInput,
  type ResearchAddSourceDeps,
  type ResearchAddSourceResponse,
} from './research-add-source.js';

export {
  registerResearchDiscoverTool,
  ResearchDiscoverInputSchema,
  type ResearchDiscoverInput,
  type ResearchDiscoverDeps,
  type ResearchDiscoverResponse,
  type DiscoveredItem,
  type DiscoverySource,
} from './research-discover.js';

export {
  registerResearchAnalyzeTool,
  ResearchAnalyzeInputSchema,
  type ResearchAnalyzeInput,
  type ResearchAnalyzeDeps,
  type ResearchAnalyzeResponse,
  type AnalysisFocus,
} from './research-analyze.js';

export {
  registerResearchCatalogReviewTool,
  ResearchCatalogReviewInputSchema,
  type ResearchCatalogReviewInput,
  type ResearchCatalogReviewDeps,
  type ResearchCatalogReviewResponse,
} from './research-catalog-review.js';

// Research synthesis (Issue #1386)
export {
  registerResearchSynthesizeTool,
  ResearchSynthesizeInputSchema,
  type ResearchSynthesizeInput,
  type ResearchSynthesizeDeps,
  type ResearchSynthesizeResponse,
} from './research-synthesize.js';

export {
  ResearchAutoCatalog,
  getAutoCatalog,
  type CatalogedReference,
} from './research-auto-catalog.js';

// Issue triage tool (Issue #828 — Wire remaining security modules)
export {
  registerIssueTriageTool,
  IssueTriageInputSchema,
  type IssueTriageInput,
  type IssueTriageDeps,
  type IssueTriageResponse,
} from './issue-triage-tool.js';

// Graph workflow tool (Issue #840 — Expose graph workflows via MCP)
export {
  registerRunGraphWorkflowTool,
  RunGraphWorkflowInputSchema,
  type RunGraphWorkflowInput,
  type RunGraphWorkflowDeps,
  type RunGraphWorkflowResponse,
} from './run-graph-workflow.js';

// Multi-CLI graph workflow templates (Issue #866)
export {
  getMultiCliTemplates,
  getMultiCliRegistry,
  SECURITY_AUDIT_ASSIGNMENTS,
  TEST_GENERATION_ASSIGNMENTS,
  DOCUMENTATION_ASSIGNMENTS,
  type CliAssignment,
  type MultiCliTemplate,
} from './run-graph-workflow-multicli-templates.js';

// Spec execution tool (Issue #853 — AI Software Factory)
export {
  registerExecuteSpecTool,
  ExecuteSpecInputSchema,
  type ExecuteSpecInput,
  type ExecuteSpecDeps,
} from './execute-spec-tool.js';

// Memory observability tools (Issue #751)
export {
  registerMemoryQueryTool,
  MemoryQueryInputSchema,
  type MemoryQueryInput,
  type MemoryQueryDeps,
  type MemoryQueryResponse,
} from './memory-query.js';

export {
  registerMemoryStatsTool,
  MemoryStatsInputSchema,
  type MemoryStatsInput,
  type MemoryStatsDeps,
  type MemoryStatsResponse,
} from './memory-stats.js';

// Memory write tool (Issue #1090)
export {
  registerMemoryWriteTool,
  MemoryWriteInputSchema,
  type MemoryWriteInput,
  type MemoryWriteDeps,
  type MemoryWriteResponse,
} from './memory-write.js';

// Weather report tool (Issue #865)
export { registerWeatherReportTool, type WeatherReportDeps } from './weather-report-tool.js';
export {
  WeatherReportInputSchema,
  type WeatherReportInput,
  type WeatherReportOptions,
  type WeatherReportResponse,
  type CliWeather,
  type AdaptiveBonus,
  type RecommendedMapping,
} from './weather-report-types.js';
export { generateWeatherReport, getAdaptiveBonus, shouldExplore } from './weather-report.js';

// Registry import tool (Issue #889)
export { registerRegistryImportTool, type RegistryImportDeps } from './registry-import-tool.js';
export {
  RegistryImportInputSchema,
  type RegistryImportInput,
  type RegistryImportResponse,
} from './registry-import-types.js';
export { generateRegistryEntry } from './registry-import.js';
// Repo analyze tool (Issue #1074)
export { registerRepoAnalyzeTool, type RepoAnalyzeDeps } from './repo-analyze-tool.js';
export {
  RepoAnalyzeInputSchema,
  type RepoAnalyzeInput,
  type RepoAnalysis,
} from './repo-analyze-types.js';
export { analyzeRepo, analyzeGitHubRepo, normalizeRepoId } from './repo-analyze.js';
// Repo security plan tool (Issue #1079)
export {
  registerRepoSecurityPlanTool,
  type RepoSecurityPlanDeps,
} from './repo-security-plan-tool.js';
export {
  RepoSecurityPlanInputSchema,
  type RepoSecurityPlanInput,
  type RepoSecurityPlan,
  type ScannerRecommendation,
  type ConflictWarning,
  type CoverageAnalysis,
} from './repo-security-plan-types.js';
export {
  buildPlanFromAnalysis,
  generateSecurityPlan,
  resolveScannerData,
  FALLBACK_SCANNER_DATA,
  type ScannerEntry,
  type ScannerData,
} from './repo-security-plan.js';
export {
  getRegistryManifest,
  clearRegistryCache,
  type RegistryScanner,
  type RegistryRelationship,
  type LanguageMatrixEntry,
  type ScannerRegistryManifest,
} from './scanner-registry-fetcher.js';
// Codebase search tool (Issue #1567 — keyword search across symbol index)
export {
  registerSearchCodebaseTool,
  SearchCodebaseInputSchema,
  type SearchCodebaseDeps,
  type SearchCodebaseInput,
} from './search-codebase-tool.js';
// Symbol extraction tool (Issue #1559 — 80%+ token savings)
export {
  registerExtractSymbolsTool,
  ExtractSymbolsInputSchema,
  type ExtractSymbolsDeps,
  type ExtractSymbolsInput,
} from './extract-symbols-tool.js';
// Query trace tool (Epic #952, Phase 5)
export {
  registerQueryTraceTool,
  QueryTraceInputSchema,
  queryTraceFromDisk,
  type QueryTraceDeps,
  type QueryTraceInput,
  type QueryTraceResponse,
} from './query-trace-tool.js';

// Research pipeline tool (Issue #1711)
export {
  registerResearchPipelineTool,
  ResearchPipelineInputSchema,
  type ResearchPipelineInput,
  type ResearchPipelineOutput,
} from './research-pipeline-tool.js';

// Tool annotations and side effects (Issue #993)
export {
  TOOL_ANNOTATIONS,
  getToolAnnotations,
  getMcpAnnotations,
  getSideEffectsByCategory,
  type ToolAnnotations as McpToolAnnotations,
  type ToolSideEffectsEntry,
  type SideEffect,
  type SideEffectCategory,
} from './tool-annotations.js';

export { createAnnotationsProxy } from './annotation-proxy.js';
export {
  createToolObservabilityProxy,
  resetInvocationCounter,
} from './tool-observability-proxy.js';

/**
 * Options for tool registration.
 */
export interface ToolRegistrationOptions {
  /** Logger instance for tool operations */
  readonly logger?: ILogger;
  /** Rate limiter for tool calls */
  readonly rateLimiter?: RateLimiter;
}

/**
 * Result of tool registration.
 */
export interface ToolRegistrationResult {
  /** Names of registered tools */
  readonly tools: readonly string[];
  /** Logger used for tool operations */
  readonly logger: ILogger;
  /** Rate limiter used for tool calls */
  readonly rateLimiter: RateLimiter;
}

/**
 * Registers all Nexus Agents tools on the MCP server.
 *
 * This function provides infrastructure and logging for tool registration.
 * Individual tools require their specific dependencies and should be
 * registered using their respective register functions:
 *
 * - `registerOrchestrateTool(server, { orchestrator, logger, rateLimiter })`
 * - `registerCreateExpertTool(server, { expertFactory, expertRegistry, logger, rateLimiter })`
 * - `registerRunWorkflowTool(server, { workflowEngine, logger, rateLimiter })`
 *
 * **Important:** Pass the `rateLimiter` from the result to each tool's register
 * function to enable rate limiting. Without it, tools will not be rate limited.
 *
 * @param server - The MCP server to register tools on
 * @param options - Optional configuration for tool registration
 * @returns Registration result with shared resources (logger, rate limiter)
 *
 * @example
 * ```typescript
 * const serverResult = createServer();
 * if (serverResult.ok) {
 *   const { server, logger } = serverResult.value;
 *   const { rateLimiter } = registerTools(server, { logger });
 *
 *   // Register individual tools with their dependencies and rate limiter
 *   registerOrchestrateTool(server, { orchestrator, logger, rateLimiter });
 *   registerCreateExpertTool(server, { expertFactory, expertRegistry, logger, rateLimiter });
 *   registerRunWorkflowTool(server, { workflowEngine, logger, rateLimiter });
 * }
 * ```
 */
export function registerTools(
  server: McpServer,
  options?: ToolRegistrationOptions
): ToolRegistrationResult {
  const logger = options?.logger ?? createMcpLogger({ component: 'tools' });
  const rateLimiter = options?.rateLimiter ?? createDefaultRateLimiter('mcp-tools', logger);

  logger.info('Tool registration infrastructure initialized');

  // Note: Individual tools are registered separately with their specific dependencies.
  // The available tools are:
  // - orchestrate: Task orchestration with Orchestrator agent
  // - create_expert: Dynamic expert agent creation
  // - run_workflow: Workflow template execution
  // - delegate_to_model: Capability-matched task routing (Phase 1 CLI integration)
  //
  // Use the exported register functions with appropriate dependencies.

  // Reference server to avoid unused parameter warning
  void server;

  return {
    tools: [
      'orchestrate',
      'create_expert',
      'execute_expert',
      'run_workflow',
      'delegate_to_model',
      'list_experts',
      'list_workflows',
      'consensus_vote',
      'research_query',
      'research_add',
      'research_add_source',
      'research_discover',
      'research_analyze',
      'research_catalog_review',
      'research_synthesize',
      'memory_query',
      'memory_stats',
      'memory_write',
      'weather_report',
      'issue_triage',
      'run_graph_workflow',
      'execute_spec',
      'registry_import',
      'query_trace',
      'repo_analyze',
      'repo_security_plan',
      'extract_symbols',
      'search_codebase',
      'run_dev_pipeline',
      'run_research_pipeline',
    ],
    logger,
    rateLimiter,
  };
}

// Tool result types and helpers — canonical source: ./tool-result.ts
export {
  type BaseMcpToolDeps,
  type TextContent,
  type ToolResult,
  toolSuccess,
  toolSuccessStructured,
  toolError,
} from './tool-result.js';
