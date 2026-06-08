/**
 * nexus-agents/workflows - AFlow Types
 *
 * Type definitions for AFlow MCTS-based automatic workflow generation.
 * AFlow uses Monte Carlo Tree Search to discover optimal workflow structures.
 *
 * @module workflows/aflow/aflow-types
 * (Source: Issue #329, arXiv:2410.10762)
 */

import { z } from 'zod';
import type { WorkflowDefinition, WorkflowStep, AgentRole } from '../../core/index.js';
import { SINGLE_LLM_EVAL_TIMEOUT_MS } from '../../config/timeouts.js';

/**
 * Action types that can be taken during workflow construction.
 */
export type ActionType =
  | 'add_step' // Add a new step to workflow
  | 'remove_step' // Remove an existing step
  | 'modify_step' // Modify step parameters
  | 'add_dependency' // Add dependency between steps
  | 'remove_dependency' // Remove dependency
  | 'set_parallel' // Set parallel execution
  | 'terminate'; // End workflow construction

/**
 * Single action in the workflow action space.
 */
export interface WorkflowAction {
  /** Action type */
  readonly type: ActionType;
  /** Target step ID (for modify/remove) */
  readonly targetStepId?: string | undefined;
  /** Source step for dependency actions */
  readonly sourceStepId?: string | undefined;
  /** New step configuration (for add_step) */
  readonly newStep?: Partial<WorkflowStep> | undefined;
  /** Step modifications (for modify_step) */
  readonly modifications?: StepModifications | undefined;
}

/**
 * Possible modifications to a workflow step.
 */
export interface StepModifications {
  readonly timeout?: number | undefined;
  readonly retries?: number | undefined;
  readonly parallel?: boolean | undefined;
  readonly agent?: AgentRole | undefined;
  readonly action?: string | undefined;
}

/**
 * MCTS node representing a workflow state in the search tree.
 */
export interface MCTSNode {
  /** Unique node identifier */
  readonly id: string;
  /** Current workflow state */
  readonly workflow: WorkflowDefinition;
  /** Parent node ID (null for root) */
  readonly parentId: string | null;
  /** Action taken from parent to reach this node */
  readonly action: WorkflowAction | null;
  /** Child node IDs */
  readonly children: readonly string[];
  /** Visit count for UCT calculation */
  readonly visitCount: number;
  /** Total value accumulated from simulations */
  readonly totalValue: number;
  /** Average value (totalValue / visitCount) */
  readonly avgValue: number;
  /** Depth in the tree */
  readonly depth: number;
  /** Whether this is a terminal node */
  readonly isTerminal: boolean;
  /** Creation timestamp */
  readonly createdAt: number;
}

/**
 * UCT (Upper Confidence Bound for Trees) calculation result.
 */
export interface UCTScore {
  /** Node ID */
  readonly nodeId: string;
  /** Exploitation component (average value) */
  readonly exploitation: number;
  /** Exploration component */
  readonly exploration: number;
  /** Total UCT score */
  readonly total: number;
}

/**
 * Result of workflow evaluation.
 */
export interface EvaluationResult {
  /** Overall quality score (0-1) */
  readonly score: number;
  /** Structural validity score */
  readonly structureScore: number;
  /** Estimated efficiency score */
  readonly efficiencyScore: number;
  /** Completeness score (all required steps present) */
  readonly completenessScore: number;
  /** Redundancy penalty */
  readonly redundancyPenalty: number;
  /** Detailed feedback */
  readonly feedback: readonly string[];
  /** Estimated execution cost */
  readonly estimatedCost: number;
}

/**
 * Configuration for AFlow workflow generator.
 */
export interface AFlowConfig {
  /** Maximum iterations for MCTS */
  readonly maxIterations: number;
  /** Maximum depth of workflow tree */
  readonly maxDepth: number;
  /** UCT exploration constant (typically sqrt(2)) */
  readonly explorationConstant: number;
  /** Number of simulations per node expansion */
  readonly simulationsPerExpansion: number;
  /** Minimum score threshold to accept workflow */
  readonly acceptanceThreshold: number;
  /** Maximum steps in generated workflow */
  readonly maxSteps: number;
  /** Minimum steps in generated workflow */
  readonly minSteps: number;
  /** Timeout for single evaluation (ms) */
  readonly evaluationTimeoutMs: number;
  /** Enable early termination when good solution found */
  readonly enableEarlyTermination: boolean;
  /** Score improvement threshold for early termination */
  readonly earlyTerminationThreshold: number;
  /** Temperature for action selection (higher = more exploration) */
  readonly temperature: number;
  /** Random seed for reproducibility (null for random) */
  readonly seed: number | null;
}

/**
 * Default AFlow configuration.
 */
export const DEFAULT_AFLOW_CONFIG: AFlowConfig = {
  maxIterations: 100,
  maxDepth: 10,
  explorationConstant: Math.SQRT2, // ~1.414
  simulationsPerExpansion: 5,
  acceptanceThreshold: 0.7,
  maxSteps: 20,
  minSteps: 2,
  // Runaway-guard for a single LLM node evaluation (#3736): was a punitive 30s
  // literal; raised to the central single-llm class guard (300s).
  evaluationTimeoutMs: SINGLE_LLM_EVAL_TIMEOUT_MS,
  enableEarlyTermination: true,
  earlyTerminationThreshold: 0.9,
  temperature: 1.0,
  seed: null,
};

/**
 * Zod schema for AFlow configuration validation.
 */
export const AFlowConfigSchema = z.object({
  maxIterations: z.number().int().positive().default(100),
  maxDepth: z.number().int().positive().default(10),
  explorationConstant: z.number().positive().default(Math.SQRT2),
  simulationsPerExpansion: z.number().int().positive().default(5),
  acceptanceThreshold: z.number().min(0).max(1).default(0.7),
  maxSteps: z.number().int().positive().default(20),
  minSteps: z.number().int().positive().default(2),
  evaluationTimeoutMs: z.number().int().positive().default(SINGLE_LLM_EVAL_TIMEOUT_MS),
  enableEarlyTermination: z.boolean().default(true),
  earlyTerminationThreshold: z.number().min(0).max(1).default(0.9),
  temperature: z.number().positive().default(1.0),
  seed: z.number().int().nullable().default(null),
});

/**
 * Task specification for workflow generation.
 */
export interface TaskSpecification {
  /** Task description */
  readonly description: string;
  /** Required capabilities/skills */
  readonly requiredCapabilities: readonly string[];
  /** Expected input types */
  readonly expectedInputs: readonly string[];
  /** Expected output type */
  readonly expectedOutput: string;
  /** Constraints on workflow structure */
  readonly constraints?: TaskConstraints | undefined;
}

/**
 * Constraints for workflow generation.
 */
export interface TaskConstraints {
  /** Required agent roles */
  readonly requiredAgents?: readonly AgentRole[] | undefined;
  /** Forbidden agent roles */
  readonly forbiddenAgents?: readonly AgentRole[] | undefined;
  /** Maximum total timeout */
  readonly maxTotalTimeout?: number | undefined;
  /** Required parallel execution */
  readonly requireParallel?: boolean | undefined;
  /** Maximum retries per step */
  readonly maxRetriesPerStep?: number | undefined;
}

/**
 * Result of AFlow workflow generation.
 */
export interface AFlowResult {
  /** Generated workflow */
  readonly workflow: WorkflowDefinition;
  /** Best node from search */
  readonly bestNode: MCTSNode;
  /** Evaluation of best workflow */
  readonly evaluation: EvaluationResult;
  /** Total iterations performed */
  readonly totalIterations: number;
  /** Total nodes explored */
  readonly nodesExplored: number;
  /** Total simulations run */
  readonly simulationsRun: number;
  /** Time taken in milliseconds */
  readonly durationMs: number;
  /** Whether early termination was triggered */
  readonly earlyTerminated: boolean;
  /** Search history for analysis */
  readonly searchHistory: readonly SearchHistoryEntry[];
}

/**
 * Entry in search history for debugging/analysis.
 */
export interface SearchHistoryEntry {
  /** Iteration number */
  readonly iteration: number;
  /** Selected node ID */
  readonly selectedNodeId: string;
  /** Action taken */
  readonly action: WorkflowAction;
  /** Resulting score */
  readonly score: number;
  /** Number of children at this point */
  readonly childCount: number;
  /** Timestamp */
  readonly timestamp: number;
}

/**
 * Statistics about MCTS search.
 */
export interface MCTSStats {
  /** Total nodes in tree */
  readonly totalNodes: number;
  /** Maximum depth reached */
  readonly maxDepthReached: number;
  /** Average branching factor */
  readonly avgBranchingFactor: number;
  /** Best score found */
  readonly bestScore: number;
  /** Average score across terminal nodes */
  readonly avgTerminalScore: number;
  /** Total simulations performed */
  readonly totalSimulations: number;
  /** Nodes pruned (if any) */
  readonly nodesPruned: number;
}

/**
 * Action space configuration for workflow construction.
 */
export interface ActionSpaceConfig {
  /** Available agent roles */
  readonly availableAgents: readonly AgentRole[];
  /** Available action types */
  readonly availableActions: readonly string[];
  /** Default timeout for new steps */
  readonly defaultTimeout: number;
  /** Default retries for new steps */
  readonly defaultRetries: number;
  /** Maximum dependencies per step */
  readonly maxDependenciesPerStep: number;
}

/**
 * Default action space configuration.
 */
export const DEFAULT_ACTION_SPACE_CONFIG: ActionSpaceConfig = {
  availableAgents: [
    'orchestrator',
    'code_expert',
    'security_expert',
    'architecture_expert',
    'testing_expert',
  ],
  availableActions: ['analyze', 'implement', 'review', 'test', 'document'],
  // Default per-step runaway-guard for newly generated steps (#3736): was a
  // punitive 60s literal; raised to the central single-llm class guard (300s).
  defaultTimeout: SINGLE_LLM_EVAL_TIMEOUT_MS,
  defaultRetries: 2,
  maxDependenciesPerStep: 5,
};
