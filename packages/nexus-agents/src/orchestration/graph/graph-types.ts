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
// Node Hooks (Issue #994 + #997)
// ============================================================================

/**
 * Context passed to node hooks (preconditions and verification).
 * Provides read-only access to current execution state.
 */
export interface NodeHookContext {
  readonly nodeId: string;
  readonly state: Readonly<GraphState>;
  readonly stepNumber: number;
}

/**
 * Error type for hook failures — identifies which hook failed and why.
 */
export interface HookError {
  readonly hookName: string;
  readonly nodeId: string;
  readonly message: string;
}

/**
 * Hook function signature. Returns ok(void) on success, err(HookError) on failure.
 */
export type NodeHook = (ctx: NodeHookContext) => Promise<Result<void, HookError>>;

/**
 * Configuration for a precondition hook.
 * Preconditions run before node execution.
 * If a required precondition fails, the node is skipped.
 */
export interface PreconditionConfig {
  readonly name: string;
  readonly hook: NodeHook;
  /** If true (default), failure prevents node execution. */
  readonly required?: boolean | undefined;
}

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

// ----------------------------------------------------------------------------
// HITL primitives (#1895) — additive, semver-minor
// ----------------------------------------------------------------------------

/**
 * Marks a deliberate pause in graph execution. Returned (or thrown) by a node
 * to halt the super-step loop and surface `value` to a human. Resumption is
 * keyed by `id`: the caller provides `{[id]: resumeValue}` to
 * `resumeFromCheckpoint(...)`, and the value is delivered to the same node via
 * its NodeContext on the next run.
 *
 * Modeled on langchain-ai/langgraph's Interrupt primitive (#1895).
 */
export interface Interrupt {
  readonly type: 'interrupt';
  /** Context shown to the human / written to the checkpoint metadata. */
  readonly value: unknown;
  /** Stable identifier — matched by the resume() call to inject the value. */
  readonly id: string;
}

/**
 * Construct an Interrupt value. Helper for ergonomic NodeHandler returns.
 */
export function interrupt(id: string, value: unknown): Interrupt {
  return { type: 'interrupt', id, value };
}

/**
 * Type guard — `true` when the candidate is an Interrupt envelope.
 */
export function isInterrupt(candidate: unknown): candidate is Interrupt {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    (candidate as { type?: unknown }).type === 'interrupt' &&
    typeof (candidate as { id?: unknown }).id === 'string'
  );
}

/**
 * Re-entry primitive returned by a NodeHandler. Combines state mutation
 * (`update`) with optional dynamic redirection (`goto`, Phase 2 — not yet
 * wired) into a single typed envelope.
 *
 * In Phase 1 of #1895, only `update` is honored by the executor. `goto` is
 * accepted in the type to avoid a breaking change when it lands.
 */
export interface Command {
  readonly type: 'command';
  /** State mutations to merge via the standard reducer pipeline. */
  readonly update?: Partial<GraphState>;
  /** Phase 2 — node ID to redirect to. Currently ignored by the executor. */
  readonly goto?: string;
}

/**
 * Type guard — `true` when the candidate is a Command envelope.
 */
export function isCommand(candidate: unknown): candidate is Command {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    (candidate as { type?: unknown }).type === 'command'
  );
}

/**
 * Per-execution context passed to NodeHandler. Currently just delivers values
 * provided to `resumeFromCheckpoint(...)` — the node sees `{interrupt_id:
 * resumed_value}` on the run that follows the resume call.
 */
export interface NodeContext {
  /**
   * Values supplied to the most recent resume() call, keyed by interrupt id.
   * Empty object when not resuming. Frozen.
   */
  readonly resumeValues: Readonly<Record<string, unknown>>;
}

/** Allowed return shapes for a NodeHandler. */
export type NodeReturn = Partial<GraphState> | Interrupt | Command;

/**
 * Handler function for a graph node. Receives current state and an optional
 * per-run context, returns either:
 *   - `Partial<GraphState>` (legacy, common case) — merged via reducers
 *   - `Command` — `update` portion is merged via reducers
 *   - `Interrupt` — pauses the graph; emits checkpoint with interrupt metadata
 *
 * The `ctx` parameter is optional — pre-#1895 handlers that take only `state`
 * remain valid (additive widening).
 */
export type NodeHandler = (state: Readonly<GraphState>, ctx?: NodeContext) => Promise<NodeReturn>;

/**
 * A node in the workflow graph.
 */
export interface GraphNode {
  readonly id: string;
  readonly handler: NodeHandler;
  readonly timeout?: number | undefined;
  readonly retries?: number | undefined;
  /** Precondition hooks run before node execution (Issue #997). */
  readonly preconditions?: readonly PreconditionConfig[] | undefined;
  /** Post-step verification hook run after node execution (Issue #994). */
  readonly verify?: NodeHook | undefined;
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
  readonly status: 'success' | 'failed' | 'skipped' | 'interrupted';
  readonly error?: string;
  /** Set when the node returned an Interrupt envelope (#1895). */
  readonly interrupt?: Interrupt;
}

/**
 * Result of a full graph execution.
 */
export interface GraphExecutionResult {
  readonly finalState: Readonly<GraphState>;
  readonly nodeResults: readonly NodeResult[];
  readonly totalDurationMs: number;
  readonly stepsExecuted: number;
  /**
   * Set when execution paused on an Interrupt return. The checkpoint
   * referenced here can be passed to `resumeFromCheckpoint(...)` along with a
   * matching `{[interruptId]: resumeValue}` map. (#1895)
   */
  readonly halted?: {
    readonly checkpointId: string;
    readonly nodeId: string;
    readonly interruptId: string;
    readonly value: unknown;
  };
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
  /**
   * Values supplied for HITL resume. Keyed by Interrupt id; passed to each
   * NodeHandler via its NodeContext on this run only. Empty when not
   * resuming. (#1895)
   */
  readonly resumeValues?: Readonly<Record<string, unknown>>;
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
    }
  | {
      readonly type: 'hook_started';
      readonly nodeId: string;
      readonly hookName: string;
      readonly hookPhase: 'precondition' | 'verify';
      readonly stepNumber: number;
      readonly timestamp: number;
    }
  | {
      readonly type: 'hook_completed';
      readonly nodeId: string;
      readonly hookName: string;
      readonly hookPhase: 'precondition' | 'verify';
      readonly durationMs: number;
      readonly stepNumber: number;
      readonly timestamp: number;
    }
  | {
      readonly type: 'hook_failed';
      readonly nodeId: string;
      readonly hookName: string;
      readonly hookPhase: 'precondition' | 'verify';
      readonly error: string;
      readonly stepNumber: number;
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
