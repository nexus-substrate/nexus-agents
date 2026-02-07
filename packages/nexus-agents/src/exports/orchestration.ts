/**
 * Orchestration exports - Factory, graph workflows, and spec-driven execution
 * Split from index.ts for file size compliance (Issue #285)
 */

// Factory and adapters
export {
  OrchestratorFactory,
  WorkflowOrchestratorAdapter,
  createOrchestratorFactory,
  type OrchestratorFactoryConfig,
  type WorkflowAdapterConfig,
} from '../orchestration/index.js';

// Core orchestrator types
export type {
  IOrchestrator,
  IOrchestratorFactory,
  OrchestratorType,
  OrchestratorDefinition,
  OrchestratorExecuteOptions,
  OrchestratorStep,
  OrchestratorResult,
  OrchestratorErrorCode,
} from '../orchestration/index.js';
export { OrchestratorError } from '../orchestration/index.js';

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
} from '../orchestration/index.js';
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
} from '../orchestration/index.js';

// Event streaming (Issue #838)
export {
  emitNodeStarted,
  emitNodeResults,
  emitStateUpdated,
  emitStepCompleted,
  emitExecutionComplete,
} from '../orchestration/index.js';

// Checkpointing (Issue #833)
export {
  InMemoryCheckpointStore,
  createCheckpoint,
  createCheckpointStore,
  CHECKPOINT_SCHEMA_VERSION,
} from '../orchestration/index.js';
export type { Checkpoint, CheckpointSummary, ICheckpointStore } from '../orchestration/index.js';

// Workflow Pattern Router (Issue #844)
export { createWorkflowRouter } from '../orchestration/index.js';
export type { IWorkflowRouter } from '../orchestration/index.js';
export type {
  WorkflowPattern,
  DependencyStructure,
  TimeConstraint,
  QualityRequirement,
  TaskSignals,
  RoutingDecision,
  WorkflowRouterOptions,
  PatternOutcome,
  PatternMetrics,
} from '../orchestration/index.js';

// Spec Parser (Issue #847)
export {
  parseSpec,
  ParsedSpecSchema,
  IssueReferenceSchema,
  FileReferenceSchema,
  KNOWN_SECTIONS,
} from '../orchestration/index.js';
export type {
  ParsedSpec,
  SpecParseError,
  IssueReference,
  FileReference,
  KnownSection,
} from '../orchestration/index.js';

// Spec Decomposer (Issue #848)
export {
  decomposeSpec,
  TaskDagSchema,
  SubtaskNodeSchema,
  DagEdgeSchema,
  SubtaskTypeSchema,
  ComplexityLevelSchema,
} from '../orchestration/index.js';
export type {
  TaskDag,
  SubtaskNode,
  DagEdge,
  DecomposeError,
  SubtaskType,
  ComplexityLevel,
} from '../orchestration/index.js';

// Spec Pipeline (Issue #849)
export { compileSpecToGraph } from '../orchestration/index.js';
export type { PipelineError, PipelineStage } from '../orchestration/index.js';

// Spec Executor (Issue #851)
export { executeSpec } from '../orchestration/index.js';
export type {
  SpecExecutionResult,
  SpecExecutionError,
  ExecutionStage,
} from '../orchestration/index.js';

// Scenario Validator (Issue #850)
export {
  validateScenario,
  ScenarioResultSchema,
  CriterionResultSchema,
} from '../orchestration/index.js';
export type { ScenarioResult, CriterionResult, ScenarioError } from '../orchestration/index.js';

// Failure Analyzer (Issue #852)
export { analyzeFailures } from '../orchestration/index.js';
export type {
  FailureAnalysis,
  CriterionFailure,
  ImprovementSuggestion,
  FailureType,
  AnalysisError,
} from '../orchestration/index.js';
