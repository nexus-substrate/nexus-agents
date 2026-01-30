/**
 * Forest-of-Thought Tree Operations
 * @module agents/reasoning/forest-engine-tree
 */

import { getTimeProvider } from '../../core/index.js';
import type { ForestId, TreeId, NodeId, ReasoningNode } from './forest-node-types.js';
import type { ReasoningTree } from './forest-tree-types.js';
import { generateTreeId, generateNodeId } from './forest-engine-ids.js';

/** Internal tracking for tree exploration. */
export interface TreeExplorationState {
  readonly activeNodeIds: readonly NodeId[];
  readonly completedNodeIds: readonly NodeId[];
  readonly currentDepth: number;
}

export type ExplorationStateMap = Map<TreeId, TreeExplorationState>;

/** Creates initial trees from hypotheses. */
export function createInitialTrees(
  hypotheses: readonly string[],
  forestId: ForestId
): { trees: Map<TreeId, ReasoningTree>; explorationState: ExplorationStateMap } {
  const time = getTimeProvider();
  const now = time.now();
  const trees = new Map<TreeId, ReasoningTree>();
  const explorationState: ExplorationStateMap = new Map();

  for (let i = 0; i < hypotheses.length; i++) {
    const treeId = generateTreeId(i);
    const rootNodeId = generateNodeId(i, 0);
    const hypothesis = hypotheses[i] ?? `Hypothesis ${String(i)}`;
    const rootNode = createRootNode(rootNodeId, treeId, hypothesis, now);
    const tree = createTree({
      id: treeId,
      forestId,
      rootId: rootNodeId,
      rootNode,
      hypothesis,
      now,
    });
    trees.set(treeId, tree);
    explorationState.set(treeId, {
      activeNodeIds: [rootNodeId],
      completedNodeIds: [],
      currentDepth: 0,
    });
  }
  return { trees, explorationState };
}

/** Creates a root node for a tree. */
function createRootNode(
  id: NodeId,
  treeId: TreeId,
  hypothesis: string,
  now: number
): ReasoningNode {
  return {
    id,
    treeId,
    parentId: null,
    children: [],
    depth: 0,
    stepType: 'hypothesis',
    content: hypothesis,
    metadata: {},
    state: 'active',
    confidence: 0.5,
    qualityScore: 0.5,
    estimatedValue: 0.5,
    isActive: true,
    activationScore: 1.0,
    createdAt: now,
    updatedAt: now,
  };
}

/** Tree creation input. */
interface CreateTreeInput {
  id: TreeId;
  forestId: ForestId;
  rootId: NodeId;
  rootNode: ReasoningNode;
  hypothesis: string;
  now: number;
}

/** Creates a new reasoning tree. */
function createTree(input: CreateTreeInput): ReasoningTree {
  const { id, forestId, rootId, rootNode, hypothesis, now } = input;
  return {
    id,
    forestId,
    rootId,
    nodes: new Map([[rootId, rootNode]]),
    state: 'growing',
    overallScore: 0.5,
    explorationPriority: 1.0,
    hypothesis,
    bestPaths: [],
    statistics: {
      totalNodes: 1,
      activeNodes: 1,
      maxDepth: 0,
      avgQualityScore: 0.5,
      avgConfidence: 0.5,
      conclusionCount: 0,
      totalTokensUsed: 0,
      avgBranchingFactor: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/** Adds a new node to a tree. */
export function addNodeToTree(
  tree: ReasoningTree,
  newNode: ReasoningNode,
  parentId: NodeId
): ReasoningTree {
  const time = getTimeProvider();
  const nodes = new Map(tree.nodes);
  nodes.set(newNode.id, newNode);
  const parent = nodes.get(parentId);
  if (parent !== undefined)
    nodes.set(parentId, { ...parent, children: [...parent.children, newNode.id] });
  const allNodes = Array.from(nodes.values());
  return {
    ...tree,
    nodes,
    statistics: {
      ...tree.statistics,
      totalNodes: nodes.size,
      activeNodes: allNodes.filter((n) => n.isActive).length,
      maxDepth: Math.max(tree.statistics.maxDepth, newNode.depth),
      conclusionCount: allNodes.filter((n) => n.stepType === 'conclusion').length,
      avgQualityScore: allNodes.reduce((s, n) => s + n.qualityScore, 0) / allNodes.length,
      avgConfidence: allNodes.reduce((s, n) => s + n.confidence, 0) / allNodes.length,
    },
    updatedAt: time.now(),
  };
}

/** Marks a node as completed. */
export function markNodeCompleted(tree: ReasoningTree, nodeId: NodeId): ReasoningTree {
  const time = getTimeProvider();
  const node = tree.nodes.get(nodeId);
  if (node === undefined) return tree;
  const nodes = new Map(tree.nodes);
  nodes.set(nodeId, { ...node, state: 'completed', isActive: false, updatedAt: time.now() });
  return {
    ...tree,
    nodes,
    statistics: {
      ...tree.statistics,
      activeNodes: Array.from(nodes.values()).filter((n) => n.isActive).length,
    },
    updatedAt: time.now(),
  };
}
