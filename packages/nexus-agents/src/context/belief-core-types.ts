/**
 * nexus-agents/context - Belief Core Types
 *
 * Core type definitions for belief states including confidence levels,
 * source types, and the fundamental Belief interface.
 *
 * @module context/belief-core-types
 * @see belief-types for re-exports
 * (Source: Issue #336, arXiv:2512.12818 - Hindsight Belief Memory)
 */

import { z } from 'zod';

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
  metadata: z.record(z.string(), z.unknown()).optional(),
});
