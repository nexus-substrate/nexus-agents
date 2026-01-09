/**
 * Agentic Memory Types
 *
 * Type definitions for A-MEM agentic memory with Zettelkasten-style
 * dynamic linking, attribute extraction, and memory evolution.
 *
 * @module context/agentic-memory-types
 * (Source: Issue #122, arXiv:2502.12110)
 */

import { z } from 'zod';
import type { Result } from '../core/result.js';
import type { MemoryEntry, MemoryError, IMemoryBackend } from './memory-backend-types.js';
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
// Memory Attributes (Zettelkasten-style)
// ============================================================================

/**
 * A-MEM attributes for a memory entry.
 * These are automatically extracted when storing memories.
 */
export interface MemoryAttributes {
  /** Auto-extracted keywords from content */
  readonly keywords: readonly string[];
  /** Semantic tags (broader categories) */
  readonly semanticTags: readonly string[];
  /** Contextual description (brief summary) */
  readonly contextDescription: string;
  /** Entity references extracted from content */
  readonly entities: readonly EntityReference[];
  /** When attributes were last updated */
  readonly attributesUpdatedAt: Date;
}

/** Zod schema for MemoryAttributes validation. */
export const MemoryAttributesSchema = z.object({
  keywords: z.array(z.string().max(100)).max(50),
  semanticTags: z.array(z.string().max(50)).max(20),
  contextDescription: z.string().max(500),
  entities: z.array(EntityReferenceSchema).max(30),
  attributesUpdatedAt: z.date(),
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

// ============================================================================
// Agentic Memory Entry
// ============================================================================

/**
 * Memory entry with A-MEM attributes attached.
 */
export interface AgenticMemoryEntry extends MemoryEntry {
  /** Auto-extracted attributes */
  readonly attributes: MemoryAttributes;
}

// ============================================================================
// Store Result
// ============================================================================

/**
 * Result of an agentic store operation.
 */
export interface AgenticStoreResult {
  /** The stored entry with extracted attributes */
  readonly entry: AgenticMemoryEntry;
  /** Suggested links to other memories */
  readonly linkSuggestions: readonly LinkSuggestion[];
  /** Detected evolution relationships */
  readonly evolution: readonly EvolutionResult[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for attribute extraction.
 */
export interface ExtractionConfig {
  /** Maximum keywords to extract (default: 10) */
  readonly maxKeywords: number;
  /** Maximum semantic tags (default: 5) */
  readonly maxSemanticTags: number;
  /** Maximum context description length in chars (default: 200) */
  readonly maxContextLength: number;
  /** Maximum entities to extract (default: 10) */
  readonly maxEntities: number;
}

/** Zod schema for ExtractionConfig validation. */
export const ExtractionConfigSchema = z.object({
  maxKeywords: z.number().int().positive().max(50),
  maxSemanticTags: z.number().int().positive().max(20),
  maxContextLength: z.number().int().positive().max(500),
  maxEntities: z.number().int().positive().max(30),
});

/**
 * Configuration for automatic linking behavior.
 */
export interface LinkingConfig {
  /** Minimum confidence to suggest links (default: 0.5) */
  readonly suggestionThreshold: number;
  /** Maximum link suggestions per memory (default: 5) */
  readonly maxSuggestions: number;
  /** Relationship types to consider for linking */
  readonly allowedTypes: readonly RelationType[];
}

/** Zod schema for LinkingConfig validation. */
export const LinkingConfigSchema = z.object({
  suggestionThreshold: z.number().min(0).max(1),
  maxSuggestions: z.number().int().positive().max(20),
  allowedTypes: z.array(RelationTypeSchema),
});

/**
 * Options for linking related memories.
 */
export interface LinkingOptions {
  /** Minimum confidence threshold for applying links (default: 0.7) */
  readonly threshold?: number;
  /** Maximum links to apply (default: config.maxSuggestions) */
  readonly maxLinks?: number;
  /** Whether to create bidirectional links (default: true) */
  readonly bidirectional?: boolean;
}

/** Zod schema for LinkingOptions validation. */
export const LinkingOptionsSchema = z.object({
  threshold: z.number().min(0).max(1).optional(),
  maxLinks: z.number().int().positive().optional(),
  bidirectional: z.boolean().optional(),
});

// ============================================================================
// Agentic Memory Interface
// ============================================================================

/**
 * Agentic memory interface implementing A-MEM Zettelkasten-style organization.
 * Extends IMemoryBackend with automatic attribute extraction, dynamic linking,
 * and memory evolution detection.
 *
 * (Source: Issue #122, arXiv:2502.12110)
 */
export interface IAgenticMemory extends IMemoryBackend {
  /**
   * Store a memory with automatic attribute extraction.
   * Extracts keywords, tags, entities, and context from the value.
   * Does NOT auto-link; call linkRelatedMemories() separately.
   * @param key - Memory key
   * @param value - Memory value (text content for extraction)
   * @param metadata - Memory metadata (importance, tags, ttl)
   * @returns Store result with extracted attributes and suggestions
   */
  storeWithAttributes(
    key: string,
    value: unknown,
    metadata: import('./memory-backend-types.js').MemoryMetadata
  ): Promise<Result<AgenticStoreResult, MemoryError>>;

  /**
   * Retrieve a memory with its A-MEM attributes.
   * @param key - Memory key
   * @returns Entry with attributes or null if not found
   */
  retrieveWithAttributes(key: string): Promise<Result<AgenticMemoryEntry | null, MemoryError>>;

  /**
   * Search with A-MEM enhanced retrieval.
   * Uses keywords and semantic tags for better relevance scoring.
   * @param query - Search query
   * @param limit - Max results (default: 10)
   * @returns Entries sorted by relevance
   */
  searchAgentic(query: string, limit?: number): Promise<Result<AgenticMemoryEntry[], MemoryError>>;

  /**
   * Get link suggestions for a memory entry.
   * Analyzes keyword overlap and entity co-occurrence.
   * Does NOT modify state.
   * @param key - Memory key to analyze
   * @param limit - Max suggestions (default: config.maxSuggestions)
   * @returns Suggested links ranked by confidence
   */
  suggestLinks(key: string, limit?: number): Promise<Result<LinkSuggestion[], MemoryError>>;

  /**
   * Link related memories based on suggestions.
   * Creates graph relationships for suggestions meeting threshold.
   * @param key - Memory key to link from
   * @param opts - Linking options (threshold, maxLinks, bidirectional)
   * @returns Number of links created
   */
  linkRelatedMemories(key: string, opts?: LinkingOptions): Promise<Result<number, MemoryError>>;

  /**
   * Detect evolution relationships with existing memories.
   * Identifies refinements, contradictions, extensions, supersessions.
   * @param key - Memory key to analyze
   * @returns Detected evolution relationships
   */
  detectEvolution(key: string): Promise<Result<EvolutionResult[], MemoryError>>;

  /**
   * Refresh attributes for a memory (re-extract).
   * Updates keywords, tags, entities, and context from current value.
   * @param key - Memory key
   * @returns Updated attributes
   */
  refreshAttributes(key: string): Promise<Result<MemoryAttributes, MemoryError>>;

  /**
   * Find memories that share attributes with the given key.
   * @param key - Memory key
   * @param attributeType - Type of attribute to match
   * @param limit - Max results (default: 10)
   * @returns Entries sharing attributes
   */
  findBySharedAttributes(
    key: string,
    attributeType: 'keywords' | 'semanticTags' | 'entities',
    limit?: number
  ): Promise<Result<AgenticMemoryEntry[], MemoryError>>;

  /** Get extraction config. */
  getExtractionConfig(): ExtractionConfig;

  /** Update extraction config. */
  updateExtractionConfig(config: Partial<ExtractionConfig>): void;

  /** Get linking config. */
  getLinkingConfig(): LinkingConfig;

  /** Update linking config. */
  updateLinkingConfig(config: Partial<LinkingConfig>): void;
}

// ============================================================================
// Backend Configuration
// ============================================================================

/**
 * Configuration for AgenticMemoryBackend.
 */
export interface AgenticMemoryConfig {
  /** Path to SQLite database file */
  readonly dbPath: string;
  /** Directory for Markdown exports */
  readonly markdownDir: string;
  /** Attribute extraction config (uses defaults if not provided) */
  readonly extraction?: Partial<ExtractionConfig>;
  /** Linking config (uses defaults if not provided) */
  readonly linking?: Partial<LinkingConfig>;
  /** Whether to auto-expire TTL entries (default: true) */
  readonly autoExpire?: boolean;
}

/** Zod schema for AgenticMemoryConfig validation. */
export const AgenticMemoryConfigSchema = z.object({
  dbPath: z.string().min(1),
  markdownDir: z.string().min(1),
  extraction: ExtractionConfigSchema.partial().optional(),
  linking: LinkingConfigSchema.partial().optional(),
  autoExpire: z.boolean().optional(),
});

// ============================================================================
// Default Configuration
// ============================================================================

/** Default extraction configuration. */
export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  maxKeywords: 10,
  maxSemanticTags: 5,
  maxContextLength: 200,
  maxEntities: 10,
};

/** Default linking configuration. */
export const DEFAULT_LINKING_CONFIG: LinkingConfig = {
  suggestionThreshold: 0.5,
  maxSuggestions: 5,
  allowedTypes: ['related_to', 'derived_from', 'same_entity'],
};

/** Default agentic memory configuration. */
export const DEFAULT_AGENTIC_MEMORY_CONFIG = {
  extraction: DEFAULT_EXTRACTION_CONFIG,
  linking: DEFAULT_LINKING_CONFIG,
  autoExpire: true,
} as const;
