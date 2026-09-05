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
import { getTimeProvider } from '../core/index.js';
import type { AgentRole } from '../core/types/agent.js';
import { createLogger } from '../core/logger.js';
import type { IContextMemoryBackend, MemoryEntry, MemoryError } from './memory-backend-types.js';
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
import type { IHindsightBeliefMemory } from './belief-types.js';
import { MemoryType, DEFAULT_RELEVANCE_CONFIG } from './memory-types.js';
import {
  CoreMemoryImpl,
  EpisodicMemoryImpl,
  SemanticMemoryImpl,
  ProceduralMemoryImpl,
  ResourceMemoryImpl,
  KnowledgeVaultImpl,
} from './typed-memory-impl.js';
import { HindsightBeliefMemory } from './belief-memory.js';

const logger = createLogger({ component: 'typed-memory' });
const STATS_SEARCH_CAP = 1000;

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
  readonly belief: IHindsightBeliefMemory;

  private readonly backend: IContextMemoryBackend;
  private readonly config: RelevanceFilterConfig;

  constructor(
    backend: IContextMemoryBackend,
    config: RelevanceFilterConfig = DEFAULT_RELEVANCE_CONFIG
  ) {
    this.backend = backend;
    this.config = config;
    this.core = new CoreMemoryImpl(backend);
    this.episodic = new EpisodicMemoryImpl(backend);
    this.semantic = new SemanticMemoryImpl(backend);
    this.procedural = new ProceduralMemoryImpl(backend);
    this.resource = new ResourceMemoryImpl(backend);
    this.vault = new KnowledgeVaultImpl(backend);
    this.belief = new HindsightBeliefMemory();
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
      belief: 0,
    };
    const coverage: TypedMemoryStats['coverage'] = {
      core: 'exact',
      episodic: 'exact',
      semantic: 'exact',
      procedural: 'exact',
      resource: 'exact',
      vault: 'exact',
      belief: 'exact',
    };
    let total = 0;
    let truncated = false;
    for (const type of Object.values(MemoryType)) {
      const result = await this.backend.search(type, STATS_SEARCH_CAP);
      if (!result.ok) {
        coverage[type] = 'error';
        continue;
      }
      counts[type] = result.value.length;
      total += result.value.length;
      if (result.value.length === STATS_SEARCH_CAP) {
        coverage[type] = 'truncated';
        truncated = true;
      }
    }
    // Successful types remain useful; coverage identifies partial failures
    // without discarding their measurements in a top-level error.
    return ok({
      totalEntries: total,
      entriesByType: counts,
      coverage,
      ...(truncated ? { cap: STATS_SEARCH_CAP } : {}),
    });
  }

  async pruneExpired(): Promise<Result<TypedMemoryPruneResult, MemoryError>> {
    const result = await this.backend.prune(new Date(getTimeProvider().now()));
    if (!result.ok) return result;
    logger.info('Pruned expired entries', { count: result.value });
    return ok({
      prunedCount: result.value,
      prunedByType: {
        core: 0,
        episodic: 0,
        semantic: 0,
        procedural: 0,
        resource: 0,
        vault: 0,
        belief: 0,
      },
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
  backend: IContextMemoryBackend,
  config?: RelevanceFilterConfig
): ITypedMemory {
  return new TypedMemory(backend, config);
}
