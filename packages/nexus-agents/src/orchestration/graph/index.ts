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
  NodeContext,
  NodeReturn,
  Interrupt,
  Command,
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
} from './graph-types.js';
export {
  START,
  END,
  formatCompileError,
  interrupt,
  isInterrupt,
  isCommand,
} from './graph-types.js';

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
export { executeGraph, resumeFromCheckpoint } from './graph-executor.js';

// Hooks (Issue #994 + #997)
export type { PreconditionResult, PreconditionOutcome, VerificationResult } from './graph-hooks.js';
export {
  runPreconditions,
  runVerification,
  createStateComparisonVerifier,
  createStateGuard,
} from './graph-hooks.js';

// Checkpointing (Issue #833, HITL extension #1895)
export type {
  Checkpoint,
  CheckpointInterrupt,
  CheckpointSummary,
  ICheckpointStore,
} from './checkpoint-types.js';
export { CHECKPOINT_SCHEMA_VERSION } from './checkpoint-types.js';
export {
  InMemoryCheckpointStore,
  createCheckpoint,
  createCheckpointStore,
} from './checkpoint-store.js';
