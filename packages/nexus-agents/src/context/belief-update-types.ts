/**
 * nexus-agents/context - Belief Update Types
 *
 * Type definitions for belief update operations, queries, and audit records.
 *
 * @module context/belief-update-types
 * @see belief-types for re-exports
 * (Source: Issue #336, arXiv:2512.12818 - Hindsight Belief Memory)
 */

import { z } from 'zod';
import type { Belief } from './belief-core-types.js';
import { BeliefConfidenceSchema, BeliefSourceTypeSchema } from './belief-core-types.js';
import type { BeliefConfidence, BeliefSourceType } from './belief-core-types.js';

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
  previousState: z.record(z.string(), z.unknown()).optional(),
  newState: z.record(z.string(), z.unknown()),
  reason: z.string().min(1),
  evidence: z.string().optional(),
  timestamp: z.date(),
  updatedBy: z.string().optional(),
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
