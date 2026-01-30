/**
 * Forest-of-Thought Helper Functions
 * @module agents/reasoning/forest-engine-helpers
 */

import type { ReasoningNode, NodeId, ReasoningStepType } from './forest-node-types.js';
import type { ReasoningTree, PathScore, PathScoreBreakdown } from './forest-tree-types.js';
import type { ForestStatistics, ForestState } from './forest-state-types.js';
import type {
  ForestResult,
  BestSolution,
  TerminationReason,
  ExplorationEvent,
} from './forest-result-types.js';
import type { ForestId, TreeId } from './forest-node-types.js';

/** Parsed hypothesis response. */
export interface ParsedHypothesis {
  hypothesis: string;
  reasoning: string;
  confidence: number;
}

/** Parsed reasoning step response. */
export interface ParsedReasoningStep {
  stepType: ReasoningStepType;
  content: string;
  confidence: number;
  isConclusion: boolean;
  conclusionContent?: string | undefined;
}

/** Extracts text from completion response content. */
export function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'object' && block !== null && 'type' in block) {
          const typed = block as { type: string; text?: string };
          if (typed.type === 'text' && typeof typed.text === 'string') return typed.text;
        }
        return '';
      })
      .join('');
  }
  return String(content);
}

/** Parses hypothesis response from LLM. */
export function parseHypothesisResponse(text: string): ParsedHypothesis | null {
  try {
    const jsonMatch = /\{[\s\S]*\}/.exec(text);
    if (jsonMatch === null) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    if (typeof parsed.hypothesis !== 'string') return null;
    return {
      hypothesis: parsed.hypothesis,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  } catch {
    return null;
  }
}

/** Parses reasoning step response from LLM. */
export function parseReasoningStepResponse(text: string): ParsedReasoningStep | null {
  try {
    const jsonMatch = /\{[\s\S]*\}/.exec(text);
    if (jsonMatch === null) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    if (typeof parsed.stepType !== 'string' || typeof parsed.content !== 'string') return null;
    const stepType = parsed.stepType as ReasoningStepType;
    if (
      !['inference', 'decomposition', 'synthesis', 'verification', 'conclusion'].includes(stepType)
    )
      return null;
    return {
      stepType,
      content: parsed.content,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      isConclusion: parsed.isConclusion === true,
      conclusionContent:
        typeof parsed.conclusionContent === 'string' ? parsed.conclusionContent : undefined,
    };
  } catch {
    return null;
  }
}

/** Builds path content for context. */
export function buildPathContent(tree: ReasoningTree, node: ReasoningNode): string {
  const path: string[] = [];
  let current: ReasoningNode | undefined = node;
  while (current !== undefined) {
    path.unshift(`[${current.stepType}] ${current.content.slice(0, 100)}`);
    current = current.parentId !== null ? tree.nodes.get(current.parentId) : undefined;
  }
  return path.join('\n→ ');
}

/** Calculates quality score for a node. */
export function calculateQualityScore(
  stepType: string,
  confidence: number,
  parentDepth: number
): number {
  let score = confidence;
  if (stepType === 'conclusion') score += 0.1;
  if (stepType === 'verification') score += 0.05;
  score -= parentDepth * 0.02;
  return Math.max(0, Math.min(1, score));
}

/** Builds cross-tree context for sharing information. */
export function buildCrossTreeContext(
  trees: Map<TreeId, ReasoningTree>,
  excludeTreeId: TreeId
): string {
  const insights: string[] = [];
  for (const [treeId, tree] of trees) {
    if (treeId === excludeTreeId) continue;
    for (const node of tree.nodes.values()) {
      if (node.stepType === 'conclusion' || node.confidence >= 0.8) {
        insights.push(`[From tree ${treeId.slice(0, 8)}]: ${node.content.slice(0, 100)}`);
      }
    }
  }
  return insights.length === 0
    ? ''
    : `\nInsights from other reasoning paths:\n${insights.slice(0, 3).join('\n')}`;
}

/** Calculates path score breakdown. */
export function calculatePathBreakdown(node: ReasoningNode): PathScoreBreakdown {
  return {
    confidenceScore: node.confidence,
    qualityScore: node.qualityScore,
    coherenceScore: 0.7,
    depthFactor: -node.depth * 0.02,
    conclusionBonus: 0.1,
  };
}

/** Result builder parameters (for parameter object pattern). */
export interface BuildResultParams {
  forestId: ForestId;
  problem: string;
  trees: Map<TreeId, ReasoningTree>;
  terminationReason: TerminationReason;
  tokensUsed: number;
  durationMs: number;
  explorationHistory: readonly ExplorationEvent[];
}

/** Builds path score for a conclusion node. */
function buildPathScore(tree: ReasoningTree, node: ReasoningNode): PathScore {
  const pathIds: NodeId[] = [];
  let current: ReasoningNode | undefined = node;
  while (current !== undefined) {
    pathIds.unshift(current.id);
    current = current.parentId !== null ? tree.nodes.get(current.parentId) : undefined;
  }
  return {
    treeId: tree.id,
    path: pathIds,
    targetNodeId: node.id,
    score: node.qualityScore * node.confidence,
    breakdown: calculatePathBreakdown(node),
    reachesConclusion: true,
    length: pathIds.length,
  };
}

/** Finds the best solution from sorted paths. */
function findBestSolution(
  topPaths: readonly PathScore[],
  trees: Map<TreeId, ReasoningTree>
): BestSolution | null {
  if (topPaths.length === 0 || topPaths[0] === undefined) return null;
  const bestPath = topPaths[0];
  const tree = trees.get(bestPath.treeId);
  const conclusionNode = tree?.nodes.get(bestPath.targetNodeId);
  if (conclusionNode === undefined) return null;
  return {
    treeId: bestPath.treeId,
    path: bestPath.path,
    conclusionNode,
    confidence: bestPath.breakdown.confidenceScore,
    qualityScore: bestPath.breakdown.qualityScore,
    combinedScore: bestPath.score,
  };
}

/** Stats input for building forest statistics. */
interface StatsInput {
  trees: Map<TreeId, ReasoningTree>;
  topPaths: readonly PathScore[];
  totalNodes: number;
  totalActiveNodes: number;
  maxDepth: number;
  tokensUsed: number;
  durationMs: number;
}

/** Builds forest statistics from aggregated data. */
function buildStatistics(input: StatsInput): ForestStatistics {
  const { trees, topPaths, totalNodes, totalActiveNodes, maxDepth, tokensUsed, durationMs } = input;
  const bestScore = topPaths.length > 0 && topPaths[0] !== undefined ? topPaths[0].score : 0;
  return {
    totalTrees: trees.size,
    activeTrees: Array.from(trees.values()).filter((t) => t.state === 'growing').length,
    totalNodes,
    totalActiveNodes,
    maxDepth,
    bestPathScore: bestScore,
    avgTreeScore: topPaths.reduce((sum, p) => sum + p.score, 0) / Math.max(1, topPaths.length),
    totalTokensUsed: tokensUsed,
    totalExplorationTimeMs: durationMs,
    activationRatio: totalActiveNodes / Math.max(1, totalNodes),
  };
}

/** Builds the final ForestResult. */
export function buildForestResult(params: BuildResultParams): ForestResult {
  const {
    forestId,
    problem,
    trees,
    terminationReason,
    tokensUsed,
    durationMs,
    explorationHistory,
  } = params;
  const conclusions: ReasoningNode[] = [];
  const topPaths: PathScore[] = [];
  let maxDepth = 0,
    totalNodes = 0,
    totalActiveNodes = 0;

  for (const tree of trees.values()) {
    maxDepth = Math.max(maxDepth, tree.statistics.maxDepth);
    totalNodes += tree.statistics.totalNodes;
    totalActiveNodes += tree.statistics.activeNodes;
    for (const node of tree.nodes.values()) {
      if (node.stepType === 'conclusion') {
        conclusions.push(node);
        topPaths.push(buildPathScore(tree, node));
      }
    }
  }

  topPaths.sort((a, b) => b.score - a.score);
  const bestSolution = findBestSolution(topPaths, trees);
  const statistics = buildStatistics({
    trees,
    topPaths,
    totalNodes,
    totalActiveNodes,
    maxDepth,
    tokensUsed,
    durationMs,
  });
  const finalState: ForestState =
    terminationReason === 'solution_found' ? 'completed' : 'converging';

  return {
    forestId,
    problem,
    bestSolution,
    topPaths: topPaths.slice(0, 5),
    conclusions,
    finalState,
    terminationReason,
    statistics,
    durationMs,
    totalTokensUsed: tokensUsed,
    explorationHistory,
  };
}
