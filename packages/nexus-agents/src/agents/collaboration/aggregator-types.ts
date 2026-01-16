/**
 * nexus-agents/agents - Aggregator Types
 *
 * Types shared between result-aggregator and aggregator-helpers.
 * Extracted to prevent circular dependencies.
 */

import type { TaskResult } from '../../core/index.js';
import type {
  ResultConflict,
  CollaborationPattern,
  VoteMessage,
  ReviewResponseMessage,
} from './collaboration-types.js';

/**
 * Aggregation strategy types.
 */
export type AggregationStrategy = 'merge' | 'select_best' | 'consensus' | 'sequential_chain';

/**
 * Expert result with metadata.
 */
export interface ExpertResult {
  expertId: string;
  result: TaskResult;
  confidence?: number;
  order?: number;
}

/**
 * Conflict resolver function type.
 */
export type ConflictResolver = (
  conflict: ResultConflict,
  result1: ExpertResult,
  result2: ExpertResult
) => 'expert1' | 'expert2' | 'merged';

/**
 * Quality scorer function type.
 */
export type QualityScorer = (results: ExpertResult[], aggregatedOutput: unknown) => number;

/**
 * Input for aggregation.
 */
export interface AggregatorInput {
  pattern: CollaborationPattern;
  results: ExpertResult[];
  votes?: VoteMessage[];
  reviews?: ReviewResponseMessage[];
}
