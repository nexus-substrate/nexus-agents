/**
 * Forest-of-Thought Helper Functions
 * @module agents/reasoning/forest-engine-helpers
 */

import type { ReasoningNode, NodeId, ReasoningStepType, TreeId } from './forest-node-types.js';
import type { ReasoningTree, PathScore, PathScoreBreakdown } from './forest-tree-types.js';
import type { ForestStatistics, ForestState } from './forest-state-types.js';
import type {
  ForestResult,
  BestSolution,
  TerminationReason,
  ExplorationEvent,
} from './forest-result-types.js';
import type { ForestId } from './forest-node-types.js';
import type { ForestConfig } from './forest-config-types.js';
import { DEFAULT_FOREST_CONFIG, ForestConfigSchema } from './forest-config-types.js';
import { generateNodeId } from './forest-engine-ids.js';
import { getTimeProvider } from '../../core/index.js';

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

/** Aggregated tree data for result building. */
interface TreeAggregation {
  conclusions: ReasoningNode[];
  topPaths: PathScore[];
  maxDepth: number;
  totalNodes: number;
  totalActiveNodes: number;
}

/** Aggregates tree data for result building. */
function aggregateTreeData(trees: Map<TreeId, ReasoningTree>): TreeAggregation {
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
  return { conclusions, topPaths, maxDepth, totalNodes, totalActiveNodes };
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
  const agg = aggregateTreeData(trees);
  const bestSolution = findBestSolution(agg.topPaths, trees);
  const statistics = buildStatistics({
    trees,
    topPaths: agg.topPaths,
    totalNodes: agg.totalNodes,
    totalActiveNodes: agg.totalActiveNodes,
    maxDepth: agg.maxDepth,
    tokensUsed,
    durationMs,
  });
  const finalState: ForestState =
    terminationReason === 'solution_found' ? 'completed' : 'converging';
  return {
    forestId,
    problem,
    bestSolution,
    topPaths: agg.topPaths.slice(0, 5),
    conclusions: agg.conclusions,
    finalState,
    terminationReason,
    statistics,
    durationMs,
    totalTokensUsed: tokensUsed,
    explorationHistory,
  };
}

/** Parses and validates forest configuration. */
export function parseForestConfig(inputConfig: Partial<ForestConfig> | undefined): ForestConfig {
  const result = ForestConfigSchema.safeParse({ ...DEFAULT_FOREST_CONFIG, ...(inputConfig ?? {}) });
  return result.success ? result.data : DEFAULT_FOREST_CONFIG;
}

/** Input for building a new reasoning node. */
export interface BuildNodeInput {
  parsed: ParsedReasoningStep;
  parentNode: ReasoningNode;
  treeId: TreeId;
  treeNodesSize: number;
  tokensUsed: number;
}

/** Builds a new reasoning node from parsed response. */
export function buildReasoningNode(input: BuildNodeInput): ReasoningNode {
  const { parsed, parentNode, treeId, treeNodesSize, tokensUsed } = input;
  const time = getTimeProvider();
  const now = time.now();
  const quality = calculateQualityScore(parsed.stepType, parsed.confidence, parentNode.depth);
  const treeIndexStr = treeId.split('-')[1];
  const treeIndex = parseInt(treeIndexStr ?? '0', 10);
  return {
    id: generateNodeId(treeIndex, treeNodesSize),
    treeId,
    parentId: parentNode.id,
    children: [],
    depth: parentNode.depth + 1,
    stepType: parsed.stepType,
    content: parsed.content,
    metadata: {
      tokensUsed,
      ...(parsed.conclusionContent !== undefined
        ? { custom: { conclusionContent: parsed.conclusionContent } }
        : {}),
    },
    state: 'active',
    confidence: parsed.confidence,
    qualityScore: quality,
    estimatedValue: parsed.confidence * 0.7 + quality * 0.3,
    isActive: !parsed.isConclusion,
    activationScore: parsed.isConclusion ? 0 : parsed.confidence,
    createdAt: now,
    updatedAt: now,
  };
}

/** Checks if early termination should occur. */
export function shouldTerminateEarly(config: ForestConfig, score: number): boolean {
  return config.enableEarlyTermination && score >= config.earlyTerminationThreshold;
}

/** Exploration iteration result. */
export interface IterationResult {
  shouldTerminate: boolean;
  reason?: TerminationReason;
  tokensUsed: number;
}

/** Process termination and early exit check. Returns updated reason if score triggers early termination. */
export function checkEarlyTermination(
  config: ForestConfig,
  res: { score: number } | null,
  bestScore: number
): { newBestScore: number; reason: TerminationReason | null } {
  if (res === null || res.score <= bestScore) return { newBestScore: bestScore, reason: null };
  const newBest = res.score;
  if (shouldTerminateEarly(config, newBest))
    return { newBestScore: newBest, reason: 'solution_found' };
  return { newBestScore: newBest, reason: null };
}
