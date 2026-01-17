/**
 * nexus-agents/workflows - MCTS Tree Implementation
 *
 * Monte Carlo Tree Search implementation for workflow discovery.
 * Implements UCT (Upper Confidence Bound for Trees) selection.
 *
 * @module workflows/aflow/mcts-tree
 * (Source: Issue #329, arXiv:2410.10762)
 */

import { v4 as uuidv4 } from 'uuid';
import type { WorkflowDefinition } from '../../core/index.js';
import type { MCTSNode, UCTScore, WorkflowAction, AFlowConfig, MCTSStats } from './aflow-types.js';
import { DEFAULT_AFLOW_CONFIG } from './aflow-types.js';

/**
 * Mutable internal node representation for tree operations.
 */
interface MutableNode {
  id: string;
  workflow: WorkflowDefinition;
  parentId: string | null;
  action: WorkflowAction | null;
  children: string[];
  visitCount: number;
  totalValue: number;
  avgValue: number;
  depth: number;
  isTerminal: boolean;
  createdAt: number;
}

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
    const root: MutableNode = {
      id: uuidv4(),
      workflow,
      parentId: null,
      action: null,
      children: [],
      visitCount: 0,
      totalValue: 0,
      avgValue: 0,
      depth: 0,
      isTerminal: false,
      createdAt: Date.now(),
    };

    this.nodes.set(root.id, root);
    this.rootId = root.id;

    return this.toImmutable(root);
  }

  /**
   * Get the root node.
   */
  getRoot(): MCTSNode | null {
    if (this.rootId === null) return null;
    const root = this.nodes.get(this.rootId);
    return root ? this.toImmutable(root) : null;
  }

  /**
   * Get a node by ID.
   */
  getNode(nodeId: string): MCTSNode | null {
    const node = this.nodes.get(nodeId);
    return node ? this.toImmutable(node) : null;
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

    const child: MutableNode = {
      id: uuidv4(),
      workflow: resultingWorkflow,
      parentId,
      action,
      children: [],
      visitCount: 0,
      totalValue: 0,
      avgValue: 0,
      depth: parent.depth + 1,
      isTerminal,
      createdAt: Date.now(),
    };

    this.nodes.set(child.id, child);
    parent.children.push(child.id);

    return this.toImmutable(child);
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

    return current ? this.toImmutable(current) : null;
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
      this.totalSimulations++;

      currentId = node.parentId;
    }
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
      .map((child) => this.toImmutable(child));
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

    return best ? this.toImmutable(best) : null;
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

    return best ? this.toImmutable(best) : null;
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
      path.unshift(this.toImmutable(node));
      currentId = node.parentId;
    }

    return path;
  }

  /**
   * Get tree statistics.
   */
  getStats(): MCTSStats {
    const terminals: MutableNode[] = [];
    let maxDepth = 0;
    let totalBranching = 0;
    let branchingCount = 0;

    for (const node of this.nodes.values()) {
      if (node.isTerminal) {
        terminals.push(node);
      }
      if (node.depth > maxDepth) {
        maxDepth = node.depth;
      }
      if (node.children.length > 0) {
        totalBranching += node.children.length;
        branchingCount++;
      }
    }

    const terminalScores = terminals.filter((n) => n.visitCount > 0).map((n) => n.avgValue);

    const avgTerminalScore =
      terminalScores.length > 0
        ? terminalScores.reduce((a, b) => a + b, 0) / terminalScores.length
        : 0;

    const bestNode = this.getBestNode();

    return {
      totalNodes: this.nodes.size,
      maxDepthReached: maxDepth,
      avgBranchingFactor: branchingCount > 0 ? totalBranching / branchingCount : 0,
      bestScore: bestNode?.avgValue ?? 0,
      avgTerminalScore,
      totalSimulations: this.totalSimulations,
      nodesPruned: 0, // No pruning implemented yet
    };
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
   * Convert mutable node to immutable MCTSNode.
   */
  private toImmutable(node: MutableNode): MCTSNode {
    return {
      id: node.id,
      workflow: node.workflow,
      parentId: node.parentId,
      action: node.action,
      children: [...node.children],
      visitCount: node.visitCount,
      totalValue: node.totalValue,
      avgValue: node.avgValue,
      depth: node.depth,
      isTerminal: node.isTerminal,
      createdAt: node.createdAt,
    };
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
