/**
 * nexus-agents/context - Hindsight Belief Memory Types
 *
 * Type definitions and Zod schemas for the Hindsight Belief Memory system.
 * Implements belief state tracking, counterfactual reasoning, and hindsight learning.
 *
 * @module context/belief-types
 * (Source: Issue #336, arXiv:2512.12818 - Hindsight Belief Memory)
 */

import { z } from 'zod';
import type { Result } from '../core/result.js';
import type { MemoryError } from './memory-backend-types.js';

// ============================================================================
// Belief Confidence Levels
// ============================================================================

/**
 * Confidence level for belief states.
 * Based on evidence quality and reasoning chain length.
 */
export const BeliefConfidence = {
  /** Strong evidence, short reasoning chain */
  HIGH: 'high',
  /** Moderate evidence or indirect inference */
  MEDIUM: 'medium',
  /** Weak evidence or long inference chain */
  LOW: 'low',
  /** Speculative or hypothetical */
  SPECULATIVE: 'speculative',
} as const;

export type BeliefConfidence = (typeof BeliefConfidence)[keyof typeof BeliefConfidence];

export const BeliefConfidenceSchema = z.enum(['high', 'medium', 'low', 'speculative']);

// ============================================================================
// Belief Source Types
// ============================================================================

/**
 * Source type for belief origin tracking.
 */
export const BeliefSourceType = {
  /** Direct observation from environment */
  OBSERVATION: 'observation',
  /** Inference from other beliefs */
  INFERENCE: 'inference',
  /** External knowledge or provided fact */
  EXTERNAL: 'external',
  /** User-provided information */
  USER_INPUT: 'user_input',
  /** Hindsight correction from outcome */
  HINDSIGHT: 'hindsight',
  /** Default or prior belief */
  PRIOR: 'prior',
} as const;

export type BeliefSourceType = (typeof BeliefSourceType)[keyof typeof BeliefSourceType];

export const BeliefSourceTypeSchema = z.enum([
  'observation',
  'inference',
  'external',
  'user_input',
  'hindsight',
  'prior',
]);

// ============================================================================
// Belief State
// ============================================================================

/**
 * A belief represents an agent's held proposition about the world.
 * Beliefs are versioned and traceable to their sources.
 */
export interface Belief {
  /** Unique identifier for this belief */
  readonly beliefId: string;
  /** The entity this belief is about */
  readonly subject: string;
  /** The property or relation being described */
  readonly predicate: string;
  /** The value or target of the relation */
  readonly object: string;
  /** Confidence level in this belief */
  readonly confidence: BeliefConfidence;
  /** Source type for this belief */
  readonly sourceType: BeliefSourceType;
  /** Reference to source evidence or reasoning */
  readonly sourceRef?: string;
  /** Parent belief IDs if derived through inference */
  readonly derivedFrom?: readonly string[];
  /** Version number for tracking updates */
  readonly version: number;
  /** When this belief was formed */
  readonly createdAt: Date;
  /** When this belief was last updated */
  readonly updatedAt: Date;
  /** Whether this belief has been superseded */
  readonly superseded: boolean;
  /** ID of belief that superseded this one */
  readonly supersededBy?: string;
  /** Domain or context for this belief */
  readonly domain?: string;
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

export const BeliefSchema = z.object({
  beliefId: z.string().min(1),
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string(),
  confidence: BeliefConfidenceSchema,
  sourceType: BeliefSourceTypeSchema,
  sourceRef: z.string().optional(),
  derivedFrom: z.array(z.string()).optional(),
  version: z.number().int().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
  superseded: z.boolean(),
  supersededBy: z.string().optional(),
  domain: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Belief Update Operations
// ============================================================================

/**
 * Types of belief update operations.
 */
export const BeliefUpdateType = {
  /** Add a new belief (retain) */
  RETAIN: 'retain',
  /** Update confidence or metadata */
  REVISE: 'revise',
  /** Mark belief as superseded */
  SUPERSEDE: 'supersede',
  /** Hindsight correction based on outcome */
  CORRECT: 'correct',
  /** Strengthen belief based on corroboration */
  REINFORCE: 'reinforce',
  /** Weaken belief based on contradicting evidence */
  WEAKEN: 'weaken',
} as const;

export type BeliefUpdateType = (typeof BeliefUpdateType)[keyof typeof BeliefUpdateType];

export const BeliefUpdateTypeSchema = z.enum([
  'retain',
  'revise',
  'supersede',
  'correct',
  'reinforce',
  'weaken',
]);

/**
 * Record of a belief update for audit trail.
 */
export interface BeliefUpdate {
  /** Unique identifier for this update */
  readonly updateId: string;
  /** ID of the belief being updated */
  readonly beliefId: string;
  /** Type of update operation */
  readonly updateType: BeliefUpdateType;
  /** Previous state (for revisions) */
  readonly previousState?: Partial<Belief>;
  /** New state after update */
  readonly newState: Partial<Belief>;
  /** Reason for the update */
  readonly reason: string;
  /** Evidence supporting this update */
  readonly evidence?: string;
  /** When this update occurred */
  readonly timestamp: Date;
  /** Agent or process that made the update */
  readonly updatedBy?: string;
}

export const BeliefUpdateSchema = z.object({
  updateId: z.string().min(1),
  beliefId: z.string().min(1),
  updateType: BeliefUpdateTypeSchema,
  previousState: z.record(z.unknown()).optional(),
  newState: z.record(z.unknown()),
  reason: z.string().min(1),
  evidence: z.string().optional(),
  timestamp: z.date(),
  updatedBy: z.string().optional(),
});

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

// ============================================================================
// Belief Query Types
// ============================================================================

/**
 * Query options for retrieving beliefs.
 */
export interface BeliefQuery {
  /** Filter by subject entity */
  readonly subject?: string;
  /** Filter by predicate */
  readonly predicate?: string;
  /** Filter by domain */
  readonly domain?: string;
  /** Minimum confidence level */
  readonly minConfidence?: BeliefConfidence;
  /** Include superseded beliefs */
  readonly includeSuperseded?: boolean;
  /** Filter by source type */
  readonly sourceType?: BeliefSourceType;
  /** Maximum number of results */
  readonly limit?: number;
  /** Order by field */
  readonly orderBy?: 'createdAt' | 'updatedAt' | 'confidence';
  /** Order direction */
  readonly orderDirection?: 'asc' | 'desc';
}

export const BeliefQuerySchema = z.object({
  subject: z.string().optional(),
  predicate: z.string().optional(),
  domain: z.string().optional(),
  minConfidence: BeliefConfidenceSchema.optional(),
  includeSuperseded: z.boolean().optional(),
  sourceType: BeliefSourceTypeSchema.optional(),
  limit: z.number().int().positive().max(1000).optional(),
  orderBy: z.enum(['createdAt', 'updatedAt', 'confidence']).optional(),
  orderDirection: z.enum(['asc', 'desc']).optional(),
});

// ============================================================================
// Belief Memory Interface
// ============================================================================

/**
 * Interface for Hindsight Belief Memory operations.
 * Implements the three core operations: retain, recall, and reflect.
 */
export interface IHindsightBeliefMemory {
  // === Retain Operations (Adding Information) ===

  /**
   * Store a new belief.
   * @param belief - The belief to store (without beliefId, version, timestamps)
   */
  retain(
    belief: Omit<Belief, 'beliefId' | 'version' | 'createdAt' | 'updatedAt' | 'superseded'>
  ): Promise<Result<Belief, MemoryError>>;

  /**
   * Store multiple beliefs atomically.
   */
  retainBatch(
    beliefs: readonly Omit<
      Belief,
      'beliefId' | 'version' | 'createdAt' | 'updatedAt' | 'superseded'
    >[]
  ): Promise<Result<readonly Belief[], MemoryError>>;

  // === Recall Operations (Accessing Information) ===

  /**
   * Retrieve a belief by ID.
   */
  recall(beliefId: string): Promise<Result<Belief | null, MemoryError>>;

  /**
   * Query beliefs with filters.
   */
  query(query: BeliefQuery): Promise<Result<readonly Belief[], MemoryError>>;

  /**
   * Get all beliefs about a subject.
   */
  recallBySubject(subject: string, limit?: number): Promise<Result<readonly Belief[], MemoryError>>;

  /**
   * Get current belief for a subject-predicate pair.
   */
  recallCurrent(subject: string, predicate: string): Promise<Result<Belief | null, MemoryError>>;

  /**
   * Get belief history for a subject-predicate pair.
   */
  recallHistory(
    subject: string,
    predicate: string,
    limit?: number
  ): Promise<Result<readonly Belief[], MemoryError>>;

  // === Reflect Operations (Updating Information) ===

  /**
   * Update a belief with a new version.
   */
  revise(
    beliefId: string,
    updates: Partial<Pick<Belief, 'object' | 'confidence' | 'metadata'>>,
    reason: string
  ): Promise<Result<Belief, MemoryError>>;

  /**
   * Supersede a belief with a new one.
   */
  supersede(
    beliefId: string,
    newBelief: Omit<Belief, 'beliefId' | 'version' | 'createdAt' | 'updatedAt' | 'superseded'>,
    reason: string
  ): Promise<Result<Belief, MemoryError>>;

  /**
   * Apply hindsight correction to beliefs.
   */
  applyHindsight(record: HindsightRecord): Promise<Result<readonly Belief[], MemoryError>>;

  /**
   * Reinforce a belief based on corroborating evidence.
   */
  reinforce(beliefId: string, evidence: string): Promise<Result<Belief, MemoryError>>;

  /**
   * Weaken a belief based on contradicting evidence.
   */
  weaken(beliefId: string, evidence: string): Promise<Result<Belief, MemoryError>>;

  // === Counterfactual Reasoning ===

  /**
   * Create a counterfactual scenario.
   */
  createCounterfactual(
    hypothesis: string,
    taskContext?: string
  ): Promise<Result<Counterfactual, MemoryError>>;

  /**
   * Validate a counterfactual with actual outcomes.
   */
  validateCounterfactual(
    counterfactualId: string,
    actualOutcomes: readonly string[]
  ): Promise<Result<Counterfactual, MemoryError>>;

  /**
   * Get counterfactuals for a task context.
   */
  getCounterfactuals(taskContext: string): Promise<Result<readonly Counterfactual[], MemoryError>>;

  // === Audit and History ===

  /**
   * Get update history for a belief.
   */
  getUpdateHistory(beliefId: string): Promise<Result<readonly BeliefUpdate[], MemoryError>>;

  /**
   * Get hindsight records for a task.
   */
  getHindsightRecords(taskId: string): Promise<Result<readonly HindsightRecord[], MemoryError>>;

  // === Statistics ===

  /**
   * Get belief memory statistics.
   */
  getStats(): Promise<Result<BeliefMemoryStats, MemoryError>>;

  /**
   * Prune old superseded beliefs.
   */
  pruneSuperseded(olderThan: Date): Promise<Result<number, MemoryError>>;
}

/**
 * Statistics for belief memory.
 */
export interface BeliefMemoryStats {
  readonly totalBeliefs: number;
  readonly activeBeliefs: number;
  readonly supersededBeliefs: number;
  readonly beliefsByConfidence: Record<BeliefConfidence, number>;
  readonly beliefsBySource: Record<BeliefSourceType, number>;
  readonly totalUpdates: number;
  readonly totalCounterfactuals: number;
  readonly totalHindsightRecords: number;
  readonly oldestBelief?: Date;
  readonly newestBelief?: Date;
}

export const BeliefMemoryStatsSchema = z.object({
  totalBeliefs: z.number().int().min(0),
  activeBeliefs: z.number().int().min(0),
  supersededBeliefs: z.number().int().min(0),
  beliefsByConfidence: z.record(BeliefConfidenceSchema, z.number().int().min(0)),
  beliefsBySource: z.record(BeliefSourceTypeSchema, z.number().int().min(0)),
  totalUpdates: z.number().int().min(0),
  totalCounterfactuals: z.number().int().min(0),
  totalHindsightRecords: z.number().int().min(0),
  oldestBelief: z.date().optional(),
  newestBelief: z.date().optional(),
});

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for HindsightBeliefMemory.
 */
export interface BeliefMemoryConfig {
  /** Maximum beliefs to retain per subject */
  readonly maxBeliefsPerSubject?: number;
  /** Auto-prune superseded beliefs older than this (ms) */
  readonly autoPruneAge?: number;
  /** Enable belief inference from observations */
  readonly enableInference?: boolean;
  /** Default confidence for new beliefs without explicit confidence */
  readonly defaultConfidence?: BeliefConfidence;
  /** Maximum depth for derived belief chains */
  readonly maxInferenceDepth?: number;
}

export const BeliefMemoryConfigSchema = z.object({
  maxBeliefsPerSubject: z.number().int().positive().optional(),
  autoPruneAge: z.number().positive().optional(),
  enableInference: z.boolean().optional(),
  defaultConfidence: BeliefConfidenceSchema.optional(),
  maxInferenceDepth: z.number().int().positive().max(10).optional(),
});

/**
 * Default configuration values.
 */
export const DEFAULT_BELIEF_CONFIG: Required<BeliefMemoryConfig> = {
  maxBeliefsPerSubject: 100,
  autoPruneAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  enableInference: true,
  defaultConfidence: BeliefConfidence.MEDIUM,
  maxInferenceDepth: 5,
};
