/**
 * Graph-Based Memory Types
 *
 * Type definitions for graph-structured memory with entity relationships.
 * Implements concepts from arXiv:2308.09687 (MiRIX) for knowledge graphs.
 *
 * @module context/graph-memory-types
 * (Source: Issue #142, arXiv:2308.09687)
 */

import { z } from 'zod';
import type { Result } from '../core/result.js';
import type {
  MemoryEntry,
  MemoryMetadata,
  MemoryError,
  IMemoryBackend,
} from './memory-backend-types.js';

// ============================================================================
// Relationship Types
// ============================================================================

/**
 * Types of relationships between memory nodes.
 */
export const RelationType = {
  /** General association between memories */
  RELATED_TO: 'related_to',
  /** One memory derived from another */
  DERIVED_FROM: 'derived_from',
  /** Memories that contradict each other */
  CONTRADICTS: 'contradicts',
  /** One memory supersedes another */
  SUPERSEDES: 'supersedes',
  /** Parent-child hierarchy */
  PARENT_OF: 'parent_of',
  /** Memories about the same entity */
  SAME_ENTITY: 'same_entity',
  /** Temporal sequence */
  PRECEDES: 'precedes',
  /** Causal relationship */
  CAUSES: 'causes',
} as const;

export type RelationType = (typeof RelationType)[keyof typeof RelationType];

/** Zod schema for RelationType validation. */
export const RelationTypeSchema = z.enum([
  'related_to',
  'derived_from',
  'contradicts',
  'supersedes',
  'parent_of',
  'same_entity',
  'precedes',
  'causes',
]);

// ============================================================================
// Graph Structures
// ============================================================================

/**
 * A relationship edge between two memory nodes.
 */
export interface GraphEdge {
  /** Source node key */
  readonly from: string;
  /** Target node key */
  readonly to: string;
  /** Type of relationship */
  readonly type: RelationType;
  /** Relationship strength/weight (0-1) */
  readonly weight: number;
  /** When the relationship was created */
  readonly createdAt: Date;
  /** Optional metadata about the relationship */
  readonly metadata?: Record<string, unknown>;
}

/** Zod schema for GraphEdge validation. */
export const GraphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: RelationTypeSchema,
  weight: z.number().min(0).max(1),
  createdAt: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * A memory node with its relationships.
 */
export interface GraphNode extends MemoryEntry {
  /** Outgoing edges from this node */
  readonly outEdges: readonly GraphEdge[];
  /** Incoming edges to this node */
  readonly inEdges: readonly GraphEdge[];
}

/**
 * Options for graph traversal operations.
 */
export interface TraversalOptions {
  /** Maximum depth to traverse (default: 2) */
  readonly maxDepth?: number;
  /** Filter by relationship types */
  readonly relationTypes?: readonly RelationType[];
  /** Minimum edge weight to follow (default: 0) */
  readonly minWeight?: number;
  /** Maximum number of results */
  readonly limit?: number;
  /** Whether to include the starting node */
  readonly includeStart?: boolean;
  /** Direction: outgoing, incoming, or both */
  readonly direction?: 'outgoing' | 'incoming' | 'both';
}

/** Zod schema for TraversalOptions validation. */
export const TraversalOptionsSchema = z.object({
  maxDepth: z.number().int().positive().optional(),
  relationTypes: z.array(RelationTypeSchema).optional(),
  minWeight: z.number().min(0).max(1).optional(),
  limit: z.number().int().positive().optional(),
  includeStart: z.boolean().optional(),
  direction: z.enum(['outgoing', 'incoming', 'both']).optional(),
});

/**
 * Result of a graph traversal with path information.
 */
export interface TraversalResult {
  /** The memory entry found */
  readonly entry: MemoryEntry;
  /** Distance from the starting node */
  readonly depth: number;
  /** Path of keys from start to this node */
  readonly path: readonly string[];
  /** Edge that led to this node (if not start) */
  readonly edge?: GraphEdge;
}

/**
 * Options for adding a relationship.
 */
export interface AddRelationshipOptions {
  /** Relationship strength (default: 1.0) */
  readonly weight?: number;
  /** Optional metadata about the relationship */
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Graph Memory Interface
// ============================================================================

/**
 * Extended memory backend with graph-based relationship operations.
 */
export interface IGraphMemory extends IMemoryBackend {
  /**
   * Add a relationship between two memory entries.
   * @param from - Source memory key
   * @param to - Target memory key
   * @param type - Type of relationship
   * @param opts - Additional options
   */
  addRelationship(
    from: string,
    to: string,
    type: RelationType,
    opts?: AddRelationshipOptions
  ): Promise<Result<void, MemoryError>>;

  /**
   * Remove a relationship between two memory entries.
   * @param from - Source memory key
   * @param to - Target memory key
   * @param type - Optional: specific type to remove (removes all if not specified)
   */
  removeRelationship(
    from: string,
    to: string,
    type?: RelationType
  ): Promise<Result<void, MemoryError>>;

  /**
   * Get all relationships for a memory entry.
   * @param key - Memory key
   * @param direction - Which edges to retrieve
   */
  getRelationships(
    key: string,
    direction?: 'outgoing' | 'incoming' | 'both'
  ): Promise<Result<GraphEdge[], MemoryError>>;

  /**
   * Traverse the graph from a starting node.
   * @param startKey - Starting memory key
   * @param opts - Traversal options
   */
  traverse(
    startKey: string,
    opts?: TraversalOptions
  ): Promise<Result<TraversalResult[], MemoryError>>;

  /**
   * Find the shortest path between two memories.
   * @param from - Source memory key
   * @param to - Target memory key
   * @param opts - Traversal constraints
   */
  findPath(
    from: string,
    to: string,
    opts?: Pick<TraversalOptions, 'relationTypes' | 'minWeight'>
  ): Promise<Result<string[] | null, MemoryError>>;

  /**
   * Get all memories connected to a key within a certain depth.
   * @param key - Central memory key
   * @param depth - Maximum hops (default: 1)
   */
  getNeighbors(key: string, depth?: number): Promise<Result<MemoryEntry[], MemoryError>>;

  /**
   * Store a memory with automatic relationship inference.
   * @param key - Memory key
   * @param value - Memory value
   * @param metadata - Memory metadata
   * @param relatedTo - Keys of related memories
   */
  storeWithRelations(
    key: string,
    value: unknown,
    metadata: MemoryMetadata,
    relatedTo?: readonly string[]
  ): Promise<Result<void, MemoryError>>;
}

// ============================================================================
// SQLite Row Types
// ============================================================================

/**
 * Row structure for the graph_edges table.
 */
export interface GraphEdgeRow {
  from_key: string;
  to_key: string;
  relation_type: string;
  weight: number;
  created_at: number;
  metadata: string | null;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for GraphMemoryBackend.
 */
export interface GraphMemoryConfig {
  /** Path to SQLite database file */
  readonly dbPath: string;
  /** Directory for Markdown exports */
  readonly markdownDir: string;
  /** Default traversal depth (default: 2) */
  readonly defaultTraversalDepth?: number;
  /** Maximum allowed traversal depth (default: 5) */
  readonly maxTraversalDepth?: number;
  /** Whether to auto-expire TTL entries (default: true) */
  readonly autoExpire?: boolean;
}

/** Zod schema for GraphMemoryConfig validation. */
export const GraphMemoryConfigSchema = z.object({
  dbPath: z.string().min(1),
  markdownDir: z.string().min(1),
  defaultTraversalDepth: z.number().int().positive().optional(),
  maxTraversalDepth: z.number().int().positive().optional(),
  autoExpire: z.boolean().optional(),
});

// ============================================================================
// Default Configuration
// ============================================================================

/** Default configuration values. */
export const DEFAULT_GRAPH_MEMORY_CONFIG = {
  defaultTraversalDepth: 2,
  maxTraversalDepth: 5,
  autoExpire: true,
} as const;
