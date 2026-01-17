/**
 * nexus-agents/agents - Forest-of-Thought Configuration Types
 *
 * Configuration type definitions for Forest-of-Thought multi-tree
 * reasoning with sparse activation.
 *
 * @module agents/reasoning/forest-config-types
 * (Source: arXiv:2412.09078, Issue #331)
 */

import { z } from 'zod';

// ============================================================================
// Strategy Types
// ============================================================================

/**
 * Strategy for selecting which nodes to activate.
 *
 * - `ucb`: Upper Confidence Bound (exploration/exploitation balance)
 * - `greedy`: Always activate highest-scoring nodes
 * - `diverse`: Prioritize diversity across trees
 * - `adaptive`: Dynamically adjust based on progress
 */
export type ActivationStrategy = 'ucb' | 'greedy' | 'diverse' | 'adaptive';

/**
 * Schema for ActivationStrategy validation.
 */
export const ActivationStrategySchema = z.enum(['ucb', 'greedy', 'diverse', 'adaptive']);

/**
 * Strategy for sharing information across trees.
 *
 * - `none`: No cross-tree sharing
 * - `conclusions`: Share only conclusions
 * - `insights`: Share conclusions and intermediate insights
 * - `full`: Share all relevant information
 */
export type CrossTreeStrategy = 'none' | 'conclusions' | 'insights' | 'full';

/**
 * Schema for CrossTreeStrategy validation.
 */
export const CrossTreeStrategySchema = z.enum(['none', 'conclusions', 'insights', 'full']);

/**
 * Strategy for pruning low-quality branches.
 *
 * - `none`: No pruning
 * - `score`: Prune nodes below score threshold
 * - `depth`: Prune based on depth limits
 * - `combined`: Use both score and depth criteria
 */
export type ForestPruningStrategy = 'none' | 'score' | 'depth' | 'combined';

/**
 * Schema for ForestPruningStrategy validation.
 */
export const ForestPruningStrategySchema = z.enum(['none', 'score', 'depth', 'combined']);

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for Forest-of-Thought reasoning.
 */
export interface ForestConfig {
  /** Maximum number of trees in the forest */
  readonly maxTrees: number;
  /** Maximum depth per tree */
  readonly maxDepth: number;
  /** Maximum nodes per tree */
  readonly maxNodesPerTree: number;
  /** Total activation budget (max active nodes across forest) */
  readonly activationBudget: number;
  /** Percentage of nodes to keep active (0-1) */
  readonly sparsityRatio: number;

  /** Strategy for node activation */
  readonly activationStrategy: ActivationStrategy;
  /** UCB exploration constant (for ucb strategy) */
  readonly explorationConstant: number;
  /** Strategy for cross-tree information sharing */
  readonly crossTreeStrategy: CrossTreeStrategy;
  /** Strategy for pruning low-quality branches */
  readonly pruningStrategy: ForestPruningStrategy;

  /** Minimum score threshold for keeping nodes */
  readonly minScoreThreshold: number;
  /** Confidence threshold for accepting conclusions */
  readonly confidenceThreshold: number;
  /** Score threshold for early termination */
  readonly earlyTerminationThreshold: number;

  /** Maximum exploration time in ms */
  readonly maxExplorationTimeMs: number;
  /** Timeout per node evaluation in ms */
  readonly nodeTimeoutMs: number;
  /** Maximum tokens per tree */
  readonly maxTokensPerTree: number;

  /** Enable parallel tree exploration */
  readonly enableParallelExploration: boolean;
  /** Number of parallel exploration threads */
  readonly parallelThreads: number;
  /** Enable early termination when good solution found */
  readonly enableEarlyTermination: boolean;
  /** Enable cross-tree information sharing */
  readonly enableCrossTreeSharing: boolean;

  /** Temperature for node generation (creativity vs determinism) */
  readonly temperature: number;
  /** Random seed for reproducibility (null for random) */
  readonly seed: number | null;
}

/**
 * Schema for ForestConfig validation.
 */
export const ForestConfigSchema = z.object({
  maxTrees: z.number().int().min(1).max(50).default(5),
  maxDepth: z.number().int().min(1).max(20).default(10),
  maxNodesPerTree: z.number().int().min(1).max(500).default(100),
  activationBudget: z.number().int().min(1).max(1000).default(50),
  sparsityRatio: z.number().min(0.01).max(1).default(0.2),

  activationStrategy: ActivationStrategySchema.default('ucb'),
  explorationConstant: z.number().positive().default(Math.SQRT2),
  crossTreeStrategy: CrossTreeStrategySchema.default('insights'),
  pruningStrategy: ForestPruningStrategySchema.default('combined'),

  minScoreThreshold: z.number().min(0).max(1).default(0.3),
  confidenceThreshold: z.number().min(0).max(1).default(0.7),
  earlyTerminationThreshold: z.number().min(0).max(1).default(0.9),

  maxExplorationTimeMs: z.number().int().positive().default(300000),
  nodeTimeoutMs: z.number().int().positive().default(30000),
  maxTokensPerTree: z.number().int().positive().default(10000),

  enableParallelExploration: z.boolean().default(true),
  parallelThreads: z.number().int().min(1).max(10).default(3),
  enableEarlyTermination: z.boolean().default(true),
  enableCrossTreeSharing: z.boolean().default(true),

  temperature: z.number().min(0).max(2).default(0.7),
  seed: z.number().int().nullable().default(null),
});

/**
 * Default Forest-of-Thought configuration.
 */
export const DEFAULT_FOREST_CONFIG: ForestConfig = {
  maxTrees: 5,
  maxDepth: 10,
  maxNodesPerTree: 100,
  activationBudget: 50,
  sparsityRatio: 0.2,

  activationStrategy: 'ucb',
  explorationConstant: Math.SQRT2,
  crossTreeStrategy: 'insights',
  pruningStrategy: 'combined',

  minScoreThreshold: 0.3,
  confidenceThreshold: 0.7,
  earlyTerminationThreshold: 0.9,

  maxExplorationTimeMs: 300000,
  nodeTimeoutMs: 30000,
  maxTokensPerTree: 10000,

  enableParallelExploration: true,
  parallelThreads: 3,
  enableEarlyTermination: true,
  enableCrossTreeSharing: true,

  temperature: 0.7,
  seed: null,
};

// ============================================================================
// Activation Options
// ============================================================================

/**
 * Options for sparse activation selection.
 */
export interface ActivationOptions {
  /** Maximum nodes to activate */
  readonly maxActive: number;
  /** Strategy for selection */
  readonly strategy: ActivationStrategy;
  /** Minimum score to consider for activation */
  readonly minScore: number;
  /** Ensure at least one node per active tree */
  readonly ensureTreeCoverage: boolean;
}

/**
 * Default activation options.
 */
export const DEFAULT_ACTIVATION_OPTIONS: ActivationOptions = {
  maxActive: 50,
  strategy: 'ucb',
  minScore: 0.2,
  ensureTreeCoverage: true,
};
