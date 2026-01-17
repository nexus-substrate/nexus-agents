/**
 * nexus-agents/agents - Forest-of-Thought Tree Types
 *
 * Type definitions for reasoning trees and paths in Forest-of-Thought
 * multi-tree reasoning with sparse activation.
 *
 * @module agents/reasoning/forest-tree-types
 * (Source: arXiv:2412.09078, Issue #331)
 */

import { z } from 'zod';
import type { NodeId, TreeId, ForestId, ReasoningNode } from './forest-node-types.js';

// ============================================================================
// Tree State Types
// ============================================================================

/**
 * State of a reasoning tree.
 *
 * - `growing`: Tree is actively being explored
 * - `paused`: Tree exploration temporarily paused
 * - `completed`: Tree has reached conclusion(s)
 * - `abandoned`: Tree was abandoned (low quality or pruned)
 */
export type TreeState = 'growing' | 'paused' | 'completed' | 'abandoned';

/**
 * Schema for TreeState validation.
 */
export const TreeStateSchema = z.enum(['growing', 'paused', 'completed', 'abandoned']);

// ============================================================================
// Path Types
// ============================================================================

/**
 * Scoring breakdown for a reasoning path.
 */
export interface PathScoreBreakdown {
  /** Average confidence across path nodes */
  readonly confidenceScore: number;
  /** Average quality across path nodes */
  readonly qualityScore: number;
  /** Coherence score (logical consistency between steps) */
  readonly coherenceScore: number;
  /** Depth penalty or bonus based on path length */
  readonly depthFactor: number;
  /** Bonus for reaching conclusion */
  readonly conclusionBonus: number;
}

/**
 * Schema for PathScoreBreakdown validation.
 */
export const PathScoreBreakdownSchema = z.object({
  confidenceScore: z.number().min(0).max(1),
  qualityScore: z.number().min(0).max(1),
  coherenceScore: z.number().min(0).max(1),
  depthFactor: z.number(),
  conclusionBonus: z.number(),
});

/**
 * A scored path through a reasoning tree from root to a target node.
 */
export interface PathScore {
  /** Tree this path belongs to */
  readonly treeId: TreeId;
  /** Ordered node IDs from root to target */
  readonly path: readonly NodeId[];
  /** Target node (usually a conclusion) */
  readonly targetNodeId: NodeId;
  /** Overall path score (0-1) */
  readonly score: number;
  /** Detailed score breakdown */
  readonly breakdown: PathScoreBreakdown;
  /** Whether this path reaches a conclusion */
  readonly reachesConclusion: boolean;
  /** Path length (number of nodes) */
  readonly length: number;
}

/**
 * Schema for PathScore validation.
 */
export const PathScoreSchema = z.object({
  treeId: z.string().min(1),
  path: z.array(z.string()),
  targetNodeId: z.string().min(1),
  score: z.number().min(0).max(1),
  breakdown: PathScoreBreakdownSchema,
  reachesConclusion: z.boolean(),
  length: z.number().int().positive(),
});

/**
 * Options for scoring a path.
 */
export interface PathScoringOptions {
  /** Weight for confidence in scoring */
  readonly confidenceWeight: number;
  /** Weight for quality in scoring */
  readonly qualityWeight: number;
  /** Weight for coherence in scoring */
  readonly coherenceWeight: number;
  /** Penalty per depth level */
  readonly depthPenalty: number;
  /** Bonus for reaching conclusion */
  readonly conclusionBonus: number;
}

/**
 * Default path scoring options.
 */
export const DEFAULT_PATH_SCORING_OPTIONS: PathScoringOptions = {
  confidenceWeight: 0.3,
  qualityWeight: 0.4,
  coherenceWeight: 0.2,
  depthPenalty: 0.01,
  conclusionBonus: 0.1,
};

// ============================================================================
// Tree Statistics
// ============================================================================

/**
 * Statistics for a reasoning tree.
 */
export interface TreeStatistics {
  /** Total number of nodes in the tree */
  readonly totalNodes: number;
  /** Number of currently active nodes */
  readonly activeNodes: number;
  /** Maximum depth reached */
  readonly maxDepth: number;
  /** Average node quality score */
  readonly avgQualityScore: number;
  /** Average node confidence */
  readonly avgConfidence: number;
  /** Number of conclusion nodes */
  readonly conclusionCount: number;
  /** Total tokens used across all nodes */
  readonly totalTokensUsed: number;
  /** Average branching factor */
  readonly avgBranchingFactor: number;
}

/**
 * Schema for TreeStatistics validation.
 */
export const TreeStatisticsSchema = z.object({
  totalNodes: z.number().int().nonnegative(),
  activeNodes: z.number().int().nonnegative(),
  maxDepth: z.number().int().nonnegative(),
  avgQualityScore: z.number().min(0).max(1),
  avgConfidence: z.number().min(0).max(1),
  conclusionCount: z.number().int().nonnegative(),
  totalTokensUsed: z.number().int().nonnegative(),
  avgBranchingFactor: z.number().nonnegative(),
});

// ============================================================================
// Tree Types
// ============================================================================

/**
 * A reasoning tree containing nodes organized hierarchically.
 * Each tree explores one approach to solving the problem.
 */
export interface ReasoningTree {
  /** Unique tree identifier */
  readonly id: TreeId;
  /** ID of the forest this tree belongs to */
  readonly forestId: ForestId;
  /** Root node ID */
  readonly rootId: NodeId;
  /** All nodes in this tree (id -> node) */
  readonly nodes: ReadonlyMap<NodeId, ReasoningNode>;

  /** Current state of the tree */
  readonly state: TreeState;
  /** Overall tree score for ranking (0-1) */
  readonly overallScore: number;
  /** Priority for exploration (higher = explore first) */
  readonly explorationPriority: number;

  /** Tree hypothesis or approach description */
  readonly hypothesis: string;
  /** Best path(s) found in this tree */
  readonly bestPaths: readonly PathScore[];
  /** Tree statistics */
  readonly statistics: TreeStatistics;

  /** Creation timestamp */
  readonly createdAt: number;
  /** Last update timestamp */
  readonly updatedAt: number;
}

/**
 * Schema for ReasoningTree validation (partial, excludes Map for JSON).
 */
export const ReasoningTreeSchema = z.object({
  id: z.string().min(1),
  forestId: z.string().min(1),
  rootId: z.string().min(1),
  state: TreeStateSchema,
  overallScore: z.number().min(0).max(1),
  explorationPriority: z.number(),
  hypothesis: z.string(),
  statistics: TreeStatisticsSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * Input for creating a new reasoning tree.
 */
export interface CreateTreeInput {
  /** Forest ID this tree belongs to */
  readonly forestId: ForestId;
  /** Tree hypothesis or approach */
  readonly hypothesis: string;
  /** Initial exploration priority */
  readonly explorationPriority?: number;
}
