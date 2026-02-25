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
  type Artifact,
  type ArtifactFilter,
  type ProvenanceEntry,
  type IArtifactStore,
  type ArtifactStoreOptions,
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
