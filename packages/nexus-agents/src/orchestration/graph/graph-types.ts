/**
 * nexus-agents/orchestration - Graph Workflow Types
 *
 * Type definitions for graph-based workflow orchestration inspired by
 * LangGraph's StateGraph pattern. Enables DAG-based workflows with
 * conditional edges, typed state reducers, and fan-out/fan-in.
 *
 * @module orchestration/graph/graph-types
 * (Source: Issue #831 — Graph-based workflow orchestration)
 */

import type { Result } from '../../core/index.js';
import type { ICheckpointStore } from './checkpoint-types.js';

// ============================================================================
// State & Reducers
// ============================================================================

/**
 * State reducer controls how values merge when multiple nodes write
 * to the same state field. Inspired by LangGraph's Annotated reducers.
 */
export type StateReducer<T = unknown> =
  | { type: 'overwrite' }
  | { type: 'append' }
  | { type: 'custom'; merge: (existing: T, incoming: T) => T };

/**
 * Schema entry for a single state field — name, default, and merge strategy.
 */
export interface StateFieldSchema<T = unknown> {
  readonly defaultValue: T;
  readonly reducer: StateReducer<T>;
}

/**
 * State schema defines all fields and their reducers.
 */
export type StateSchema = Record<string, StateFieldSchema>;

/**
 * Flattened state values at runtime (one value per field).
 */
export type GraphState = Record<string, unknown>;

// ============================================================================
// Nodes & Edges
// ============================================================================

/**
 * Handler function for a graph node. Receives current state,
 * returns partial state updates.
 */
export type NodeHandler = (state: Readonly<GraphState>) => Promise<Partial<GraphState>>;

/**
 * A node in the workflow graph.
 */
export interface GraphNode {
  readonly id: string;
  readonly handler: NodeHandler;
  readonly timeout?: number | undefined;
  readonly retries?: number | undefined;
}

/** Special sentinel for the graph entry point. */
export const START = '__START__' as const;

/** Special sentinel for the graph exit point. */
export const END = '__END__' as const;

/**
 * Edge types in the graph.
 */
export type GraphEdge =
  | {
      readonly type: 'fixed';
      readonly from: string;
      readonly to: string;
      readonly maxTraversals?: number;
    }
  | {
      readonly type: 'conditional';
      readonly from: string;
      readonly router: (state: Readonly<GraphState>) => string;
      readonly targets: readonly string[];
      readonly maxTraversals?: number;
    };

// ============================================================================
// Compiled Graph
// ============================================================================

/**
 * Compiled graph definition — validated and ready for execution.
 * Immutable after compilation.
 */
export interface CompiledGraph {
  readonly nodes: ReadonlyMap<string, GraphNode>;
  readonly edges: readonly GraphEdge[];
  readonly stateSchema: Readonly<StateSchema>;
  readonly entryEdges: readonly GraphEdge[];
}

/**
 * Result of a single node execution.
 */
export interface NodeResult {
  readonly nodeId: string;
  readonly stateUpdates: Partial<GraphState>;
  readonly durationMs: number;
  readonly status: 'success' | 'failed' | 'skipped';
  readonly error?: string;
}

/**
 * Result of a full graph execution.
 */
export interface GraphExecutionResult {
  readonly finalState: Readonly<GraphState>;
  readonly nodeResults: readonly NodeResult[];
  readonly totalDurationMs: number;
  readonly stepsExecuted: number;
}

/**
 * Options for graph execution.
 */
export interface GraphExecuteOptions {
  readonly signal?: AbortSignal;
  readonly timeout?: number;
  readonly maxSteps?: number;
  readonly onNodeComplete?: (result: NodeResult) => void;
  /** Optional checkpoint store for durable execution (Issue #837). */
  readonly checkpointStore?: ICheckpointStore;
  /** Execution ID for checkpoint grouping. Required with checkpointStore. */
  readonly executionId?: string;
  /** Event listener for streaming observation (Issue #838). */
  readonly onEvent?: (event: GraphEvent) => void;
}

// ============================================================================
// Graph Events (Issue #838)
// ============================================================================

/** Discriminated union of graph lifecycle events for streaming observation. */
export type GraphEvent =
  | {
      readonly type: 'node_started';
      readonly nodeId: string;
      readonly stepNumber: number;
      readonly timestamp: number;
    }
  | {
      readonly type: 'node_completed';
      readonly nodeId: string;
      readonly stepNumber: number;
      readonly durationMs: number;
      readonly resultKeys: readonly string[];
      readonly timestamp: number;
    }
  | {
      readonly type: 'node_error';
      readonly nodeId: string;
      readonly stepNumber: number;
      readonly error: string;
      readonly timestamp: number;
    }
  | {
      readonly type: 'state_updated';
      readonly stepNumber: number;
      readonly updatedKeys: readonly string[];
      readonly timestamp: number;
    }
  | {
      readonly type: 'step_completed';
      readonly stepNumber: number;
      readonly nodesExecuted: number;
      readonly timestamp: number;
    }
  | {
      readonly type: 'execution_complete';
      readonly totalSteps: number;
      readonly totalNodes: number;
      readonly durationMs: number;
      readonly timestamp: number;
    };

// ============================================================================
// Builder Error
// ============================================================================

/**
 * Error type for graph compilation failures.
 */
export type GraphCompileError =
  | { type: 'duplicate_node'; nodeId: string }
  | { type: 'missing_node'; nodeId: string; referencedBy: string }
  | { type: 'cycle_detected'; path: readonly string[] }
  | { type: 'no_entry'; message: string }
  | { type: 'unreachable_node'; nodeId: string }
  | { type: 'missing_reducer'; field: string };

/** Format a compile error as a human-readable string. */
export function formatCompileError(error: GraphCompileError): string {
  switch (error.type) {
    case 'duplicate_node':
      return `Duplicate node ID: '${error.nodeId}'`;
    case 'missing_node':
      return `Edge references non-existent node '${error.nodeId}' (from '${error.referencedBy}')`;
    case 'cycle_detected':
      return `Cycle detected: ${error.path.join(' -> ')}`;
    case 'no_entry':
      return `No entry point: ${error.message}`;
    case 'unreachable_node':
      return `Node '${error.nodeId}' is unreachable from START`;
    case 'missing_reducer':
      return `State field '${error.field}' has no reducer defined`;
  }
}

/**
 * Result type for graph compilation.
 */
export type CompileResult = Result<CompiledGraph, GraphCompileError>;
