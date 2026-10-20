/** Measure promised callback settlement without changing graph deadlines. */
import type { CompiledGraph, GraphNode } from '../orchestration/graph/graph-types.js';

/** Private run-local adapter; detached work is outside the callback contract. */
export class PipelineCallbackTracker {
  readonly graph: CompiledGraph;
  private activeCallbacks = 0;

  constructor(graph: CompiledGraph) {
    const nodes = new Map<string, GraphNode>();
    for (const [id, node] of graph.nodes) {
      nodes.set(id, {
        ...node,
        handler: this.track(node.handler.bind(node)),
        ...(node.verify === undefined ? {} : { verify: this.track(node.verify) }),
        ...(node.preconditions === undefined
          ? {}
          : {
              preconditions: node.preconditions.map((config) => ({
                ...config,
                hook: this.track(config.hook.bind(config)),
              })),
            }),
      });
    }
    this.graph = { ...graph, nodes };
  }

  get pendingCount(): number {
    return this.activeCallbacks;
  }

  private track<Args extends unknown[], Value>(
    callback: (...args: Args) => Promise<Value>
  ): (...args: Args) => Promise<Value> {
    return async (...args) => {
      this.activeCallbacks++;
      try {
        return await callback(...args);
      } finally {
        this.activeCallbacks--;
      }
    };
  }
}
