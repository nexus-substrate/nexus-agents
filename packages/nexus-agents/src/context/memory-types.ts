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
// Core Memory - Agent Identity
// ============================================================================

/**
 * Core memory stores agent identity, constraints, and role definitions.
 * This is the most persistent memory type, rarely modified after initialization.
 */
export interface CoreMemoryData {
  readonly agentId: string;
  readonly role: AgentRole;
  readonly name: string;
  readonly constraints: readonly string[];
  readonly capabilities: readonly string[];
  readonly systemPrompt?: string;
  readonly temperament?: 'cautious' | 'balanced' | 'exploratory';
}

export const CoreMemoryDataSchema = z.object({
  agentId: z.string().min(1),
  role: z.string(),
  name: z.string().min(1),
  constraints: z.array(z.string()),
  capabilities: z.array(z.string()),
  systemPrompt: z.string().optional(),
  temperament: z.enum(['cautious', 'balanced', 'exploratory']).optional(),
});

export interface ICoreMemory {
  getIdentity(agentId: string): Promise<Result<CoreMemoryData | null, MemoryError>>;
  setIdentity(data: CoreMemoryData): Promise<Result<void, MemoryError>>;
  getConstraints(agentId: string): Promise<Result<readonly string[], MemoryError>>;
  updateConstraints(
    agentId: string,
    constraints: readonly string[]
  ): Promise<Result<void, MemoryError>>;
}

// ============================================================================
// Episodic Memory - Task Experiences
// ============================================================================

/**
 * Episodic memory stores task experiences and interaction history.
 * Used for learning from past interactions and avoiding repeated mistakes.
 */
export interface EpisodeData {
  readonly episodeId: string;
  readonly taskId: string;
  readonly agentId: string;
  readonly action: string;
  readonly outcome: 'success' | 'failure' | 'partial';
  readonly context: Record<string, unknown>;
  readonly learnings?: readonly string[];
  readonly timestamp: Date;
  readonly durationMs?: number;
}

export const EpisodeDataSchema = z.object({
  episodeId: z.string().min(1),
  taskId: z.string().min(1),
  agentId: z.string().min(1),
  action: z.string().min(1),
  outcome: z.enum(['success', 'failure', 'partial']),
  context: z.record(z.unknown()),
  learnings: z.array(z.string()).optional(),
  timestamp: z.date(),
  durationMs: z.number().positive().optional(),
});

export interface IEpisodicMemory {
  recordEpisode(episode: EpisodeData): Promise<Result<void, MemoryError>>;
  getEpisodes(
    agentId: string,
    limit?: number
  ): Promise<Result<readonly EpisodeData[], MemoryError>>;
  getEpisodesByTask(taskId: string): Promise<Result<readonly EpisodeData[], MemoryError>>;
  getRecentFailures(
    agentId: string,
    limit?: number
  ): Promise<Result<readonly EpisodeData[], MemoryError>>;
  searchEpisodes(
    query: string,
    limit?: number
  ): Promise<Result<readonly EpisodeData[], MemoryError>>;
}

// ============================================================================
// Semantic Memory - Domain Knowledge
// ============================================================================

/**
 * Semantic memory stores domain facts and learned information.
 * Used for general knowledge that applies across tasks.
 */
export interface SemanticFact {
  readonly factId: string;
  readonly domain: string;
  readonly subject: string;
  readonly predicate: string;
  readonly object: string;
  readonly confidence: number;
  readonly source?: string;
  readonly validUntil?: Date;
}

export const SemanticFactSchema = z.object({
  factId: z.string().min(1),
  domain: z.string().min(1),
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.string().optional(),
  validUntil: z.date().optional(),
});

export interface ISemanticMemory {
  storeFact(fact: SemanticFact): Promise<Result<void, MemoryError>>;
  getFact(factId: string): Promise<Result<SemanticFact | null, MemoryError>>;
  queryByDomain(
    domain: string,
    limit?: number
  ): Promise<Result<readonly SemanticFact[], MemoryError>>;
  queryBySubject(
    subject: string,
    limit?: number
  ): Promise<Result<readonly SemanticFact[], MemoryError>>;
  searchFacts(query: string, limit?: number): Promise<Result<readonly SemanticFact[], MemoryError>>;
  invalidateFact(factId: string): Promise<Result<void, MemoryError>>;
}

// ============================================================================
// Procedural Memory - Skills and Workflows
// ============================================================================

/**
 * Procedural memory stores skills, workflows, and action patterns.
 * Used for learned procedures that can be reused across tasks.
 */
export interface ProcedureStep {
  readonly stepId: string;
  readonly action: string;
  readonly parameters?: Record<string, unknown>;
  readonly preconditions?: readonly string[];
  readonly postconditions?: readonly string[];
}

export interface Procedure {
  readonly procedureId: string;
  readonly name: string;
  readonly description: string;
  readonly steps: readonly ProcedureStep[];
  readonly triggerConditions: readonly string[];
  readonly successRate: number;
  readonly executionCount: number;
  readonly averageDurationMs?: number;
  readonly tags?: readonly string[];
}

export const ProcedureStepSchema = z.object({
  stepId: z.string().min(1),
  action: z.string().min(1),
  parameters: z.record(z.unknown()).optional(),
  preconditions: z.array(z.string()).optional(),
  postconditions: z.array(z.string()).optional(),
});

export const ProcedureSchema = z.object({
  procedureId: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  steps: z.array(ProcedureStepSchema),
  triggerConditions: z.array(z.string()),
  successRate: z.number().min(0).max(1),
  executionCount: z.number().int().min(0),
  averageDurationMs: z.number().positive().optional(),
  tags: z.array(z.string()).optional(),
});

export interface IProceduralMemory {
  storeProcedure(procedure: Procedure): Promise<Result<void, MemoryError>>;
  getProcedure(procedureId: string): Promise<Result<Procedure | null, MemoryError>>;
  findProcedures(
    triggerContext: string,
    limit?: number
  ): Promise<Result<readonly Procedure[], MemoryError>>;
  updateSuccessRate(procedureId: string, success: boolean): Promise<Result<void, MemoryError>>;
  searchProcedures(
    query: string,
    limit?: number
  ): Promise<Result<readonly Procedure[], MemoryError>>;
}

// ============================================================================
// Resource Memory - External References
// ============================================================================

/**
 * Resource memory stores references to external data (files, URLs, APIs).
 * Used for tracking data sources and their freshness.
 */
export interface ResourceReference {
  readonly resourceId: string;
  readonly type: 'file' | 'url' | 'api' | 'database' | 'other';
  readonly location: string;
  readonly name: string;
  readonly mimeType?: string;
  readonly size?: number;
  readonly hash?: string;
  readonly lastAccessed: Date;
  readonly lastModified?: Date;
  readonly metadata?: Record<string, unknown>;
}

export const ResourceReferenceSchema = z.object({
  resourceId: z.string().min(1),
  type: z.enum(['file', 'url', 'api', 'database', 'other']),
  location: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().optional(),
  size: z.number().int().positive().optional(),
  hash: z.string().optional(),
  lastAccessed: z.date(),
  lastModified: z.date().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export interface IResourceMemory {
  storeResource(resource: ResourceReference): Promise<Result<void, MemoryError>>;
  getResource(resourceId: string): Promise<Result<ResourceReference | null, MemoryError>>;
  findByType(
    type: ResourceReference['type'],
    limit?: number
  ): Promise<Result<readonly ResourceReference[], MemoryError>>;
  findByLocation(
    locationPattern: string
  ): Promise<Result<readonly ResourceReference[], MemoryError>>;
  updateLastAccessed(resourceId: string): Promise<Result<void, MemoryError>>;
  searchResources(
    query: string,
    limit?: number
  ): Promise<Result<readonly ResourceReference[], MemoryError>>;
}

// ============================================================================
// Knowledge Vault - Persistent Cross-Session Storage
// ============================================================================

/**
 * Knowledge vault stores persistent data that survives across sessions.
 * Used for long-term knowledge and critical information.
 */
export interface VaultEntry {
  readonly vaultId: string;
  readonly category: 'insight' | 'decision' | 'pattern' | 'config' | 'archive';
  readonly title: string;
  readonly content: unknown;
  readonly importance: 'critical' | 'high' | 'normal';
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiresAt?: Date;
  readonly tags?: readonly string[];
  readonly relatedIds?: readonly string[];
}

export const VaultEntrySchema = z.object({
  vaultId: z.string().min(1),
  category: z.enum(['insight', 'decision', 'pattern', 'config', 'archive']),
  title: z.string().min(1),
  content: z.unknown(),
  importance: z.enum(['critical', 'high', 'normal']),
  createdAt: z.date(),
  updatedAt: z.date(),
  expiresAt: z.date().optional(),
  tags: z.array(z.string()).optional(),
  relatedIds: z.array(z.string()).optional(),
});

export interface IKnowledgeVault {
  store(entry: VaultEntry): Promise<Result<void, MemoryError>>;
  retrieve(vaultId: string): Promise<Result<VaultEntry | null, MemoryError>>;
  findByCategory(
    category: VaultEntry['category'],
    limit?: number
  ): Promise<Result<readonly VaultEntry[], MemoryError>>;
  findByImportance(
    importance: VaultEntry['importance'],
    limit?: number
  ): Promise<Result<readonly VaultEntry[], MemoryError>>;
  searchVault(query: string, limit?: number): Promise<Result<readonly VaultEntry[], MemoryError>>;
  archive(vaultId: string): Promise<Result<void, MemoryError>>;
  getExpired(): Promise<Result<readonly VaultEntry[], MemoryError>>;
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
    orchestrator: [MemoryType.CORE, MemoryType.EPISODIC, MemoryType.VAULT],
    researcher: [MemoryType.SEMANTIC, MemoryType.RESOURCE, MemoryType.VAULT],
    implementer: [MemoryType.PROCEDURAL, MemoryType.RESOURCE, MemoryType.EPISODIC],
    reviewer: [MemoryType.SEMANTIC, MemoryType.EPISODIC, MemoryType.VAULT],
    specialist: [MemoryType.SEMANTIC, MemoryType.PROCEDURAL, MemoryType.RESOURCE],
  },
  minRelevanceScore: 0.5,
  maxEntriesPerType: 10,
};
