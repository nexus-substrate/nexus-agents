/**
 * nexus-agents/agents - Forest State and Statistics Types
 *
 * Foundational types for Forest-of-Thought state tracking and statistics.
 * Extracted to break circular dependency between forest-types.ts and
 * forest-result-types.ts.
 *
 * @module agents/reasoning/forest-state-types
 * (Source: arXiv:2412.09078, Issue #331)
 * (Source: Issue #392 - Circular dependency resolution)
 */

import { z } from 'zod';

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
// Forest Statistics Types
// ============================================================================

/**
 * Statistics about forest exploration.
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
