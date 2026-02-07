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

// Checkpointing (Issue #833)
export {
  InMemoryCheckpointStore,
  createCheckpoint,
  createCheckpointStore,
  CHECKPOINT_SCHEMA_VERSION,
} from './graph/index.js';
export type { Checkpoint, CheckpointSummary, ICheckpointStore } from './graph/index.js';
