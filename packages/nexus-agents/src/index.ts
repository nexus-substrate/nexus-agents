/* eslint-disable max-lines */
/**
 * nexus-agents
 *
 * Multi-agent orchestration framework with MCP server.
 * Provides tools for orchestrating AI agents for complex software tasks.
 *
 * @example
 * ```typescript
 * import { createServer, startStdioServer, TechLead, createClaudeAdapter } from 'nexus-agents';
 *
 * // Start MCP server
 * const result = await startStdioServer({ name: 'my-server', version: '1.0.0' });
 *
 * // Or use programmatically
 * const adapter = createClaudeAdapter({ model: 'claude-sonnet-4-20250514' });
 * const techLead = new TechLead({ adapter });
 * ```
 */

export { VERSION } from './version.js';

// ============================================================================
// Core - Types, Result<T,E>, errors, and logger
// ============================================================================
export {
  // Result pattern
  type Result,
  ok,
  err,
  isOk,
  isErr,
  map,
  mapErr,
  unwrap,
  unwrapOr,
  // Error hierarchy
  ErrorCode,
  NexusError,
  ValidationError,
  ConfigError,
  ModelError,
  AgentError,
  WorkflowError,
  SecurityError,
  TimeoutError,
  RateLimitError,
  type SerializedError,
  type NexusErrorOptions,
  // Logger
  createLogger,
  logger,
  sanitize,
  type LogLevel,
  type LogContext,
  type LogEntry,
  type ILogger,
} from './core/index.js';

// Re-export all types from core
export type {
  // Agent types
  IAgent,
  AgentState,
  AgentRole,
  AgentMessage,
  AgentMessageType,
  AgentResponse,
  // Task types
  Task,
  TaskContext,
  TaskResult,
  // Model types
  IModelAdapter,
  Message,
  ContentBlock,
  MessageRole,
  CompletionRequest,
  CompletionResponse,
  TokenUsage,
  StopReason,
  StreamChunk,
  ToolDefinition,
  // Workflow types
  IWorkflowEngine,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowTemplate,
  InputDefinition,
  StepResult,
} from './core/index.js';

// Re-export enums/constants from core
export { ModelCapability, AgentCapability, ParseError } from './core/index.js';

// ============================================================================
// Config - Configuration schemas
// ============================================================================
export {
  AppConfigSchema,
  ModelConfigSchema,
  ModelTiersSchema,
  ProviderConfigSchema,
  ExpertConfigSchema as ConfigExpertConfigSchema,
  ExpertDefinitionSchema as ConfigExpertDefinitionSchema,
  WorkflowConfigSchema,
  SecurityConfigSchema,
  LoggingConfigSchema,
  defaultConfig,
  type AppConfig,
  type ModelConfig,
  type ModelTiers,
  type ProviderConfig,
  type ExpertConfig as ConfigExpertConfig,
  type ExpertDefinition as ConfigExpertDefinition,
  type WorkflowConfig,
  type SecurityConfig,
  type LoggingConfig,
} from './config/index.js';

// ============================================================================
// Adapters - Model adapters (Claude, OpenAI, Gemini, Ollama)
// ============================================================================
export {
  // Adapter factory
  AdapterFactory,
  AdapterConfigSchema,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Re-exporting deprecated item for consumers
  defaultFactory,
  type AdapterConfig,
  type AdapterCreator,
  type RegisterOptions as AdapterRegisterOptions,
  // Rate limiting
  RateLimiter as AdapterRateLimiter,
  createRateLimiter,
  type RateLimiterConfig as AdapterRateLimiterConfig,
  type RateLimitExceeded,
  // Retry logic
  withRetry,
  withRetryWrapper,
  isRetryableError,
  calculateDelay,
  sleep,
  RetryExhaustedError,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
  type RetryAttemptInfo,
  type WithRetryOptions,
  // Base adapter
  BaseAdapter,
  AdapterModelError,
  type BaseAdapterConfig,
  // Streaming utilities
  StreamController,
  StreamError,
  StreamCancelledError,
  createStream,
  collectStream,
  transformStream,
  mergeStreams,
  takeUntil,
  take,
  skip,
  filterStream,
  withTimeout,
  bufferStream,
  concatStreams,
  fromArray,
  tapStream,
  reduceStream,
  type StreamState,
  type CreateStreamOptions,
  // Claude adapter
  ClaudeAdapter,
  createClaudeAdapter,
  CLAUDE_MODELS,
  CLAUDE_MODEL_ALIASES,
  type ClaudeAdapterConfig,
  // OpenAI adapter
  OpenAIAdapter,
  createOpenAIAdapter,
  OPENAI_MODELS,
  OPENAI_MODEL_ALIASES,
  type OpenAIAdapterConfig,
  // Ollama adapter
  OllamaAdapter,
  createOllamaAdapter,
  OLLAMA_MODELS,
  type OllamaAdapterConfig,
  // Gemini adapter
  GeminiAdapter,
  createGeminiAdapter,
  GEMINI_MODELS,
  GEMINI_MODEL_ALIASES,
  type GeminiAdapterConfig,
} from './adapters/index.js';

// ============================================================================
// Agents - Agent framework, TechLead, Experts
// ============================================================================
export {
  // Base agent
  BaseAgent,
  TaskSchema,
  AgentMessageSchema,
  BaseAgentOptionsSchema,
  type BaseAgentOptions,
  // Simple agent
  SimpleAgent,
  // TechLead
  TechLead,
  createTechLead,
  type ExecutionPlan,
  // TechLead types
  type SubTask,
  type TaskAnalysis,
  type ExpertAssignment,
  type SynthesizedResult,
  type ResultSummary,
  type Conflict,
  type TechLeadOptions,
  type SubtaskPriority,
  type SubtaskStatus,
  SubTaskSchema,
  TaskAnalysisSchema,
  ExpertAssignmentSchema,
  SynthesizedResultSchema,
  TechLeadOptionsSchema,
  SubtaskPrioritySchema,
  SubtaskStatusSchema,
  EXPERT_CAPABILITIES,
  TASK_TYPE_EXPERTS,
  // State machine
  AgentStateMachine,
  createStateMachine,
  type StateTransitionEvent,
  type StateTransition,
  type StateChangeCallback,
  type TransitionErrorCallback,
  type StateMachineOptions,
  // Context management
  ContextManager,
  ContentPriority,
  DEFAULT_BUDGET,
  ContextBudgetSchema,
  ContextManagerConfigSchema,
  type ContextBudget,
  type ContextItem,
  type ContextManagerConfig,
  type ContextStats,
  // Context pruning
  ContextPruner,
  PruningStrategy,
  ContextPrunerConfigSchema,
  type ContextPrunerConfig,
  type PruneOptions,
  type PruneResult,
  // Expert system
  type ExpertConfig,
  type ModelPreference,
  type BuiltInExpertType,
  ExpertConfigSchema,
  ModelPreferenceSchema,
  BuiltInExpertTypeSchema,
  BUILT_IN_EXPERTS,
  EXPERT_TYPE_TO_ROLE,
  validateExpertConfig,
  safeValidateExpertConfig,
  ExpertFactory,
  Expert,
  FactoryError,
  type CreateExpertOptions,
  ExpertRegistry,
  RegistryError,
  getExpertRegistry,
  type RegisterOptions as ExpertRegisterOptions,
  type QueryOptions,
  type RegistryStats,
  // Task analysis
  analyzeTask,
  TaskDomain,
  TaskComplexity,
  AnalysisError,
  TaskAnalysisResultSchema,
  type TaskAnalysisResult,
  // Expert selection
  selectExperts,
  quickSelect,
  createDefaultRegistry,
  SelectionError,
  ExpertCollaborationPattern,
  type ExpertCollaborationPatternType,
  ScoreBreakdownSchema,
  ExpertMatchSchema,
  SelectionResultSchema,
  SelectionOptionsSchema,
  type ExpertDefinition,
  type ExpertMatch,
  type ScoreBreakdown,
  type SelectionResult,
  type SelectionOptions,
  type SelectionExpertRegistry,
  // Expert types
  type ExpertDomain,
  type ExpertOptions,
  type ExpertOutput,
  type CodeAnalysisResult,
  type CodeChange,
  type SecurityAnalysisResult,
  type Vulnerability,
  type ComplianceStatus,
  type ArchitectureAnalysisResult,
  type ArchitecturePattern,
  type ArchitectureDecision,
  type SystemComponent,
  type TestingAnalysisResult,
  type GeneratedTest,
  type CoverageMetrics,
  type TestQuality,
  type DocumentationResult,
  type DocumentationSection,
  type ApiDocumentation,
  type ApiEndpoint,
  type ApiType,
  ExpertDomainSchema,
  ExpertOptionsSchema,
  ExpertOutputSchema,
  VulnerabilitySeveritySchema,
  VulnerabilitySchema,
  CodeChangeSchema,
  GeneratedTestSchema,
  CoverageMetricsSchema,
  EXPERT_DEFAULT_TEMPERATURES,
  EXPERT_DEFAULT_CAPABILITIES,
  // Specialized experts
  CodeExpert,
  createCodeExpert,
  type CodeExpertOptions,
  SecurityExpert,
  createSecurityExpert,
  type SecurityExpertOptions,
  type SecurityFocusArea,
  ArchitectureExpert,
  createArchitectureExpert,
  type ArchitectureExpertOptions,
  type ArchitectureStyle,
  type QualityAttribute,
  TestingExpert,
  createTestingExpert,
  type TestingExpertOptions,
  DocumentationExpert,
  createDocumentationExpert,
  type DocumentationExpertOptions,
  // Collaboration
  type CollaborationPattern,
  type SessionStatus,
  type VoteDecision,
  type CollaborationConfig,
  type ExpertParticipation,
  type CollaborationMessage,
  type TaskAssignmentMessage,
  type ResultSubmissionMessage,
  type ReviewRequestMessage,
  type ReviewResponseMessage,
  type FeedbackMessage,
  type VoteMessage,
  type StatusUpdateMessage,
  type SessionState,
  type CollaborationResult,
  type ExpertResultSummary,
  type AggregatedResult,
  type ResultConflict,
  type AggregationMetadata,
  CollaborationPatternSchema,
  SessionStatusSchema,
  VoteDecisionSchema,
  CollaborationConfigSchema,
  ExpertParticipationSchema,
  VoteMessageSchema,
  ReviewResponseMessageSchema,
  DEFAULT_TIMEOUTS,
  DEFAULT_MAX_RETRIES,
  MIN_EXPERTS_FOR_PATTERN,
  CollaborationSession,
  createCollaborationSession,
  type CollaborationSessionOptions,
  type SessionEvent,
  SequentialProtocol,
  ParallelProtocol,
  ReviewProtocol,
  ConsensusProtocol,
  ProtocolFactory,
  createProtocolFactory,
  type ICollaborationProtocol,
  type ProtocolOptions,
  ResultAggregator,
  createResultAggregator,
  aggregateResults,
  type AggregationStrategy,
  type AggregatorOptions,
  type AggregatorInput,
  type ExpertResult,
  type ConflictResolver,
  type QualityScorer,
  // Observability (SwarmObserver)
  AgentStateSchema,
  SwarmObserverConfigSchema,
  ObserverTopics,
  type TrackedAgent,
  type RoutingDecision,
  type TokenUsage as SwarmTokenUsage,
  type CostMetrics,
  type SessionMetrics,
  type SwarmStats,
  type SwarmObserverEvent,
  type SwarmObserverListener,
  type SwarmObserverConfig,
  type SwarmObserverOptions,
  type ISwarmObserver,
  SwarmObserver,
  createSwarmObserver,
} from './agents/index.js';

// ============================================================================
// Workflows - Workflow engine with parallel execution
// ============================================================================
export {
  // Workflow parser
  parseWorkflowYaml,
  parseWorkflowJson,
  loadWorkflowFile,
  validateWorkflow,
  // Workflow types
  InputTypeSchema,
  formatZodErrors,
  type InputType,
  type InputDefinitionInput,
  type InputDefinitionOutput,
  type AgentRoleType,
  type WorkflowStepInput,
  type WorkflowStepOutput,
  type WorkflowDefinitionInput,
  type WorkflowDefinitionOutput,
  type ValidationIssue,
  // Strict schemas
  StrictInputDefinitionSchema,
  StrictAgentRoleSchema,
  StrictWorkflowStepSchema,
  StrictWorkflowDefinitionSchema,
  // Dependency graph
  DependencyGraph,
  buildDependencyGraph,
  validateDependencyGraph,
  getTopologicalOrder,
  // Task queue
  TaskQueue,
  createTaskQueue,
  // Execution planner
  createExecutionPlan,
  validateWorkflowDependencies,
  getExecutionOrder,
  type ExecutionPhase,
  type ExecutionPlan as WorkflowExecutionPlan,
  // Parallel executor
  executeParallel,
  withRetries,
  allSucceeded,
  getFailedSteps,
  type ParallelOptions,
  type ExecutionContext,
  type StepExecutor,
  // Template types
  type TemplateCategory,
  type TemplateMetadata,
  type ITemplateRegistry,
  InputDefinitionSchema,
  AgentRoleSchema,
  WorkflowStepSchema,
  WorkflowDefinitionSchema,
  TemplateCategorySchema,
  TemplateMetadataSchema,
  BUILT_IN_TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_KEYWORDS,
  // Template loader
  getBuiltInTemplatesPath,
  parseTemplateContent,
  loadTemplateFile,
  loadTemplatesFromDirectory,
  getBuiltInTemplates,
  getBuiltInTemplatesWithMetadata,
  type ParsedTemplate,
  // Template registry
  createTemplateRegistry,
  createIsolatedRegistry,
  resetRegistry,
  TemplateRegistry,
  // Execution context
  createExecutionContext,
  storeStepResult,
  getStepResult,
  setVariable,
  getVariable,
  getCompletedSteps,
  isStepCompleted,
  areStepsCompleted,
  getExecutionDuration,
  cancelExecution,
  isCancelled,
  snapshotContext,
  validateRequiredInputs,
  WorkflowInputsSchema,
  type WorkflowExecutionContext,
  type CreateExecutionContextOptions,
  // Expression resolver
  parseExpression,
  resolveExpression,
  resolveInput,
  resolveStringExpressions,
  containsExpressions,
  validateExpressions,
  extractExpressions,
  getReferencedSteps,
  type ExpressionType,
  type ParsedExpression,
  type ResolveResult,
  // Step executor
  AgentStepExecutor,
  createAgentStepExecutor,
  ExpertFactoryAdapter,
  type IExpertFactory as WorkflowExpertFactory,
  type StepExecutorDeps,
  type StepExecutionOptions,
} from './workflows/index.js';

// ============================================================================
// MCP - MCP server implementation
// ============================================================================
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
  createMockTechLead,
  OrchestrateInputSchema,
  OrchestrateOutputSchema,
  OrchestrationError,
  type OrchestrateInput,
  type OrchestrateOutput,
  type OrchestrateDeps,
  type ITechLead,
  type IOrchestrateExpertFactory,
} from './mcp/index.js';

// ============================================================================
// CLI Adapters - CLI integration with defensive parsing
// ============================================================================
export {
  // Types
  type CliName,
  type CliTransport,
  type TokenUsage as CliTokenUsage,
  type CliResponse,
  type CliError,
  type CliErrorCode,
  type VersionStatus,
  type HealthStatus,
  type CapacityStatus,
  type ModelInfo as CliModelInfo,
  type CapabilityProfile as CliCapabilityProfile,
  type CliTask,
  type ExecutionOptions as CliExecutionOptions,
  type ICliAdapter,
  type ICliResponseParser,
  type VersionRequirements,
  CLI_VERSION_REQUIREMENTS,
  DEFAULT_CAPABILITIES as CLI_DEFAULT_CAPABILITIES,
  // Base adapter
  BaseCliAdapter,
  SubprocessCliAdapter,
  // Concrete adapters
  ClaudeCliAdapter,
  GeminiCliAdapter,
  CodexCliAdapter,
  CodexMcpAdapter,
  // Parsers
  ClaudeResponseParser,
  type ClaudeCliResponse,
  GeminiResponseParser,
  type GeminiCliResponse,
  CodexResponseParser,
  type CodexCliResponse,
  // Factory
  createCliAdapter,
  createAllAdapters,
  isCliAvailable,
  getAvailableClis,
  type CliAdapterConfig,
  // CLI Detection Cache (Issue #165)
  CliDetectionCache,
  createCliDetectionCache,
  DEFAULT_CACHE_CONFIG as CLI_DEFAULT_CACHE_CONFIG,
  CliDetectionCacheConfigSchema,
  type ICliDetectionCache,
  type CliDetectionCacheConfig,
  type CliHealthResult,
  type CacheStats as CliCacheStats,
  // CompositeRouter (Issue #166)
  CompositeRouter,
  createCompositeRouter,
  CompositeRouterConfigSchema,
  DEFAULT_COMPOSITE_CONFIG as CLI_DEFAULT_COMPOSITE_CONFIG,
  CompositeRoutingError,
  type ICompositeRouter,
  type CompositeRouterConfig,
  type CompositeRoutingDecision,
  type CompositeRouterStats,
} from './cli-adapters/index.js';

// ============================================================================
// Context - Context management and token counting
// ============================================================================
export {
  // Token counter
  TokenCounter,
  createTokenCounter,
  TokenCounterProvider,
  TokenCountError,
  type ITokenCounter,
  type TokenCounterConfig,
  type TokenCountResult,
} from './context/index.js';

// ============================================================================
// Learning - Closed-loop feedback and routing improvement
// ============================================================================
export {
  // Outcome Feedback Types
  type RouterType,
  type OutcomeClass,
  type QualitySignals,
  type RoutingDecision as FeedbackRoutingDecision,
  type TaskOutcome,
  type ComputedReward,
  type FeedbackLoopStats,
  type FeedbackCollectorConfig,
  type IOutcomeFeedback,
  type OutcomeProcessedCallback,
  DEFAULT_FEEDBACK_COLLECTOR_CONFIG,
  FeedbackCollectorConfigSchema,
  QualitySignalsSchema,
  RoutingDecisionSchema as FeedbackRoutingDecisionSchema,
  TaskOutcomeSchema,
  // Outcome Feedback Collector
  OutcomeFeedbackCollector,
  createRoutingDecision,
  createTaskOutcome,
  createOutcomeFeedbackCollector,
  // Feedback Integration (Issue #167)
  FeedbackIntegration,
  createFeedbackIntegration,
  computeOutcomeReward,
  DEFAULT_FEEDBACK_INTEGRATION_CONFIG,
  type IFeedbackIntegration,
  type FeedbackIntegrationConfig,
  type RecordOutcomeParams,
} from './learning/index.js';

// ============================================================================
// Audit - Structured audit logging (Issue #193)
// ============================================================================
export {
  // Error
  AuditError,
  // Schemas
  AuditCategorySchema,
  AuditSeveritySchema,
  AuditOutcomeSchema,
  AuditActorSchema,
  AuditResourceSchema,
  AuditEventSchema,
  AuditEventInputSchema,
  AuditLogConfigSchema,
  AuditQueryCriteriaSchema,
  // Types
  type AuditCategory,
  type AuditSeverity,
  type AuditOutcome,
  type AuditActor,
  type AuditResource,
  type AuditEvent,
  type AuditEventInput,
  type AuditLogConfig,
  type AuditQueryCriteria,
  type IAuditStorage,
  type IAuditLogger,
  type ToolInvocationAuditOpts,
  type PolicyDecisionAuditOpts,
  type SecurityEventAuditOpts,
  type RateLimitAuditOpts,
  // Logger
  AuditLogger,
  createAuditLogger,
  // Storage
  FileAuditStorage,
  InMemoryAuditStorage,
  // Integration helpers
  actorFromContext,
  resultToOutcome,
  logToolInvocationAudit,
  logPolicyAudit,
  logRateLimitAudit,
  type AuditHandlerConfig,
  type LogToolInvocationOpts,
  type LogPolicyAuditOpts,
  type LogRateLimitAuditOpts,
} from './audit/index.js';
