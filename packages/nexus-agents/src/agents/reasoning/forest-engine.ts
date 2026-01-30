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
import type { TreeId, ReasoningNode } from './forest-node-types.js';
import type { ReasoningTree } from './forest-tree-types.js';
import type { ForestConfig } from './forest-config-types.js';
import type { ForestResult, TerminationReason, ExplorationEvent } from './forest-result-types.js';
import { generateForestId } from './forest-engine-ids.js';
import { HYPOTHESIS_PROMPT, REASONING_STEP_PROMPT } from './forest-engine-prompts.js';
import { ForestExecutionError, ForestAdapterUnavailableError } from './forest-engine-errors.js';
import {
  extractText,
  parseHypothesisResponse,
  parseReasoningStepResponse,
  buildPathContent,
  buildCrossTreeContext,
  buildForestResult,
  parseForestConfig,
  buildReasoningNode,
  checkEarlyTermination,
  type BuildResultParams,
} from './forest-engine-helpers.js';
import {
  createInitialTrees,
  addNodeToTree,
  markNodeCompleted,
  completeNodeInState,
  type TreeExplorationState,
  type ExplorationStateMap,
} from './forest-engine-tree.js';

export { ForestExecutionError, ForestAdapterUnavailableError };

/** Options for creating a ForestEngine. */
export interface ForestEngineOptions {
  readonly logger?: ILogger;
  readonly adapter?: IModelAdapter;
}

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

/** Input for processStep method. */
interface ProcessStepInput {
  trees: Map<TreeId, ReasoningTree>;
  explState: ExplorationStateMap;
  problem: string;
  config: ForestConfig;
  history: ExplorationEvent[];
  bestScore: number;
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
    if (this.adapter === undefined)
      return err(new ForestAdapterUnavailableError('No model adapter provided'));
    const time = getTimeProvider();
    const startTime = time.now();
    const forestId = generateForestId();
    const history: ExplorationEvent[] = [];
    const config = parseForestConfig(input.config);
    this.logger.info('Starting Forest-of-Thought', { forestId, maxTrees: config.maxTrees });
    try {
      const hypotheses = await this.generateHypotheses(input, config);
      const { trees, explorationState } = createInitialTrees(hypotheses, forestId);
      history.push({
        timestamp: time.now(),
        eventType: 'tree_created',
        details: { treeCount: trees.size },
      });
      const result = await this.exploreForest(
        trees,
        explorationState,
        input.problem,
        config,
        history
      );
      const durationMs = time.now() - startTime;
      const params: BuildResultParams = {
        forestId,
        problem: input.problem,
        trees: result.trees,
        terminationReason: result.terminationReason,
        tokensUsed: result.tokensUsed,
        durationMs,
        explorationHistory: history,
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
    if (input.initialHypotheses !== undefined && input.initialHypotheses.length > 0) {
      return input.initialHypotheses.slice(0, config.maxTrees);
    }
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
    trees.set(tree.id, addNodeToTree(tree, expansion.node, nodeToExpand.id));
    const newActive = expansion.node.isActive
      ? [...state.activeNodeIds, expansion.node.id]
      : state.activeNodeIds;
    explorationState.set(tree.id, {
      ...state,
      activeNodeIds: newActive,
      currentDepth: Math.max(state.currentDepth, expansion.node.depth),
    });
    history.push({
      timestamp: time.now(),
      eventType: 'node_created',
      treeId: tree.id,
      nodeId: expansion.node.id,
      details: { stepType: expansion.node.stepType },
    });
    if (expansion.node.stepType !== 'conclusion') return null;
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

  /** Process a single iteration step. Returns tokens used and optional termination reason. */
  private async processStep(
    input: ProcessStepInput
  ): Promise<{ tokens: number; done?: TerminationReason; newBest: number } | null> {
    const { trees, explState, problem, config, history, bestScore } = input;
    const node = this.getActiveNodes(trees, explState, config)[0];
    if (node === undefined) return null;
    const tree = trees.get(node.treeId),
      state = explState.get(node.treeId);
    if (tree === undefined || state === undefined) return { tokens: 0, newBest: bestScore };
    const exp = await this.expandNode(
      node,
      tree,
      problem,
      config,
      buildCrossTreeContext(trees, node.treeId)
    );
    const res = this.handleExpansion({
      expansion: exp,
      tree,
      state,
      explorationState: explState,
      trees,
      history,
      nodeToExpand: node,
    });
    const chk = checkEarlyTermination(config, res, bestScore);
    trees.set(tree.id, markNodeCompleted(tree, node.id));
    explState.set(tree.id, completeNodeInState(state, node.id));
    const base = { tokens: exp.tokensUsed, newBest: chk.newBestScore };
    return chk.reason !== null ? { ...base, done: chk.reason } : base;
  }

  private async exploreForest(
    trees: Map<TreeId, ReasoningTree>,
    explState: ExplorationStateMap,
    problem: string,
    config: ForestConfig,
    history: ExplorationEvent[]
  ): Promise<{
    trees: Map<TreeId, ReasoningTree>;
    terminationReason: TerminationReason;
    tokensUsed: number;
  }> {
    const startTime = getTimeProvider().now();
    let tokensUsed = 0,
      terminationReason: TerminationReason = 'no_progress',
      bestScore = 0;
    for (let i = 0; i < config.maxDepth * config.maxTrees; i++) {
      const term = this.checkTermination(startTime, tokensUsed, config);
      if (term !== null) {
        terminationReason = term;
        break;
      }
      const step = await this.processStep({
        trees,
        explState,
        problem,
        config,
        history,
        bestScore,
      });
      if (step === null) break;
      tokensUsed += step.tokens;
      bestScore = step.newBest;
      if (step.done !== undefined) {
        terminationReason = step.done;
        break;
      }
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
    const newNode = buildReasoningNode({
      parsed,
      parentNode: node,
      treeId: tree.id,
      treeNodesSize: tree.nodes.size,
      tokensUsed,
    });
    return { node: newNode, tokensUsed };
  }
}

export function createForestEngine(options?: ForestEngineOptions): ForestEngine {
  return new ForestEngine(options);
}

/** Convenience function to execute Forest-of-Thought reasoning in one call. */
export async function executeForest(
  input: CreateForestInput,
  options: ForestEngineOptions = {}
): Promise<Result<ForestResult, ForestExecutionError>> {
  const engine = createForestEngine(options);
  return engine.execute(input);
}
