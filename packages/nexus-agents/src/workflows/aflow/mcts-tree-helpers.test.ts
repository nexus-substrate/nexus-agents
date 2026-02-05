/**
 * Tests for MCTS Tree Helpers
 * @module workflows/aflow/mcts-tree-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { WorkflowDefinition } from '../../core/index.js';
import type { MCTSNode } from './aflow-types.js';
import {
  toImmutableNode,
  calculateTreeStats,
  createMutableNode,
  type MutableNode,
} from './mcts-tree-helpers.js';

vi.mock('../../core/index.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getTimeProvider: () => ({ now: () => 1700000000000 }),
  };
});

// ============================================================================
// Test Helpers
// ============================================================================

const minimalWorkflow: WorkflowDefinition = {
  name: 'test',
  version: '1.0.0',
  inputs: [],
  steps: [],
};

function makeNode(overrides: Partial<MutableNode> = {}): MutableNode {
  return {
    id: 'node-1',
    workflow: minimalWorkflow,
    parentId: null,
    action: null,
    children: [],
    visitCount: 0,
    totalValue: 0,
    avgValue: 0,
    depth: 0,
    isTerminal: false,
    createdAt: 1700000000000,
    ...overrides,
  };
}

// ============================================================================
// toImmutableNode
// ============================================================================

describe('toImmutableNode', () => {
  it('converts mutable to immutable node', () => {
    const mutable = makeNode({ id: 'n1', visitCount: 5, totalValue: 10, avgValue: 2 });
    const immutable = toImmutableNode(mutable);
    expect(immutable.id).toBe('n1');
    expect(immutable.visitCount).toBe(5);
    expect(immutable.totalValue).toBe(10);
    expect(immutable.avgValue).toBe(2);
  });

  it('creates a copy of children array', () => {
    const mutable = makeNode({ children: ['c1', 'c2'] });
    const immutable = toImmutableNode(mutable);
    expect(immutable.children).toEqual(['c1', 'c2']);
    // Verify it's a copy, not the same reference
    mutable.children.push('c3');
    expect(immutable.children).toHaveLength(2);
  });

  it('preserves all fields', () => {
    const mutable = makeNode({
      parentId: 'parent',
      action: { type: 'add_step' },
      depth: 3,
      isTerminal: true,
    });
    const immutable = toImmutableNode(mutable);
    expect(immutable.parentId).toBe('parent');
    expect(immutable.action).toEqual({ type: 'add_step' });
    expect(immutable.depth).toBe(3);
    expect(immutable.isTerminal).toBe(true);
  });
});

// ============================================================================
// calculateTreeStats
// ============================================================================

describe('calculateTreeStats', () => {
  it('calculates stats for empty tree', () => {
    const nodes = new Map<string, MutableNode>();
    const stats = calculateTreeStats(nodes, () => null, 0);
    expect(stats.totalNodes).toBe(0);
    expect(stats.maxDepthReached).toBe(0);
    expect(stats.avgBranchingFactor).toBe(0);
    expect(stats.bestScore).toBe(0);
  });

  it('calculates total nodes', () => {
    const nodes = new Map<string, MutableNode>();
    nodes.set('a', makeNode({ id: 'a' }));
    nodes.set('b', makeNode({ id: 'b' }));
    const stats = calculateTreeStats(nodes, () => null, 0);
    expect(stats.totalNodes).toBe(2);
  });

  it('finds max depth', () => {
    const nodes = new Map<string, MutableNode>();
    nodes.set('a', makeNode({ id: 'a', depth: 1 }));
    nodes.set('b', makeNode({ id: 'b', depth: 5 }));
    nodes.set('c', makeNode({ id: 'c', depth: 3 }));
    const stats = calculateTreeStats(nodes, () => null, 0);
    expect(stats.maxDepthReached).toBe(5);
  });

  it('calculates average branching factor', () => {
    const nodes = new Map<string, MutableNode>();
    nodes.set('a', makeNode({ id: 'a', children: ['b', 'c'] }));
    nodes.set('b', makeNode({ id: 'b', children: ['d'] }));
    nodes.set('c', makeNode({ id: 'c' }));
    nodes.set('d', makeNode({ id: 'd' }));
    const stats = calculateTreeStats(nodes, () => null, 0);
    // a has 2 children, b has 1, c and d have 0 (excluded)
    // Average: (2 + 1) / 2 = 1.5
    expect(stats.avgBranchingFactor).toBe(1.5);
  });

  it('calculates average terminal score', () => {
    const nodes = new Map<string, MutableNode>();
    nodes.set('a', makeNode({ id: 'a', isTerminal: true, visitCount: 2, avgValue: 0.8 }));
    nodes.set('b', makeNode({ id: 'b', isTerminal: true, visitCount: 3, avgValue: 0.6 }));
    nodes.set('c', makeNode({ id: 'c', isTerminal: false }));
    const stats = calculateTreeStats(nodes, () => null, 10);
    expect(stats.avgTerminalScore).toBeCloseTo(0.7);
    expect(stats.totalSimulations).toBe(10);
  });

  it('excludes unvisited terminals from avg score', () => {
    const nodes = new Map<string, MutableNode>();
    nodes.set('a', makeNode({ id: 'a', isTerminal: true, visitCount: 2, avgValue: 0.8 }));
    nodes.set('b', makeNode({ id: 'b', isTerminal: true, visitCount: 0, avgValue: 0 }));
    const stats = calculateTreeStats(nodes, () => null, 0);
    expect(stats.avgTerminalScore).toBeCloseTo(0.8);
  });

  it('uses bestNode score', () => {
    const bestNode: MCTSNode = {
      ...makeNode({ avgValue: 0.95 }),
      children: [],
    };
    const nodes = new Map<string, MutableNode>();
    nodes.set('a', makeNode());
    const stats = calculateTreeStats(nodes, () => bestNode, 0);
    expect(stats.bestScore).toBe(0.95);
  });
});

// ============================================================================
// createMutableNode
// ============================================================================

describe('createMutableNode', () => {
  it('creates node with provided options', () => {
    const node = createMutableNode({
      id: 'test-node',
      workflow: minimalWorkflow,
      parentId: 'parent',
      action: { type: 'terminate' },
      depth: 2,
      isTerminal: true,
    });
    expect(node.id).toBe('test-node');
    expect(node.parentId).toBe('parent');
    expect(node.depth).toBe(2);
    expect(node.isTerminal).toBe(true);
  });

  it('initializes counters to zero', () => {
    const node = createMutableNode({
      id: 'n',
      workflow: minimalWorkflow,
      parentId: null,
      action: null,
      depth: 0,
      isTerminal: false,
    });
    expect(node.visitCount).toBe(0);
    expect(node.totalValue).toBe(0);
    expect(node.avgValue).toBe(0);
  });

  it('initializes children as empty array', () => {
    const node = createMutableNode({
      id: 'n',
      workflow: minimalWorkflow,
      parentId: null,
      action: null,
      depth: 0,
      isTerminal: false,
    });
    expect(node.children).toEqual([]);
  });

  it('uses time provider for createdAt', () => {
    const node = createMutableNode({
      id: 'n',
      workflow: minimalWorkflow,
      parentId: null,
      action: null,
      depth: 0,
      isTerminal: false,
    });
    expect(node.createdAt).toBe(1700000000000);
  });
});
