/**
 * nexus-agents/agents
 *
 * Agent framework for Nexus Agents.
 * Provides base classes and implementations for AI agents.
 */

export const VERSION = '0.0.1';

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
  type ContextPrunerConfig,
  type PruneOptions,
  type PruneResult,
} from './context-pruner.js';

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
