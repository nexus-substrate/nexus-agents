/**
 * nexus-agents/context - Belief Hindsight Types
 *
 * Type definitions for counterfactual reasoning and hindsight learning.
 *
 * @module context/belief-hindsight-types
 * @see belief-types for re-exports
 * (Source: Issue #336, arXiv:2512.12818 - Hindsight Belief Memory)
 */

import { z } from 'zod';

// ============================================================================
// Counterfactual Reasoning
// ============================================================================

/**
 * A counterfactual represents an alternative scenario for reasoning.
 */
export interface Counterfactual {
  /** Unique identifier */
  readonly counterfactualId: string;
  /** The hypothetical change to consider */
  readonly hypothesis: string;
  /** Beliefs that would change under this hypothesis */
  readonly affectedBeliefs: readonly string[];
  /** Predicted outcomes under this scenario */
  readonly predictedOutcomes: readonly string[];
  /** Actual outcomes if hypothesis was tested */
  readonly actualOutcomes?: readonly string[];
  /** Whether the counterfactual was validated */
  readonly validated: boolean;
  /** When this counterfactual was created */
  readonly createdAt: Date;
  /** Task or context that prompted this counterfactual */
  readonly taskContext?: string;
}

export const CounterfactualSchema = z.object({
  counterfactualId: z.string().min(1),
  hypothesis: z.string().min(1),
  affectedBeliefs: z.array(z.string()),
  predictedOutcomes: z.array(z.string()),
  actualOutcomes: z.array(z.string()).optional(),
  validated: z.boolean(),
  createdAt: z.date(),
  taskContext: z.string().optional(),
});

// ============================================================================
// Hindsight Learning
// ============================================================================

/**
 * Hindsight record captures learning from outcomes.
 */
export interface HindsightRecord {
  /** Unique identifier */
  readonly hindsightId: string;
  /** Task that produced this hindsight */
  readonly taskId: string;
  /** Beliefs held before the task */
  readonly priorBeliefs: readonly string[];
  /** Expected outcome based on prior beliefs */
  readonly expectedOutcome: string;
  /** Actual outcome observed */
  readonly actualOutcome: string;
  /** Whether expectation matched reality */
  readonly outcomeMatched: boolean;
  /** Beliefs that were corrected */
  readonly correctedBeliefs: readonly string[];
  /** New beliefs formed from this experience */
  readonly newBeliefs: readonly string[];
  /** Lessons learned */
  readonly lessons: readonly string[];
  /** When this record was created */
  readonly createdAt: Date;
}

export const HindsightRecordSchema = z.object({
  hindsightId: z.string().min(1),
  taskId: z.string().min(1),
  priorBeliefs: z.array(z.string()),
  expectedOutcome: z.string(),
  actualOutcome: z.string(),
  outcomeMatched: z.boolean(),
  correctedBeliefs: z.array(z.string()),
  newBeliefs: z.array(z.string()),
  lessons: z.array(z.string()),
  createdAt: z.date(),
});
