/**
 * nexus-agents/orchestration - Orchestration Module
 *
 * Unified orchestration layer providing canonical IOrchestrator interface
 * for all orchestration strategies (workflow, tech_lead, puppeteer).
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
} from './graph/index.js';

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
  QualityRequirement,
  TaskSignals,
  RoutingDecision,
  WorkflowRouterOptions,
  PatternOutcome,
  PatternMetrics,
} from './workflow-router-types.js';

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

// Spec Pipeline (Issue #849)
export { compileSpecToGraph } from './spec-pipeline.js';
export type { PipelineError, PipelineStage } from './spec-pipeline-types.js';

// Spec Executor (Issue #851)
export { executeSpec } from './spec-executor.js';
export type {
  SpecExecutionResult,
  SpecExecutionError,
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

// Checkpointing (Issue #833)
export {
  InMemoryCheckpointStore,
  createCheckpoint,
  createCheckpointStore,
  CHECKPOINT_SCHEMA_VERSION,
} from './graph/index.js';
export type { Checkpoint, CheckpointSummary, ICheckpointStore } from './graph/index.js';
