/**
 * nexus-agents/workflows - MCTS Tree Helper Types and Functions
 *
 * Internal types and helper functions for MCTS tree operations.
 * These are implementation details not exposed in the public API.
 *
 * @module workflows/aflow/mcts-tree-helpers
 * @internal
 */

import type { WorkflowDefinition } from '../../core/index.js';
import type { MCTSNode, WorkflowAction, MCTSStats } from './aflow-types.js';

/**
 * Mutable internal node representation for tree operations.
 * This mirrors MCTSNode but allows mutation for performance.
 * @internal
 */
export interface MutableNode {
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
 * Convert mutable node to immutable MCTSNode.
 * @internal
 */
export function toImmutableNode(node: MutableNode): MCTSNode {
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
 * Calculate tree statistics from node collection.
 * @internal
 */
export function calculateTreeStats(
  nodes: Map<string, MutableNode>,
  getBestNode: () => MCTSNode | null,
  totalSimulations: number
): MCTSStats {
  const terminals: MutableNode[] = [];
  let maxDepth = 0;
  let totalBranching = 0;
  let branchingCount = 0;

  for (const node of nodes.values()) {
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

  const bestNode = getBestNode();

  return {
    totalNodes: nodes.size,
    maxDepthReached: maxDepth,
    avgBranchingFactor: branchingCount > 0 ? totalBranching / branchingCount : 0,
    bestScore: bestNode?.avgValue ?? 0,
    avgTerminalScore,
    totalSimulations,
    nodesPruned: 0, // No pruning implemented yet
  };
}

/**
 * Options for creating a mutable node.
 * @internal
 */
export interface CreateNodeOptions {
  readonly id: string;
  readonly workflow: WorkflowDefinition;
  readonly parentId: string | null;
  readonly action: WorkflowAction | null;
  readonly depth: number;
  readonly isTerminal: boolean;
}

/**
 * Create a new mutable node.
 * @internal
 */
export function createMutableNode(options: CreateNodeOptions): MutableNode {
  return {
    id: options.id,
    workflow: options.workflow,
    parentId: options.parentId,
    action: options.action,
    children: [],
    visitCount: 0,
    totalValue: 0,
    avgValue: 0,
    depth: options.depth,
    isTerminal: options.isTerminal,
    createdAt: Date.now(),
  };
}
