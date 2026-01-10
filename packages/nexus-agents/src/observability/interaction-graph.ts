/**
 * nexus-agents/observability - Interaction Graph
 *
 * Directed graph for tracking agent interactions.
 * Supports centrality analysis, cluster detection, and bottleneck identification.
 *
 * @module observability/interaction-graph
 * (Source: Alignment Roadmap Phase 1, Issue #158)
 */

import type {
  AgentId,
  InteractionEdge,
  InteractionGraph as IInteractionGraph,
} from './swarm-observer-types.js';

/**
 * Adjacency list entry for the graph.
 */
interface AdjacencyEntry {
  edges: InteractionEdge[];
}

/**
 * Directed graph implementation for agent interactions.
 */
export class DirectedInteractionGraph implements IInteractionGraph {
  private readonly nodes: Set<AgentId> = new Set();
  private readonly outgoing: Map<AgentId, AdjacencyEntry> = new Map();
  private readonly incoming: Map<AgentId, AdjacencyEntry> = new Map();

  /**
   * Add a node (agent) to the graph.
   */
  addNode(agentId: AgentId): void {
    if (this.nodes.has(agentId)) return;
    this.nodes.add(agentId);
    this.outgoing.set(agentId, { edges: [] });
    this.incoming.set(agentId, { edges: [] });
  }

  /**
   * Add an edge (interaction) to the graph.
   */
  addEdge(edge: InteractionEdge): void {
    this.addNode(edge.from);
    this.addNode(edge.to);

    const outEntry = this.outgoing.get(edge.from);
    const inEntry = this.incoming.get(edge.to);

    if (outEntry) {
      outEntry.edges.push(edge);
    }
    if (inEntry) {
      inEntry.edges.push(edge);
    }
  }

  /**
   * Get all nodes in the graph.
   */
  getNodes(): AgentId[] {
    return Array.from(this.nodes);
  }

  /**
   * Get all edges in the graph.
   */
  getEdges(): InteractionEdge[] {
    const edges: InteractionEdge[] = [];
    for (const entry of this.outgoing.values()) {
      edges.push(...entry.edges);
    }
    return edges;
  }

  /**
   * Get edges from a specific agent.
   */
  getOutgoingEdges(agentId: AgentId): InteractionEdge[] {
    return this.outgoing.get(agentId)?.edges ?? [];
  }

  /**
   * Get edges to a specific agent.
   */
  getIncomingEdges(agentId: AgentId): InteractionEdge[] {
    return this.incoming.get(agentId)?.edges ?? [];
  }

  /**
   * Calculate degree centrality for all nodes.
   * Returns normalized centrality (0-1).
   */
  getDegreeCentrality(): Map<AgentId, number> {
    const centrality = new Map<AgentId, number>();
    const nodeCount = this.nodes.size;

    if (nodeCount <= 1) {
      for (const node of this.nodes) {
        centrality.set(node, 0);
      }
      return centrality;
    }

    const maxPossibleDegree = (nodeCount - 1) * 2; // in + out

    for (const node of this.nodes) {
      const outDegree = this.getOutgoingEdges(node).length;
      const inDegree = this.getIncomingEdges(node).length;
      const totalDegree = outDegree + inDegree;
      centrality.set(node, totalDegree / maxPossibleDegree);
    }

    return centrality;
  }

  /**
   * Find strongly connected components using Kosaraju's algorithm.
   */
  getStronglyConnectedComponents(): AgentId[][] {
    const visited = new Set<AgentId>();
    const stack: AgentId[] = [];
    const components: AgentId[][] = [];

    // First DFS to fill stack
    const fillOrder = (node: AgentId): void => {
      visited.add(node);
      for (const edge of this.getOutgoingEdges(node)) {
        if (!visited.has(edge.to)) {
          fillOrder(edge.to);
        }
      }
      stack.push(node);
    };

    for (const node of this.nodes) {
      if (!visited.has(node)) {
        fillOrder(node);
      }
    }

    // Second DFS on transposed graph
    visited.clear();

    const collectComponent = (node: AgentId, component: AgentId[]): void => {
      visited.add(node);
      component.push(node);
      for (const edge of this.getIncomingEdges(node)) {
        if (!visited.has(edge.from)) {
          collectComponent(edge.from, component);
        }
      }
    };

    while (stack.length > 0) {
      const node = stack.pop();
      if (node !== undefined && !visited.has(node)) {
        const component: AgentId[] = [];
        collectComponent(node, component);
        components.push(component);
      }
    }

    return components;
  }

  /**
   * Get edge count between two agents.
   */
  getEdgeCount(from: AgentId, to: AgentId): number {
    const edges = this.getOutgoingEdges(from);
    return edges.filter((e) => e.to === to).length;
  }

  /**
   * Get unique interaction partners for an agent.
   */
  getNeighbors(agentId: AgentId): AgentId[] {
    const neighbors = new Set<AgentId>();

    for (const edge of this.getOutgoingEdges(agentId)) {
      neighbors.add(edge.to);
    }
    for (const edge of this.getIncomingEdges(agentId)) {
      neighbors.add(edge.from);
    }

    return Array.from(neighbors);
  }

  /**
   * Calculate clustering coefficient for a node.
   * Measures how interconnected a node's neighbors are.
   */
  getClusteringCoefficient(agentId: AgentId): number {
    const neighbors = this.getNeighbors(agentId);
    const k = neighbors.length;

    if (k < 2) return 0;

    let actualEdges = 0;
    for (const n1 of neighbors) {
      for (const n2 of neighbors) {
        if (n1 !== n2 && this.getEdgeCount(n1, n2) > 0) {
          actualEdges++;
        }
      }
    }

    const possibleEdges = k * (k - 1);
    return actualEdges / possibleEdges;
  }

  /**
   * Get statistics about the graph.
   */
  getStats(): GraphStats {
    const nodeCount = this.nodes.size;
    const edges = this.getEdges();
    const edgeCount = edges.length;

    let totalLatency = 0;
    let latencyCount = 0;
    let successCount = 0;

    for (const edge of edges) {
      if (edge.durationMs !== undefined) {
        totalLatency += edge.durationMs;
        latencyCount++;
      }
      if (edge.outcome === 'success') {
        successCount++;
      }
    }

    return {
      nodeCount,
      edgeCount,
      avgLatencyMs: latencyCount > 0 ? totalLatency / latencyCount : 0,
      successRate: edgeCount > 0 ? successCount / edgeCount : 0,
      density: nodeCount > 1 ? edgeCount / (nodeCount * (nodeCount - 1)) : 0,
    };
  }

  /**
   * Clear the graph.
   */
  clear(): void {
    this.nodes.clear();
    this.outgoing.clear();
    this.incoming.clear();
  }
}

/**
 * Graph statistics.
 */
export interface GraphStats {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly avgLatencyMs: number;
  readonly successRate: number;
  readonly density: number;
}

/**
 * Create a new interaction graph.
 */
export function createInteractionGraph(): IInteractionGraph {
  return new DirectedInteractionGraph();
}
