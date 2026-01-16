/**
 * Agentic Memory Primitives
 *
 * Core primitive types for A-MEM agentic memory including entity types,
 * evolution types, and link suggestions. Extracted from agentic-memory-types.ts
 * for module size compliance.
 *
 * @module context/agentic-memory-primitives
 * (Source: Issue #122, arXiv:2502.12110)
 */

import { z } from 'zod';
import type { RelationType } from './graph-memory-types.js';
import { RelationTypeSchema } from './graph-memory-types.js';

// ============================================================================
// Entity Types
// ============================================================================

/**
 * Types of entities that can be extracted from memory content.
 */
export const EntityType = {
  PERSON: 'person',
  ORGANIZATION: 'organization',
  CONCEPT: 'concept',
  CODE: 'code',
  FILE: 'file',
  UNKNOWN: 'unknown',
} as const;

export type EntityType = (typeof EntityType)[keyof typeof EntityType];

/** Zod schema for EntityType validation. */
export const EntityTypeSchema = z.enum([
  'person',
  'organization',
  'concept',
  'code',
  'file',
  'unknown',
]);

/**
 * An entity reference extracted from memory content.
 */
export interface EntityReference {
  /** Name or identifier of the entity */
  readonly name: string;
  /** Type of entity */
  readonly type: EntityType;
}

/** Zod schema for EntityReference validation. */
export const EntityReferenceSchema = z.object({
  name: z.string().min(1).max(200),
  type: EntityTypeSchema,
});

// ============================================================================
// Evolution Types
// ============================================================================

/**
 * Types of memory evolution.
 */
export const EvolutionType = {
  /** New memory refines/improves existing knowledge */
  REFINEMENT: 'refinement',
  /** New memory contradicts existing knowledge */
  CONTRADICTION: 'contradiction',
  /** New memory extends existing knowledge */
  EXTENSION: 'extension',
  /** New memory supersedes (replaces) existing knowledge */
  SUPERSESSION: 'supersession',
} as const;

export type EvolutionType = (typeof EvolutionType)[keyof typeof EvolutionType];

/** Zod schema for EvolutionType validation. */
export const EvolutionTypeSchema = z.enum([
  'refinement',
  'contradiction',
  'extension',
  'supersession',
]);

/**
 * Result of memory evolution analysis.
 */
export interface EvolutionResult {
  /** Type of evolution detected */
  readonly type: EvolutionType;
  /** Key of the affected existing memory */
  readonly affectedKey: string;
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Description of what changed */
  readonly description: string;
}

/** Zod schema for EvolutionResult validation. */
export const EvolutionResultSchema = z.object({
  type: EvolutionTypeSchema,
  affectedKey: z.string().min(1),
  confidence: z.number().min(0).max(1),
  description: z.string().max(500),
});

// ============================================================================
// Link Suggestions
// ============================================================================

/**
 * A suggested link between memories.
 */
export interface LinkSuggestion {
  /** Source memory key */
  readonly from: string;
  /** Target memory key */
  readonly to: string;
  /** Suggested relationship type */
  readonly relationType: RelationType;
  /** Reason for the suggestion */
  readonly reason: string;
  /** Confidence score (0-1) */
  readonly confidence: number;
}

/** Zod schema for LinkSuggestion validation. */
export const LinkSuggestionSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  relationType: RelationTypeSchema,
  reason: z.string().max(200),
  confidence: z.number().min(0).max(1),
});
