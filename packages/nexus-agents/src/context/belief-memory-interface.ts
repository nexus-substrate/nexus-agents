/**
 * nexus-agents/context - Belief Memory Interface
 *
 * Interface definition for Hindsight Belief Memory operations,
 * statistics types, and configuration options.
 *
 * @module context/belief-memory-interface
 * @see belief-types for re-exports
 * (Source: Issue #336, arXiv:2512.12818 - Hindsight Belief Memory)
 */

import { z } from 'zod';
import type { Result } from '../core/result.js';
import type { MemoryError } from './memory-backend-types.js';
import type { Belief, BeliefConfidence, BeliefSourceType } from './belief-core-types.js';
import { BeliefConfidenceSchema, BeliefSourceTypeSchema } from './belief-core-types.js';
import { BeliefConfidence as BeliefConfidenceConst } from './belief-core-types.js';
import type { BeliefUpdate, BeliefQuery } from './belief-update-types.js';
import type { Counterfactual, HindsightRecord } from './belief-hindsight-types.js';

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

// ============================================================================
// Statistics
// ============================================================================

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
  defaultConfidence: BeliefConfidenceConst.MEDIUM,
  maxInferenceDepth: 5,
};
