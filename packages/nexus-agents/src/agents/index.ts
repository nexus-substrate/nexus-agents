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

// Orchestrator agent (preferred name - Issue #759)
export { Orchestrator, createOrchestrator, type ExecutionPlan } from './tech-lead.js';

// Deprecated aliases (Issue #759) — intentional re-exports for backward compatibility
/* eslint-disable @typescript-eslint/no-deprecated -- Intentional: public API backward compat */
export { type TechLead, createTechLead, type OrchestratorAgentOptions } from './tech-lead.js';
/* eslint-enable @typescript-eslint/no-deprecated */

// Wave Scheduler (Issue #769)
export {
  WaveScheduler,
  createWaveScheduler,
  chunkByDirectory,
  DEFAULT_WAVE_CONFIG,
  type WaveSchedulerConfig,
  type WaveTask,
  type WaveTaskResult,
  type WaveResult,
  type WaveExecutionResult,
  type WorkChunk,
  type WaveTaskExecutor,
} from './wave-scheduler.js';

// Wave Checkpoint Persistence (Context Exhaustion Prevention)
export {
  ensureCheckpointDir,
  appendWaveCheckpoint,
  loadCheckpoints,
  summarizeCheckpoints,
  cleanupCheckpoint,
  type AppendCheckpointOptions,
} from './wave-checkpoint-persistence.js';

export {
  WaveCheckpointEntrySchema,
  CheckpointTaskResultSchema,
  DEFAULT_CHECKPOINT_CONFIG,
  type WaveCheckpointEntry,
  type WaveCheckpointConfig,
  type CheckpointSummary,
  type OnWaveCompleteCallback,
} from './wave-checkpoint-types.js';

// Wave Pressure Integration (Issue #800 - Context Exhaustion Prevention)
export { buildPressureAwareConfig, type PressureAwareConfig } from './wave-pressure-integration.js';

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

// Orchestrator types and schemas (preferred names - Issue #759)
export type {
  SubTask,
  TaskAnalysis,
  ExpertAssignment,
  SynthesizedResult,
  ResultSummary,
  Conflict,
  OrchestratorOptions,
  SubtaskPriority,
  SubtaskStatus,
} from './tech-lead-types.js';

// eslint-disable-next-line @typescript-eslint/no-deprecated -- Intentional: public API backward compat
export type { TechLeadOptions } from './tech-lead-types.js';

export {
  SubTaskSchema,
  TaskAnalysisSchema,
  ExpertAssignmentSchema,
  SynthesizedResultSchema,
  OrchestratorOptionsSchema,
  SubtaskPrioritySchema,
  SubtaskStatusSchema,
  EXPERT_CAPABILITIES,
  TASK_TYPE_EXPERTS,
} from './tech-lead-types.js';

// eslint-disable-next-line @typescript-eslint/no-deprecated -- Intentional: public API backward compat
export { TechLeadOptionsSchema } from './tech-lead-types.js';

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

// Context pruning agent config (Issue #476 - for ExpertFactory and BaseAgent)
export {
  DEFAULT_PRUNING_CONFIG,
  resolvePruningConfig,
  initializePruningInfrastructure,
  type ContextPrunerAgentConfig,
  type ResolvedPruningConfig,
  type ContextPruningMetrics,
  type PruningInfrastructure,
  type PruningInitOptions,
} from './base-agent-pruning-init.js';

// Schema for context pruning config
export { ContextPrunerAgentConfigSchema } from './agent-schemas.js';

// Memory backend integration (Issue #348)
export {
  initializeMemoryInfrastructure,
  resolveMemoryConfig,
  createInitialMemoryState,
  persistMemoryState,
  loadMemoryState,
  loadRelevantTypedMemories,
  recordTaskLearning,
  recordExecutionPattern,
  recordErrorResolution,
  findErrorResolution,
  getLearningsByType,
  getTopPatterns,
  getAgentStateKey,
  getTaskLearningKey,
  getPatternKey,
  getErrorResolutionKey,
  MemoryPersistenceMode,
  DEFAULT_MEMORY_CONFIG,
  AgentMemoryError,
  type AgentMemoryConfig,
  type ResolvedMemoryConfig,
  type AgentMemoryState,
  type TaskLearning,
  type ExecutionPattern,
  type ErrorResolution,
  type MemoryInfrastructure,
  type MemoryInitOptions,
} from './base-agent-memory-init.js';

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
  createFromICTM,
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

// Collaboration protocol (re-exported from helper file)
export * from './collaboration-exports.js';

// Agent resilience (failure detection and recovery)
export * from './resilience-exports.js';

// Skill library (Voyager pattern)
export * from './skills-exports.js';

// Self-Improving (SICA) exports
export * from './sica-exports.js';

// Observability exports (OrchestrationObserver + deprecated SwarmObserver)
export * from './observability-exports.js';

// Coordination module (Scaling Predictor for multi-agent systems)
export * from './coordination-exports.js';

// Reasoning module (Forest-of-Thought)
export * from './reasoning-exports.js';

// Puppeteer Orchestration module (Issue #335)
// Uses explicit exports to avoid conflicts with reasoning module
export * from './orchestration-exports.js';

// ICTM module (AOrchestra pattern - Issue #756)
export * from './ictm/index.js';

// ICTM integration with TechLead (Issue #756 Phase 2)
export {
  enrichAssignmentsWithICTM,
  type ICTMEnrichmentResult,
} from './tech-lead-ictm-integration.js';

// Expert Pool — concurrent admission control (Issue #1029)
export {
  ExpertPool,
  getExpertPool,
  resetExpertPool,
  type ExpertPermit,
  type ExpertPoolStatus,
  type ExpertPoolConfig,
} from './expert-pool.js';

// Heartbeat Monitor — liveness detection (Issue #1032)
export {
  HeartbeatMonitor,
  getHeartbeatMonitor,
  resetHeartbeatMonitor,
  type ExpertSessionSnapshot,
  type AgentHealthReport,
  type HeartbeatConfig,
  type SessionHealth,
  type HealthTransition,
} from './heartbeat-monitor.js';
