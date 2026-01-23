/**
 * nexus-agents/workflows - MCTS Tree Tests
 *
 * Comprehensive tests for Monte Carlo Tree Search implementation.
 * Tests cover tree construction, UCB selection, node operations,
 * expansion, backpropagation, statistics, and edge cases.
 *
 * @module workflows/aflow/mcts-tree.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MCTSTree, createMCTSTree } from './mcts-tree.js';
import type { WorkflowDefinition } from '../../core/index.js';
import type { WorkflowAction, AFlowConfig } from './aflow-types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestWorkflow(name = 'test-workflow'): WorkflowDefinition {
  return {
    name,
    version: '1.0.0',
    description: 'Test workflow for MCTS',
    inputs: [],
    steps: [],
  };
}

function createAddStepAction(stepId: string): WorkflowAction {
  return {
    type: 'add_step',
    newStep: {
      id: stepId,
      agent: 'code_expert',
      action: 'analyze',
      inputs: {},
    },
  };
}

function createTerminateAction(): WorkflowAction {
  return { type: 'terminate' };
}

// ============================================================================
// Tree Construction Tests
// ============================================================================

describe('MCTS Tree Construction', () => {
  describe('empty tree initialization', () => {
    it('should create empty tree with zero nodes', () => {
      const tree = createMCTSTree();

      expect(tree.size).toBe(0);
    });

    it('should return null for root when tree is empty', () => {
      const tree = createMCTSTree();

      expect(tree.getRoot()).toBeNull();
    });

    it('should use default configuration', () => {
      const tree = createMCTSTree();
      const stats = tree.getStats();

      expect(stats.totalNodes).toBe(0);
      expect(stats.totalSimulations).toBe(0);
    });
  });

  describe('root node creation', () => {
    it('should initialize root with workflow', () => {
      const tree = createMCTSTree();
      const workflow = createTestWorkflow();

      const root = tree.initializeRoot(workflow);

      expect(root).toBeDefined();
      expect(root.workflow).toEqual(workflow);
      expect(root.parentId).toBeNull();
      expect(root.depth).toBe(0);
    });

    it('should set root node properties correctly', () => {
      const tree = createMCTSTree();
      const workflow = createTestWorkflow('my-workflow');

      const root = tree.initializeRoot(workflow);

      expect(root.id).toBeDefined();
      expect(root.action).toBeNull();
      expect(root.children).toEqual([]);
      expect(root.visitCount).toBe(0);
      expect(root.totalValue).toBe(0);
      expect(root.avgValue).toBe(0);
      expect(root.isTerminal).toBe(false);
      expect(root.createdAt).toBeGreaterThan(0);
    });

    it('should make root retrievable via getRoot', () => {
      const tree = createMCTSTree();
      const workflow = createTestWorkflow();

      const root = tree.initializeRoot(workflow);
      const retrieved = tree.getRoot();

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(root.id);
    });

    it('should increase tree size to 1', () => {
      const tree = createMCTSTree();
      tree.initializeRoot(createTestWorkflow());

      expect(tree.size).toBe(1);
    });
  });

  describe('node state management', () => {
    it('should retrieve node by ID', () => {
      const tree = createMCTSTree();
      const root = tree.initializeRoot(createTestWorkflow());

      const retrieved = tree.getNode(root.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(root.id);
    });

    it('should return null for non-existent node ID', () => {
      const tree = createMCTSTree();
      tree.initializeRoot(createTestWorkflow());

      const retrieved = tree.getNode('non-existent-id');

      expect(retrieved).toBeNull();
    });

    it('should mark node as terminal', () => {
      const tree = createMCTSTree();
      const root = tree.initializeRoot(createTestWorkflow());

      tree.markTerminal(root.id);
      const updated = tree.getNode(root.id);

      expect(updated?.isTerminal).toBe(true);
    });

    it('should clear tree properly', () => {
      const tree = createMCTSTree();
      tree.initializeRoot(createTestWorkflow());

      tree.clear();

      expect(tree.size).toBe(0);
      expect(tree.getRoot()).toBeNull();
    });
  });
});

// ============================================================================
// UCB Selection Tests
// ============================================================================

describe('UCB Selection (Upper Confidence Bound)', () => {
  let tree: MCTSTree;

  beforeEach(() => {
    tree = createMCTSTree();
  });

  describe('unexplored nodes prioritized', () => {
    it('should select unexplored child with high exploration score when parent has multiple visits', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child1 = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );
      tree.addChild(root.id, createAddStepAction('step2'), createTestWorkflow(), false);

      // Backpropagate multiple times to child1 only (building parent visit count)
      for (let i = 0; i < 5; i++) {
        tree.backpropagate(child1!.id, 0.5);
      }

      // child2 is unexplored, should have highest UCT due to exploration bonus
      // Now parent has 5 visits, so ln(5) > 0
      const bestChild = tree.selectBestChild(root.id);

      expect(bestChild).not.toBeNull();
      expect(bestChild?.exploration).toBeGreaterThan(0);
    });

    it('should give maximum exploration bonus to unvisited nodes with high parent visits', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child1 = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );
      tree.addChild(root.id, createAddStepAction('step2'), createTestWorkflow(), false);

      // Backpropagate multiple times to child1 (this also increments root visits)
      for (let i = 0; i < 10; i++) {
        tree.backpropagate(child1!.id, 0.5);
      }

      // child2 is unvisited but has exploration bonus due to parent visits
      const bestChild = tree.selectBestChild(root.id);

      expect(bestChild).not.toBeNull();
      // With high parent visits and low child visits, exploration should be significant
      expect(bestChild?.exploration).toBeGreaterThan(0);
    });

    it('should return zero exploration when parent has only 1 visit (ln(1) = 0)', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );

      // Only backpropagate once - parent has 1 visit
      tree.backpropagate(child!.id, 0.5);

      const bestChild = tree.selectBestChild(root.id);

      expect(bestChild).not.toBeNull();
      // ln(1) = 0, so exploration = c * sqrt(0 / childVisits) = 0
      expect(bestChild?.exploration).toBe(0);
    });
  });

  describe('balance exploration vs exploitation', () => {
    it('should prefer high-value nodes as visits accumulate', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child1 = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );
      const child2 = tree.addChild(
        root.id,
        createAddStepAction('step2'),
        createTestWorkflow(),
        false
      );

      // Give child1 higher value over many visits
      for (let i = 0; i < 10; i++) {
        tree.backpropagate(child1!.id, 0.9);
        tree.backpropagate(child2!.id, 0.1);
      }

      const bestChild = tree.selectBestChild(root.id);

      expect(bestChild).not.toBeNull();
      expect(bestChild?.nodeId).toBe(child1?.id);
      expect(bestChild?.exploitation).toBeGreaterThan(0.8);
    });

    it('should consider both exploitation and exploration in UCT with sufficient parent visits', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child1 = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );
      const child2 = tree.addChild(
        root.id,
        createAddStepAction('step2'),
        createTestWorkflow(),
        false
      );

      // Backpropagate to both children multiple times to build up parent visits
      for (let i = 0; i < 5; i++) {
        tree.backpropagate(child1!.id, 0.7);
        tree.backpropagate(child2!.id, 0.3);
      }

      const bestChild = tree.selectBestChild(root.id);

      expect(bestChild).not.toBeNull();
      expect(bestChild?.exploitation).toBeGreaterThan(0);
      // With parent visits > 1, ln(parentVisits) > 0, so exploration > 0
      expect(bestChild?.exploration).toBeGreaterThan(0);
      expect(bestChild?.total).toBe(bestChild!.exploitation + bestChild!.exploration);
    });

    it('should compute total as sum of exploitation and exploration', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );

      tree.backpropagate(child!.id, 0.7);

      const bestChild = tree.selectBestChild(root.id);

      expect(bestChild).not.toBeNull();
      expect(bestChild?.total).toBeCloseTo(bestChild!.exploitation + bestChild!.exploration, 10);
    });
  });

  describe('UCB formula correctness', () => {
    it('should calculate UCT correctly: avgValue + C * sqrt(ln(parent) / child)', () => {
      const explorationConstant = 1.0;
      const tree = createMCTSTree({ explorationConstant });

      const root = tree.initializeRoot(createTestWorkflow());
      const child = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );

      // Backpropagate 5 times to child with value 0.6
      for (let i = 0; i < 5; i++) {
        tree.backpropagate(child!.id, 0.6);
      }

      // Root has 5 visits, child has 5 visits
      // UCT = 0.6 + 1.0 * sqrt(ln(5) / 5)
      const expectedExploitation = 0.6;
      const expectedExploration = explorationConstant * Math.sqrt(Math.log(5) / 5);

      const bestChild = tree.selectBestChild(root.id);

      expect(bestChild?.exploitation).toBeCloseTo(expectedExploitation, 5);
      expect(bestChild?.exploration).toBeCloseTo(expectedExploration, 5);
    });

    it('should use configured exploration constant with sufficient visits', () => {
      const highExplorationTree = createMCTSTree({ explorationConstant: 2.0 });
      const lowExplorationTree = createMCTSTree({ explorationConstant: 0.5 });

      // Build up enough visits so ln(parentVisits) > 0
      [highExplorationTree, lowExplorationTree].forEach((t) => {
        const root = t.initializeRoot(createTestWorkflow());
        const child = t.addChild(
          root.id,
          createAddStepAction('step1'),
          createTestWorkflow(),
          false
        );
        // Multiple backpropagations to get parent visits > 1
        for (let i = 0; i < 5; i++) {
          t.backpropagate(child!.id, 0.5);
        }
      });

      const highScore = highExplorationTree.selectBestChild(highExplorationTree.getRoot()!.id);
      const lowScore = lowExplorationTree.selectBestChild(lowExplorationTree.getRoot()!.id);

      // Both should have non-zero exploration now
      expect(highScore?.exploration).toBeGreaterThan(0);
      expect(lowScore?.exploration).toBeGreaterThan(0);
      // Higher exploration constant should give higher exploration component
      expect(highScore?.exploration).toBeGreaterThan(lowScore!.exploration);
    });

    it('should return null for node with no children', () => {
      const root = tree.initializeRoot(createTestWorkflow());

      const result = tree.selectBestChild(root.id);

      expect(result).toBeNull();
    });

    it('should return null for non-existent node', () => {
      tree.initializeRoot(createTestWorkflow());

      const result = tree.selectBestChild('non-existent');

      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// Node Operations Tests
// ============================================================================

describe('Node Operations', () => {
  let tree: MCTSTree;

  beforeEach(() => {
    tree = createMCTSTree();
  });

  describe('addChild creates proper parent-child relationship', () => {
    it('should link child to parent', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const action = createAddStepAction('step1');

      const child = tree.addChild(root.id, action, createTestWorkflow(), false);

      expect(child).not.toBeNull();
      expect(child?.parentId).toBe(root.id);
    });

    it('should store action that led to child', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const action = createAddStepAction('step1');

      const child = tree.addChild(root.id, action, createTestWorkflow(), false);

      expect(child?.action).toEqual(action);
    });

    it('should increment child depth from parent', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );
      const grandchild = tree.addChild(
        child!.id,
        createAddStepAction('step2'),
        createTestWorkflow(),
        false
      );

      expect(root.depth).toBe(0);
      expect(child?.depth).toBe(1);
      expect(grandchild?.depth).toBe(2);
    });

    it('should update parent children array', () => {
      const root = tree.initializeRoot(createTestWorkflow());

      tree.addChild(root.id, createAddStepAction('step1'), createTestWorkflow(), false);
      tree.addChild(root.id, createAddStepAction('step2'), createTestWorkflow(), false);

      const updatedRoot = tree.getRoot();
      expect(updatedRoot?.children.length).toBe(2);
    });

    it('should return null when parent does not exist', () => {
      tree.initializeRoot(createTestWorkflow());

      const result = tree.addChild(
        'non-existent',
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );

      expect(result).toBeNull();
    });
  });

  describe('getChildren returns all children', () => {
    it('should return empty array for node with no children', () => {
      const root = tree.initializeRoot(createTestWorkflow());

      const children = tree.getChildren(root.id);

      expect(children).toEqual([]);
    });

    it('should return all child nodes', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      tree.addChild(root.id, createAddStepAction('step1'), createTestWorkflow(), false);
      tree.addChild(root.id, createAddStepAction('step2'), createTestWorkflow(), false);
      tree.addChild(root.id, createAddStepAction('step3'), createTestWorkflow(), false);

      const children = tree.getChildren(root.id);

      expect(children.length).toBe(3);
    });

    it('should return empty array for non-existent node', () => {
      tree.initializeRoot(createTestWorkflow());

      const children = tree.getChildren('non-existent');

      expect(children).toEqual([]);
    });
  });

  describe('getBestChild with different policies', () => {
    it('should return best terminal node by average value', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child1 = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        true
      );
      const child2 = tree.addChild(
        root.id,
        createAddStepAction('step2'),
        createTestWorkflow(),
        true
      );

      // Give child2 higher value
      tree.backpropagate(child1!.id, 0.3);
      tree.backpropagate(child2!.id, 0.9);

      const best = tree.getBestTerminal();

      expect(best).not.toBeNull();
      expect(best?.id).toBe(child2?.id);
    });

    it('should return best node by average value (any depth)', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );
      const grandchild = tree.addChild(
        child!.id,
        createAddStepAction('step2'),
        createTestWorkflow(),
        false
      );

      // Give grandchild highest value
      tree.backpropagate(child!.id, 0.5);
      tree.backpropagate(grandchild!.id, 0.95);

      const best = tree.getBestNode();

      expect(best).not.toBeNull();
      expect(best?.id).toBe(grandchild?.id);
    });

    it('should return null when no visited nodes', () => {
      tree.initializeRoot(createTestWorkflow());

      const best = tree.getBestNode();

      expect(best).toBeNull();
    });

    it('should return null when no terminal nodes', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      tree.addChild(root.id, createAddStepAction('step1'), createTestWorkflow(), false);

      const best = tree.getBestTerminal();

      expect(best).toBeNull();
    });
  });
});

// ============================================================================
// Expansion Tests
// ============================================================================

describe('Expansion', () => {
  let tree: MCTSTree;

  beforeEach(() => {
    tree = createMCTSTree();
  });

  describe('expand from leaf node', () => {
    it('should add child to leaf node', () => {
      const root = tree.initializeRoot(createTestWorkflow());

      const child = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );

      expect(child).not.toBeNull();
      expect(tree.size).toBe(2);
    });

    it('should preserve workflow in new child', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const newWorkflow = createTestWorkflow('modified-workflow');

      const child = tree.addChild(root.id, createAddStepAction('step1'), newWorkflow, false);

      expect(child?.workflow.name).toBe('modified-workflow');
    });
  });

  describe('expand with multiple children', () => {
    it('should support multiple children from same parent', () => {
      const root = tree.initializeRoot(createTestWorkflow());

      tree.addChild(root.id, createAddStepAction('step1'), createTestWorkflow(), false);
      tree.addChild(root.id, createAddStepAction('step2'), createTestWorkflow(), false);
      tree.addChild(root.id, createAddStepAction('step3'), createTestWorkflow(), false);

      expect(tree.size).toBe(4);
      const children = tree.getChildren(root.id);
      expect(children.length).toBe(3);
    });

    it('should assign unique IDs to each child', () => {
      const root = tree.initializeRoot(createTestWorkflow());

      const child1 = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );
      const child2 = tree.addChild(
        root.id,
        createAddStepAction('step2'),
        createTestWorkflow(),
        false
      );

      expect(child1?.id).not.toBe(child2?.id);
    });
  });

  describe('terminal node handling', () => {
    it('should mark node as terminal when specified', () => {
      const root = tree.initializeRoot(createTestWorkflow());

      const terminal = tree.addChild(root.id, createTerminateAction(), createTestWorkflow(), true);

      expect(terminal?.isTerminal).toBe(true);
    });

    it('should select terminal nodes during selection phase', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const terminal = tree.addChild(root.id, createTerminateAction(), createTestWorkflow(), true);
      tree.backpropagate(terminal!.id, 0.8);

      const selected = tree.select();

      expect(selected).not.toBeNull();
      expect(selected?.isTerminal).toBe(true);
    });
  });
});

// ============================================================================
// Backpropagation Tests
// ============================================================================

describe('Backpropagation', () => {
  let tree: MCTSTree;

  beforeEach(() => {
    tree = createMCTSTree();
  });

  describe('value propagates up tree', () => {
    it('should update node value after backpropagation', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );

      tree.backpropagate(child!.id, 0.75);

      const updatedChild = tree.getNode(child!.id);
      expect(updatedChild?.avgValue).toBe(0.75);
    });

    it('should propagate value to all ancestors', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );
      const grandchild = tree.addChild(
        child!.id,
        createAddStepAction('step2'),
        createTestWorkflow(),
        false
      );

      tree.backpropagate(grandchild!.id, 0.8);

      const updatedGrandchild = tree.getNode(grandchild!.id);
      const updatedChild = tree.getNode(child!.id);
      const updatedRoot = tree.getRoot();

      expect(updatedGrandchild?.avgValue).toBe(0.8);
      expect(updatedChild?.avgValue).toBe(0.8);
      expect(updatedRoot?.avgValue).toBe(0.8);
    });
  });

  describe('visit counts increment', () => {
    it('should increment visit count on backpropagation', () => {
      const root = tree.initializeRoot(createTestWorkflow());

      expect(root.visitCount).toBe(0);

      tree.backpropagate(root.id, 0.5);

      const updated = tree.getRoot();
      expect(updated?.visitCount).toBe(1);
    });

    it('should increment visit count for all nodes in path', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );
      const grandchild = tree.addChild(
        child!.id,
        createAddStepAction('step2'),
        createTestWorkflow(),
        false
      );

      tree.backpropagate(grandchild!.id, 0.5);

      expect(tree.getNode(grandchild!.id)?.visitCount).toBe(1);
      expect(tree.getNode(child!.id)?.visitCount).toBe(1);
      expect(tree.getRoot()?.visitCount).toBe(1);
    });
  });

  describe('multiple backpropagations accumulate', () => {
    it('should accumulate total value', () => {
      const root = tree.initializeRoot(createTestWorkflow());

      tree.backpropagate(root.id, 0.6);
      tree.backpropagate(root.id, 0.8);
      tree.backpropagate(root.id, 0.4);

      const updated = tree.getRoot();
      expect(updated?.totalValue).toBeCloseTo(1.8, 5);
      expect(updated?.visitCount).toBe(3);
      expect(updated?.avgValue).toBeCloseTo(0.6, 5);
    });

    it('should correctly compute running average', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );

      // 5 visits with varying values
      tree.backpropagate(child!.id, 1.0);
      tree.backpropagate(child!.id, 0.5);
      tree.backpropagate(child!.id, 0.75);
      tree.backpropagate(child!.id, 0.25);
      tree.backpropagate(child!.id, 1.0);

      const updated = tree.getNode(child!.id);
      const expectedAvg = (1.0 + 0.5 + 0.75 + 0.25 + 1.0) / 5;

      expect(updated?.avgValue).toBeCloseTo(expectedAvg, 5);
    });

    it('should track total simulations', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );

      tree.backpropagate(child!.id, 0.5);
      tree.backpropagate(child!.id, 0.5);

      const stats = tree.getStats();
      // Each backprop from child increments both child and root = 2 per call
      expect(stats.totalSimulations).toBe(4);
    });
  });
});

// ============================================================================
// Selection Phase Tests
// ============================================================================

describe('Selection Phase', () => {
  let tree: MCTSTree;

  beforeEach(() => {
    tree = createMCTSTree();
  });

  it('should return root when tree has only root', () => {
    const root = tree.initializeRoot(createTestWorkflow());

    const selected = tree.select();

    expect(selected?.id).toBe(root.id);
  });

  it('should traverse to leaf using UCT', () => {
    const root = tree.initializeRoot(createTestWorkflow());
    const child = tree.addChild(root.id, createAddStepAction('step1'), createTestWorkflow(), false);
    const grandchild = tree.addChild(
      child!.id,
      createAddStepAction('step2'),
      createTestWorkflow(),
      false
    );

    // Backpropagate to make path traversable
    tree.backpropagate(grandchild!.id, 0.5);

    const selected = tree.select();

    // Should select deepest unexpanded or terminal
    expect(selected).not.toBeNull();
    expect(selected?.depth).toBeGreaterThanOrEqual(0);
  });

  it('should stop at terminal nodes', () => {
    const root = tree.initializeRoot(createTestWorkflow());
    const child = tree.addChild(root.id, createAddStepAction('step1'), createTestWorkflow(), true);
    tree.backpropagate(child!.id, 0.5);

    const selected = tree.select();

    expect(selected?.isTerminal).toBe(true);
  });

  it('should return null for empty tree', () => {
    const selected = tree.select();

    expect(selected).toBeNull();
  });
});

// ============================================================================
// Tree Statistics Tests
// ============================================================================

describe('Tree Statistics', () => {
  let tree: MCTSTree;

  beforeEach(() => {
    tree = createMCTSTree();
  });

  describe('total nodes count', () => {
    it('should count all nodes in tree', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      tree.addChild(root.id, createAddStepAction('step1'), createTestWorkflow(), false);
      tree.addChild(root.id, createAddStepAction('step2'), createTestWorkflow(), false);

      const stats = tree.getStats();

      expect(stats.totalNodes).toBe(3);
    });

    it('should return 0 for empty tree', () => {
      const stats = tree.getStats();

      expect(stats.totalNodes).toBe(0);
    });
  });

  describe('depth calculation', () => {
    it('should track maximum depth reached', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const level1 = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );
      const level2 = tree.addChild(
        level1!.id,
        createAddStepAction('step2'),
        createTestWorkflow(),
        false
      );
      tree.addChild(level2!.id, createAddStepAction('step3'), createTestWorkflow(), false);

      const stats = tree.getStats();

      expect(stats.maxDepthReached).toBe(3);
    });

    it('should return 0 for root-only tree', () => {
      tree.initializeRoot(createTestWorkflow());

      const stats = tree.getStats();

      expect(stats.maxDepthReached).toBe(0);
    });
  });

  describe('branching factor', () => {
    it('should calculate average branching factor', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      tree.addChild(root.id, createAddStepAction('step1'), createTestWorkflow(), false);
      tree.addChild(root.id, createAddStepAction('step2'), createTestWorkflow(), false);
      tree.addChild(root.id, createAddStepAction('step3'), createTestWorkflow(), false);

      const stats = tree.getStats();

      expect(stats.avgBranchingFactor).toBe(3);
    });

    it('should average branching across multiple parents', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child1 = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );
      tree.addChild(root.id, createAddStepAction('step2'), createTestWorkflow(), false);
      tree.addChild(child1!.id, createAddStepAction('step3'), createTestWorkflow(), false);
      tree.addChild(child1!.id, createAddStepAction('step4'), createTestWorkflow(), false);

      const stats = tree.getStats();

      // root has 2 children, child1 has 2 children
      expect(stats.avgBranchingFactor).toBe(2);
    });

    it('should return 0 for tree with no branches', () => {
      tree.initializeRoot(createTestWorkflow());

      const stats = tree.getStats();

      expect(stats.avgBranchingFactor).toBe(0);
    });
  });

  describe('terminal node statistics', () => {
    it('should calculate average terminal score', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const t1 = tree.addChild(root.id, createTerminateAction(), createTestWorkflow(), true);
      const t2 = tree.addChild(root.id, createTerminateAction(), createTestWorkflow(), true);

      tree.backpropagate(t1!.id, 0.6);
      tree.backpropagate(t2!.id, 0.8);

      const stats = tree.getStats();

      expect(stats.avgTerminalScore).toBeCloseTo((0.6 + 0.8) / 2, 5);
    });

    it('should track best score found', () => {
      const root = tree.initializeRoot(createTestWorkflow());
      const child1 = tree.addChild(
        root.id,
        createAddStepAction('step1'),
        createTestWorkflow(),
        false
      );
      const child2 = tree.addChild(
        root.id,
        createAddStepAction('step2'),
        createTestWorkflow(),
        false
      );

      tree.backpropagate(child1!.id, 0.3);
      tree.backpropagate(child2!.id, 0.95);

      const stats = tree.getStats();

      expect(stats.bestScore).toBeCloseTo(0.95, 5);
    });
  });
});

// ============================================================================
// Path and Navigation Tests
// ============================================================================

describe('Path and Navigation', () => {
  let tree: MCTSTree;

  beforeEach(() => {
    tree = createMCTSTree();
  });

  it('should return path from root to node', () => {
    const root = tree.initializeRoot(createTestWorkflow());
    const child = tree.addChild(root.id, createAddStepAction('step1'), createTestWorkflow(), false);
    const grandchild = tree.addChild(
      child!.id,
      createAddStepAction('step2'),
      createTestWorkflow(),
      false
    );

    const path = tree.getPathToNode(grandchild!.id);

    expect(path.length).toBe(3);
    expect(path[0]?.id).toBe(root.id);
    expect(path[1]?.id).toBe(child?.id);
    expect(path[2]?.id).toBe(grandchild?.id);
  });

  it('should return single-element path for root', () => {
    const root = tree.initializeRoot(createTestWorkflow());

    const path = tree.getPathToNode(root.id);

    expect(path.length).toBe(1);
    expect(path[0]?.id).toBe(root.id);
  });

  it('should return empty path for non-existent node', () => {
    tree.initializeRoot(createTestWorkflow());

    const path = tree.getPathToNode('non-existent');

    expect(path).toEqual([]);
  });
});

// ============================================================================
// Expansion Status Tests
// ============================================================================

describe('Expansion Status', () => {
  let tree: MCTSTree;

  beforeEach(() => {
    tree = createMCTSTree();
  });

  it('should count unexpanded children', () => {
    const root = tree.initializeRoot(createTestWorkflow());
    const child1 = tree.addChild(
      root.id,
      createAddStepAction('step1'),
      createTestWorkflow(),
      false
    );
    tree.addChild(root.id, createAddStepAction('step2'), createTestWorkflow(), false);

    // Visit only child1
    tree.backpropagate(child1!.id, 0.5);

    const unexpanded = tree.getUnexpandedCount(root.id);

    expect(unexpanded).toBe(1);
  });

  it('should report fully expanded when all children visited', () => {
    const root = tree.initializeRoot(createTestWorkflow());
    const child1 = tree.addChild(
      root.id,
      createAddStepAction('step1'),
      createTestWorkflow(),
      false
    );
    const child2 = tree.addChild(
      root.id,
      createAddStepAction('step2'),
      createTestWorkflow(),
      false
    );

    tree.backpropagate(child1!.id, 0.5);
    tree.backpropagate(child2!.id, 0.5);

    expect(tree.isFullyExpanded(root.id)).toBe(true);
  });

  it('should report not fully expanded when children unvisited', () => {
    const root = tree.initializeRoot(createTestWorkflow());
    tree.addChild(root.id, createAddStepAction('step1'), createTestWorkflow(), false);

    expect(tree.isFullyExpanded(root.id)).toBe(false);
  });

  it('should report fully expanded for node with no children', () => {
    const root = tree.initializeRoot(createTestWorkflow());

    expect(tree.isFullyExpanded(root.id)).toBe(true);
  });
});

// ============================================================================
// Pruning Tests
// ============================================================================

describe('Pruning', () => {
  let tree: MCTSTree;

  beforeEach(() => {
    tree = createMCTSTree();
  });

  it('should prune nodes below score threshold', () => {
    const root = tree.initializeRoot(createTestWorkflow());
    const lowScoreChild = tree.addChild(
      root.id,
      createAddStepAction('step1'),
      createTestWorkflow(),
      false
    );
    const highScoreChild = tree.addChild(
      root.id,
      createAddStepAction('step2'),
      createTestWorkflow(),
      false
    );

    // Give low score child many visits with low value
    for (let i = 0; i < 10; i++) {
      tree.backpropagate(lowScoreChild!.id, 0.1);
    }

    // Give high score child visits with high value
    for (let i = 0; i < 10; i++) {
      tree.backpropagate(highScoreChild!.id, 0.9);
    }

    const pruned = tree.prune(0.5);

    expect(pruned).toBe(1);
    expect(tree.getNode(lowScoreChild!.id)).toBeNull();
    expect(tree.getNode(highScoreChild!.id)).not.toBeNull();
  });

  it('should not prune root node', () => {
    const root = tree.initializeRoot(createTestWorkflow());

    // Give root low score
    for (let i = 0; i < 10; i++) {
      tree.backpropagate(root.id, 0.1);
    }

    const pruned = tree.prune(0.5);

    expect(pruned).toBe(0);
    expect(tree.getRoot()).not.toBeNull();
  });

  it('should not prune nodes with few visits', () => {
    const root = tree.initializeRoot(createTestWorkflow());
    const child = tree.addChild(root.id, createAddStepAction('step1'), createTestWorkflow(), false);

    // Only a few visits (< 5 threshold)
    tree.backpropagate(child!.id, 0.1);
    tree.backpropagate(child!.id, 0.1);

    const pruned = tree.prune(0.5);

    expect(pruned).toBe(0);
    expect(tree.getNode(child!.id)).not.toBeNull();
  });

  it('should recursively remove children of pruned nodes', () => {
    const root = tree.initializeRoot(createTestWorkflow());
    const parent = tree.addChild(
      root.id,
      createAddStepAction('step1'),
      createTestWorkflow(),
      false
    );
    const child = tree.addChild(
      parent!.id,
      createAddStepAction('step2'),
      createTestWorkflow(),
      false
    );

    // Give low scores to both
    for (let i = 0; i < 10; i++) {
      tree.backpropagate(parent!.id, 0.1);
      tree.backpropagate(child!.id, 0.1);
    }

    tree.prune(0.5);

    // Both should be removed (child implicitly via parent)
    expect(tree.getNode(parent!.id)).toBeNull();
    expect(tree.getNode(child!.id)).toBeNull();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  describe('single node tree', () => {
    it('should handle operations on single-node tree', () => {
      const tree = createMCTSTree();
      const root = tree.initializeRoot(createTestWorkflow());

      tree.backpropagate(root.id, 0.5);

      expect(tree.size).toBe(1);
      expect(tree.getRoot()?.avgValue).toBe(0.5);
      expect(tree.select()?.id).toBe(root.id);
      expect(tree.getChildren(root.id)).toEqual([]);
      expect(tree.getPathToNode(root.id).length).toBe(1);
    });
  });

  describe('very deep tree', () => {
    it('should handle deep tree (depth 50)', () => {
      const tree = createMCTSTree();
      let current = tree.initializeRoot(createTestWorkflow());

      for (let i = 0; i < 50; i++) {
        const next = tree.addChild(
          current.id,
          createAddStepAction(`step${String(i)}`),
          createTestWorkflow(),
          false
        );
        current = next!;
      }

      expect(tree.size).toBe(51);
      expect(current.depth).toBe(50);

      const stats = tree.getStats();
      expect(stats.maxDepthReached).toBe(50);

      const path = tree.getPathToNode(current.id);
      expect(path.length).toBe(51);
    });

    it('should backpropagate through deep tree correctly', () => {
      const tree = createMCTSTree();
      let current = tree.initializeRoot(createTestWorkflow());
      const nodeIds: string[] = [current.id];

      for (let i = 0; i < 20; i++) {
        const next = tree.addChild(
          current.id,
          createAddStepAction(`step${String(i)}`),
          createTestWorkflow(),
          false
        );
        nodeIds.push(next!.id);
        current = next!;
      }

      tree.backpropagate(current.id, 1.0);

      // All nodes in path should have visit count 1
      for (const id of nodeIds) {
        expect(tree.getNode(id)?.visitCount).toBe(1);
        expect(tree.getNode(id)?.avgValue).toBe(1.0);
      }
    });
  });

  describe('wide tree (many children)', () => {
    it('should handle node with 100 children', () => {
      const tree = createMCTSTree();
      const root = tree.initializeRoot(createTestWorkflow());

      for (let i = 0; i < 100; i++) {
        tree.addChild(
          root.id,
          createAddStepAction(`step${String(i)}`),
          createTestWorkflow(),
          false
        );
      }

      expect(tree.size).toBe(101);

      const children = tree.getChildren(root.id);
      expect(children.length).toBe(100);

      const stats = tree.getStats();
      expect(stats.avgBranchingFactor).toBe(100);
    });

    it('should select among many children correctly', () => {
      const tree = createMCTSTree();
      const root = tree.initializeRoot(createTestWorkflow());
      const childIds: string[] = [];

      for (let i = 0; i < 20; i++) {
        const child = tree.addChild(
          root.id,
          createAddStepAction(`step${String(i)}`),
          createTestWorkflow(),
          false
        );
        childIds.push(child!.id);
      }

      // Give varying scores
      for (let i = 0; i < childIds.length; i++) {
        const childId = childIds[i];
        if (childId !== undefined) {
          tree.backpropagate(childId, i / 20); // scores 0 to 0.95
        }
      }

      const best = tree.selectBestChild(root.id);

      expect(best).not.toBeNull();
      // Should select highest scored child (index 19)
      expect(best?.nodeId).toBe(childIds[19]);
    });
  });

  describe('configuration options', () => {
    it('should respect custom exploration constant with sufficient visits', () => {
      const highExploration = createMCTSTree({ explorationConstant: 5.0 });
      const lowExploration = createMCTSTree({ explorationConstant: 0.1 });

      // Build up enough visits so ln(parentVisits) > 0
      [highExploration, lowExploration].forEach((tree) => {
        const root = tree.initializeRoot(createTestWorkflow());
        const child = tree.addChild(
          root.id,
          createAddStepAction('step1'),
          createTestWorkflow(),
          false
        );
        for (let i = 0; i < 5; i++) {
          tree.backpropagate(child!.id, 0.5);
        }
      });

      const highScore = highExploration.selectBestChild(highExploration.getRoot()!.id);
      const lowScore = lowExploration.selectBestChild(lowExploration.getRoot()!.id);

      // Both should have non-zero exploration
      expect(highScore?.exploration).toBeGreaterThan(0);
      expect(lowScore?.exploration).toBeGreaterThan(0);
      // Higher exploration constant should give higher exploration component
      // Ratio should be 5.0 / 0.1 = 50x
      expect(highScore!.exploration / lowScore!.exploration).toBeGreaterThan(10);
    });

    it('should merge partial config with defaults', () => {
      const tree = createMCTSTree({ explorationConstant: 2.0 });

      // Tree should work normally with partial config
      const root = tree.initializeRoot(createTestWorkflow());
      tree.addChild(root.id, createAddStepAction('step1'), createTestWorkflow(), false);

      expect(tree.size).toBe(2);
    });
  });

  describe('immutability of returned nodes', () => {
    it('should return immutable node copies', () => {
      const tree = createMCTSTree();
      const root = tree.initializeRoot(createTestWorkflow());

      const retrieved1 = tree.getNode(root.id);
      tree.backpropagate(root.id, 0.5);
      const retrieved2 = tree.getNode(root.id);

      // retrieved1 should still have old values (immutable copy)
      expect(retrieved1?.visitCount).toBe(0);
      expect(retrieved2?.visitCount).toBe(1);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createMCTSTree factory', () => {
  it('should create tree instance', () => {
    const tree = createMCTSTree();

    expect(tree).toBeInstanceOf(MCTSTree);
  });

  it('should accept configuration', () => {
    const config: Partial<AFlowConfig> = {
      maxIterations: 500,
      explorationConstant: 2.5,
    };

    const tree = createMCTSTree(config);
    const root = tree.initializeRoot(createTestWorkflow());
    const child = tree.addChild(root.id, createAddStepAction('step1'), createTestWorkflow(), false);

    // Multiple backpropagations to get parent visits > 1
    for (let i = 0; i < 5; i++) {
      tree.backpropagate(child!.id, 0.5);
    }

    // Verify exploration constant is applied (with sufficient visits)
    const score = tree.selectBestChild(root.id);
    expect(score?.exploration).toBeGreaterThan(0);
  });

  it('should use default config when not provided', () => {
    const tree = createMCTSTree();
    const root = tree.initializeRoot(createTestWorkflow());
    const child = tree.addChild(root.id, createAddStepAction('step1'), createTestWorkflow(), false);
    tree.backpropagate(child!.id, 0.5);

    // With default config (sqrt(2) exploration), should work correctly
    const score = tree.selectBestChild(root.id);
    expect(score).not.toBeNull();
  });
});
