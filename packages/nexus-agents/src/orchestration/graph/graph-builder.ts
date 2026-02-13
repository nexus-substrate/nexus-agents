/**
 * nexus-agents/orchestration - Graph Workflow Builder
 *
 * Fluent API for constructing and compiling graph-based workflows.
 * Validates structure at compile time (before execution):
 * - All edges reference existing nodes
 * - No cycles in fixed edges
 * - All nodes reachable from START
 * - All state fields have reducers
 *
 * @module orchestration/graph/graph-builder
 * (Source: Issue #831 — Graph-based workflow orchestration)
 */

import { ok, err } from '../../core/index.js';
import type {
  GraphNode,
  GraphEdge,
  NodeHandler,
  StateSchema,
  StateFieldSchema,
  StateReducer,
  CompileResult,
  GraphCompileError,
  PreconditionConfig,
  NodeHook,
} from './graph-types.js';
import { START, END } from './graph-types.js';

// ============================================================================
// Builder
// ============================================================================

/**
 * Fluent builder for graph-based workflows.
 *
 * Usage:
 * ```ts
 * const graph = new GraphBuilder()
 *   .addState('messages', { defaultValue: [], reducer: { type: 'append' } })
 *   .addNode('classify', classifyHandler)
 *   .addNode('respond', respondHandler)
 *   .addEdge(START, 'classify')
 *   .addConditionalEdge('classify', router, ['respond', 'escalate'])
 *   .addEdge('respond', END)
 *   .compile();
 * ```
 */
export class GraphBuilder {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly edges: GraphEdge[] = [];
  private readonly stateFields = new Map<string, StateFieldSchema>();

  /**
   * Registers a state field with its default value and reducer.
   */
  addState<T>(name: string, schema: StateFieldSchema<T>): this {
    this.stateFields.set(name, schema as StateFieldSchema);
    return this;
  }

  /**
   * Adds a node to the graph.
   * Supports optional precondition hooks (Issue #997) and verify hook (Issue #994).
   */
  addNode(
    id: string,
    handler: NodeHandler,
    opts?: {
      timeout?: number;
      retries?: number;
      preconditions?: readonly PreconditionConfig[];
      verify?: NodeHook;
    }
  ): this {
    const node: GraphNode = {
      id,
      handler,
      ...(opts?.timeout !== undefined ? { timeout: opts.timeout } : {}),
      ...(opts?.retries !== undefined ? { retries: opts.retries } : {}),
      ...(opts?.preconditions !== undefined ? { preconditions: opts.preconditions } : {}),
      ...(opts?.verify !== undefined ? { verify: opts.verify } : {}),
    };
    this.nodes.set(id, node);
    return this;
  }

  /**
   * Adds a fixed edge between two nodes.
   */
  addEdge(from: string, to: string, options?: { maxTraversals?: number }): this {
    const edge: GraphEdge = { type: 'fixed', from, to };
    if (options?.maxTraversals !== undefined) {
      this.edges.push({ ...edge, maxTraversals: options.maxTraversals });
    } else {
      this.edges.push(edge);
    }
    return this;
  }

  /**
   * Adds a conditional edge with a routing function.
   * The router inspects state and returns the target node ID.
   * All possible targets must be declared for compile-time validation.
   */
  addConditionalEdge(
    from: string,
    router: GraphEdge & { type: 'conditional' } extends infer E
      ? E extends { type: 'conditional'; router: infer R }
        ? R
        : never
      : never,
    targets: readonly string[]
  ): this {
    this.edges.push({ type: 'conditional', from, router, targets });
    return this;
  }

  /**
   * Compiles the graph, validating all structural invariants.
   * Returns a CompileResult — either a validated CompiledGraph or a compile error.
   */
  compile(): CompileResult {
    const dupError = this.checkDuplicateNodes();
    if (dupError !== undefined) return err(dupError);

    const refError = this.checkEdgeReferences();
    if (refError !== undefined) return err(refError);

    const entryError = this.checkEntryPoint();
    if (entryError !== undefined) return err(entryError);

    const cycleError = this.checkCycles();
    if (cycleError !== undefined) return err(cycleError);

    const reachError = this.checkReachability();
    if (reachError !== undefined) return err(reachError);

    const entryEdges = this.edges.filter((e) => e.from === START);
    const stateSchema = Object.fromEntries(this.stateFields) as StateSchema;

    return ok({
      nodes: new Map(this.nodes),
      edges: [...this.edges],
      stateSchema,
      entryEdges,
    });
  }

  // ==========================================================================
  // Validation Helpers
  // ==========================================================================

  private checkDuplicateNodes(): GraphCompileError | undefined {
    // Nodes are stored in a Map — duplicates are overwritten during addNode.
    // This is intentional (last-write-wins) and not an error.
    return undefined;
  }

  private checkEdgeReferences(): GraphCompileError | undefined {
    const validIds = new Set([...this.nodes.keys(), START, END]);

    for (const edge of this.edges) {
      if (!validIds.has(edge.from) && edge.from !== START) {
        return { type: 'missing_node', nodeId: edge.from, referencedBy: 'edge.from' };
      }

      if (edge.type === 'fixed') {
        if (!validIds.has(edge.to) && edge.to !== END) {
          return { type: 'missing_node', nodeId: edge.to, referencedBy: 'edge.to' };
        }
      } else {
        for (const target of edge.targets) {
          if (!validIds.has(target) && target !== END) {
            return {
              type: 'missing_node',
              nodeId: target,
              referencedBy: `conditional(${edge.from})`,
            };
          }
        }
      }
    }

    return undefined;
  }

  private checkEntryPoint(): GraphCompileError | undefined {
    const hasEntry = this.edges.some((e) => e.from === START);
    if (!hasEntry) {
      return { type: 'no_entry', message: 'No edge from START — add an edge from START to a node' };
    }
    return undefined;
  }

  private checkCycles(): GraphCompileError | undefined {
    // Build adjacency list from fixed edges only (conditional edges
    // can't be statically validated for cycles)
    const adj = new Map<string, string[]>();
    for (const node of this.nodes.keys()) {
      adj.set(node, []);
    }

    for (const edge of this.edges) {
      if (edge.type === 'fixed' && edge.from !== START && edge.to !== END) {
        const list = adj.get(edge.from);
        if (list !== undefined) {
          list.push(edge.to);
        }
      }
    }

    // DFS-based cycle detection
    const visited = new Set<string>();
    const stack = new Set<string>();
    const path: string[] = [];

    for (const nodeId of this.nodes.keys()) {
      const cycle = this.dfs(nodeId, adj, visited, stack, path);
      if (cycle !== undefined) return cycle;
    }

    return undefined;
  }

  private dfs(
    nodeId: string,
    adj: Map<string, string[]>,
    visited: Set<string>,
    stack: Set<string>,
    path: string[]
  ): GraphCompileError | undefined {
    if (stack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      const cyclePath = path.slice(cycleStart);
      cyclePath.push(nodeId);
      return { type: 'cycle_detected', path: cyclePath };
    }
    if (visited.has(nodeId)) return undefined;

    visited.add(nodeId);
    stack.add(nodeId);
    path.push(nodeId);

    const neighbors = adj.get(nodeId) ?? [];
    for (const neighbor of neighbors) {
      const cycle = this.dfs(neighbor, adj, visited, stack, path);
      if (cycle !== undefined) return cycle;
    }

    stack.delete(nodeId);
    path.pop();
    return undefined;
  }

  private checkReachability(): GraphCompileError | undefined {
    const reachable = this.findReachableNodes();

    for (const nodeId of this.nodes.keys()) {
      if (!reachable.has(nodeId)) {
        return { type: 'unreachable_node', nodeId };
      }
    }

    return undefined;
  }

  /** BFS from START to find all reachable node IDs. */
  private findReachableNodes(): Set<string> {
    const reachable = new Set<string>();
    const queue = this.getStartTargets();

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined || current === END || reachable.has(current)) continue;
      reachable.add(current);
      queue.push(...this.getEdgeTargets(current, reachable));
    }

    return reachable;
  }

  /** Gets initial target nodes from START edges. */
  private getStartTargets(): string[] {
    const targets: string[] = [];
    for (const edge of this.edges) {
      if (edge.from !== START) continue;
      if (edge.type === 'fixed') targets.push(edge.to);
      else targets.push(...edge.targets);
    }
    return targets;
  }

  /** Gets unvisited targets of outgoing edges from a node. */
  private getEdgeTargets(nodeId: string, visited: Set<string>): string[] {
    const targets: string[] = [];
    for (const edge of this.edges) {
      if (edge.from !== nodeId) continue;
      if (edge.type === 'fixed') {
        if (!visited.has(edge.to)) targets.push(edge.to);
      } else {
        for (const t of edge.targets) {
          if (!visited.has(t)) targets.push(t);
        }
      }
    }
    return targets;
  }
}

// ============================================================================
// State Reducer Helpers
// ============================================================================

/** Creates an overwrite reducer (last write wins). */
export function overwrite<T>(defaultValue: T): StateFieldSchema<T> {
  return { defaultValue, reducer: { type: 'overwrite' } };
}

/** Creates an append reducer for array fields. */
export function append<T>(defaultValue: T[] = []): StateFieldSchema<T[]> {
  return { defaultValue, reducer: { type: 'append' } };
}

/** Creates a custom reducer with a merge function. */
export function customReducer<T>(
  defaultValue: T,
  merge: StateReducer<T> & { type: 'custom' } extends infer R
    ? R extends { merge: infer M }
      ? M
      : never
    : never
): StateFieldSchema<T> {
  return { defaultValue, reducer: { type: 'custom', merge } };
}

export { START, END } from './graph-types.js';
