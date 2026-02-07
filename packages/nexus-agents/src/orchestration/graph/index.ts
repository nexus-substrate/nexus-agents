/**
 * nexus-agents/orchestration/graph - Graph Workflow Module
 *
 * DAG-based workflow orchestration with conditional edges,
 * typed state reducers, and parallel super-step execution.
 *
 * @module orchestration/graph
 * (Source: Issue #831 — Graph-based workflow orchestration)
 */

// Types
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
} from './graph-types.js';
export { START, END, formatCompileError } from './graph-types.js';

// Events (Issue #838)
export {
  emitNodeStarted,
  emitNodeResults,
  emitStateUpdated,
  emitStepCompleted,
  emitExecutionComplete,
} from './graph-events.js';

// Builder
export { GraphBuilder, overwrite, append, customReducer } from './graph-builder.js';

// Executor
export { executeGraph } from './graph-executor.js';

// Checkpointing (Issue #833)
export type { Checkpoint, CheckpointSummary, ICheckpointStore } from './checkpoint-types.js';
export { CHECKPOINT_SCHEMA_VERSION } from './checkpoint-types.js';
export {
  InMemoryCheckpointStore,
  createCheckpoint,
  createCheckpointStore,
} from './checkpoint-store.js';
