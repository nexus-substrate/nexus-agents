/**
 * nexus-agents/workflows - AFlow Workflow Generator
 *
 * Main AFlow class implementing MCTS-based automatic workflow generation.
 * Uses Monte Carlo Tree Search to discover optimal workflow structures.
 *
 * @module workflows/aflow/aflow-generator
 * (Source: Issue #329, arXiv:2410.10762)
 */

import type { Result } from '../../core/result.js';
import { ok, err } from '../../core/result.js';
import type { WorkflowDefinition } from '../../core/index.js';
import { createLogger } from '../../core/logger.js';
import type {
  AFlowConfig,
  AFlowResult,
  TaskSpecification,
  SearchHistoryEntry,
  WorkflowAction,
  MCTSNode,
} from './aflow-types.js';
import { DEFAULT_AFLOW_CONFIG, AFlowConfigSchema } from './aflow-types.js';
import { MCTSTree, createMCTSTree } from './mcts-tree.js';
import { ActionSpace, createActionSpace } from './action-space.js';
import { WorkflowEvaluator, createWorkflowEvaluator } from './evaluation.js';
import { AFlowError } from './aflow-generator-types.js';
import { actionsEqual, createInitialWorkflow } from './aflow-generator-helpers.js';

// Re-export types and error classes for convenience
export { AFlowError } from './aflow-generator-types.js';
export type { AFlowErrorCode } from './aflow-generator-types.js';
export { actionsEqual, createInitialWorkflow } from './aflow-generator-helpers.js';

const logger = createLogger({ component: 'AFlow' });

/**
 * AFlow MCTS-based workflow generator.
 */
export class AFlowGenerator {
  private readonly config: AFlowConfig;
  private readonly tree: MCTSTree;
  private readonly actionSpace: ActionSpace;
  private readonly evaluator: WorkflowEvaluator;
  private cancelled = false;

  constructor(config: Partial<AFlowConfig> = {}) {
    this.config = AFlowConfigSchema.parse({ ...DEFAULT_AFLOW_CONFIG, ...config });
    this.tree = createMCTSTree(this.config);
    this.actionSpace = createActionSpace(undefined, this.config.seed ?? undefined);
    this.evaluator = createWorkflowEvaluator();

    logger.info('AFlow generator initialized', {
      maxIterations: this.config.maxIterations,
      maxDepth: this.config.maxDepth,
      explorationConstant: this.config.explorationConstant,
    });
  }

  /**
   * Generate a workflow for the given task specification.
   * Note: async is maintained for API compatibility.
   */
  async generate(task: TaskSpecification): Promise<Result<AFlowResult, AFlowError>> {
    // Yield to event loop for responsiveness with large iterations
    await Promise.resolve();

    this.cancelled = false;
    const startTime = Date.now();
    const searchHistory: SearchHistoryEntry[] = [];

    // Create initial workflow
    const initialWorkflow = createInitialWorkflow(task);
    this.tree.initializeRoot(initialWorkflow);

    logger.info('Starting MCTS search', {
      task: task.description,
      initialSteps: initialWorkflow.steps.length,
    });

    // Run search loop
    const searchResult = this.runSearchLoop(task, searchHistory, startTime);
    if (!searchResult.ok) {
      return searchResult;
    }

    const { iteration, bestScore, simulationsRun } = searchResult.value;

    // Finalize and return result
    return this.finalizeResult({
      task,
      iteration,
      bestScore,
      simulationsRun,
      startTime,
      searchHistory,
    });
  }

  /**
   * Run the main MCTS search loop.
   */
  private runSearchLoop(
    task: TaskSpecification,
    searchHistory: SearchHistoryEntry[],
    startTime: number
  ): Result<{ iteration: number; bestScore: number; simulationsRun: number }, AFlowError> {
    let iteration = 0;
    let bestScore = 0;
    let simulationsRun = 0;

    try {
      while (iteration < this.config.maxIterations && !this.cancelled) {
        // Check timeout
        if (Date.now() - startTime > this.config.evaluationTimeoutMs) {
          logger.warn('AFlow search timeout', { iteration, elapsed: Date.now() - startTime });
          break;
        }

        // MCTS phases: Select, Expand, Simulate, Backpropagate
        const result = this.mctsIteration(task, searchHistory, iteration);

        if (result.score > bestScore) {
          bestScore = result.score;
          logger.debug('New best score', { iteration, score: bestScore });

          // Early termination check
          if (
            this.config.enableEarlyTermination &&
            bestScore >= this.config.earlyTerminationThreshold
          ) {
            logger.info('Early termination triggered', { score: bestScore });
            break;
          }
        }

        simulationsRun += result.simulations;
        iteration++;
      }
    } catch (error) {
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      logger.error('MCTS search failed', errorInstance);
      return err(new AFlowError(`Search failed: ${errorInstance.message}`, 'SEARCH_FAILED'));
    }

    return ok({ iteration, bestScore, simulationsRun });
  }

  /**
   * Finalize and build the result object.
   */
  private finalizeResult(params: {
    task: TaskSpecification;
    iteration: number;
    bestScore: number;
    simulationsRun: number;
    startTime: number;
    searchHistory: SearchHistoryEntry[];
  }): Result<AFlowResult, AFlowError> {
    const { task, iteration, bestScore, simulationsRun, startTime, searchHistory } = params;
    // Get best result
    const bestNode = this.tree.getBestNode();
    if (!bestNode) {
      return err(new AFlowError('No valid workflow found', 'SEARCH_FAILED'));
    }

    const evaluation = this.evaluator.evaluate(bestNode.workflow, task);

    // Check minimum steps
    if (bestNode.workflow.steps.length < this.config.minSteps) {
      const stepCount = String(bestNode.workflow.steps.length);
      const minSteps = String(this.config.minSteps);
      return err(
        new AFlowError(
          `Workflow has ${stepCount} steps, minimum is ${minSteps}`,
          'MIN_STEPS_NOT_MET'
        )
      );
    }

    const result: AFlowResult = {
      workflow: bestNode.workflow,
      bestNode,
      evaluation,
      totalIterations: iteration,
      nodesExplored: this.tree.size,
      simulationsRun,
      durationMs: Date.now() - startTime,
      earlyTerminated: bestScore >= this.config.earlyTerminationThreshold,
      searchHistory,
    };

    logger.info('AFlow search complete', {
      iterations: iteration,
      nodes: this.tree.size,
      bestScore: evaluation.score,
      duration: result.durationMs,
    });

    return ok(result);
  }

  /**
   * Single MCTS iteration: Select -> Expand -> Simulate -> Backpropagate
   */
  private mctsIteration(
    task: TaskSpecification,
    history: SearchHistoryEntry[],
    iteration: number
  ): { score: number; simulations: number } {
    // 1. Selection - traverse tree to find best leaf
    const selectedNode = this.tree.select();
    if (!selectedNode) {
      return { score: 0, simulations: 0 };
    }

    // 2. Expansion - if not terminal and not at max depth, expand
    let expandedNode = selectedNode;
    if (!selectedNode.isTerminal && selectedNode.depth < this.config.maxDepth) {
      const expanded = this.expand(selectedNode, task);
      if (expanded) {
        expandedNode = expanded;
      }
    }

    // 3. Simulation - run simulations to estimate value
    let totalValue = 0;
    for (let i = 0; i < this.config.simulationsPerExpansion; i++) {
      const value = this.simulate(expandedNode, task);
      totalValue += value;
    }
    const avgValue = totalValue / this.config.simulationsPerExpansion;

    // 4. Backpropagation - update values up the tree
    this.tree.backpropagate(expandedNode.id, avgValue);

    // Record history
    if (expandedNode.action) {
      history.push({
        iteration,
        selectedNodeId: expandedNode.id,
        action: expandedNode.action,
        score: avgValue,
        childCount: this.tree.getChildren(expandedNode.id).length,
        timestamp: Date.now(),
      });
    }

    return { score: avgValue, simulations: this.config.simulationsPerExpansion };
  }

  /**
   * Expansion phase - add new children to the tree.
   */
  private expand(node: MCTSNode, task: TaskSpecification): MCTSNode | null {
    const validActions = this.actionSpace.getValidActions(
      node.workflow,
      task,
      this.config.maxSteps
    );

    if (validActions.length === 0) {
      this.tree.markTerminal(node.id);
      return null;
    }

    // Select an unexplored action
    const existingActions = this.tree
      .getChildren(node.id)
      .map((c) => c.action)
      .filter((a): a is WorkflowAction => a !== null);

    const unexploredActions = validActions.filter(
      (a) => !existingActions.some((ea) => actionsEqual(a, ea))
    );

    if (unexploredActions.length === 0) {
      return null;
    }

    // Sample an action
    const action = this.actionSpace.sampleAction(unexploredActions);
    if (!action) return null;

    // Apply action to create new workflow state
    const newWorkflow = this.actionSpace.applyAction(node.workflow, action);
    const isTerminal =
      this.actionSpace.isTerminateAction(action) || node.depth + 1 >= this.config.maxDepth;

    return this.tree.addChild(node.id, action, newWorkflow, isTerminal);
  }

  /**
   * Simulation phase - estimate value through random rollout.
   */
  private simulate(node: MCTSNode, task: TaskSpecification): number {
    let currentWorkflow = node.workflow;
    let depth = node.depth;

    // Random rollout until terminal or max depth
    while (depth < this.config.maxDepth) {
      const validActions = this.actionSpace.getValidActions(
        currentWorkflow,
        task,
        this.config.maxSteps
      );

      if (validActions.length === 0) break;

      const action = this.actionSpace.sampleAction(validActions);
      if (!action || this.actionSpace.isTerminateAction(action)) break;

      currentWorkflow = this.actionSpace.applyAction(currentWorkflow, action);
      depth++;
    }

    // Evaluate the final workflow
    const evaluation = this.evaluator.evaluate(currentWorkflow, task);
    return evaluation.score;
  }

  /**
   * Cancel ongoing generation.
   */
  cancel(): void {
    this.cancelled = true;
    logger.info('AFlow generation cancelled');
  }

  /**
   * Get current search statistics.
   */
  getStats(): {
    treeStats: ReturnType<MCTSTree['getStats']>;
    cancelled: boolean;
  } {
    return {
      treeStats: this.tree.getStats(),
      cancelled: this.cancelled,
    };
  }

  /**
   * Reset the generator for a new search.
   */
  reset(): void {
    this.tree.clear();
    this.cancelled = false;
  }
}

/**
 * Create an AFlow generator with optional configuration.
 */
export function createAFlowGenerator(config?: Partial<AFlowConfig>): AFlowGenerator {
  return new AFlowGenerator(config);
}

/**
 * Quick helper to generate a workflow from a task description.
 */
export async function generateWorkflow(
  taskDescription: string,
  requiredCapabilities: readonly string[] = [],
  config?: Partial<AFlowConfig>
): Promise<Result<WorkflowDefinition, AFlowError>> {
  const generator = createAFlowGenerator(config);

  const task: TaskSpecification = {
    description: taskDescription,
    requiredCapabilities,
    expectedInputs: [],
    expectedOutput: 'result',
  };

  const result = await generator.generate(task);
  if (!result.ok) return result;

  return ok(result.value.workflow);
}
