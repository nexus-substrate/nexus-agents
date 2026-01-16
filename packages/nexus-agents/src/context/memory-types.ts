/**
 * nexus-agents/context - Typed Memory Architecture
 *
 * Implements MIRIX-style typed memory system with six distinct memory types
 * for improved agent coordination and context management.
 *
 * @module context/memory-types
 * (Source: Issue #101, arXiv:2507.07957 - MIRIX Architecture)
 */

import { z } from 'zod';
import type { Result } from '../core/result.js';
import type { AgentRole } from '../core/types/agent.js';
import type { MemoryError, MemoryMetadata } from './memory-backend-types.js';

// Re-export all memory module types for backward compatibility
export type {
  CoreMemoryData,
  ICoreMemory,
  EpisodeData,
  IEpisodicMemory,
  SemanticFact,
  ISemanticMemory,
  ProcedureStep,
  Procedure,
  IProceduralMemory,
  ResourceReference,
  IResourceMemory,
  VaultEntry,
  IKnowledgeVault,
} from './memory-module-types.js';

export {
  CoreMemoryDataSchema,
  EpisodeDataSchema,
  SemanticFactSchema,
  ProcedureStepSchema,
  ProcedureSchema,
  ResourceReferenceSchema,
  VaultEntrySchema,
} from './memory-module-types.js';

// Import interfaces for use in ITypedMemory
import type {
  ICoreMemory,
  IEpisodicMemory,
  ISemanticMemory,
  IProceduralMemory,
  IResourceMemory,
  IKnowledgeVault,
} from './memory-module-types.js';

// ============================================================================
// Memory Type Enum
// ============================================================================

/**
 * Six distinct memory types based on MIRIX architecture.
 */
export const MemoryType = {
  CORE: 'core',
  EPISODIC: 'episodic',
  SEMANTIC: 'semantic',
  PROCEDURAL: 'procedural',
  RESOURCE: 'resource',
  VAULT: 'vault',
} as const;

export type MemoryType = (typeof MemoryType)[keyof typeof MemoryType];

export const MemoryTypeSchema = z.enum([
  'core',
  'episodic',
  'semantic',
  'procedural',
  'resource',
  'vault',
]);

// ============================================================================
// Typed Memory Entry
// ============================================================================

/**
 * Base typed memory entry with type discrimination.
 */
export interface TypedMemoryEntry<T extends MemoryType = MemoryType> {
  readonly id: string;
  readonly type: T;
  readonly key: string;
  readonly value: unknown;
  readonly metadata: MemoryMetadata;
  readonly createdAt: Date;
  readonly accessedAt: Date;
  readonly agentId?: string;
  readonly relevanceScore?: number;
}

// ============================================================================
// Typed Memory Interface
// ============================================================================

/**
 * Unified typed memory interface providing access to all six memory types.
 * (Source: Issue #101, arXiv:2507.07957 - MIRIX Architecture)
 */
export interface ITypedMemory {
  readonly core: ICoreMemory;
  readonly episodic: IEpisodicMemory;
  readonly semantic: ISemanticMemory;
  readonly procedural: IProceduralMemory;
  readonly resource: IResourceMemory;
  readonly vault: IKnowledgeVault;

  /** Query entries by memory type */
  queryByType(
    type: MemoryType,
    query: string,
    limit?: number
  ): Promise<Result<readonly TypedMemoryEntry[], MemoryError>>;

  /** Filter memories by relevance to an agent role */
  filterByRelevance(
    agentRole: AgentRole,
    limit?: number
  ): Promise<Result<readonly TypedMemoryEntry[], MemoryError>>;

  /** Get memory statistics across all types */
  getStats(): Promise<Result<TypedMemoryStats, MemoryError>>;

  /** Prune expired entries across all memory types */
  pruneExpired(): Promise<Result<TypedMemoryPruneResult, MemoryError>>;
}

/**
 * Statistics for typed memory usage.
 */
export interface TypedMemoryStats {
  readonly totalEntries: number;
  readonly entriesByType: Record<MemoryType, number>;
  readonly oldestEntry?: Date;
  readonly newestEntry?: Date;
  readonly totalSizeBytes?: number;
}

/**
 * Result of pruning expired entries.
 */
export interface TypedMemoryPruneResult {
  readonly prunedCount: number;
  readonly prunedByType: Record<MemoryType, number>;
  readonly freedBytes?: number;
}

// ============================================================================
// Relevance Filter Configuration
// ============================================================================

/**
 * Configuration for role-based memory filtering.
 */
export interface RelevanceFilterConfig {
  /** Memory types relevant to each role */
  readonly roleMemoryTypes: Record<AgentRole, readonly MemoryType[]>;
  /** Minimum relevance score to include (0-1) */
  readonly minRelevanceScore: number;
  /** Maximum entries to return per type */
  readonly maxEntriesPerType: number;
}

/**
 * Default relevance filter configuration.
 */
export const DEFAULT_RELEVANCE_CONFIG: RelevanceFilterConfig = {
  roleMemoryTypes: {
    tech_lead: [MemoryType.CORE, MemoryType.EPISODIC, MemoryType.VAULT],
    code_expert: [MemoryType.PROCEDURAL, MemoryType.RESOURCE, MemoryType.EPISODIC],
    architecture_expert: [MemoryType.SEMANTIC, MemoryType.RESOURCE, MemoryType.VAULT],
    security_expert: [MemoryType.SEMANTIC, MemoryType.VAULT, MemoryType.PROCEDURAL],
    documentation_expert: [MemoryType.SEMANTIC, MemoryType.RESOURCE, MemoryType.EPISODIC],
    testing_expert: [MemoryType.SEMANTIC, MemoryType.EPISODIC, MemoryType.VAULT],
    custom: [MemoryType.SEMANTIC, MemoryType.PROCEDURAL, MemoryType.RESOURCE],
    // TRINITY roles (arXiv:2512.04695)
    thinker: [MemoryType.SEMANTIC, MemoryType.CORE, MemoryType.VAULT],
    worker: [MemoryType.PROCEDURAL, MemoryType.RESOURCE, MemoryType.EPISODIC],
    verifier: [MemoryType.SEMANTIC, MemoryType.VAULT, MemoryType.PROCEDURAL],
  },
  minRelevanceScore: 0.5,
  maxEntriesPerType: 10,
};
