/**
 * Typed memory implementation classes.
 *
 * @module context/typed-memory-impl
 * (Source: Issue #101, arXiv:2507.07957 - MIRIX Architecture)
 */

import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import type { IMemoryBackend, MemoryMetadata, MemoryError } from './memory-backend-types.js';
import { MemoryImportance, MemoryError as MemError } from './memory-backend-types.js';
import type {
  ICoreMemory,
  IEpisodicMemory,
  ISemanticMemory,
  IProceduralMemory,
  IResourceMemory,
  IKnowledgeVault,
  CoreMemoryData,
  EpisodeData,
  SemanticFact,
  Procedure,
  ResourceReference,
  VaultEntry,
} from './memory-types.js';

// ============================================================================
// Core Memory Implementation
// ============================================================================

export class CoreMemoryImpl implements ICoreMemory {
  constructor(private readonly backend: IMemoryBackend) {}

  async getIdentity(agentId: string): Promise<Result<CoreMemoryData | null, MemoryError>> {
    const result = await this.backend.retrieve(`core:identity:${agentId}`);
    if (!result.ok) return result;
    return ok(result.value as CoreMemoryData | null);
  }

  async setIdentity(data: CoreMemoryData): Promise<Result<void, MemoryError>> {
    const meta: MemoryMetadata = {
      importance: MemoryImportance.HIGH,
      tags: ['core', 'identity', data.role],
    };
    return this.backend.store(`core:identity:${data.agentId}`, data, meta);
  }

  async getConstraints(agentId: string): Promise<Result<readonly string[], MemoryError>> {
    const result = await this.getIdentity(agentId);
    if (!result.ok) return result;
    return ok(result.value?.constraints ?? []);
  }

  async updateConstraints(
    agentId: string,
    constraints: readonly string[]
  ): Promise<Result<void, MemoryError>> {
    const identity = await this.getIdentity(agentId);
    if (!identity.ok) return identity;
    if (identity.value === null) return err(new MemError(`Agent ${agentId} not found`));
    return this.setIdentity({ ...identity.value, constraints });
  }
}

// ============================================================================
// Episodic Memory Implementation
// ============================================================================

export class EpisodicMemoryImpl implements IEpisodicMemory {
  constructor(private readonly backend: IMemoryBackend) {}

  async recordEpisode(episode: EpisodeData): Promise<Result<void, MemoryError>> {
    const importance =
      episode.outcome === 'failure' ? MemoryImportance.HIGH : MemoryImportance.MEDIUM;
    const meta: MemoryMetadata = {
      importance,
      tags: ['episodic', episode.outcome, episode.agentId],
    };
    return this.backend.store(`episodic:${episode.episodeId}`, episode, meta);
  }

  async getEpisodes(
    agentId: string,
    limit = 20
  ): Promise<Result<readonly EpisodeData[], MemoryError>> {
    const result = await this.backend.search(`episodic ${agentId}`, limit);
    if (!result.ok) return result;
    return ok(result.value.map((e) => e.value as EpisodeData).filter((e) => e.agentId === agentId));
  }

  async getEpisodesByTask(taskId: string): Promise<Result<readonly EpisodeData[], MemoryError>> {
    const result = await this.backend.search(`episodic ${taskId}`, 50);
    if (!result.ok) return result;
    return ok(result.value.map((e) => e.value as EpisodeData).filter((e) => e.taskId === taskId));
  }

  async getRecentFailures(
    agentId: string,
    limit = 10
  ): Promise<Result<readonly EpisodeData[], MemoryError>> {
    const result = await this.backend.search(`episodic failure ${agentId}`, limit * 2);
    if (!result.ok) return result;
    const failures = result.value
      .map((e) => e.value as EpisodeData)
      .filter((e) => e.outcome === 'failure' && e.agentId === agentId)
      .slice(0, limit);
    return ok(failures);
  }

  async searchEpisodes(
    query: string,
    limit = 20
  ): Promise<Result<readonly EpisodeData[], MemoryError>> {
    const result = await this.backend.search(`episodic ${query}`, limit);
    if (!result.ok) return result;
    return ok(result.value.map((e) => e.value as EpisodeData));
  }
}

// ============================================================================
// Semantic Memory Implementation
// ============================================================================

export class SemanticMemoryImpl implements ISemanticMemory {
  constructor(private readonly backend: IMemoryBackend) {}

  async storeFact(fact: SemanticFact): Promise<Result<void, MemoryError>> {
    const meta: MemoryMetadata = {
      importance: MemoryImportance.MEDIUM,
      tags: ['semantic', fact.domain, fact.subject],
    };
    if (fact.validUntil !== undefined) {
      meta.ttl = fact.validUntil.getTime() - Date.now();
    }
    return this.backend.store(`semantic:${fact.factId}`, fact, meta);
  }

  async getFact(factId: string): Promise<Result<SemanticFact | null, MemoryError>> {
    const result = await this.backend.retrieve(`semantic:${factId}`);
    if (!result.ok) return result;
    return ok(result.value as SemanticFact | null);
  }

  async queryByDomain(
    domain: string,
    limit = 20
  ): Promise<Result<readonly SemanticFact[], MemoryError>> {
    const result = await this.backend.search(`semantic ${domain}`, limit);
    if (!result.ok) return result;
    return ok(result.value.map((e) => e.value as SemanticFact).filter((f) => f.domain === domain));
  }

  async queryBySubject(
    subject: string,
    limit = 20
  ): Promise<Result<readonly SemanticFact[], MemoryError>> {
    const result = await this.backend.search(`semantic ${subject}`, limit);
    if (!result.ok) return result;
    return ok(
      result.value.map((e) => e.value as SemanticFact).filter((f) => f.subject === subject)
    );
  }

  async searchFacts(
    query: string,
    limit = 20
  ): Promise<Result<readonly SemanticFact[], MemoryError>> {
    const result = await this.backend.search(`semantic ${query}`, limit);
    if (!result.ok) return result;
    return ok(result.value.map((e) => e.value as SemanticFact));
  }

  async invalidateFact(factId: string): Promise<Result<void, MemoryError>> {
    const fact = await this.getFact(factId);
    if (!fact.ok) return fact;
    if (fact.value === null) return ok(undefined);
    const updated = { ...fact.value, validUntil: new Date() };
    return this.storeFact(updated);
  }
}

// ============================================================================
// Procedural Memory Implementation
// ============================================================================

export class ProceduralMemoryImpl implements IProceduralMemory {
  constructor(private readonly backend: IMemoryBackend) {}

  async storeProcedure(procedure: Procedure): Promise<Result<void, MemoryError>> {
    const tags = ['procedural', procedure.name, ...(procedure.tags ?? [])];
    const meta: MemoryMetadata = { importance: MemoryImportance.MEDIUM, tags };
    return this.backend.store(`procedural:${procedure.procedureId}`, procedure, meta);
  }

  async getProcedure(procedureId: string): Promise<Result<Procedure | null, MemoryError>> {
    const result = await this.backend.retrieve(`procedural:${procedureId}`);
    if (!result.ok) return result;
    return ok(result.value as Procedure | null);
  }

  async findProcedures(
    triggerContext: string,
    limit = 10
  ): Promise<Result<readonly Procedure[], MemoryError>> {
    const result = await this.backend.search(`procedural ${triggerContext}`, limit * 2);
    if (!result.ok) return result;
    const procs = result.value
      .map((e) => e.value as Procedure)
      .filter((p) =>
        p.triggerConditions.some((t) => triggerContext.toLowerCase().includes(t.toLowerCase()))
      )
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, limit);
    return ok(procs);
  }

  async updateSuccessRate(
    procedureId: string,
    success: boolean
  ): Promise<Result<void, MemoryError>> {
    const proc = await this.getProcedure(procedureId);
    if (!proc.ok) return proc;
    if (proc.value === null) return err(new MemError(`Procedure ${procedureId} not found`));
    const count = proc.value.executionCount + 1;
    const rate = (proc.value.successRate * proc.value.executionCount + (success ? 1 : 0)) / count;
    return this.storeProcedure({ ...proc.value, successRate: rate, executionCount: count });
  }

  async searchProcedures(
    query: string,
    limit = 10
  ): Promise<Result<readonly Procedure[], MemoryError>> {
    const result = await this.backend.search(`procedural ${query}`, limit);
    if (!result.ok) return result;
    return ok(result.value.map((e) => e.value as Procedure));
  }
}

// ============================================================================
// Resource Memory Implementation
// ============================================================================

export class ResourceMemoryImpl implements IResourceMemory {
  constructor(private readonly backend: IMemoryBackend) {}

  async storeResource(resource: ResourceReference): Promise<Result<void, MemoryError>> {
    const meta: MemoryMetadata = {
      importance: MemoryImportance.LOW,
      tags: ['resource', resource.type, resource.name],
    };
    return this.backend.store(`resource:${resource.resourceId}`, resource, meta);
  }

  async getResource(resourceId: string): Promise<Result<ResourceReference | null, MemoryError>> {
    const result = await this.backend.retrieve(`resource:${resourceId}`);
    if (!result.ok) return result;
    return ok(result.value as ResourceReference | null);
  }

  async findByType(
    type: ResourceReference['type'],
    limit = 20
  ): Promise<Result<readonly ResourceReference[], MemoryError>> {
    const result = await this.backend.search(`resource ${type}`, limit);
    if (!result.ok) return result;
    return ok(result.value.map((e) => e.value as ResourceReference).filter((r) => r.type === type));
  }

  async findByLocation(
    locationPattern: string
  ): Promise<Result<readonly ResourceReference[], MemoryError>> {
    const result = await this.backend.search(`resource ${locationPattern}`, 50);
    if (!result.ok) return result;
    return ok(
      result.value
        .map((e) => e.value as ResourceReference)
        .filter((r) => r.location.includes(locationPattern))
    );
  }

  async updateLastAccessed(resourceId: string): Promise<Result<void, MemoryError>> {
    const res = await this.getResource(resourceId);
    if (!res.ok) return res;
    if (res.value === null) return ok(undefined);
    return this.storeResource({ ...res.value, lastAccessed: new Date() });
  }

  async searchResources(
    query: string,
    limit = 20
  ): Promise<Result<readonly ResourceReference[], MemoryError>> {
    const result = await this.backend.search(`resource ${query}`, limit);
    if (!result.ok) return result;
    return ok(result.value.map((e) => e.value as ResourceReference));
  }
}

// ============================================================================
// Knowledge Vault Implementation
// ============================================================================

export class KnowledgeVaultImpl implements IKnowledgeVault {
  constructor(private readonly backend: IMemoryBackend) {}

  async store(entry: VaultEntry): Promise<Result<void, MemoryError>> {
    const importance =
      entry.importance === 'critical' ? MemoryImportance.HIGH : MemoryImportance.MEDIUM;
    const tags = ['vault', entry.category, entry.importance, ...(entry.tags ?? [])];
    const meta: MemoryMetadata = { importance, tags };
    if (entry.expiresAt !== undefined) {
      meta.ttl = entry.expiresAt.getTime() - Date.now();
    }
    return this.backend.store(`vault:${entry.vaultId}`, entry, meta);
  }

  async retrieve(vaultId: string): Promise<Result<VaultEntry | null, MemoryError>> {
    const result = await this.backend.retrieve(`vault:${vaultId}`);
    if (!result.ok) return result;
    return ok(result.value as VaultEntry | null);
  }

  async findByCategory(
    category: VaultEntry['category'],
    limit = 20
  ): Promise<Result<readonly VaultEntry[], MemoryError>> {
    const result = await this.backend.search(`vault ${category}`, limit);
    if (!result.ok) return result;
    return ok(
      result.value.map((e) => e.value as VaultEntry).filter((v) => v.category === category)
    );
  }

  async findByImportance(
    importance: VaultEntry['importance'],
    limit = 20
  ): Promise<Result<readonly VaultEntry[], MemoryError>> {
    const result = await this.backend.search(`vault ${importance}`, limit);
    if (!result.ok) return result;
    return ok(
      result.value.map((e) => e.value as VaultEntry).filter((v) => v.importance === importance)
    );
  }

  async searchVault(
    query: string,
    limit = 20
  ): Promise<Result<readonly VaultEntry[], MemoryError>> {
    const result = await this.backend.search(`vault ${query}`, limit);
    if (!result.ok) return result;
    return ok(result.value.map((e) => e.value as VaultEntry));
  }

  async archive(vaultId: string): Promise<Result<void, MemoryError>> {
    const entry = await this.retrieve(vaultId);
    if (!entry.ok) return entry;
    if (entry.value === null) return ok(undefined);
    return this.store({ ...entry.value, category: 'archive', updatedAt: new Date() });
  }

  async getExpired(): Promise<Result<readonly VaultEntry[], MemoryError>> {
    const result = await this.backend.search('vault', 100);
    if (!result.ok) return result;
    const now = new Date();
    const expired = result.value
      .map((e) => e.value as VaultEntry)
      .filter((v) => v.expiresAt !== undefined && v.expiresAt < now);
    return ok(expired);
  }
}
