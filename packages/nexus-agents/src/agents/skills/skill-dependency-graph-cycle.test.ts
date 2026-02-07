/**
 * Tests for skill-dependency-graph-cycle.ts
 *
 * Covers canReach, wouldCreateCycle, findCyclePath, detectCycleDFS,
 * and findCycleFromNode.
 */

import { describe, it, expect } from 'vitest';
import {
  canReach,
  wouldCreateCycle,
  findCyclePath,
  detectCycleDFS,
  findCycleFromNode,
} from './skill-dependency-graph-cycle.js';
import type { CycleDetectionNode, NodeLookup } from './skill-dependency-graph-cycle.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a graph from adjacency list.
 * E.g., { A: ['B', 'C'], B: ['C'] } means A depends on B and C; B depends on C.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildGraph(adjacency: Record<string, string[]>) {
  const nodes = new Map<string, CycleDetectionNode>();

  for (const [id, deps] of Object.entries(adjacency)) {
    const depMap = new Map<string, { skillId: string; dependsOn: string; type: 'required' }>();
    for (const dep of deps) {
      depMap.set(dep, { skillId: id, dependsOn: dep, type: 'required' });
    }
    nodes.set(id, { id, dependencies: depMap });
  }

  const getNode: NodeLookup = (id) => nodes.get(id);
  return { nodes, getNode };
}

// ============================================================================
// canReach
// ============================================================================

describe('canReach', () => {
  it('returns true for self', () => {
    const { getNode } = buildGraph({ A: [] });
    expect(canReach('A', 'A', new Set(), getNode)).toBe(true);
  });

  it('returns true for direct dependency', () => {
    const { getNode } = buildGraph({ A: ['B'], B: [] });
    expect(canReach('A', 'B', new Set(), getNode)).toBe(true);
  });

  it('returns true for transitive dependency', () => {
    const { getNode } = buildGraph({ A: ['B'], B: ['C'], C: [] });
    expect(canReach('A', 'C', new Set(), getNode)).toBe(true);
  });

  it('returns false when no path exists', () => {
    const { getNode } = buildGraph({ A: ['B'], B: [], C: [] });
    expect(canReach('A', 'C', new Set(), getNode)).toBe(false);
  });

  it('returns false for unknown node', () => {
    const { getNode } = buildGraph({ A: ['B'] });
    expect(canReach('A', 'Z', new Set(), getNode)).toBe(false);
  });

  it('handles already-visited nodes', () => {
    const { getNode } = buildGraph({ A: ['B'], B: ['C'], C: [] });
    const visited = new Set(['B']);
    // A->B is skipped because B is already visited, so can't reach C
    expect(canReach('A', 'C', visited, getNode)).toBe(false);
  });
});

// ============================================================================
// wouldCreateCycle
// ============================================================================

describe('wouldCreateCycle', () => {
  it('detects cycle when adding reverse edge', () => {
    const { getNode } = buildGraph({ A: ['B'], B: [] });
    // Adding B->A would create A->B->A cycle
    expect(wouldCreateCycle('B', 'A', getNode)).toBe(true);
  });

  it('returns false when no cycle would be created', () => {
    const { getNode } = buildGraph({ A: [], B: [] });
    expect(wouldCreateCycle('A', 'B', getNode)).toBe(false);
  });

  it('detects transitive cycle', () => {
    const { getNode } = buildGraph({ A: ['B'], B: ['C'], C: [] });
    // Adding C->A would create A->B->C->A cycle
    expect(wouldCreateCycle('C', 'A', getNode)).toBe(true);
  });

  it('self-loop is a cycle', () => {
    const { getNode } = buildGraph({ A: [] });
    expect(wouldCreateCycle('A', 'A', getNode)).toBe(true);
  });
});

// ============================================================================
// findCyclePath
// ============================================================================

describe('findCyclePath', () => {
  it('finds direct cycle path', () => {
    const { getNode } = buildGraph({ A: ['B'], B: [] });
    const path = findCyclePath('B', 'A', getNode);
    expect(path[0]).toBe('B');
    expect(path[1]).toBe('A');
  });

  it('finds transitive cycle path', () => {
    const { getNode } = buildGraph({ A: ['B'], B: ['C'], C: [] });
    const path = findCyclePath('C', 'A', getNode);
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path).toContain('C');
    expect(path).toContain('A');
  });
});

// ============================================================================
// detectCycleDFS
// ============================================================================

describe('detectCycleDFS', () => {
  it('returns false for acyclic graph', () => {
    const { getNode } = buildGraph({ A: ['B'], B: ['C'], C: [] });
    expect(detectCycleDFS('A', new Set(), new Set(), getNode)).toBe(false);
  });

  it('detects direct cycle', () => {
    const { getNode } = buildGraph({ A: ['B'], B: ['A'] });
    expect(detectCycleDFS('A', new Set(), new Set(), getNode)).toBe(true);
  });

  it('detects transitive cycle', () => {
    const { getNode } = buildGraph({ A: ['B'], B: ['C'], C: ['A'] });
    expect(detectCycleDFS('A', new Set(), new Set(), getNode)).toBe(true);
  });

  it('handles disconnected nodes', () => {
    const { getNode } = buildGraph({ A: [], B: [] });
    expect(detectCycleDFS('A', new Set(), new Set(), getNode)).toBe(false);
  });
});

// ============================================================================
// findCycleFromNode
// ============================================================================

describe('findCycleFromNode', () => {
  it('returns empty for acyclic graph', () => {
    const { getNode } = buildGraph({ A: ['B'], B: [] });
    const cycle = findCycleFromNode('A', getNode);
    expect(cycle).toEqual([]);
  });

  it('finds cycle in cyclic graph', () => {
    const { getNode } = buildGraph({ A: ['B'], B: ['A'] });
    const cycle = findCycleFromNode('A', getNode);
    expect(cycle.length).toBeGreaterThan(0);
    expect(cycle).toContain('A');
    expect(cycle).toContain('B');
  });

  it('finds cycle in longer chain', () => {
    const { getNode } = buildGraph({ A: ['B'], B: ['C'], C: ['A'] });
    const cycle = findCycleFromNode('A', getNode);
    expect(cycle.length).toBeGreaterThanOrEqual(3);
  });
});
