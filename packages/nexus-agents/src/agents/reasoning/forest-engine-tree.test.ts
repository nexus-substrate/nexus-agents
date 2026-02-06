/**
 * Tests for forest-engine-tree.ts
 *
 * Covers tree creation from hypotheses, node addition,
 * node completion, exploration state tracking, and statistics.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createInitialTrees,
  addNodeToTree,
  markNodeCompleted,
  completeNodeInState,
} from './forest-engine-tree.js';
import type { ReasoningNode } from './forest-node-types.js';
import type { ReasoningTree } from './forest-tree-types.js';

// ============================================================================
// Mock time provider
// ============================================================================

let mockNow = 1000;

vi.mock('../../core/index.js', () => ({
  getTimeProvider: () => ({ now: () => mockNow }),
  getRandomProvider: () => ({
    randomString: (len: number) => 'a'.repeat(len),
  }),
}));

beforeEach(() => {
  mockNow = 1000;
});

// ============================================================================
// Helper
// ============================================================================

function makeNode(overrides: Partial<ReasoningNode> = {}): ReasoningNode {
  return {
    id: 'node-0-1-test',
    treeId: 'tree-0-test',
    parentId: 'node-0-0-test',
    children: [],
    depth: 1,
    stepType: 'reasoning',
    content: 'A reasoning step',
    metadata: {},
    state: 'active',
    confidence: 0.7,
    qualityScore: 0.6,
    estimatedValue: 0.5,
    isActive: true,
    activationScore: 0.8,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

// ============================================================================
// createInitialTrees
// ============================================================================

describe('createInitialTrees', () => {
  it('creates correct number of trees', () => {
    const { trees } = createInitialTrees(['H1', 'H2', 'H3'], 'forest-1');
    expect(trees.size).toBe(3);
  });

  it('creates correct number of exploration states', () => {
    const { explorationState } = createInitialTrees(['H1', 'H2'], 'forest-1');
    expect(explorationState.size).toBe(2);
  });

  it('sets hypothesis on each tree', () => {
    const { trees } = createInitialTrees(['First hypothesis'], 'forest-1');
    const tree = [...trees.values()][0];
    expect(tree?.hypothesis).toBe('First hypothesis');
  });

  it('creates root node in each tree', () => {
    const { trees } = createInitialTrees(['H1'], 'forest-1');
    const tree = [...trees.values()][0];
    expect(tree?.nodes.size).toBe(1);
    const rootNode = tree?.nodes.get(tree.rootId);
    expect(rootNode?.depth).toBe(0);
    expect(rootNode?.stepType).toBe('hypothesis');
    expect(rootNode?.content).toBe('H1');
  });

  it('sets initial statistics', () => {
    const { trees } = createInitialTrees(['H1'], 'forest-1');
    const tree = [...trees.values()][0];
    expect(tree?.statistics.totalNodes).toBe(1);
    expect(tree?.statistics.activeNodes).toBe(1);
    expect(tree?.statistics.maxDepth).toBe(0);
  });

  it('sets initial exploration state with root as active', () => {
    const { trees, explorationState } = createInitialTrees(['H1'], 'forest-1');
    const treeId = [...trees.keys()][0];
    const state = explorationState.get(treeId!);
    expect(state?.activeNodeIds).toHaveLength(1);
    expect(state?.completedNodeIds).toHaveLength(0);
    expect(state?.currentDepth).toBe(0);
  });

  it('handles empty hypotheses', () => {
    const { trees, explorationState } = createInitialTrees([], 'forest-1');
    expect(trees.size).toBe(0);
    expect(explorationState.size).toBe(0);
  });

  it('sets forestId on each tree', () => {
    const { trees } = createInitialTrees(['H1'], 'forest-xyz');
    const tree = [...trees.values()][0];
    expect(tree?.forestId).toBe('forest-xyz');
  });
});

// ============================================================================
// addNodeToTree
// ============================================================================

describe('addNodeToTree', () => {
  it('adds node to tree', () => {
    const { trees } = createInitialTrees(['H1'], 'forest-1');
    const tree = [...trees.values()][0] as ReasoningTree;
    const newNode = makeNode({ id: 'new-node', depth: 1 });
    const updated = addNodeToTree(tree, newNode, tree.rootId);
    expect(updated.nodes.size).toBe(2);
    expect(updated.nodes.has('new-node')).toBe(true);
  });

  it('updates parent children list', () => {
    const { trees } = createInitialTrees(['H1'], 'forest-1');
    const tree = [...trees.values()][0] as ReasoningTree;
    const newNode = makeNode({ id: 'child-1' });
    const updated = addNodeToTree(tree, newNode, tree.rootId);
    const parent = updated.nodes.get(tree.rootId);
    expect(parent?.children).toContain('child-1');
  });

  it('updates totalNodes statistic', () => {
    const { trees } = createInitialTrees(['H1'], 'forest-1');
    const tree = [...trees.values()][0] as ReasoningTree;
    const newNode = makeNode({ id: 'new-node' });
    const updated = addNodeToTree(tree, newNode, tree.rootId);
    expect(updated.statistics.totalNodes).toBe(2);
  });

  it('updates maxDepth when new node is deeper', () => {
    const { trees } = createInitialTrees(['H1'], 'forest-1');
    const tree = [...trees.values()][0] as ReasoningTree;
    const newNode = makeNode({ id: 'deep-node', depth: 3 });
    const updated = addNodeToTree(tree, newNode, tree.rootId);
    expect(updated.statistics.maxDepth).toBe(3);
  });

  it('calculates average quality score', () => {
    const { trees } = createInitialTrees(['H1'], 'forest-1');
    const tree = [...trees.values()][0] as ReasoningTree;
    // Root has qualityScore 0.5, new node has 0.8
    const newNode = makeNode({ id: 'q-node', qualityScore: 0.8 });
    const updated = addNodeToTree(tree, newNode, tree.rootId);
    expect(updated.statistics.avgQualityScore).toBeCloseTo((0.5 + 0.8) / 2);
  });

  it('counts conclusion nodes', () => {
    const { trees } = createInitialTrees(['H1'], 'forest-1');
    const tree = [...trees.values()][0] as ReasoningTree;
    const conclusion = makeNode({ id: 'conclusion', stepType: 'conclusion' });
    const updated = addNodeToTree(tree, conclusion, tree.rootId);
    expect(updated.statistics.conclusionCount).toBe(1);
  });

  it('does not modify original tree (immutable)', () => {
    const { trees } = createInitialTrees(['H1'], 'forest-1');
    const tree = [...trees.values()][0] as ReasoningTree;
    const newNode = makeNode({ id: 'new-node' });
    addNodeToTree(tree, newNode, tree.rootId);
    expect(tree.nodes.size).toBe(1); // Original unchanged
  });
});

// ============================================================================
// markNodeCompleted
// ============================================================================

describe('markNodeCompleted', () => {
  it('marks node as completed and inactive', () => {
    const { trees } = createInitialTrees(['H1'], 'forest-1');
    const tree = [...trees.values()][0] as ReasoningTree;
    const updated = markNodeCompleted(tree, tree.rootId);
    const node = updated.nodes.get(tree.rootId);
    expect(node?.state).toBe('completed');
    expect(node?.isActive).toBe(false);
  });

  it('updates activeNodes count', () => {
    const { trees } = createInitialTrees(['H1'], 'forest-1');
    const tree = [...trees.values()][0] as ReasoningTree;
    const updated = markNodeCompleted(tree, tree.rootId);
    expect(updated.statistics.activeNodes).toBe(0);
  });

  it('returns unchanged tree for unknown node ID', () => {
    const { trees } = createInitialTrees(['H1'], 'forest-1');
    const tree = [...trees.values()][0] as ReasoningTree;
    const updated = markNodeCompleted(tree, 'nonexistent-id');
    expect(updated).toBe(tree);
  });

  it('does not modify original tree (immutable)', () => {
    const { trees } = createInitialTrees(['H1'], 'forest-1');
    const tree = [...trees.values()][0] as ReasoningTree;
    markNodeCompleted(tree, tree.rootId);
    const originalNode = tree.nodes.get(tree.rootId);
    expect(originalNode?.isActive).toBe(true); // Original unchanged
  });
});

// ============================================================================
// completeNodeInState
// ============================================================================

describe('completeNodeInState', () => {
  it('removes node from active list', () => {
    const state = {
      activeNodeIds: ['n1', 'n2', 'n3'] as const,
      completedNodeIds: [] as const,
      currentDepth: 0,
    };
    const updated = completeNodeInState(state, 'n2');
    expect(updated.activeNodeIds).toEqual(['n1', 'n3']);
  });

  it('adds node to completed list', () => {
    const state = {
      activeNodeIds: ['n1'] as const,
      completedNodeIds: [] as const,
      currentDepth: 0,
    };
    const updated = completeNodeInState(state, 'n1');
    expect(updated.completedNodeIds).toContain('n1');
  });

  it('preserves currentDepth', () => {
    const state = {
      activeNodeIds: ['n1'] as const,
      completedNodeIds: [] as const,
      currentDepth: 3,
    };
    const updated = completeNodeInState(state, 'n1');
    expect(updated.currentDepth).toBe(3);
  });

  it('handles completing non-existent node gracefully', () => {
    const state = {
      activeNodeIds: ['n1'] as const,
      completedNodeIds: [] as const,
      currentDepth: 0,
    };
    const updated = completeNodeInState(state, 'n99');
    expect(updated.activeNodeIds).toEqual(['n1']);
    expect(updated.completedNodeIds).toContain('n99');
  });
});
