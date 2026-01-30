/**
 * nexus-agents/agents - Forest-of-Thought Engine
 *
 * Execution engine for Forest-of-Thought multi-tree reasoning
 * with sparse activation. (Source: arXiv:2412.09078, Issue #331, Issue #513)
 *
 * @module agents/reasoning/forest-engine
 */

import type { ILogger, IModelAdapter, CompletionRequest, Result } from '../../core/index.js';
import { createLogger, ok, err, getTimeProvider } from '../../core/index.js';
import type { CreateForestInput } from './forest-types.js';
import type { ForestId, TreeId, NodeId, ReasoningNode } from './forest-node-types.js';
import type { ReasoningTree } from './forest-tree-types.js';
import type { ForestConfig } from './forest-config-types.js';
import { DEFAULT_FOREST_CONFIG, ForestConfigSchema } from './forest-config-types.js';
import type { ForestResult, TerminationReason, ExplorationEvent } from './forest-result-types.js';
import { generateForestId, generateTreeId, generateNodeId } from './forest-engine-ids.js';
import { HYPOTHESIS_PROMPT, REASONING_STEP_PROMPT } from './forest-engine-prompts.js';
import { ForestExecutionError, ForestAdapterUnavailableError } from './forest-engine-errors.js';
import {
  extractText,
  parseHypothesisResponse,
  parseReasoningStepResponse,
  buildPathContent,
  calculateQualityScore,
  buildCrossTreeContext,
  buildForestResult,
  type BuildResultParams,
} from './forest-engine-helpers.js';

export { ForestExecutionError, ForestAdapterUnavailableError };

/** Options for creating a ForestEngine. */
export interface ForestEngineOptions {
  readonly logger?: ILogger;
  readonly adapter?: IModelAdapter;
}

/** Internal tracking for tree exploration. */
interface TreeExplorationState {
  readonly activeNodeIds: readonly NodeId[];
  readonly completedNodeIds: readonly NodeId[];
  readonly currentDepth: number;
}

type ExplorationStateMap = Map<TreeId, TreeExplorationState>;

/** Input for handleExpansion method. */
interface HandleExpansionInput {
  expansion: { node: ReasoningNode | null; tokensUsed: number };
  tree: ReasoningTree;
  state: TreeExplorationState;
  explorationState: ExplorationStateMap;
  trees: Map<TreeId, ReasoningTree>;
  history: ExplorationEvent[];
  nodeToExpand: ReasoningNode;
}

/** Forest-of-Thought reasoning engine. */
export class ForestEngine {
  private readonly logger: ILogger;
  private readonly adapter: IModelAdapter | undefined;

  constructor(options: ForestEngineOptions = {}) {
    this.logger = options.logger ?? createLogger({ component: 'forest-engine' });
    this.adapter = options.adapter;
  }

  /** Creates and executes a Forest-of-Thought reasoning process. */
  async execute(input: CreateForestInput): Promise<Result<ForestResult, ForestExecutionError>> {
    if (this.adapter === undefined) {
      return err(new ForestAdapterUnavailableError('No model adapter provided'));
    }

    const time = getTimeProvider();
    const startTime = time.now();
    const forestId = generateForestId();
    const explorationHistory: ExplorationEvent[] = [];

    const configResult = ForestConfigSchema.safeParse({
      ...DEFAULT_FOREST_CONFIG,
      ...(input.config ?? {}),
    });
    const config = configResult.success ? configResult.data : DEFAULT_FOREST_CONFIG;

    this.logger.info('Starting Forest-of-Thought', { forestId, maxTrees: config.maxTrees });

    try {
      const hypotheses = await this.generateHypotheses(input, config);
      const { trees, explorationState } = this.createInitialTrees(hypotheses, forestId);
      explorationHistory.push({
        timestamp: time.now(),
        eventType: 'tree_created',
        details: { treeCount: trees.size },
      });

      const result = await this.exploreForest(
        trees,
        explorationState,
        input.problem,
        config,
        explorationHistory
      );
      const durationMs = time.now() - startTime;

      const params: BuildResultParams = {
        forestId,
        problem: input.problem,
        trees: result.trees,
        terminationReason: result.terminationReason,
        tokensUsed: result.tokensUsed,
        durationMs,
        explorationHistory,
      };
      const finalResult = buildForestResult(params);

      this.logger.info('Forest completed', {
        forestId,
        durationMs,
        hasSolution: finalResult.bestSolution !== null,
      });
      return ok(finalResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Forest execution failed', error instanceof Error ? error : undefined, {
        forestId,
      });
      return err(new ForestExecutionError(`Forest execution failed: ${message}`));
    }
  }

  private async generateHypotheses(
    input: CreateForestInput,
    config: ForestConfig
  ): Promise<readonly string[]> {
    if (input.initialHypotheses !== undefined && input.initialHypotheses.length > 0)
      return input.initialHypotheses.slice(0, config.maxTrees);
    if (this.adapter === undefined) return ['Direct analysis approach'];

    const hypotheses: string[] = [];
    for (let i = 0; i < config.maxTrees; i++) {
      const prompt = HYPOTHESIS_PROMPT.replace('{problem}', input.problem).replace(
        '{context}',
        `Generate hypothesis ${String(i + 1)} of ${String(config.maxTrees)}`
      );
      const request: CompletionRequest = {
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 200,
        temperature: config.temperature + i * 0.1,
      };
      const response = await this.adapter.complete(request);
      const parsed = response.ok
        ? parseHypothesisResponse(extractText(response.value.content))
        : null;
      hypotheses.push(
        parsed?.hypothesis ?? `Approach ${String(i + 1)}: ${input.problem.slice(0, 50)}...`
      );
    }
    return hypotheses;
  }

  private createInitialTrees(
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

      const rootNode: ReasoningNode = {
        id: rootNodeId,
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

      const tree: ReasoningTree = {
        id: treeId,
        forestId,
        rootId: rootNodeId,
        nodes: new Map([[rootNodeId, rootNode]]),
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

      trees.set(treeId, tree);
      explorationState.set(treeId, {
        activeNodeIds: [rootNodeId],
        completedNodeIds: [],
        currentDepth: 0,
      });
    }
    return { trees, explorationState };
  }

  private checkTermination(
    startTime: number,
    tokensUsed: number,
    config: ForestConfig
  ): TerminationReason | null {
    const time = getTimeProvider();
    if (time.now() - startTime > config.maxExplorationTimeMs) return 'max_time';
    if (tokensUsed > config.maxTokensPerTree * config.maxTrees) return 'max_tokens';
    return null;
  }

  private handleExpansion(input: HandleExpansionInput): { score: number } | null {
    const { expansion, tree, state, explorationState, trees, history, nodeToExpand } = input;
    if (expansion.node === null) return null;
    const time = getTimeProvider();
    const updatedTree = this.addNodeToTree(tree, expansion.node, nodeToExpand.id);
    trees.set(tree.id, updatedTree);
    const newActiveIds = expansion.node.isActive
      ? [...state.activeNodeIds, expansion.node.id]
      : state.activeNodeIds;
    explorationState.set(tree.id, {
      ...state,
      activeNodeIds: newActiveIds,
      currentDepth: Math.max(state.currentDepth, expansion.node.depth),
    });
    history.push({
      timestamp: time.now(),
      eventType: 'node_created',
      treeId: tree.id,
      nodeId: expansion.node.id,
      details: { stepType: expansion.node.stepType },
    });
    if (expansion.node.stepType === 'conclusion') {
      const score = expansion.node.qualityScore * expansion.node.confidence;
      history.push({
        timestamp: time.now(),
        eventType: 'conclusion_reached',
        treeId: tree.id,
        nodeId: expansion.node.id,
        details: { score },
      });
      return { score };
    }
    return null;
  }

  private async exploreForest(
    trees: Map<TreeId, ReasoningTree>,
    explorationState: ExplorationStateMap,
    problem: string,
    config: ForestConfig,
    history: ExplorationEvent[]
  ): Promise<{
    trees: Map<TreeId, ReasoningTree>;
    terminationReason: TerminationReason;
    tokensUsed: number;
  }> {
    const time = getTimeProvider();
    const startTime = time.now();
    let tokensUsed = 0,
      terminationReason: TerminationReason = 'no_progress',
      bestScore = 0;

    for (let iter = 0; iter < config.maxDepth * config.maxTrees; iter++) {
      const termCheck = this.checkTermination(startTime, tokensUsed, config);
      if (termCheck !== null) {
        terminationReason = termCheck;
        break;
      }

      const nodeToExpand = this.getActiveNodes(trees, explorationState, config)[0];
      if (nodeToExpand === undefined) break;

      const tree = trees.get(nodeToExpand.treeId);
      const state = explorationState.get(nodeToExpand.treeId);
      if (tree === undefined || state === undefined) continue;

      const expansion = await this.expandNode(
        nodeToExpand,
        tree,
        problem,
        config,
        buildCrossTreeContext(trees, nodeToExpand.treeId)
      );
      tokensUsed += expansion.tokensUsed;

      const conclusionResult = this.handleExpansion({
        expansion,
        tree,
        state,
        explorationState,
        trees,
        history,
        nodeToExpand,
      });
      if (conclusionResult !== null && conclusionResult.score > bestScore) {
        bestScore = conclusionResult.score;
        if (
          config.enableEarlyTermination &&
          conclusionResult.score >= config.earlyTerminationThreshold
        ) {
          terminationReason = 'solution_found';
          break;
        }
      }

      trees.set(tree.id, this.markNodeCompleted(tree, nodeToExpand.id));
      explorationState.set(tree.id, {
        ...state,
        activeNodeIds: state.activeNodeIds.filter((id) => id !== nodeToExpand.id),
        completedNodeIds: [...state.completedNodeIds, nodeToExpand.id],
      });
    }
    return { trees, terminationReason, tokensUsed };
  }

  private getActiveNodes(
    trees: Map<TreeId, ReasoningTree>,
    explorationState: ExplorationStateMap,
    config: ForestConfig
  ): readonly ReasoningNode[] {
    const allActive: ReasoningNode[] = [];
    for (const [treeId, tree] of trees) {
      const state = explorationState.get(treeId);
      if (state === undefined) continue;
      for (const nodeId of state.activeNodeIds) {
        const node = tree.nodes.get(nodeId);
        if (node !== undefined && node.isActive && node.depth < config.maxDepth)
          allActive.push(node);
      }
    }
    return allActive
      .sort((a, b) => b.activationScore - a.activationScore)
      .slice(0, config.activationBudget);
  }

  private async expandNode(
    node: ReasoningNode,
    tree: ReasoningTree,
    problem: string,
    config: ForestConfig,
    crossTreeContext: string
  ): Promise<{ node: ReasoningNode | null; tokensUsed: number }> {
    if (this.adapter === undefined) return { node: null, tokensUsed: 0 };

    const prompt = REASONING_STEP_PROMPT.replace('{problem}', problem)
      .replace('{hypothesis}', tree.hypothesis)
      .replace('{path}', buildPathContent(tree, node))
      .replace('{depth}', String(node.depth + 1))
      .replace('{crossTreeContext}', crossTreeContext);
    const request: CompletionRequest = {
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
      temperature: config.temperature,
    };
    const response = await this.adapter.complete(request);
    if (!response.ok) return { node: null, tokensUsed: 0 };

    const tokensUsed = response.value.usage.totalTokens;
    const parsed = parseReasoningStepResponse(extractText(response.value.content));
    if (parsed === null) return { node: null, tokensUsed };

    const time = getTimeProvider();
    const now = time.now();
    const quality = calculateQualityScore(parsed.stepType, parsed.confidence, node.depth);

    const treeIndexStr = tree.id.split('-')[1];
    const treeIndex = parseInt(treeIndexStr ?? '0', 10);
    const newNode: ReasoningNode = {
      id: generateNodeId(treeIndex, tree.nodes.size),
      treeId: tree.id,
      parentId: node.id,
      children: [],
      depth: node.depth + 1,
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
    return { node: newNode, tokensUsed };
  }

  private addNodeToTree(
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

  private markNodeCompleted(tree: ReasoningTree, nodeId: NodeId): ReasoningTree {
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
}

export function createForestEngine(options?: ForestEngineOptions): ForestEngine {
  return new ForestEngine(options);
}

/**
 * Convenience function to execute Forest-of-Thought reasoning in one call.
 * @param input - Problem and optional hypotheses/config
 * @param options - Engine options (logger, adapter)
 * @returns ForestResult with best solution and exploration data
 */
export async function executeForest(
  input: CreateForestInput,
  options: ForestEngineOptions = {}
): Promise<Result<ForestResult, ForestExecutionError>> {
  const engine = createForestEngine(options);
  return engine.execute(input);
}
