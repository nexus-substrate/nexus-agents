/**
 * nexus-agents/workflows - MCTS Tree Implementation
 *
 * Monte Carlo Tree Search implementation for workflow discovery.
 * Implements UCT (Upper Confidence Bound for Trees) selection.
 *
 * @module workflows/aflow/mcts-tree
 * (Source: Issue #329, arXiv:2410.10762)
 */

import { generateUUID } from '../../utils/index.js';
import type { WorkflowDefinition } from '../../core/index.js';
import type { MCTSNode, UCTScore, WorkflowAction, AFlowConfig, MCTSStats } from './aflow-types.js';
import { DEFAULT_AFLOW_CONFIG } from './aflow-types.js';
import {
  type MutableNode,
  toImmutableNode,
  calculateTreeStats,
  createMutableNode,
} from './mcts-tree-helpers.js';

/**
 * MCTS Tree for workflow search.
 */
export class MCTSTree {
  private readonly config: AFlowConfig;
  private readonly nodes: Map<string, MutableNode> = new Map();
  private rootId: string | null = null;
  private totalSimulations = 0;

  constructor(config: Partial<AFlowConfig> = {}) {
    this.config = { ...DEFAULT_AFLOW_CONFIG, ...config };
  }

  /**
   * Initialize tree with root workflow.
   */
  initializeRoot(workflow: WorkflowDefinition): MCTSNode {
    const root = createMutableNode({
      id: generateUUID(),
      workflow,
      parentId: null,
      action: null,
      depth: 0,
      isTerminal: false,
    });
    this.nodes.set(root.id, root);
    this.rootId = root.id;
    return toImmutableNode(root);
  }

  /**
   * Get the root node.
   */
  getRoot(): MCTSNode | null {
    if (this.rootId === null) return null;
    const root = this.nodes.get(this.rootId);
    return root ? toImmutableNode(root) : null;
  }

  /**
   * Get a node by ID.
   */
  getNode(nodeId: string): MCTSNode | null {
    const node = this.nodes.get(nodeId);
    return node ? toImmutableNode(node) : null;
  }

  /**
   * Add a child node after taking an action.
   */
  addChild(
    parentId: string,
    action: WorkflowAction,
    resultingWorkflow: WorkflowDefinition,
    isTerminal: boolean
  ): MCTSNode | null {
    const parent = this.nodes.get(parentId);
    if (!parent) return null;

    const child = createMutableNode({
      id: generateUUID(),
      workflow: resultingWorkflow,
      parentId,
      action,
      depth: parent.depth + 1,
      isTerminal,
    });

    this.nodes.set(child.id, child);
    parent.children.push(child.id);

    return toImmutableNode(child);
  }

  /**
   * UCT selection - select best child node using UCT formula.
   * UCT = avgValue + C * sqrt(ln(parentVisits) / childVisits)
   */
  selectBestChild(nodeId: string): UCTScore | null {
    const node = this.nodes.get(nodeId);
    if (!node || node.children.length === 0) return null;

    const scores = this.calculateUCTScores(node);
    if (scores.length === 0) return null;

    // Sort by total UCT score (descending)
    scores.sort((a, b) => b.total - a.total);
    return scores[0] ?? null;
  }

  /**
   * Calculate UCT scores for all children of a node.
   */
  calculateUCTScores(node: MutableNode): UCTScore[] {
    const parentVisits = Math.max(node.visitCount, 1);
    const lnParent = Math.log(parentVisits);
    const c = this.config.explorationConstant;

    return node.children
      .map((childId) => {
        const child = this.nodes.get(childId);
        if (!child) return null;

        const childVisits = Math.max(child.visitCount, 1);
        const exploitation = child.avgValue;
        const exploration = c * Math.sqrt(lnParent / childVisits);
        const total = exploitation + exploration;

        return { nodeId: childId, exploitation, exploration, total };
      })
      .filter((score): score is UCTScore => score !== null);
  }

  /**
   * Selection phase - traverse tree selecting best children until leaf.
   */
  select(): MCTSNode | null {
    if (this.rootId === null) return null;

    let currentId = this.rootId;
    let current = this.nodes.get(currentId);

    while (current && !current.isTerminal && current.children.length > 0) {
      const bestChild = this.selectBestChild(currentId);
      if (!bestChild) break;

      currentId = bestChild.nodeId;
      const next = this.nodes.get(currentId);
      if (!next) break;
      current = next;
    }

    return current ? toImmutableNode(current) : null;
  }

  /**
   * Backpropagate value from leaf to root.
   */
  backpropagate(nodeId: string, value: number): void {
    let currentId: string | null = nodeId;

    while (currentId !== null) {
      const node = this.nodes.get(currentId);
      if (!node) break;

      node.visitCount++;
      node.totalValue += value;
      node.avgValue = node.totalValue / node.visitCount;

      currentId = node.parentId;
    }

    this.totalSimulations++;
  }

  /**
   * Get all children of a node.
   */
  getChildren(nodeId: string): readonly MCTSNode[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];

    return node.children
      .map((childId) => this.nodes.get(childId))
      .filter((child): child is MutableNode => child !== undefined)
      .map((child) => toImmutableNode(child));
  }

  /**
   * Get unexpanded children count (nodes not yet visited).
   */
  getUnexpandedCount(nodeId: string): number {
    const node = this.nodes.get(nodeId);
    if (!node) return 0;

    return node.children.filter((childId) => {
      const child = this.nodes.get(childId);
      return child?.visitCount === 0;
    }).length;
  }

  /**
   * Check if a node is fully expanded (all children visited at least once).
   */
  isFullyExpanded(nodeId: string): boolean {
    return this.getUnexpandedCount(nodeId) === 0;
  }

  /**
   * Get the best terminal node found so far.
   */
  getBestTerminal(): MCTSNode | null {
    let best: MutableNode | null = null;
    let bestScore = -Infinity;

    for (const node of this.nodes.values()) {
      if (node.isTerminal && node.avgValue > bestScore) {
        best = node;
        bestScore = node.avgValue;
      }
    }

    return best ? toImmutableNode(best) : null;
  }

  /**
   * Get the best node (highest average value) at any depth.
   */
  getBestNode(): MCTSNode | null {
    let best: MutableNode | null = null;
    let bestScore = -Infinity;

    for (const node of this.nodes.values()) {
      if (node.visitCount > 0 && node.avgValue > bestScore) {
        best = node;
        bestScore = node.avgValue;
      }
    }

    return best ? toImmutableNode(best) : null;
  }

  /**
   * Mark a node as terminal.
   */
  markTerminal(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.isTerminal = true;
    }
  }

  /**
   * Get path from root to a node.
   */
  getPathToNode(nodeId: string): readonly MCTSNode[] {
    const path: MCTSNode[] = [];
    let currentId: string | null = nodeId;

    while (currentId !== null) {
      const node = this.nodes.get(currentId);
      if (!node) break;
      path.unshift(toImmutableNode(node));
      currentId = node.parentId;
    }

    return path;
  }

  /**
   * Get tree statistics.
   */
  getStats(): MCTSStats {
    return calculateTreeStats(this.nodes, () => this.getBestNode(), this.totalSimulations);
  }

  /**
   * Prune nodes below score threshold to save memory.
   */
  prune(minScore: number): number {
    const toRemove: string[] = [];

    for (const [id, node] of this.nodes.entries()) {
      if (id !== this.rootId && node.visitCount > 5 && node.avgValue < minScore) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.removeNode(id);
    }

    return toRemove.length;
  }

  /**
   * Remove a node and update parent references.
   */
  private removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Remove from parent's children
    if (node.parentId !== null) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.children = parent.children.filter((id) => id !== nodeId);
      }
    }

    // Recursively remove children
    for (const childId of node.children) {
      this.removeNode(childId);
    }

    this.nodes.delete(nodeId);
  }

  /**
   * Get total node count.
   */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * Clear the tree.
   */
  clear(): void {
    this.nodes.clear();
    this.rootId = null;
    this.totalSimulations = 0;
  }
}

/**
 * Create an MCTS tree with optional configuration.
 */
export function createMCTSTree(config?: Partial<AFlowConfig>): MCTSTree {
  return new MCTSTree(config);
}
