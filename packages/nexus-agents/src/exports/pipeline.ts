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
  // Adapter functions
  analysisToTaskContract,
  taskContractToToolResponse,
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
  type TaskToolResponse,
  // Plan compiler
  compilePlan,
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
  // Artifact store
  ArtifactStore,
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
  type DelegateInputLike,
  type PipelineMetrics,
  // Core plugins (Issue #921, Phase B)
  CORE_PLUGINS,
  registerCorePlugins,
  createCorePluginRegistry,
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
} from '../pipeline/index.js';
