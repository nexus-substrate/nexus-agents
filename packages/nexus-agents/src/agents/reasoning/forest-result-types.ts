/**
 * nexus-agents/agents - Forest-of-Thought Result Types
 *
 * Type definitions for Forest-of-Thought reasoning results, including
 * solutions, exploration events, and termination reasons.
 *
 * @module agents/reasoning/forest-result-types
 * (Source: arXiv:2412.09078, Issue #331)
 */

import { z } from 'zod';
import type { NodeId, TreeId, ForestId, ReasoningNode } from './forest-node-types.js';
import { ReasoningNodeSchema } from './forest-node-types.js';
import type { PathScore } from './forest-tree-types.js';
import { PathScoreSchema } from './forest-tree-types.js';
import type { ForestState, ForestStatistics } from './forest-types.js';
import { ForestStateSchema, ForestStatisticsSchema } from './forest-types.js';

// ============================================================================
// Termination Types
// ============================================================================

/**
 * Termination reason for forest exploration.
 */
export type TerminationReason =
  | 'solution_found'
  | 'convergence'
  | 'max_time'
  | 'max_tokens'
  | 'max_depth'
  | 'no_progress'
  | 'error';

/**
 * Schema for TerminationReason validation.
 */
export const TerminationReasonSchema = z.enum([
  'solution_found',
  'convergence',
  'max_time',
  'max_tokens',
  'max_depth',
  'no_progress',
  'error',
]);

// ============================================================================
// Solution Types
// ============================================================================

/**
 * The best solution found by the forest.
 */
export interface BestSolution {
  /** Tree that produced the solution */
  readonly treeId: TreeId;
  /** Path to the solution */
  readonly path: readonly NodeId[];
  /** Solution node */
  readonly conclusionNode: ReasoningNode;
  /** Overall confidence */
  readonly confidence: number;
  /** Overall quality score */
  readonly qualityScore: number;
  /** Combined score */
  readonly combinedScore: number;
}

/**
 * Schema for BestSolution validation.
 */
export const BestSolutionSchema = z.object({
  treeId: z.string().min(1),
  path: z.array(z.string()),
  conclusionNode: ReasoningNodeSchema,
  confidence: z.number().min(0).max(1),
  qualityScore: z.number().min(0).max(1),
  combinedScore: z.number().min(0).max(1),
});

// ============================================================================
// Exploration Event Types
// ============================================================================

/**
 * Types of exploration events.
 */
export type ExplorationEventType =
  | 'tree_created'
  | 'node_created'
  | 'node_activated'
  | 'node_deactivated'
  | 'node_completed'
  | 'node_pruned'
  | 'path_scored'
  | 'cross_tree_share'
  | 'conclusion_reached'
  | 'tree_completed'
  | 'forest_converging'
  | 'forest_completed';

/**
 * Schema for ExplorationEventType validation.
 */
export const ExplorationEventTypeSchema = z.enum([
  'tree_created',
  'node_created',
  'node_activated',
  'node_deactivated',
  'node_completed',
  'node_pruned',
  'path_scored',
  'cross_tree_share',
  'conclusion_reached',
  'tree_completed',
  'forest_converging',
  'forest_completed',
]);

/**
 * An event in the exploration history for debugging/analysis.
 */
export interface ExplorationEvent {
  /** Timestamp */
  readonly timestamp: number;
  /** Event type */
  readonly eventType: ExplorationEventType;
  /** Tree ID involved */
  readonly treeId?: TreeId;
  /** Node ID involved */
  readonly nodeId?: NodeId;
  /** Additional details */
  readonly details: Record<string, unknown>;
}

/**
 * Schema for ExplorationEvent validation.
 */
export const ExplorationEventSchema = z.object({
  timestamp: z.number(),
  eventType: ExplorationEventTypeSchema,
  treeId: z.string().optional(),
  nodeId: z.string().optional(),
  details: z.record(z.unknown()),
});

// ============================================================================
// Forest Result Types
// ============================================================================

/**
 * Result of Forest-of-Thought reasoning.
 */
export interface ForestResult {
  /** Forest ID */
  readonly forestId: ForestId;
  /** Original problem */
  readonly problem: string;

  /** Best solution found */
  readonly bestSolution: BestSolution | null;
  /** All high-quality paths found */
  readonly topPaths: readonly PathScore[];
  /** All conclusions reached across trees */
  readonly conclusions: readonly ReasoningNode[];

  /** Final state of the forest */
  readonly finalState: ForestState;
  /** Reason for termination */
  readonly terminationReason: TerminationReason;
  /** Final statistics */
  readonly statistics: ForestStatistics;

  /** Total duration in ms */
  readonly durationMs: number;
  /** Total tokens used */
  readonly totalTokensUsed: number;

  /** Exploration history for analysis */
  readonly explorationHistory?: readonly ExplorationEvent[];
}

/**
 * Schema for ForestResult validation (partial).
 */
export const ForestResultSchema = z.object({
  forestId: z.string().min(1),
  problem: z.string(),
  bestSolution: BestSolutionSchema.nullable(),
  topPaths: z.array(PathScoreSchema),
  finalState: ForestStateSchema,
  terminationReason: TerminationReasonSchema,
  statistics: ForestStatisticsSchema,
  durationMs: z.number().nonnegative(),
  totalTokensUsed: z.number().int().nonnegative(),
  explorationHistory: z.array(ExplorationEventSchema).optional(),
});
