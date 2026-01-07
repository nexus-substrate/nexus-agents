/**
 * nexus-agents/context - Typed Memory Implementation
 *
 * Implements MIRIX-style typed memory system using HybridMemoryBackend.
 *
 * @module context/typed-memory
 * (Source: Issue #101, arXiv:2507.07957 - MIRIX Architecture)
 */

import type { Result } from '../core/result.js';
import { ok } from '../core/result.js';
import type { AgentRole } from '../core/types/agent.js';
import { createLogger } from '../core/logger.js';
import type { IMemoryBackend, MemoryEntry, MemoryError } from './memory-backend-types.js';
import type {
  ITypedMemory,
  ICoreMemory,
  IEpisodicMemory,
  ISemanticMemory,
  IProceduralMemory,
  IResourceMemory,
  IKnowledgeVault,
  TypedMemoryEntry,
  TypedMemoryStats,
  TypedMemoryPruneResult,
  RelevanceFilterConfig,
} from './memory-types.js';
import { MemoryType, DEFAULT_RELEVANCE_CONFIG } from './memory-types.js';
import {
  CoreMemoryImpl,
  EpisodicMemoryImpl,
  SemanticMemoryImpl,
  ProceduralMemoryImpl,
  ResourceMemoryImpl,
  KnowledgeVaultImpl,
} from './typed-memory-impl.js';

const logger = createLogger({ component: 'typed-memory' });

/**
 * Typed memory system implementing MIRIX architecture.
 */
export class TypedMemory implements ITypedMemory {
  readonly core: ICoreMemory;
  readonly episodic: IEpisodicMemory;
  readonly semantic: ISemanticMemory;
  readonly procedural: IProceduralMemory;
  readonly resource: IResourceMemory;
  readonly vault: IKnowledgeVault;

  private readonly backend: IMemoryBackend;
  private readonly config: RelevanceFilterConfig;

  constructor(backend: IMemoryBackend, config: RelevanceFilterConfig = DEFAULT_RELEVANCE_CONFIG) {
    this.backend = backend;
    this.config = config;
    this.core = new CoreMemoryImpl(backend);
    this.episodic = new EpisodicMemoryImpl(backend);
    this.semantic = new SemanticMemoryImpl(backend);
    this.procedural = new ProceduralMemoryImpl(backend);
    this.resource = new ResourceMemoryImpl(backend);
    this.vault = new KnowledgeVaultImpl(backend);
    logger.info('TypedMemory initialized');
  }

  async queryByType(
    type: MemoryType,
    query: string,
    limit = 20
  ): Promise<Result<readonly TypedMemoryEntry[], MemoryError>> {
    const result = await this.backend.search(`${type} ${query}`, limit);
    if (!result.ok) return result;
    return ok(result.value.map((e) => this.toTypedEntry(e, type)));
  }

  async filterByRelevance(
    agentRole: AgentRole,
    limit = 50
  ): Promise<Result<readonly TypedMemoryEntry[], MemoryError>> {
    const configuredTypes = this.config.roleMemoryTypes[agentRole];
    const relevantTypes =
      configuredTypes.length > 0 ? configuredTypes : [MemoryType.CORE, MemoryType.VAULT];
    const entries: TypedMemoryEntry[] = [];
    for (const type of relevantTypes) {
      const result = await this.backend.search(type, this.config.maxEntriesPerType);
      if (result.ok) {
        entries.push(...result.value.map((e) => this.toTypedEntry(e, type)));
      }
    }
    return ok(entries.slice(0, limit));
  }

  async getStats(): Promise<Result<TypedMemoryStats, MemoryError>> {
    const counts: Record<MemoryType, number> = {
      core: 0,
      episodic: 0,
      semantic: 0,
      procedural: 0,
      resource: 0,
      vault: 0,
    };
    let total = 0;
    for (const type of Object.values(MemoryType)) {
      const result = await this.backend.search(type, 1000);
      if (result.ok) {
        counts[type] = result.value.length;
        total += result.value.length;
      }
    }
    return ok({ totalEntries: total, entriesByType: counts });
  }

  async pruneExpired(): Promise<Result<TypedMemoryPruneResult, MemoryError>> {
    const result = await this.backend.prune(new Date());
    if (!result.ok) return result;
    logger.info('Pruned expired entries', { count: result.value });
    return ok({
      prunedCount: result.value,
      prunedByType: { core: 0, episodic: 0, semantic: 0, procedural: 0, resource: 0, vault: 0 },
    });
  }

  private toTypedEntry(entry: MemoryEntry, type: MemoryType): TypedMemoryEntry {
    return {
      id: entry.key,
      type,
      key: entry.key,
      value: entry.value,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
      accessedAt: entry.accessedAt,
    };
  }
}

/** Create a typed memory instance. */
export function createTypedMemory(
  backend: IMemoryBackend,
  config?: RelevanceFilterConfig
): ITypedMemory {
  return new TypedMemory(backend, config);
}
