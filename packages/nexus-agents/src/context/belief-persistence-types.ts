/**
 * nexus-agents/context - Belief Persistence Types & Schema
 *
 * Type definitions, Zod validation schema, and data interfaces
 * for belief memory disk persistence.
 *
 * @module context/belief-persistence-types
 * (Source: Issue #714 Phase 3 - Unified memory persistence)
 */

import { z } from 'zod';
import type { Belief } from './belief-core-types.js';
import { BeliefConfidenceSchema, BeliefSourceTypeSchema } from './belief-core-types.js';
import type { BeliefUpdate } from './belief-update-types.js';
import { BeliefUpdateTypeSchema } from './belief-update-types.js';
import type { Counterfactual, HindsightRecord } from './belief-hindsight-types.js';

// ============================================================================
// Serialized Types (Date → string for JSON)
// ============================================================================

/** Belief with Date fields as ISO strings. */
export interface SerializedBelief {
  readonly beliefId: string;
  readonly subject: string;
  readonly predicate: string;
  readonly object: string;
  readonly confidence: string;
  readonly sourceType: string;
  readonly sourceRef?: string | undefined;
  readonly derivedFrom?: readonly string[] | undefined;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly superseded: boolean;
  readonly supersededBy?: string | undefined;
  readonly domain?: string | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

/** BeliefUpdate with Date fields as ISO strings. */
export interface SerializedBeliefUpdate {
  readonly updateId: string;
  readonly beliefId: string;
  readonly updateType: string;
  readonly previousState?: Record<string, unknown> | undefined;
  readonly newState: Record<string, unknown>;
  readonly reason: string;
  readonly evidence?: string | undefined;
  readonly timestamp: string;
  readonly updatedBy?: string | undefined;
}

/** Counterfactual with Date fields as ISO strings. */
export interface SerializedCounterfactual {
  readonly counterfactualId: string;
  readonly hypothesis: string;
  readonly affectedBeliefs: readonly string[];
  readonly predictedOutcomes: readonly string[];
  readonly actualOutcomes?: readonly string[] | undefined;
  readonly validated: boolean;
  readonly createdAt: string;
  readonly taskContext?: string | undefined;
}

/** HindsightRecord with Date fields as ISO strings. */
export interface SerializedHindsightRecord {
  readonly hindsightId: string;
  readonly taskId: string;
  readonly priorBeliefs: readonly string[];
  readonly expectedOutcome: string;
  readonly actualOutcome: string;
  readonly outcomeMatched: boolean;
  readonly correctedBeliefs: readonly string[];
  readonly newBeliefs: readonly string[];
  readonly lessons: readonly string[];
  readonly createdAt: string;
}

// ============================================================================
// Snapshot Type
// ============================================================================

/** Full snapshot of belief memory state for disk persistence. */
export interface BeliefSnapshot {
  readonly version: number;
  readonly exportedAt: string;
  readonly beliefs: readonly SerializedBelief[];
  readonly updates: ReadonlyArray<{
    beliefId: string;
    records: readonly SerializedBeliefUpdate[];
  }>;
  readonly counterfactuals: readonly SerializedCounterfactual[];
  readonly hindsightRecords: ReadonlyArray<{
    taskId: string;
    records: readonly SerializedHindsightRecord[];
  }>;
}

// ============================================================================
// Data Interfaces
// ============================================================================

/** Raw data extracted from HindsightBeliefMemory for serialization. */
export interface BeliefMemoryData {
  readonly beliefs: ReadonlyMap<string, Belief>;
  readonly updates: ReadonlyMap<string, readonly BeliefUpdate[]>;
  readonly counterfactuals: ReadonlyMap<string, Counterfactual>;
  readonly hindsightRecords: ReadonlyMap<string, readonly HindsightRecord[]>;
}

/** Deserialized data ready to hydrate into HindsightBeliefMemory. */
export interface HydratedBeliefData {
  readonly beliefs: Map<string, Belief>;
  readonly updates: Map<string, BeliefUpdate[]>;
  readonly counterfactuals: Map<string, Counterfactual>;
  readonly hindsightRecords: Map<string, HindsightRecord[]>;
}

// ============================================================================
// Zod Schema for Validation
// ============================================================================

/** Zod schema for snapshot validation on load. */
export const BeliefSnapshotSchema = z.object({
  version: z.number().int().min(1),
  exportedAt: z.string(),
  beliefs: z.array(
    z.object({
      beliefId: z.string(),
      subject: z.string(),
      predicate: z.string(),
      object: z.string(),
      confidence: BeliefConfidenceSchema,
      sourceType: BeliefSourceTypeSchema,
      sourceRef: z.string().optional(),
      derivedFrom: z.array(z.string()).optional(),
      version: z.number(),
      createdAt: z.string(),
      updatedAt: z.string(),
      superseded: z.boolean(),
      supersededBy: z.string().optional(),
      domain: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
  ),
  updates: z.array(
    z.object({
      beliefId: z.string(),
      records: z.array(
        z.object({
          updateId: z.string(),
          beliefId: z.string(),
          updateType: BeliefUpdateTypeSchema,
          previousState: z.record(z.string(), z.unknown()).optional(),
          newState: z.record(z.string(), z.unknown()),
          reason: z.string().max(10_000),
          evidence: z.string().max(10_000).optional(),
          timestamp: z.string(),
          updatedBy: z.string().optional(),
        })
      ),
    })
  ),
  counterfactuals: z.array(
    z.object({
      counterfactualId: z.string(),
      hypothesis: z.string().max(10_000),
      affectedBeliefs: z.array(z.string()),
      predictedOutcomes: z.array(z.string()),
      actualOutcomes: z.array(z.string()).optional(),
      validated: z.boolean(),
      createdAt: z.string(),
      taskContext: z.string().optional(),
    })
  ),
  hindsightRecords: z.array(
    z.object({
      taskId: z.string(),
      records: z.array(
        z.object({
          hindsightId: z.string(),
          taskId: z.string(),
          priorBeliefs: z.array(z.string()),
          expectedOutcome: z.string().max(10_000),
          actualOutcome: z.string().max(10_000),
          outcomeMatched: z.boolean(),
          correctedBeliefs: z.array(z.string()),
          newBeliefs: z.array(z.string()),
          lessons: z.array(z.string()),
          createdAt: z.string(),
        })
      ),
    })
  ),
});
