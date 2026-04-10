/**
 * Pipeline module — V2 Pipeline OS core types and execution.
 *
 * @see docs/v2/04-v2-architecture-pipeline-os.md
 * @module pipeline
 */
export {
  // Schemas
  TaskContractSchema,
  PlanContractSchema,
  StageSpecSchema,
  PolicyGateSpecSchema,
  CostEstimateSchema,
  ArtifactRefSchema,
  // Constants
  TASK_STATUSES,
  STAGE_TYPES,
  ARTIFACT_TYPES,
  // Types
  type TaskContract,
  type TaskStatus,
  type PlanContract,
  type StageSpec,
  type StageType,
  type PolicyGateSpec,
  type CostEstimate,
  type ArtifactRef,
  type ArtifactType,
} from './task-contract.js';

export {
  analysisToTaskContract,
  taskContractToToolResponse,
  type TaskToolResponse,
} from './v1-adapters.js';

export { compilePlan, type PlanCompileOptions } from './plan-compiler.js';

export {
  PipelineRunner,
  DEFAULT_RUNS_DIR,
  type CompiledPipeline,
  type PipelineResult,
  type PipelineExecuteOptions,
  type StepOutcome,
} from './pipeline-runner.js';

export {
  // Schemas
  PluginManifestSchema,
  StageResultSchema,
  // Constants
  PLUGIN_TRUST_LEVELS,
  // Types
  type PluginManifest,
  type PluginTrustLevel,
  type PipelinePlugin,
  type StageContext,
  type StageResult,
  type ValidationError,
  type RegistrationError,
  type IPluginRegistry,
} from './plugin-types.js';

export { PluginRegistry, type PluginRegistryOptions } from './plugin-registry.js';

export {
  PIPELINE_EVENT_TYPES,
  type PipelineEvent,
  type PipelineEventType,
  type EventFilter,
  type EventHandler,
  type Unsubscribe,
  type IEventBus,
  type ToolInvokedEvent,
  type ToolCompletedEvent,
} from './event-types.js';

export {
  EventBus,
  getPipelineEventBus,
  resetPipelineEventBus,
  type EventBusOptions,
} from './event-bus.js';

export {
  ArtifactStore,
  getPipelineArtifactStore,
  resetPipelineArtifactStore,
  getCheckpointStore,
  resetCheckpointStore,
  type Artifact,
  type ArtifactFilter,
  type ProvenanceEntry,
  type IArtifactStore,
  type ArtifactStoreOptions,
  type StageCheckpoint,
  type CheckpointPort,
  type CheckpointStoreOptions,
} from './artifact-store.js';

export {
  PolicyEngine,
  createDefaultPolicyEngine,
  BUILT_IN_RULES,
  type PolicyDecision,
  type PolicyContext,
  type PolicyRule,
  type IPolicyEngine,
} from './policy-engine.js';

export { createFeedbackSubscriber } from './feedback-subscriber.js';

export {
  createDelegatePipeline,
  delegateInputToTaskContract,
  executeDelegatePipeline,
  checkPipelinePolicy,
} from './v2-delegate.js';
export type { DelegateInputLike, PipelineMetrics } from './v2-delegate.js';

export {
  CORE_PLUGINS,
  TASK_ANALYZER_PLUGIN,
  MODEL_ROUTER_PLUGIN,
  CLI_EXECUTOR_PLUGIN,
  registerCorePlugins,
  createCorePluginRegistry,
  getPipelinePluginRegistry,
  resetPipelinePluginRegistry,
} from './core-plugins.js';
export type { CorePluginRegistrationResult } from './core-plugins.js';

export {
  createEventBusBridge,
  type EventBusBridgeOptions,
  type PipelineBridgeResult,
} from './event-bus-bridge.js';

export {
  evaluatePolicy,
  getPolicyMode,
  type PolicyMode,
  type PolicyEvaluatorOptions,
  type PolicyEvalResult,
  type PolicyViolation,
} from './policy-evaluator.js';

export { orchestrateInputToTaskContract, executeOrchestratePipeline } from './v2-orchestrate.js';
export type { OrchestrateInputLike } from './v2-orchestrate.js';

export { resolveV2Config, type V2Mode, type V2Config } from './v2-config.js';

export {
  ExecutionTraceEntrySchema,
  ErrorTaxonomy,
  type ExecutionTraceEntry,
  type ErrorTaxonomyType,
} from './trace-schema.js';

export { TraceWriter, type TraceWriterOptions } from './trace-writer.js';

// Dev Pipeline — multi-agent development workflow (#1684)
export { runDevPipeline } from './dev-pipeline.js';
export type {
  DevPipelineStages,
  DevPipelineOptions,
  PipelineMode,
  DevPipelineResult,
  PipelineTask,
  PipelineRole,
  VoteResult,
  QaReviewResult,
} from './dev-pipeline.js';
export { runQualityPipeline } from './quality-pipeline.js';
export type { StageConfig, PipelineRunResult } from './quality-pipeline.js';
export { checkSecurityScan } from './security-gate.js';
export { executeExpert } from './expert-bridge.js';
export type { ExpertBridgeResult } from './expert-bridge.js';
export { createAgentStages, flushPipelineMemory } from './agent-executor.js';
export type { AgentExecutorConfig } from './agent-executor.js';
export { createTaskTracker, createAutoTaskTracker, detectBackend } from './task-tracker.js';
export type {
  ITaskTracker,
  TrackerBackend,
  TrackedTask,
  TaskTrackerConfig,
} from './task-tracker.js';

// Research Trigger — auto-create pipeline tasks from discoveries (#1715)
export { checkForResearchTriggers } from './research-trigger.js';
export type { ResearchTriggerConfig } from './research-trigger.js';

// Pipeline Checkpoint — crash recovery via stage persistence (#1703)
export {
  saveStageCheckpoint,
  loadCheckpointState,
  cleanupCheckpoint,
  checkpointToResult,
} from './pipeline-checkpoint.js';
export type {
  PipelineStage,
  PipelineCheckpointEntry,
  PipelineStageData,
  PipelineCheckpointState,
} from './pipeline-checkpoint.js';

// QA Loop — reusable implement→review→iterate pattern (#1707)
export { runQaLoop, DEFAULT_MAX_QA_ITERATIONS } from '../orchestration/qa-loop.js';
export type { QaVerdict, QaReviewOutput, QaLoopResult } from '../orchestration/qa-loop.js';

// Pipeline Observability — shared stage event emission (#1734)
export {
  emitStageStarted,
  emitStageCompleted,
  emitStageFailed,
  emitPipelineStageEvent,
} from './pipeline-observability.js';
export type {
  StageStartedOptions,
  StageCompletedOptions,
  StageFailedOptions,
} from './pipeline-observability.js';

// Iterative Consensus — reusable vote loop (#1734 Phase 1.2)
export { runIterativeConsensus } from './iterative-consensus.js';
export type { IterativeConsensusConfig, IterativeConsensusResult } from './iterative-consensus.js';

// Stage Types — shared interfaces for graph-backed pipelines (#1735 Phase 2)
export { PIPELINE_STATE_KEYS } from './stage-types.js';
export type {
  IPipelineStage,
  PipelineContext,
  StageOutput,
  PipelineTemplate,
  PipelineEdge,
} from './stage-types.js';

// Pipeline Graph Compiler (#1735 Phase 2)
export { compilePipelineGraph } from './pipeline-graph.js';
export type { PipelineGraphResult, StageRegistry } from './pipeline-graph.js';

// Pipeline Templates (#1735 Phase 2)
export {
  DEV_PIPELINE_TEMPLATE,
  RESEARCH_PIPELINE_TEMPLATE,
  AUDIT_PIPELINE_TEMPLATE,
  PIPELINE_TEMPLATES,
  getTemplate,
  listTemplateIds,
} from './templates.js';

// Stage Wrappers — adapt DevPipelineStages to IPipelineStage (#1735 Phase 2)
export { createDevStageRegistry } from './stage-wrappers.js';

// Graph Pipeline Runner — execute pipelines via graph executor (#1735 Phase 2)
export { runGraphPipeline, extractStateValue } from './graph-pipeline-runner.js';
export type { GraphPipelineOptions, GraphPipelineResult } from './graph-pipeline-runner.js';

// Adaptive Orchestrator — task-driven pipeline selection (#1736 Phase 3)
export { runAdaptiveOrchestrator, classifyTask } from './adaptive-orchestrator.js';
export type {
  AdaptiveOrchestratorOptions,
  AdaptiveOrchestratorResult,
  TaskClassification,
  PipelineType,
} from './adaptive-orchestrator.js';

// Incomplete Result — typed partial completion (#1737 Phase 4)
export {
  isIncompleteResult,
  createIncompleteResult,
  canPipelineProceed,
  filterBySeverity,
} from './incomplete-result.js';
export type { IncompleteResult, IncompleteSeverity } from './incomplete-result.js';

// Shared Memory — cross-stage knowledge propagation (#1737 Phase 4)
export { SharedMemoryStore } from './shared-memory.js';
export type { SharedMemoryEntry, SharedMemoryTag } from './shared-memory.js';

// Dynamic Expert — bounded runtime expert creation (#1737 Phase 4)
export { DynamicExpertManager, MAX_DYNAMIC_EXPERTS } from './dynamic-expert.js';
export type { DynamicExpertSpec, DynamicExpert } from './dynamic-expert.js';

// Replay — decision trace comparison (#1688)
export { parseTraceJsonl, extractDecisions, compareDecisions } from '../replay/replay-executor.js';
export type { TracedDecision, ReplayComparison, ReplaySummary } from '../replay/replay-executor.js';
