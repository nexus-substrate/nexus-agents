/**
 * nexus-agents/agents
 *
 * Agent framework for Nexus Agents.
 * Provides base classes and implementations for AI agents.
 */

// Base agent class and types
export {
  BaseAgent,
  TaskSchema,
  AgentMessageSchema,
  BaseAgentOptionsSchema,
  type BaseAgentOptions,
} from './base-agent.js';

// Simple agent implementation
export { SimpleAgent } from './simple-agent.js';

// TechLead agent
export { TechLead, createTechLead, type ExecutionPlan } from './tech-lead.js';

// Plan to Workflow conversion
export {
  convertPlanToWorkflow,
  makeConvertible,
  isConvertible,
  PlanConversionOptionsSchema,
  type PlanConversionOptions,
  type ConvertibleExecutionPlan,
  type ExecutionPlanData,
} from './plan-converter.js';

// TechLead types and schemas
export type {
  SubTask,
  TaskAnalysis,
  ExpertAssignment,
  SynthesizedResult,
  ResultSummary,
  Conflict,
  TechLeadOptions,
  SubtaskPriority,
  SubtaskStatus,
} from './tech-lead-types.js';

export {
  SubTaskSchema,
  TaskAnalysisSchema,
  ExpertAssignmentSchema,
  SynthesizedResultSchema,
  TechLeadOptionsSchema,
  SubtaskPrioritySchema,
  SubtaskStatusSchema,
  EXPERT_CAPABILITIES,
  TASK_TYPE_EXPERTS,
} from './tech-lead-types.js';

// State machine
export {
  AgentStateMachine,
  createStateMachine,
  type StateTransitionEvent,
  type StateTransition,
  type StateChangeCallback,
  type TransitionErrorCallback,
  type StateMachineOptions,
} from './state-machine.js';

// Context management
export {
  ContextManager,
  ContentPriority,
  DEFAULT_BUDGET,
  ContextBudgetSchema,
  ContextManagerConfigSchema,
  type ContextBudget,
  type ContextItem,
  type ContextManagerConfig,
  type ContextStats,
} from './context-manager.js';

// Context pruning
export {
  ContextPruner,
  PruningStrategy,
  ContextPrunerConfigSchema,
  SlidingWindowOptionsSchema,
  HierarchicalOptionsSchema,
  SemanticOptionsSchema,
  type ContextPrunerConfig,
  type PruneOptions,
  type PruneResult,
  type SlidingWindowOptions,
  type HierarchicalOptions,
  type SemanticOptions,
} from './context-pruner.js';

// Pruning strategy helpers
export {
  extractKeywords,
  calculateRelevance,
  createEmptyPruneResult,
} from './pruning-strategies.js';

// Expert system (dynamic expert factory)
export {
  // Configuration
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
  // Factory
  ExpertFactory,
  Expert,
  FactoryError,
  type CreateExpertOptions,
  // Registry
  ExpertRegistry,
  RegistryError,
  getExpertRegistry,
  type RegisterOptions,
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
  // Specialized expert types and schemas
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
  // Specialized Expert Agents
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
} from './experts/index.js';

// Collaboration protocol
export {
  // Types and schemas
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
  // Session management
  CollaborationSession,
  createCollaborationSession,
  type CollaborationSessionOptions,
  type SessionEvent,
  // Protocol implementations
  SequentialProtocol,
  ParallelProtocol,
  ReviewProtocol,
  ConsensusProtocol,
  ProtocolFactory,
  createProtocolFactory,
  type ICollaborationProtocol,
  type ProtocolOptions,
  // Result aggregation
  ResultAggregator,
  createResultAggregator,
  aggregateResults,
  type AggregationStrategy,
  type AggregatorOptions,
  type AggregatorInput,
  type ExpertResult,
  type ConflictResolver,
  type QualityScorer,
} from './collaboration/index.js';

// Agent resilience (failure detection and recovery)
export {
  // Types
  type FailureArchetype,
  type FailureSeverity,
  type DetectedFailure,
  type DetectionResult,
  type RecoveryAction,
  type RecoveryStrategy,
  type RecoveryResult,
  type DetectorConfig,
  type DetectionInput,
  type ToolCallRecord,
  type RecoveryManagerConfig,
  type RecoveryContext,
  type RecoveryInstructions,
  type RecoveryResultOptions,
  // Schemas
  FailureArchetypeSchema,
  FailureSeveritySchema,
  DetectedFailureSchema,
  DetectionResultSchema,
  RecoveryActionSchema,
  RecoveryStrategySchema,
  RecoveryResultSchema,
  DetectorConfigSchema,
  // Constants
  DEFAULT_DETECTOR_CONFIG,
  DEFAULT_RECOVERY_STRATEGIES,
  DEFAULT_RECOVERY_CONFIG,
  ARCHETYPE_DESCRIPTIONS,
  // Classes and factories
  FailureDetector,
  createFailureDetector,
  RecoveryManager,
  createRecoveryManager,
  buildRecoveryResult,
} from './resilience/index.js';

// Skill library (Voyager pattern)
export {
  // Types
  type Skill,
  type SkillWithMetrics,
  type SkillParameter,
  type SkillExample,
  type SkillExecution,
  type SkillMetrics,
  type SkillQuery,
  type SkillSearchResult,
  type CreateSkillOptions,
  type SkillCompositionRequest,
  type SkillComposition,
  type CompositionStep,
  type InputBinding,
  type SkillLibraryConfig,
  type SkillComplexity,
  type SkillExecutionStatus,
  type SkillCategory,
  type LibraryStatistics,
  type SkillComposerConfig,
  type CompositionValidation,
  // Constants
  DEFAULT_SKILL_LIBRARY_CONFIG,
  COMPLEXITY_ORDER,
  DEFAULT_COMPOSER_CONFIG,
  // Classes and factories
  SkillLibrary,
  createSkillLibrary,
  SkillComposer,
  createSkillComposer,
} from './skills/index.js';

// Self-Improving (SICA) exports
export {
  // Types
  type VersionId,
  type VersionStatus,
  type AgentConfiguration,
  type AgentVersion,
  type ExecutionMetrics,
  type VersionMetrics,
  type ImprovementAttempt,
  type ConfigurationChange,
  type ImprovementValidation,
  type ValidationCheck,
  type SicaConfig,
  type SicaEventType,
  type SicaEvent,
  type SicaExecutionResult,
  type ImprovementOptions,
  type SicaAgentOptions,
  // Constants
  DEFAULT_SICA_CONFIG,
  // Classes and factories
  SicaVersionManager,
  createVersionManager,
  SicaAgent,
  createSicaAgent,
} from './self-improving/index.js';

// Observability (OrchestrationObserver - renamed from SwarmObserver in Issue #251)
export {
  // Types and schemas (new names)
  AgentStateSchema,
  OrchestrationObserverConfigSchema,
  ObserverTopics,
  type AgentState,
  type TrackedAgent,
  type RoutingDecision,
  type TokenUsage,
  type CostMetrics,
  type SessionMetrics,
  type OrchestrationStats,
  type OrchestrationObserverEvent,
  type OrchestrationObserverListener,
  type OrchestrationObserverConfig,
  type OrchestrationObserverOptions,
  type IOrchestrationObserver,
  // Implementation (new names)
  OrchestrationObserver,
  createOrchestrationObserver,
} from './observability/index.js';

// Backward compatibility aliases (deprecated, will be removed in v3.0)
/* eslint-disable @typescript-eslint/no-deprecated */
export {
  SwarmObserverConfigSchema,
  type SwarmStats,
  type SwarmObserverEvent,
  type SwarmObserverListener,
  type SwarmObserverConfig,
  type SwarmObserverOptions,
  type ISwarmObserver,
  SwarmObserver,
  createSwarmObserver,
} from './observability/index.js';
/* eslint-enable @typescript-eslint/no-deprecated */
