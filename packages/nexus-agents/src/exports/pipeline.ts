/**
 * Pipeline module exports — V2 Pipeline OS types and adapters.
 * @module exports/pipeline
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
  // Plan compiler
  compilePlan,
  type PlanCompileOptions,
  // Pipeline runner
  PipelineRunner,
  type CompiledPipeline,
  type PipelineResult,
  type PipelineExecuteOptions,
  // Plugin types
  PluginManifestSchema,
  StageResultSchema,
  PLUGIN_TRUST_LEVELS,
  type PluginManifest,
  type PluginTrustLevel,
  type PipelinePlugin,
  type StageContext,
  type StageResult,
  type ValidationError as PluginValidationError, // Renamed: core.ts exports class ValidationError
  type RegistrationError,
  type IPluginRegistry,
  // Plugin registry
  PluginRegistry,
  type PluginRegistryOptions,
  // Event bus
  PIPELINE_EVENT_TYPES,
  EventBus,
  type PipelineEvent,
  type PipelineEventType,
  type EventFilter,
  type EventHandler,
  type Unsubscribe,
  type IEventBus,
  type EventBusOptions,
  type ToolInvokedEvent,
  type ToolCompletedEvent,
  // Artifact store
  ArtifactStore,
  getPipelineArtifactStore,
  resetPipelineArtifactStore,
  type Artifact,
  type ArtifactFilter,
  type ProvenanceEntry,
  type IArtifactStore,
  type ArtifactStoreOptions,
  // Policy engine
  PolicyEngine,
  createDefaultPolicyEngine,
  BUILT_IN_RULES,
  type PolicyDecision,
  type PolicyContext,
  type PolicyRule,
  type IPolicyEngine,
  // Feedback loop
  createFeedbackSubscriber,
  // V2 delegate
  createDelegatePipeline,
  delegateInputToTaskContract,
  executeDelegatePipeline,
  checkPipelinePolicy,
  type DelegateInputLike,
  type PipelineMetrics,
  // Core plugins (Issue #921, Phase B)
  CORE_PLUGINS,
  registerCorePlugins,
  createCorePluginRegistry,
  getPipelinePluginRegistry,
  resetPipelinePluginRegistry,
  type CorePluginRegistrationResult,
  // EventBus bridge (Issue #922, Phase C)
  createEventBusBridge,
  type EventBusBridgeOptions,
  type PipelineBridgeResult,
  // Policy evaluator (Issue #923, Phase D)
  evaluatePolicy as evaluatePipelinePolicy, // Renamed: mcp.ts exports evaluatePolicy
  getPolicyMode,
  type PolicyMode as PipelinePolicyMode, // Renamed: mcp.ts exports PolicyMode
  type PolicyEvaluatorOptions,
  type PolicyEvalResult,
  type PolicyViolation as PipelinePolicyViolation, // Renamed: security.ts exports PolicyViolation
  // V2 orchestrate (Issue #924, Phase E)
  orchestrateInputToTaskContract,
  executeOrchestratePipeline,
  type OrchestrateInputLike,
  // V2 config (Issue #925, Phase F)
  resolveV2Config,
  type V2Mode,
  type V2Config,
  // Dev Pipeline — multi-agent development workflow (#1684)
  runDevPipeline,
  type DevPipelineStages,
  type DevPipelineOptions,
  type DevPipelineResult,
  type PipelineMode,
  type PipelineTask,
  type PipelineRole,
  type VoteResult,
  type QaReviewResult,
  createAgentStages,
  flushPipelineMemory,
  type AgentExecutorConfig,
  executeExpert,
  type ExpertBridgeResult,
  // Research Trigger (#1715)
  checkForResearchTriggers,
  type ResearchTriggerConfig,
  // Pipeline Checkpoint (#1703)
  saveStageCheckpoint,
  loadCheckpointState,
  cleanupCheckpoint,
  checkpointToResult,
  type PipelineCheckpointState,
  type PipelineStage as CheckpointPipelineStage, // Renamed: orchestration.ts exports PipelineStage from graph
  type PipelineStageData,
  // Pipeline Observability (#1734 Phase 1.1)
  emitStageStarted,
  emitStageCompleted,
  emitStageFailed,
  emitPipelineStageEvent,
  type StageStartedOptions,
  type StageCompletedOptions,
  type StageFailedOptions,
  // Iterative Consensus (#1734 Phase 1.2)
  runIterativeConsensus,
  type IterativeConsensusConfig,
  type IterativeConsensusResult,
  // Stage Types (#1735 Phase 2)
  PIPELINE_STATE_KEYS,
  compilePipelineGraph,
  type IPipelineStage,
  type PipelineEdge,
  type PipelineContext,
  type StageOutput,
  type PipelineTemplate,
  type PipelineGraphResult,
  type StageRegistry,
  // Templates (#1735 Phase 2)
  DEV_PIPELINE_TEMPLATE,
  RESEARCH_PIPELINE_TEMPLATE,
  AUDIT_PIPELINE_TEMPLATE,
  GENERAL_PIPELINE_TEMPLATE,
  PIPELINE_TEMPLATES,
  getTemplate,
  listTemplateIds,
  // Stage Wrappers (#1735 Phase 2)
  createDevStageRegistry,
  // Graph Pipeline Runner (#1735 Phase 2)
  runGraphPipeline,
  extractStateValue,
  type GraphPipelineOptions,
  type GraphPipelineResult,
  // Adaptive Orchestrator (#1736 Phase 3)
  runAdaptiveOrchestrator,
  classifyTask,
  type AdaptiveOrchestratorOptions,
  type AdaptiveOrchestratorResult,
  type TaskClassification,
  type PipelineType,
  // Incomplete Result (#1737 Phase 4)
  isIncompleteResult,
  createIncompleteResult,
  canPipelineProceed,
  filterBySeverity,
  type IncompleteResult,
  type IncompleteSeverity,
  // Shared Memory (#1737 Phase 4)
  SharedMemoryStore,
  type SharedMemoryEntry,
  type SharedMemoryTag,
  // Dynamic Expert (#1737 Phase 4)
  DynamicExpertManager,
  MAX_DYNAMIC_EXPERTS,
  type DynamicExpertSpec,
  type DynamicExpert,
} from '../pipeline/index.js';
