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

// Re-export Hindsight Belief Memory types (arXiv:2512.12818)
export type {
  Belief,
  BeliefConfidence,
  BeliefMemoryConfig,
  BeliefMemoryStats,
  BeliefQuery,
  BeliefSourceType,
  BeliefUpdate,
  BeliefUpdateType,
  Counterfactual,
  HindsightRecord,
  IHindsightBeliefMemory,
} from './belief-types.js';

export {
  BeliefConfidence as BeliefConfidenceEnum,
  BeliefConfidenceSchema,
  BeliefMemoryConfigSchema,
  BeliefMemoryStatsSchema,
  BeliefQuerySchema,
  BeliefSchema,
  BeliefSourceType as BeliefSourceTypeEnum,
  BeliefSourceTypeSchema,
  BeliefUpdateSchema,
  BeliefUpdateType as BeliefUpdateTypeEnum,
  BeliefUpdateTypeSchema,
  CounterfactualSchema,
  DEFAULT_BELIEF_CONFIG,
  HindsightRecordSchema,
} from './belief-types.js';

// Import interfaces for use in ITypedMemory
import type {
  ICoreMemory,
  IEpisodicMemory,
  ISemanticMemory,
  IProceduralMemory,
  IResourceMemory,
  IKnowledgeVault,
} from './memory-module-types.js';

// Import belief memory interface for extended typed memory
import type { IHindsightBeliefMemory } from './belief-types.js';

// ============================================================================
// Memory Type Enum
// ============================================================================

/**
 * Seven distinct memory types: six from MIRIX architecture plus Belief Memory.
 * (Source: arXiv:2507.07957 - MIRIX, arXiv:2512.12818 - Hindsight Belief Memory)
 */
export const MemoryType = {
  CORE: 'core',
  EPISODIC: 'episodic',
  SEMANTIC: 'semantic',
  PROCEDURAL: 'procedural',
  RESOURCE: 'resource',
  VAULT: 'vault',
  /** Hindsight Belief Memory for reasoning agents (arXiv:2512.12818) */
  BELIEF: 'belief',
} as const;

export type MemoryType = (typeof MemoryType)[keyof typeof MemoryType];

export const MemoryTypeSchema = z.enum([
  'core',
  'episodic',
  'semantic',
  'procedural',
  'resource',
  'vault',
  'belief',
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
 * Unified typed memory interface providing access to all seven memory types.
 * (Source: Issue #101, arXiv:2507.07957 - MIRIX, arXiv:2512.12818 - Hindsight)
 */
export interface ITypedMemory {
  readonly core: ICoreMemory;
  readonly episodic: IEpisodicMemory;
  readonly semantic: ISemanticMemory;
  readonly procedural: IProceduralMemory;
  readonly resource: IResourceMemory;
  readonly vault: IKnowledgeVault;
  /** Hindsight Belief Memory for reasoning agents (arXiv:2512.12818) */
  readonly belief: IHindsightBeliefMemory;

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
 * Belief memory is relevant for roles that require reasoning and decision-making.
 */
export const DEFAULT_RELEVANCE_CONFIG: RelevanceFilterConfig = {
  roleMemoryTypes: {
    orchestrator: [MemoryType.CORE, MemoryType.EPISODIC, MemoryType.VAULT, MemoryType.BELIEF],
    tech_lead: [MemoryType.CORE, MemoryType.EPISODIC, MemoryType.VAULT, MemoryType.BELIEF], // @deprecated - same as orchestrator
    code_expert: [MemoryType.PROCEDURAL, MemoryType.RESOURCE, MemoryType.EPISODIC],
    architecture_expert: [
      MemoryType.SEMANTIC,
      MemoryType.RESOURCE,
      MemoryType.VAULT,
      MemoryType.BELIEF,
    ],
    security_expert: [
      MemoryType.SEMANTIC,
      MemoryType.VAULT,
      MemoryType.PROCEDURAL,
      MemoryType.BELIEF,
    ],
    documentation_expert: [MemoryType.SEMANTIC, MemoryType.RESOURCE, MemoryType.EPISODIC],
    testing_expert: [MemoryType.SEMANTIC, MemoryType.EPISODIC, MemoryType.VAULT],
    devops_expert: [
      MemoryType.PROCEDURAL,
      MemoryType.RESOURCE,
      MemoryType.EPISODIC,
      MemoryType.VAULT,
    ],
    research_expert: [
      MemoryType.SEMANTIC,
      MemoryType.RESOURCE,
      MemoryType.VAULT,
      MemoryType.EPISODIC,
    ],
    pm_expert: [MemoryType.SEMANTIC, MemoryType.EPISODIC, MemoryType.CORE, MemoryType.BELIEF],
    ux_expert: [MemoryType.SEMANTIC, MemoryType.EPISODIC, MemoryType.RESOURCE],
    infrastructure_expert: [
      MemoryType.PROCEDURAL,
      MemoryType.RESOURCE,
      MemoryType.EPISODIC,
      MemoryType.VAULT,
    ],
    qa_expert: [MemoryType.SEMANTIC, MemoryType.EPISODIC, MemoryType.PROCEDURAL, MemoryType.BELIEF],
    data_visualization_expert: [MemoryType.SEMANTIC, MemoryType.RESOURCE, MemoryType.EPISODIC],
    custom: [MemoryType.SEMANTIC, MemoryType.PROCEDURAL, MemoryType.RESOURCE],
    // TRINITY roles (arXiv:2512.04695) - thinker and verifier benefit from belief memory
    thinker: [MemoryType.SEMANTIC, MemoryType.CORE, MemoryType.VAULT, MemoryType.BELIEF],
    worker: [MemoryType.PROCEDURAL, MemoryType.RESOURCE, MemoryType.EPISODIC],
    verifier: [MemoryType.SEMANTIC, MemoryType.VAULT, MemoryType.PROCEDURAL, MemoryType.BELIEF],
  },
  minRelevanceScore: 0.5,
  maxEntriesPerType: 10,
};
