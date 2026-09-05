/**
 * Tests for typed memory architecture.
 * (Source: Issue #101, arXiv:2507.07957)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TypedMemory, createTypedMemory } from './typed-memory.js';
import { MemoryType } from './memory-types.js';
import type {
  CoreMemoryData,
  EpisodeData,
  SemanticFact,
  Procedure,
  ResourceReference,
  VaultEntry,
} from './memory-types.js';
import type { IContextMemoryBackend, MemoryMetadata, MemoryEntry } from './memory-backend-types.js';
import { MemoryError } from './memory-backend-types.js';
import { err, ok } from '../core/result.js';

// Mock memory backend
function createMockBackend(): IContextMemoryBackend {
  const storage = new Map<string, { value: unknown; metadata: MemoryMetadata }>();

  return {
    store: vi.fn().mockImplementation((key: string, value: unknown, metadata: MemoryMetadata) => {
      storage.set(key, { value, metadata });
      return Promise.resolve(ok(undefined));
    }),
    retrieve: vi.fn().mockImplementation((key: string) => {
      const entry = storage.get(key);
      return Promise.resolve(ok(entry?.value ?? null));
    }),
    search: vi.fn().mockImplementation((query: string, limit: number) => {
      const entries: MemoryEntry[] = [];
      storage.forEach((data, key) => {
        const tags = data.metadata.tags ?? [];
        const firstWord = query.split(' ')[0] ?? '';
        if (key.includes(firstWord) || tags.some((t) => query.includes(t))) {
          entries.push({
            key,
            value: data.value,
            metadata: data.metadata,
            createdAt: new Date(),
            accessedAt: new Date(),
          });
        }
      });
      return Promise.resolve(ok(entries.slice(0, limit)));
    }),
    prune: vi.fn().mockReturnValue(Promise.resolve(ok(0))),
  };
}

describe('TypedMemory', () => {
  let backend: IContextMemoryBackend;
  let memory: TypedMemory;

  beforeEach(() => {
    backend = createMockBackend();
    memory = new TypedMemory(backend);
  });

  describe('createTypedMemory', () => {
    it('should create a TypedMemory instance', () => {
      const mem = createTypedMemory(backend);
      expect(mem).toBeInstanceOf(TypedMemory);
    });
  });

  describe('Core Memory', () => {
    const agentData: CoreMemoryData = {
      agentId: 'agent-1',
      role: 'code_expert',
      name: 'Research Agent',
      constraints: ['no external API calls', 'read-only access'],
      capabilities: ['search', 'analyze', 'summarize'],
      temperament: 'cautious',
    };

    it('should store and retrieve agent identity', async () => {
      const setResult = await memory.core.setIdentity(agentData);
      expect(setResult.ok).toBe(true);

      const getResult = await memory.core.getIdentity('agent-1');
      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value?.agentId).toBe('agent-1');
        expect(getResult.value?.role).toBe('code_expert');
      }
    });

    it('should get agent constraints', async () => {
      await memory.core.setIdentity(agentData);
      const result = await memory.core.getConstraints('agent-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('no external API calls');
      }
    });

    it('should update agent constraints', async () => {
      await memory.core.setIdentity(agentData);
      const newConstraints = ['updated constraint'];
      await memory.core.updateConstraints('agent-1', newConstraints);

      const result = await memory.core.getConstraints('agent-1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('updated constraint');
      }
    });
  });

  describe('Episodic Memory', () => {
    const episode: EpisodeData = {
      episodeId: 'ep-1',
      taskId: 'task-1',
      agentId: 'agent-1',
      action: 'search_codebase',
      outcome: 'success',
      context: { query: 'authentication' },
      learnings: ['Found auth module in src/auth'],
      timestamp: new Date(),
      durationMs: 1500,
    };

    it('should record and retrieve episodes', async () => {
      const recordResult = await memory.episodic.recordEpisode(episode);
      expect(recordResult.ok).toBe(true);

      const getResult = await memory.episodic.getEpisodes('agent-1');
      expect(getResult.ok).toBe(true);
    });

    it('should get episodes by task', async () => {
      await memory.episodic.recordEpisode(episode);
      const result = await memory.episodic.getEpisodesByTask('task-1');
      expect(result.ok).toBe(true);
    });

    it('should get recent failures', async () => {
      const failedEpisode: EpisodeData = { ...episode, episodeId: 'ep-2', outcome: 'failure' };
      await memory.episodic.recordEpisode(failedEpisode);
      const result = await memory.episodic.getRecentFailures('agent-1');
      expect(result.ok).toBe(true);
    });

    it('should search episodes', async () => {
      await memory.episodic.recordEpisode(episode);
      const result = await memory.episodic.searchEpisodes('search');
      expect(result.ok).toBe(true);
    });
  });

  describe('Semantic Memory', () => {
    const fact: SemanticFact = {
      factId: 'fact-1',
      domain: 'typescript',
      subject: 'Result type',
      predicate: 'is defined in',
      object: 'src/core/result.ts',
      confidence: 0.95,
      source: 'codebase analysis',
    };

    it('should store and retrieve facts', async () => {
      const storeResult = await memory.semantic.storeFact(fact);
      expect(storeResult.ok).toBe(true);

      const getResult = await memory.semantic.getFact('fact-1');
      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value?.domain).toBe('typescript');
      }
    });

    it('should query by domain', async () => {
      await memory.semantic.storeFact(fact);
      const result = await memory.semantic.queryByDomain('typescript');
      expect(result.ok).toBe(true);
    });

    it('should query by subject', async () => {
      await memory.semantic.storeFact(fact);
      const result = await memory.semantic.queryBySubject('Result type');
      expect(result.ok).toBe(true);
    });

    it('should invalidate facts', async () => {
      await memory.semantic.storeFact(fact);
      const result = await memory.semantic.invalidateFact('fact-1');
      expect(result.ok).toBe(true);
    });
  });

  describe('Procedural Memory', () => {
    const procedure: Procedure = {
      procedureId: 'proc-1',
      name: 'Code Review',
      description: 'Standard code review procedure',
      steps: [
        { stepId: 's1', action: 'read_file', parameters: { path: 'src/**/*.ts' } },
        { stepId: 's2', action: 'analyze_code', preconditions: ['files loaded'] },
        { stepId: 's3', action: 'generate_report', postconditions: ['report created'] },
      ],
      triggerConditions: ['review', 'code quality'],
      successRate: 0.85,
      executionCount: 10,
      tags: ['review', 'quality'],
    };

    it('should store and retrieve procedures', async () => {
      const storeResult = await memory.procedural.storeProcedure(procedure);
      expect(storeResult.ok).toBe(true);

      const getResult = await memory.procedural.getProcedure('proc-1');
      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value?.name).toBe('Code Review');
      }
    });

    it('should find procedures by trigger', async () => {
      await memory.procedural.storeProcedure(procedure);
      const result = await memory.procedural.findProcedures('need to review code');
      expect(result.ok).toBe(true);
    });

    it('should update success rate', async () => {
      await memory.procedural.storeProcedure(procedure);
      const result = await memory.procedural.updateSuccessRate('proc-1', true);
      expect(result.ok).toBe(true);
    });
  });

  describe('Resource Memory', () => {
    const resource: ResourceReference = {
      resourceId: 'res-1',
      type: 'file',
      location: '/home/user/project/src/index.ts',
      name: 'index.ts',
      mimeType: 'text/typescript',
      size: 2048,
      lastAccessed: new Date(),
    };

    it('should store and retrieve resources', async () => {
      const storeResult = await memory.resource.storeResource(resource);
      expect(storeResult.ok).toBe(true);

      const getResult = await memory.resource.getResource('res-1');
      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value?.name).toBe('index.ts');
      }
    });

    it('should find by type', async () => {
      await memory.resource.storeResource(resource);
      const result = await memory.resource.findByType('file');
      expect(result.ok).toBe(true);
    });

    it('should find by location', async () => {
      await memory.resource.storeResource(resource);
      const result = await memory.resource.findByLocation('src');
      expect(result.ok).toBe(true);
    });

    it('should update last accessed', async () => {
      await memory.resource.storeResource(resource);
      const result = await memory.resource.updateLastAccessed('res-1');
      expect(result.ok).toBe(true);
    });
  });

  describe('Knowledge Vault', () => {
    const entry: VaultEntry = {
      vaultId: 'vault-1',
      category: 'insight',
      title: 'Performance optimization insight',
      content: { finding: 'Database queries need indexing', impact: 'high' },
      importance: 'high',
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: ['performance', 'database'],
    };

    it('should store and retrieve vault entries', async () => {
      const storeResult = await memory.vault.store(entry);
      expect(storeResult.ok).toBe(true);

      const getResult = await memory.vault.retrieve('vault-1');
      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value?.title).toBe('Performance optimization insight');
      }
    });

    it('should find by category', async () => {
      await memory.vault.store(entry);
      const result = await memory.vault.findByCategory('insight');
      expect(result.ok).toBe(true);
    });

    it('should find by importance', async () => {
      await memory.vault.store(entry);
      const result = await memory.vault.findByImportance('high');
      expect(result.ok).toBe(true);
    });

    it('should archive entries', async () => {
      await memory.vault.store(entry);
      const result = await memory.vault.archive('vault-1');
      expect(result.ok).toBe(true);
    });

    it('should get expired entries', async () => {
      const expiredEntry: VaultEntry = {
        ...entry,
        vaultId: 'vault-2',
        expiresAt: new Date(Date.now() - 1000),
      };
      await memory.vault.store(expiredEntry);
      const result = await memory.vault.getExpired();
      expect(result.ok).toBe(true);
    });
  });

  describe('Unified Operations', () => {
    it('should query by memory type', async () => {
      const result = await memory.queryByType(MemoryType.CORE, 'agent');
      expect(result.ok).toBe(true);
    });

    it('should filter by relevance to agent role', async () => {
      const result = await memory.filterByRelevance('architecture_expert');
      expect(result.ok).toBe(true);
    });

    it('should get memory statistics', async () => {
      await backend.store('core-normal', null, { importance: 'low' });
      const result = await memory.getStats();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.entriesByType.core).toBe(1);
        expect(typeof result.value.totalEntries).toBe('number');
        expect(result.value.coverage.core).toBe('exact');
        expect(result.value.cap).toBeUndefined();
      }
    });

    it('marks a failed type search as unmeasured', async () => {
      vi.mocked(backend.search).mockImplementation((query) =>
        Promise.resolve(query === MemoryType.CORE ? err(new MemoryError('failed')) : ok([]))
      );

      const result = await memory.getStats();

      expect(result.ok && result.value.coverage.core).toBe('error');
    });

    it('marks counts that reach the 1000-entry cap as truncated', async () => {
      const metadata: MemoryMetadata = { importance: 'low' };
      await Promise.all(
        Array.from({ length: 1001 }, (_, index) =>
          backend.store(`core-${String(index)}`, null, metadata)
        )
      );

      const result = await memory.getStats();

      expect(result.ok && result.value.coverage.core).toBe('truncated');
      expect(result.ok && result.value.cap).toBe(1000);
    });

    it('should prune expired entries', async () => {
      const result = await memory.pruneExpired();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.prunedCount).toBe('number');
      }
    });
  });
});
