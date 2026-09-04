/**
 * nexus-agents/orchestration - Orchestration Module
 *
 * Unified orchestration layer providing canonical IOrchestrator interface
 * for all orchestration strategies (workflow, orchestrator, puppeteer).
 *
 * @module orchestration
 * @see docs/adr/0002-orchestrator-interface.md
 */

// Factory and adapters
export {
  OrchestratorFactory,
  WorkflowOrchestratorAdapter,
  createOrchestratorFactory,
  type OrchestratorFactoryConfig,
  type WorkflowAdapterConfig,
} from './orchestrator-factory.js';

// Re-export types from core for convenience
export type {
  IOrchestrator,
  IOrchestratorFactory,
  OrchestratorType,
  OrchestratorDefinition,
  OrchestratorExecuteOptions,
  OrchestratorStep,
  OrchestratorResult,
  OrchestratorErrorCode,
} from '../core/types/orchestrator.js';
export { OrchestratorError } from '../core/types/orchestrator.js';

// Graph-based workflow orchestration (Issue #831)
export {
  GraphBuilder,
  executeGraph,
  overwrite,
  append,
  customReducer,
  START,
  END,
  formatCompileError,
  runConsensusGate,
  createConsensusGateNode,
  runGraphWithConsensus,
} from './graph/index.js';
export type {
  ConsensusVoter,
  ConsensusVerdict,
  ConsensusProposalInput,
  ConsensusGateNodeOptions,
  RunGraphWithConsensusOptions,
} from './graph/index.js';
export type {
  StateReducer,
  StateFieldSchema,
  StateSchema,
  GraphState,
  NodeHandler,
  GraphNode,
  GraphEdge,
  CompiledGraph,
  NodeResult,
  GraphExecutionResult,
  GraphExecuteOptions,
  GraphCompileError,
  CompileResult,
  GraphEvent,
  NodeHookContext,
  HookError,
  NodeHook,
  PreconditionConfig,
} from './graph/index.js';

// Node Hooks (Issue #994 + #997)
export {
  runPreconditions,
  runVerification,
  createStateComparisonVerifier,
  createStateGuard,
} from './graph/index.js';
export type { PreconditionResult, PreconditionOutcome, VerificationResult } from './graph/index.js';

// Event streaming (Issue #838)
export {
  emitNodeStarted,
  emitNodeResults,
  emitStateUpdated,
  emitStepCompleted,
  emitExecutionComplete,
} from './graph/index.js';

// Workflow Pattern Router (Issue #844)
export { createWorkflowRouter } from './workflow-router.js';
export type { IWorkflowRouter } from './workflow-router.js';
export type {
  WorkflowPattern,
  DependencyStructure,
  TimeConstraint,
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- re-exporting the deprecated alias IS the deprecation path (#5097); removal needs a breaking-change panel
  QualityRequirement,
  TaskSignals,
  RoutingDecision,
  WorkflowRouterOptions,
  PatternOutcome,
  PatternMetrics,
} from './workflow-router-types.js';

export {
  createMetaOrchestrator,
  createAuditLogSink,
  createRecordingSink,
} from './meta-orchestrator.js';
export type {
  IMetaOrchestrator,
  MetaOrchestratorInput,
  MetaDecision,
  ExecutionStrategy,
  MetaSelectionRecord,
  MetaDecisionSink,
  IRecordingMetaDecisionSink,
} from './meta-orchestrator.js';

export {
  StrategyManifestSchema,
  StrategyManifestRegistrySchema,
  StrategyNameSchema,
  AuthorityTierSchema,
  LatencyClassSchema,
  MaturityTierSchema,
  CostProfileSchema,
  STRATEGY_MANIFEST_SCHEMA_VERSION,
  parseStrategyManifest,
  parseStrategyManifestRegistry,
  loadStrategyManifestRegistry,
} from './strategy-manifest.js';
export type {
  StrategyManifest,
  StrategyManifestRegistry,
  StrategyName,
  AuthorityTier,
  LatencyClass,
  MaturityTier,
  CostProfile,
} from './strategy-manifest.js';

// Authority-tier enforcement guard (Epic D, #3841 — ADR-0017)
export {
  ACTION_CLASSES,
  authorityRank,
  permitsAction,
  evaluateAuthority,
  guardAuthority,
  AuthorityRefusalError,
} from './authority-tier-guard.js';
export type {
  ActionClass,
  AuthorityDecision,
  AuthorityRefusalCode,
} from './authority-tier-guard.js';

export {
  createMetaDispatcher,
  createAuditLogOutcomeSink,
  createRecordingOutcomeSink,
  MetaDispatchError,
} from './meta-dispatcher.js';
export type {
  IMetaDispatcher,
  StrategyExecutor,
  StrategyExecutorMap,
  MetaOutcomeRecord,
  MetaOutcomeSink,
  IRecordingMetaOutcomeSink,
  DispatchResult,
  MetaDispatchErrorCode,
} from './meta-dispatcher.js';

// Spec Parser (Issue #847)
export { parseSpec } from './spec-parser.js';
export type {
  ParsedSpec,
  SpecParseError,
  IssueReference,
  FileReference,
  KnownSection,
} from './spec-parser-types.js';
export {
  ParsedSpecSchema,
  IssueReferenceSchema,
  FileReferenceSchema,
  KNOWN_SECTIONS,
} from './spec-parser-types.js';

// Spec Decomposer (Issue #848)
export { decomposeSpec } from './spec-decomposer.js';
export type {
  TaskDag,
  SubtaskNode,
  DagEdge,
  DecomposeError,
  SubtaskType,
  ComplexityLevel,
} from './spec-decomposer-types.js';
export {
  TaskDagSchema,
  SubtaskNodeSchema,
  DagEdgeSchema,
  SubtaskTypeSchema,
  ComplexityLevelSchema,
} from './spec-decomposer-types.js';

// Spec Pipeline (Issue #849, #857)
export { compileSpecToGraph, createDryRunHandler } from './spec-pipeline.js';
export type {
  PipelineError,
  PipelineStage,
  NodeHandlerFactory,
  CompileOptions,
} from './spec-pipeline-types.js';

// Spec Executor (Issue #851, #857)
export { executeSpec } from './spec-executor.js';
export type {
  SpecExecutionResult,
  SpecExecutionError,
  SpecExecutionOptions,
  ExecutionStage,
} from './spec-executor-types.js';

// Failure Analyzer (Issue #852)
export { analyzeFailures } from './failure-analyzer.js';
export type {
  FailureAnalysis,
  CriterionFailure,
  ImprovementSuggestion,
  FailureType,
  AnalysisError,
} from './failure-analyzer-types.js';

// Scenario Validator (Issue #850)
export { validateScenario } from './scenario-validator.js';
export type { ScenarioResult, CriterionResult, ScenarioError } from './scenario-validator-types.js';
export { ScenarioResultSchema, CriterionResultSchema } from './scenario-validator-types.js';

// Task Outcome Tracking (Issue #861)
export type {
  TaskOutcome,
  OutcomeQuery,
  OutcomeSource,
  OutcomeFailureCategory,
  PerformanceSummary,
  GroupStats,
} from './outcomes/index.js';
export {
  TaskOutcomeSchema,
  OutcomeQuerySchema,
  OutcomeFailureCategorySchema,
  categorizeOutcomeError,
  categorizeOutcomeErrorMessage,
  extractNonErrorMessage,
  OutcomeStore,
  getOutcomeStore,
  getOutcomeSummaryText,
  resetOutcomeStore,
  setOutcomeStore,
  PersistentOutcomeStore,
} from './outcomes/index.js';
export type { OutcomeStoreConfig, PersistentOutcomeStoreConfig } from './outcomes/index.js';

// Adaptive Thresholds — Learning Loop (Issue #901, Phase 4)
export { computeAdaptiveThresholds, detectTrend } from './outcomes/index.js';
export type { Trend, AdaptiveThresholdResult } from './outcomes/index.js';
// `emitThresholdUpdate` / `emitTrendDetected` removed in #3022 — see
// outcomes/index.ts for the activate-or-delete rationale.

// Parallel Exploration (Issue #862)
export { executeParallelExploration } from './parallel-exploration.js';
export type { ExploreOptions } from './parallel-exploration.js';
export {
  isParallelEligible,
  createDefaultConfig as createParallelExplorationConfig,
  ParallelExplorationConfigSchema,
} from './parallel-exploration-types.js';
export type {
  PartitionResult,
  ExplorationResult,
  ParallelExplorationConfig,
} from './parallel-exploration-types.js';

// Triangulated Code Review (Issue #864)
export { executeTriangulatedReview } from './triangulated-review.js';
export type { ReviewOptions } from './triangulated-review.js';
export {
  createDefaultReviewConfig,
  TriangulatedReviewConfigSchema,
} from './triangulated-review-types.js';
export type {
  CliReviewPartition,
  DeduplicatedFinding,
  TriangulatedReviewResult,
  TriangulatedReviewConfig,
} from './triangulated-review-types.js';

// Consensus Planning (Issue #863)
export { executeConsensusPlan } from './consensus-plan.js';
export type { PlanOptions } from './consensus-plan.js';
export {
  createDefaultPlanConfig,
  ConsensusPlanConfigSchema,
  PlanStepSchema,
  PlanRiskSchema,
} from './consensus-plan-types.js';
export type {
  PlanStep,
  PlanRisk,
  CliPlan,
  CliPlanPartition,
  AgreedStep,
  Divergence,
  ConsensusPlanResult,
  ConsensusPlanConfig,
} from './consensus-plan-types.js';

// AOrchestra — Dynamic Sub-Agent Creation (Issue #699)
export {
  planAgentTeam,
  MAX_WORKERS_PER_WAVE,
  dispatchWorkers,
  groupByWave,
  composeWorkerPrompt,
  buildLearningsBlock,
  detectConflicts,
  matchTriggers,
  DEFAULT_TRIGGER_TABLE,
  isContextFresh,
  markContextVerified,
  getContextAge,
  DEFAULT_TTL_MS,
} from './aorchestra/index.js';
export type {
  AgentPlan,
  AgentPlanEntry,
  WorkerResult,
  WorkerDispatchOptions,
  ComposeWorkerPromptInput,
  WorkerLearning,
  WorkerConflict,
  TriggerRule,
  ContextEntry,
} from './aorchestra/index.js';

// Checkpointing (Issue #833)
export {
  InMemoryCheckpointStore,
  createCheckpoint,
  createCheckpointStore,
  CHECKPOINT_SCHEMA_VERSION,
} from './graph/index.js';
export type { Checkpoint, CheckpointSummary, ICheckpointStore } from './graph/index.js';
