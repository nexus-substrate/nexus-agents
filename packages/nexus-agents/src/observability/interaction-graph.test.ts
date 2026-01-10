/**
 * nexus-agents/observability - Interaction Graph Tests
 *
 * Tests for directed interaction graph.
 *
 * @module observability/interaction-graph.test
 * (Source: Issue #158)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DirectedInteractionGraph, createInteractionGraph } from './interaction-graph.js';
import type { InteractionEdge } from './swarm-observer-types.js';

describe('DirectedInteractionGraph', () => {
  let graph: DirectedInteractionGraph;

  const createEdge = (
    from: string,
    to: string,
    outcome: InteractionEdge['outcome'] = 'success'
  ): InteractionEdge => ({
    from,
    to,
    interactionType: 'message',
    timestamp: new Date().toISOString(),
    outcome,
    traceId: 'trace123456789012345678901234',
    weight: 1,
  });

  beforeEach(() => {
    graph = new DirectedInteractionGraph();
  });

  describe('addNode', () => {
    it('should add a node to the graph', () => {
      graph.addNode('agent-1');
      expect(graph.getNodes()).toContain('agent-1');
    });

    it('should not duplicate nodes', () => {
      graph.addNode('agent-1');
      graph.addNode('agent-1');
      expect(graph.getNodes()).toHaveLength(1);
    });
  });

  describe('addEdge', () => {
    it('should add edge and create nodes', () => {
      graph.addEdge(createEdge('a', 'b'));
      expect(graph.getNodes()).toContain('a');
      expect(graph.getNodes()).toContain('b');
      expect(graph.getEdges()).toHaveLength(1);
    });

    it('should allow multiple edges between same nodes', () => {
      graph.addEdge(createEdge('a', 'b'));
      graph.addEdge(createEdge('a', 'b'));
      expect(graph.getEdges()).toHaveLength(2);
    });
  });

  describe('getNodes', () => {
    it('should return all nodes', () => {
      graph.addNode('a');
      graph.addNode('b');
      graph.addNode('c');
      expect(graph.getNodes()).toHaveLength(3);
    });

    it('should return empty array for empty graph', () => {
      expect(graph.getNodes()).toHaveLength(0);
    });
  });

  describe('getEdges', () => {
    it('should return all edges', () => {
      graph.addEdge(createEdge('a', 'b'));
      graph.addEdge(createEdge('b', 'c'));
      expect(graph.getEdges()).toHaveLength(2);
    });

    it('should return empty array for empty graph', () => {
      expect(graph.getEdges()).toHaveLength(0);
    });
  });

  describe('getOutgoingEdges', () => {
    it('should return edges from specified node', () => {
      graph.addEdge(createEdge('a', 'b'));
      graph.addEdge(createEdge('a', 'c'));
      graph.addEdge(createEdge('b', 'c'));

      const outgoing = graph.getOutgoingEdges('a');
      expect(outgoing).toHaveLength(2);
      expect(outgoing.map((e) => e.to)).toContain('b');
      expect(outgoing.map((e) => e.to)).toContain('c');
    });

    it('should return empty array for unknown node', () => {
      expect(graph.getOutgoingEdges('unknown')).toHaveLength(0);
    });
  });

  describe('getIncomingEdges', () => {
    it('should return edges to specified node', () => {
      graph.addEdge(createEdge('a', 'c'));
      graph.addEdge(createEdge('b', 'c'));
      graph.addEdge(createEdge('a', 'b'));

      const incoming = graph.getIncomingEdges('c');
      expect(incoming).toHaveLength(2);
      expect(incoming.map((e) => e.from)).toContain('a');
      expect(incoming.map((e) => e.from)).toContain('b');
    });

    it('should return empty array for unknown node', () => {
      expect(graph.getIncomingEdges('unknown')).toHaveLength(0);
    });
  });

  describe('getDegreeCentrality', () => {
    it('should calculate centrality for all nodes', () => {
      graph.addEdge(createEdge('a', 'b'));
      graph.addEdge(createEdge('a', 'c'));
      graph.addEdge(createEdge('b', 'c'));

      const centrality = graph.getDegreeCentrality();
      expect(centrality.has('a')).toBe(true);
      expect(centrality.has('b')).toBe(true);
      expect(centrality.has('c')).toBe(true);
    });

    it('should return 0 for single node', () => {
      graph.addNode('lonely');
      const centrality = graph.getDegreeCentrality();
      expect(centrality.get('lonely')).toBe(0);
    });

    it('should give higher centrality to more connected nodes', () => {
      graph.addEdge(createEdge('hub', 'a'));
      graph.addEdge(createEdge('hub', 'b'));
      graph.addEdge(createEdge('hub', 'c'));
      graph.addEdge(createEdge('a', 'hub'));

      const centrality = graph.getDegreeCentrality();
      const hubCentrality = centrality.get('hub') ?? 0;
      const aCentrality = centrality.get('a') ?? 0;

      expect(hubCentrality).toBeGreaterThan(aCentrality);
    });
  });

  describe('getStronglyConnectedComponents', () => {
    it('should find single-node components', () => {
      graph.addNode('a');
      graph.addNode('b');

      const components = graph.getStronglyConnectedComponents();
      expect(components).toHaveLength(2);
    });

    it('should find strongly connected cycle', () => {
      graph.addEdge(createEdge('a', 'b'));
      graph.addEdge(createEdge('b', 'c'));
      graph.addEdge(createEdge('c', 'a'));

      const components = graph.getStronglyConnectedComponents();
      // All three should be in same component
      const largestComponent = components.reduce<string[]>(
        (max, c) => (c.length > max.length ? c : max),
        []
      );
      expect(largestComponent).toHaveLength(3);
    });

    it('should separate disconnected components', () => {
      graph.addEdge(createEdge('a', 'b'));
      graph.addEdge(createEdge('b', 'a'));
      graph.addEdge(createEdge('c', 'd'));
      graph.addEdge(createEdge('d', 'c'));

      const components = graph.getStronglyConnectedComponents();
      expect(components.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getEdgeCount', () => {
    it('should count edges between two nodes', () => {
      graph.addEdge(createEdge('a', 'b'));
      graph.addEdge(createEdge('a', 'b'));
      graph.addEdge(createEdge('a', 'c'));

      expect(graph.getEdgeCount('a', 'b')).toBe(2);
      expect(graph.getEdgeCount('a', 'c')).toBe(1);
      expect(graph.getEdgeCount('b', 'a')).toBe(0);
    });
  });

  describe('getNeighbors', () => {
    it('should return all connected nodes', () => {
      graph.addEdge(createEdge('center', 'a'));
      graph.addEdge(createEdge('b', 'center'));
      graph.addEdge(createEdge('center', 'c'));

      const neighbors = graph.getNeighbors('center');
      expect(neighbors).toHaveLength(3);
      expect(neighbors).toContain('a');
      expect(neighbors).toContain('b');
      expect(neighbors).toContain('c');
    });
  });

  describe('getClusteringCoefficient', () => {
    it('should return 0 for node with less than 2 neighbors', () => {
      graph.addEdge(createEdge('a', 'b'));
      expect(graph.getClusteringCoefficient('a')).toBe(0);
    });

    it('should return 1 for fully connected triangle', () => {
      graph.addEdge(createEdge('a', 'b'));
      graph.addEdge(createEdge('b', 'c'));
      graph.addEdge(createEdge('c', 'a'));
      graph.addEdge(createEdge('b', 'a'));
      graph.addEdge(createEdge('c', 'b'));
      graph.addEdge(createEdge('a', 'c'));

      const coeff = graph.getClusteringCoefficient('a');
      expect(coeff).toBeCloseTo(1, 1);
    });
  });

  describe('getStats', () => {
    it('should return graph statistics', () => {
      graph.addEdge({ ...createEdge('a', 'b'), durationMs: 100 });
      graph.addEdge({ ...createEdge('b', 'c'), durationMs: 200 });
      graph.addEdge({ ...createEdge('c', 'a', 'failure'), durationMs: 150 });

      const stats = graph.getStats();
      expect(stats.nodeCount).toBe(3);
      expect(stats.edgeCount).toBe(3);
      expect(stats.avgLatencyMs).toBeCloseTo(150, 0);
      expect(stats.successRate).toBeCloseTo(0.667, 1);
    });

    it('should handle empty graph', () => {
      const stats = graph.getStats();
      expect(stats.nodeCount).toBe(0);
      expect(stats.edgeCount).toBe(0);
      expect(stats.avgLatencyMs).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all nodes and edges', () => {
      graph.addEdge(createEdge('a', 'b'));
      graph.addEdge(createEdge('b', 'c'));

      graph.clear();

      expect(graph.getNodes()).toHaveLength(0);
      expect(graph.getEdges()).toHaveLength(0);
    });
  });

  describe('createInteractionGraph', () => {
    it('should create new graph instance', () => {
      const g = createInteractionGraph();
      expect(g).toBeDefined();
      expect(g.getNodes()).toHaveLength(0);
    });
  });
});
