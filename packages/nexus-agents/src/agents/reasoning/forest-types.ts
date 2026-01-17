/**
 * nexus-agents/agents - Forest-of-Thought Types
 *
 * Type definitions for Forest-of-Thought multi-tree reasoning with sparse
 * activation. This technique enables parallel exploration of multiple
 * reasoning paths for improved problem-solving on complex multi-step tasks.
 *
 * This is the main entry point that re-exports all forest-related types
 * and includes the Forest and ForestResult types.
 *
 * @module agents/reasoning/forest-types
 * (Source: arXiv:2412.09078, Issue #331)
 */

import { z } from 'zod';
import type { NodeId, TreeId, ForestId } from './forest-node-types.js';
import type { PathScore, ReasoningTree } from './forest-tree-types.js';
import type { ForestConfig } from './forest-config-types.js';

// Re-export all types from sub-modules
export * from './forest-node-types.js';
export * from './forest-tree-types.js';
export * from './forest-config-types.js';
export * from './forest-result-types.js';

// ============================================================================
// Forest State Types
// ============================================================================

/**
 * State of a forest of reasoning trees.
 *
 * - `initializing`: Forest is being set up
 * - `exploring`: Actively exploring trees
 * - `converging`: Trees are converging on solution(s)
 * - `completed`: Forest has finished exploration
 * - `timeout`: Exploration ended due to timeout
 */
export type ForestState = 'initializing' | 'exploring' | 'converging' | 'completed' | 'timeout';

/**
 * Schema for ForestState validation.
 */
export const ForestStateSchema = z.enum([
  'initializing',
  'exploring',
  'converging',
  'completed',
  'timeout',
]);

// ============================================================================
// Cross-Tree Information Types
// ============================================================================

/**
 * A conclusion shared across trees for cross-pollination.
 */
export interface SharedConclusion {
  /** Source tree ID */
  readonly sourceTreeId: TreeId;
  /** Source node ID */
  readonly sourceNodeId: NodeId;
  /** The conclusion content */
  readonly content: string;
  /** Confidence in this conclusion */
  readonly confidence: number;
  /** Quality score */
  readonly qualityScore: number;
}

/**
 * Schema for SharedConclusion validation.
 */
export const SharedConclusionSchema = z.object({
  sourceTreeId: z.string().min(1),
  sourceNodeId: z.string().min(1),
  content: z.string(),
  confidence: z.number().min(0).max(1),
  qualityScore: z.number().min(0).max(1),
});

/**
 * An insight shared across trees.
 */
export interface SharedInsight {
  /** Source tree ID */
  readonly sourceTreeId: TreeId;
  /** Source node ID */
  readonly sourceNodeId: NodeId;
  /** The insight content */
  readonly content: string;
  /** Relevance score for current exploration */
  readonly relevance: number;
}

/**
 * Schema for SharedInsight validation.
 */
export const SharedInsightSchema = z.object({
  sourceTreeId: z.string().min(1),
  sourceNodeId: z.string().min(1),
  content: z.string(),
  relevance: z.number().min(0).max(1),
});

/**
 * A pattern that has been identified as ineffective.
 */
export interface FailurePattern {
  /** Pattern description */
  readonly pattern: string;
  /** Number of times this pattern failed */
  readonly occurrences: number;
  /** Average quality score when this pattern appeared */
  readonly avgFailureScore: number;
}

/**
 * Schema for FailurePattern validation.
 */
export const FailurePatternSchema = z.object({
  pattern: z.string(),
  occurrences: z.number().int().positive(),
  avgFailureScore: z.number().min(0).max(1),
});

/**
 * Information shared across trees for cross-pollination.
 */
export interface CrossTreeInfo {
  /** High-confidence conclusions found in other trees */
  readonly sharedConclusions: readonly SharedConclusion[];
  /** Useful intermediate results from other trees */
  readonly sharedInsights: readonly SharedInsight[];
  /** Patterns that have been proven ineffective */
  readonly failurePatterns: readonly FailurePattern[];
}

/**
 * Schema for CrossTreeInfo validation.
 */
export const CrossTreeInfoSchema = z.object({
  sharedConclusions: z.array(SharedConclusionSchema),
  sharedInsights: z.array(SharedInsightSchema),
  failurePatterns: z.array(FailurePatternSchema),
});

// ============================================================================
// Forest Statistics
// ============================================================================

/**
 * Statistics for the entire forest.
 */
export interface ForestStatistics {
  /** Total number of trees */
  readonly totalTrees: number;
  /** Number of active trees */
  readonly activeTrees: number;
  /** Total nodes across all trees */
  readonly totalNodes: number;
  /** Total active nodes across all trees */
  readonly totalActiveNodes: number;
  /** Maximum depth across all trees */
  readonly maxDepth: number;
  /** Best path score found */
  readonly bestPathScore: number;
  /** Average tree score */
  readonly avgTreeScore: number;
  /** Total tokens used */
  readonly totalTokensUsed: number;
  /** Total exploration time in ms */
  readonly totalExplorationTimeMs: number;
  /** Activation ratio (active nodes / total nodes) */
  readonly activationRatio: number;
}

/**
 * Schema for ForestStatistics validation.
 */
export const ForestStatisticsSchema = z.object({
  totalTrees: z.number().int().nonnegative(),
  activeTrees: z.number().int().nonnegative(),
  totalNodes: z.number().int().nonnegative(),
  totalActiveNodes: z.number().int().nonnegative(),
  maxDepth: z.number().int().nonnegative(),
  bestPathScore: z.number().min(0).max(1),
  avgTreeScore: z.number().min(0).max(1),
  totalTokensUsed: z.number().int().nonnegative(),
  totalExplorationTimeMs: z.number().nonnegative(),
  activationRatio: z.number().min(0).max(1),
});

// ============================================================================
// Forest Types
// ============================================================================

/**
 * A forest of reasoning trees with sparse activation.
 * Coordinates multiple parallel reasoning approaches.
 */
export interface Forest {
  /** Unique forest identifier */
  readonly id: ForestId;
  /** Problem being solved */
  readonly problem: string;
  /** All trees in the forest (id -> tree) */
  readonly trees: ReadonlyMap<TreeId, ReasoningTree>;

  /** Current state of the forest */
  readonly state: ForestState;
  /** Best paths across all trees */
  readonly bestPaths: readonly PathScore[];
  /** Cross-tree shared information */
  readonly crossTreeInfo: CrossTreeInfo;
  /** Forest-wide statistics */
  readonly statistics: ForestStatistics;

  /** Maximum number of active nodes (sparse activation budget) */
  readonly activationBudget: number;
  /** Currently active tree IDs */
  readonly activeTreeIds: readonly TreeId[];

  /** Creation timestamp */
  readonly createdAt: number;
  /** Last update timestamp */
  readonly updatedAt: number;
}

/**
 * Input for creating a new forest.
 */
export interface CreateForestInput {
  /** Problem to solve */
  readonly problem: string;
  /** Initial configuration */
  readonly config?: Partial<ForestConfig>;
  /** Initial tree hypotheses to explore */
  readonly initialHypotheses?: readonly string[];
}
