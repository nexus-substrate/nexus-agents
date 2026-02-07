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
} from './graph-types.js';
export { START, END, formatCompileError } from './graph-types.js';

// Builder
export { GraphBuilder, overwrite, append, customReducer } from './graph-builder.js';

// Executor
export { executeGraph } from './graph-executor.js';
