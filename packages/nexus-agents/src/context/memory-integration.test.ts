/**
 * Integration Tests for Memory System
 *
 * Tests cross-backend interactions and real-world usage scenarios
 * for the memory system components.
 *
 * @module context/memory-integration.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  ISQLiteDatabase,
  ISQLiteStatement,
  MemoryRow,
  MemoryMetadata,
} from './memory-backend-types.js';
import { TypedMemory } from './typed-memory.js';
import { MemoryType } from './memory-types.js';
import type { IMemoryBackend, MemoryEntry } from './memory-backend-types.js';
import { ok, err } from '../core/result.js';
import type { Result } from '../core/result.js';
import { MemoryError } from './memory-backend-types.js';

// =============================================================================
// Shared Mock Database Infrastructure
// =============================================================================

interface MockMemoryStore {
  memories: Map<string, MemoryRow>;
  edges: Map<string, { from: string; to: string; type: string; weight: number }>;
}

function _createMemoryRow(key: string, value: unknown, metadata: MemoryMetadata): MemoryRow {
  const now = Date.now();
  return {
    key,
    value: JSON.stringify(value),
    metadata: JSON.stringify(metadata),
    created_at: now,
    accessed_at: now,
    expires_at: metadata.ttl !== undefined && metadata.ttl !== 0 ? now + metadata.ttl : null,
  };
}
void _createMemoryRow; // Prepared for future use

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Infrastructure for future SQLite tests
function _createSharedMockDatabase(): ISQLiteDatabase & { store: MockMemoryStore } {
  const store: MockMemoryStore = {
    memories: new Map(),
    edges: new Map(),
  };

  return {
    store,
    exec: vi.fn(),
    prepare: <T = unknown>(sql: string): ISQLiteStatement<T> => ({
      // eslint-disable-next-line complexity -- Mock implementation requires branching logic
      run: (...params: unknown[]): { changes: number } => {
        // INSERT memories
        if (sql.includes('INSERT') && sql.includes('memories') && !sql.includes('graph')) {
          const [key, value, metadata, created_at, accessed_at, expires_at] = params as [
            string,
            string,
            string,
            number,
            number,
            number | null,
          ];
          store.memories.set(key, { key, value, metadata, created_at, accessed_at, expires_at });
          return { changes: 1 };
        }

        // UPDATE accessed_at
        if (sql.includes('UPDATE') && sql.includes('accessed_at')) {
          const [accessed_at, key] = params as [number, string];
          const row = store.memories.get(key);
          if (row) {
            store.memories.set(key, { ...row, accessed_at });
            return { changes: 1 };
          }
          return { changes: 0 };
        }

        // DELETE memories
        if (sql.includes('DELETE') && sql.includes('memories')) {
          const [key] = params as [string];
          const had = store.memories.has(key);
          store.memories.delete(key);
          return { changes: had ? 1 : 0 };
        }

        // INSERT edges
        if (sql.includes('INSERT') && sql.includes('graph_edges')) {
          const [from, to, type, weight] = params as [string, string, string, number];
          store.edges.set(`${from}:${to}:${type}`, { from, to, type, weight });
          return { changes: 1 };
        }

        return { changes: 0 };
      },
      get: (...params: unknown[]): T | undefined => {
        // COUNT
        if (sql.includes('COUNT') && sql.includes('memories')) {
          const [key] = params as [string];
          if (key) {
            return { count: store.memories.has(key) ? 1 : 0 } as T;
          }
          return { count: store.memories.size } as T;
        }

        // SELECT single memory
        if (sql.includes('SELECT') && sql.includes('key = ?')) {
          const [key] = params as [string];
          return store.memories.get(key) as T;
        }

        return undefined;
      },
      // eslint-disable-next-line complexity -- Mock implementation requires branching logic
      all: (...params: unknown[]): T[] => {
        // Search with FTS
        if (sql.includes('memories_fts') || sql.includes('MATCH')) {
          const [query, limit] = params as [string, number];
          const results: MemoryRow[] = [];
          const queryLower = query.toLowerCase();

          for (const row of store.memories.values()) {
            const valueLower = row.value.toLowerCase();
            const metaLower = row.metadata.toLowerCase();
            if (valueLower.includes(queryLower) || metaLower.includes(queryLower)) {
              results.push(row);
            }
          }
          return results.slice(0, limit) as T[];
        }

        // SELECT all with ORDER BY
        if (sql.includes('ORDER BY')) {
          const [limit] = params as [number];
          return Array.from(store.memories.values())
            .sort((a, b) => b.accessed_at - a.accessed_at)
            .slice(0, limit) as T[];
        }

        // Get edges for key
        if (sql.includes('graph_edges') && sql.includes('from_key')) {
          const [key] = params as [string];
          return Array.from(store.edges.values()).filter((e) => e.from === key) as T[];
        }

        if (sql.includes('graph_edges') && sql.includes('to_key')) {
          const [key] = params as [string];
          return Array.from(store.edges.values()).filter((e) => e.to === key) as T[];
        }

        return [];
      },
    }),
    close: vi.fn(),
  };
}

// =============================================================================
// Mock Memory Backend for Testing
// =============================================================================

function createMockMemoryBackend(): IMemoryBackend & {
  _storage: Map<string, { value: unknown; metadata: MemoryMetadata }>;
} {
  const storage = new Map<string, { value: unknown; metadata: MemoryMetadata }>();

  return {
    _storage: storage,

    store: vi
      .fn()
      .mockImplementation(
        (
          key: string,
          value: unknown,
          metadata: MemoryMetadata
        ): Promise<Result<void, MemoryError>> => {
          storage.set(key, { value, metadata });
          return Promise.resolve(ok(undefined));
        }
      ),

    retrieve: vi.fn().mockImplementation((key: string): Promise<Result<unknown, MemoryError>> => {
      const entry = storage.get(key);
      return Promise.resolve(ok(entry?.value ?? null));
    }),

    search: vi
      .fn()
      .mockImplementation(
        (query: string, limit: number): Promise<Result<MemoryEntry[], MemoryError>> => {
          const results: MemoryEntry[] = [];
          const queryLower = query.toLowerCase();

          for (const [key, entry] of storage.entries()) {
            const valueStr = JSON.stringify(entry.value).toLowerCase();
            const tags = entry.metadata.tags ?? [];
            const hasMatch =
              key.toLowerCase().includes(queryLower) ||
              valueStr.includes(queryLower) ||
              tags.some((t) => t.toLowerCase().includes(queryLower));

            if (hasMatch) {
              results.push({
                key,
                value: entry.value,
                metadata: entry.metadata,
                createdAt: new Date(),
                accessedAt: new Date(),
              });
            }
          }

          return Promise.resolve(ok(results.slice(0, limit)));
        }
      ),

    prune: vi.fn().mockImplementation((_olderThan: Date): Promise<Result<number, MemoryError>> => {
      return Promise.resolve(ok(0));
    }),
  };
}

// =============================================================================
// Integration Tests: TypedMemory with Backend
// =============================================================================

describe('TypedMemory Integration', () => {
  let backend: ReturnType<typeof createMockMemoryBackend>;
  let typedMemory: TypedMemory;

  beforeEach(() => {
    backend = createMockMemoryBackend();
    typedMemory = new TypedMemory(backend);
  });

  describe('Cross-Memory-Type Operations', () => {
    it('should store and retrieve data across different memory types', async () => {
      // Store core memory
      const coreResult = await typedMemory.core.setIdentity({
        agentId: 'agent-001',
        role: 'code_expert',
        name: 'Code Reviewer',
        constraints: ['no external APIs'],
        capabilities: ['code analysis'],
        temperament: 'balanced',
      });
      expect(coreResult.ok).toBe(true);

      // Store episodic memory
      const episodeResult = await typedMemory.episodic.recordEpisode({
        episodeId: 'ep-001',
        taskId: 'task-001',
        agentId: 'agent-001',
        action: 'code_review',
        outcome: 'success',
        context: { files: ['src/main.ts'] },
        learnings: ['Type-safety improves code quality'],
        timestamp: new Date(),
        durationMs: 5000,
      });
      expect(episodeResult.ok).toBe(true);

      // Store semantic fact
      const factResult = await typedMemory.semantic.storeFact({
        factId: 'fact-001',
        domain: 'typescript',
        subject: 'Result type',
        predicate: 'enables',
        object: 'error handling',
        confidence: 0.95,
        source: 'code analysis',
      });
      expect(factResult.ok).toBe(true);

      // Verify storage occurred
      expect(backend.store).toHaveBeenCalledTimes(3);
    });

    it('should query by memory type', async () => {
      // Store some data first
      await typedMemory.core.setIdentity({
        agentId: 'agent-001',
        role: 'code_expert',
        name: 'Test Agent',
        constraints: [],
        capabilities: [],
        temperament: 'balanced',
      });

      const result = await typedMemory.queryByType(MemoryType.CORE, 'agent', 10);

      expect(result.ok).toBe(true);
      expect(backend.search).toHaveBeenCalled();
    });

    it('should filter by agent role relevance', async () => {
      // Store various memories
      await typedMemory.vault.store({
        vaultId: 'vault-001',
        category: 'insight',
        title: 'Performance Tip',
        content: { tip: 'Use memoization' },
        importance: 'high',
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: ['performance'],
      });

      const result = await typedMemory.filterByRelevance('architecture_expert', 20);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should return entries based on role configuration
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it('should get aggregated statistics', async () => {
      const statsResult = await typedMemory.getStats();

      expect(statsResult.ok).toBe(true);
      if (statsResult.ok) {
        expect(statsResult.value).toHaveProperty('totalEntries');
        expect(statsResult.value).toHaveProperty('entriesByType');
        expect(statsResult.value.entriesByType).toHaveProperty('core');
        expect(statsResult.value.entriesByType).toHaveProperty('episodic');
        expect(statsResult.value.entriesByType).toHaveProperty('semantic');
        expect(statsResult.value.entriesByType).toHaveProperty('procedural');
        expect(statsResult.value.entriesByType).toHaveProperty('resource');
        expect(statsResult.value.entriesByType).toHaveProperty('vault');
      }
    });

    it('should prune expired entries across types', async () => {
      const pruneResult = await typedMemory.pruneExpired();

      expect(pruneResult.ok).toBe(true);
      if (pruneResult.ok) {
        expect(pruneResult.value).toHaveProperty('prunedCount');
        expect(pruneResult.value).toHaveProperty('prunedByType');
      }
    });
  });

  describe('Procedural Memory Workflow', () => {
    it('should store and retrieve procedures', async () => {
      const procedure = {
        procedureId: 'proc-001',
        name: 'Code Review Workflow',
        description: 'Standard review process',
        steps: [
          { stepId: 's1', action: 'read_file', parameters: { pattern: '*.ts' } },
          { stepId: 's2', action: 'analyze', preconditions: ['files_loaded'] },
          { stepId: 's3', action: 'report', postconditions: ['report_generated'] },
        ],
        triggerConditions: ['review', 'code quality'],
        successRate: 0.9,
        executionCount: 15,
        tags: ['review', 'typescript'],
      };

      const storeResult = await typedMemory.procedural.storeProcedure(procedure);
      expect(storeResult.ok).toBe(true);

      const retrieveResult = await typedMemory.procedural.getProcedure('proc-001');
      expect(retrieveResult.ok).toBe(true);
    });

    it('should track procedure success rates', async () => {
      const procedure = {
        procedureId: 'proc-track',
        name: 'Tracked Procedure',
        description: 'For testing success tracking',
        steps: [],
        triggerConditions: ['test'],
        successRate: 0.5,
        executionCount: 2,
        tags: [],
      };

      await typedMemory.procedural.storeProcedure(procedure);
      const updateResult = await typedMemory.procedural.updateSuccessRate('proc-track', true);

      expect(updateResult.ok).toBe(true);
    });
  });

  describe('Resource Memory Tracking', () => {
    it('should store and retrieve resource references', async () => {
      const resource = {
        resourceId: 'res-001',
        type: 'file' as const,
        location: '/src/components/Button.tsx',
        name: 'Button.tsx',
        mimeType: 'text/typescript',
        size: 2048,
        lastAccessed: new Date(),
      };

      const storeResult = await typedMemory.resource.storeResource(resource);
      expect(storeResult.ok).toBe(true);

      const findResult = await typedMemory.resource.findByType('file');
      expect(findResult.ok).toBe(true);
    });

    it('should update resource access timestamps', async () => {
      const resource = {
        resourceId: 'res-access',
        type: 'file' as const,
        location: '/src/index.ts',
        name: 'index.ts',
        lastAccessed: new Date(Date.now() - 10000),
      };

      await typedMemory.resource.storeResource(resource);
      const updateResult = await typedMemory.resource.updateLastAccessed('res-access');

      expect(updateResult.ok).toBe(true);
    });
  });
});

// =============================================================================
// Integration Tests: Backend Error Propagation
// =============================================================================

describe('Backend Error Propagation', () => {
  it('should propagate storage errors through TypedMemory', async () => {
    const failingBackend: IMemoryBackend = {
      store: vi.fn().mockResolvedValue(err(new MemoryError('Storage failed'))),
      retrieve: vi.fn().mockResolvedValue(ok(null)),
      search: vi.fn().mockResolvedValue(ok([])),
      prune: vi.fn().mockResolvedValue(ok(0)),
    };

    const typedMemory = new TypedMemory(failingBackend);

    const result = await typedMemory.core.setIdentity({
      agentId: 'agent-001',
      role: 'code_expert',
      name: 'Test',
      constraints: [],
      capabilities: [],
      temperament: 'balanced',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(MemoryError);
    }
  });

  it('should propagate search errors', async () => {
    const failingBackend: IMemoryBackend = {
      store: vi.fn().mockResolvedValue(ok(undefined)),
      retrieve: vi.fn().mockResolvedValue(ok(null)),
      search: vi.fn().mockResolvedValue(err(new MemoryError('Search failed'))),
      prune: vi.fn().mockResolvedValue(ok(0)),
    };

    const typedMemory = new TypedMemory(failingBackend);

    const result = await typedMemory.queryByType(MemoryType.CORE, 'test', 10);

    expect(result.ok).toBe(false);
  });

  it('should propagate prune errors', async () => {
    const failingBackend: IMemoryBackend = {
      store: vi.fn().mockResolvedValue(ok(undefined)),
      retrieve: vi.fn().mockResolvedValue(ok(null)),
      search: vi.fn().mockResolvedValue(ok([])),
      prune: vi.fn().mockResolvedValue(err(new MemoryError('Prune failed'))),
    };

    const typedMemory = new TypedMemory(failingBackend);

    const result = await typedMemory.pruneExpired();

    expect(result.ok).toBe(false);
  });
});

// =============================================================================
// Integration Tests: Concurrent Operations
// =============================================================================

describe('Concurrent Memory Operations', () => {
  let backend: ReturnType<typeof createMockMemoryBackend>;
  let typedMemory: TypedMemory;

  beforeEach(() => {
    backend = createMockMemoryBackend();
    typedMemory = new TypedMemory(backend);
  });

  it('should handle concurrent stores to different memory types', async () => {
    const operations = [
      typedMemory.core.setIdentity({
        agentId: 'agent-1',
        role: 'code_expert',
        name: 'Agent 1',
        constraints: [],
        capabilities: [],
        temperament: 'balanced',
      }),
      typedMemory.episodic.recordEpisode({
        episodeId: 'ep-1',
        taskId: 'task-1',
        agentId: 'agent-1',
        action: 'action-1',
        outcome: 'success',
        context: {},
        learnings: [],
        timestamp: new Date(),
        durationMs: 100,
      }),
      typedMemory.semantic.storeFact({
        factId: 'fact-1',
        domain: 'test',
        subject: 'A',
        predicate: 'relates',
        object: 'B',
        confidence: 0.8,
        source: 'test',
      }),
      typedMemory.vault.store({
        vaultId: 'vault-1',
        category: 'insight',
        title: 'Test Insight',
        content: {},
        importance: 'high',
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      }),
    ];

    const results = await Promise.all(operations);

    // All should succeed
    results.forEach((result) => {
      expect(result.ok).toBe(true);
    });

    // All entries should be stored
    expect(backend._storage.size).toBe(4);
  });

  it('should handle rapid sequential operations', async () => {
    const iterations = 50;
    const results: boolean[] = [];

    for (let i = 0; i < iterations; i++) {
      const result = await typedMemory.semantic.storeFact({
        factId: `fact-${String(i)}`,
        domain: 'test',
        subject: `Subject ${String(i)}`,
        predicate: 'test',
        object: `Object ${String(i)}`,
        confidence: 0.9,
        source: 'test',
      });
      results.push(result.ok);
    }

    // All operations should succeed
    expect(results.every((r) => r)).toBe(true);
    expect(backend._storage.size).toBe(iterations);
  });

  it('should maintain consistency with interleaved reads and writes', async () => {
    // Store initial data
    await typedMemory.core.setIdentity({
      agentId: 'agent-interleave',
      role: 'code_expert',
      name: 'Initial Name',
      constraints: ['initial'],
      capabilities: [],
      temperament: 'balanced',
    });

    // Interleave reads and writes
    const operations = [];
    for (let i = 0; i < 10; i++) {
      operations.push(typedMemory.core.getIdentity('agent-interleave'));
      operations.push(
        typedMemory.core.updateConstraints('agent-interleave', [`constraint-${String(i)}`])
      );
    }

    const results = await Promise.all(operations);

    // No errors should occur
    expect(results.every((r) => r.ok)).toBe(true);
  });
});

// =============================================================================
// Integration Tests: Memory Type Interactions
// =============================================================================

describe('Memory Type Interactions', () => {
  let backend: ReturnType<typeof createMockMemoryBackend>;
  let typedMemory: TypedMemory;

  beforeEach(() => {
    backend = createMockMemoryBackend();
    typedMemory = new TypedMemory(backend);
  });

  it('should correlate episodic memories with agent identity', async () => {
    const agentId = 'agent-corr';

    // Store agent identity
    await typedMemory.core.setIdentity({
      agentId,
      role: 'code_expert',
      name: 'Correlation Test Agent',
      constraints: [],
      capabilities: ['analysis'],
      temperament: 'exploratory',
    });

    // Record multiple episodes for the same agent
    for (let i = 0; i < 5; i++) {
      await typedMemory.episodic.recordEpisode({
        episodeId: `ep-corr-${String(i)}`,
        taskId: `task-${String(i)}`,
        agentId,
        action: i % 2 === 0 ? 'success_action' : 'learning_action',
        outcome: i % 3 === 0 ? 'failure' : 'success',
        context: { iteration: i },
        learnings: [`Learning ${String(i)}`],
        timestamp: new Date(),
        durationMs: 100 * i,
      });
    }

    // Retrieve episodes for the agent
    const episodesResult = await typedMemory.episodic.getEpisodes(agentId);
    expect(episodesResult.ok).toBe(true);

    // Verify we stored the data
    expect(backend.store).toHaveBeenCalled();
  });

  it('should link semantic facts to procedures', async () => {
    // Store a fact about TypeScript
    await typedMemory.semantic.storeFact({
      factId: 'ts-fact-1',
      domain: 'typescript',
      subject: 'interfaces',
      predicate: 'enable',
      object: 'type safety',
      confidence: 0.95,
      source: 'documentation',
    });

    // Store a procedure that uses TypeScript knowledge
    await typedMemory.procedural.storeProcedure({
      procedureId: 'ts-proc-1',
      name: 'TypeScript Review',
      description: 'Review TypeScript code for type safety',
      steps: [
        { stepId: 's1', action: 'check_interfaces', parameters: {} },
        { stepId: 's2', action: 'validate_types', preconditions: ['interfaces_found'] },
      ],
      triggerConditions: ['typescript', 'type safety', 'interfaces'],
      successRate: 0.88,
      executionCount: 25,
      tags: ['typescript', 'review'],
    });

    // Find procedures by trigger
    const proceduresResult = await typedMemory.procedural.findProcedures('typescript interfaces');
    expect(proceduresResult.ok).toBe(true);
  });

  it('should track resources used in episodes', async () => {
    // Store a resource
    const resourceId = 'res-used';
    await typedMemory.resource.storeResource({
      resourceId,
      type: 'file',
      location: '/src/utils/helpers.ts',
      name: 'helpers.ts',
      mimeType: 'text/typescript',
      size: 1024,
      lastAccessed: new Date(),
    });

    // Record an episode that uses the resource
    await typedMemory.episodic.recordEpisode({
      episodeId: 'ep-with-resource',
      taskId: 'task-resource',
      agentId: 'agent-res',
      action: 'analyze_file',
      outcome: 'success',
      context: { resourceId, filePath: '/src/utils/helpers.ts' },
      learnings: ['Helper functions are well-organized'],
      timestamp: new Date(),
      durationMs: 2000,
    });

    // Update resource access time
    const updateResult = await typedMemory.resource.updateLastAccessed(resourceId);
    expect(updateResult.ok).toBe(true);
  });

  it('should store vault entries based on episode learnings', async () => {
    // Record an episode with significant learnings
    await typedMemory.episodic.recordEpisode({
      episodeId: 'ep-insight',
      taskId: 'task-insight',
      agentId: 'agent-insight',
      action: 'deep_analysis',
      outcome: 'success',
      context: { projectType: 'monorepo' },
      learnings: [
        'Monorepo structure improves code sharing',
        'Shared configurations reduce duplication',
      ],
      timestamp: new Date(),
      durationMs: 5000,
    });

    // Store the insights in vault
    await typedMemory.vault.store({
      vaultId: 'vault-monorepo',
      category: 'insight',
      title: 'Monorepo Benefits',
      content: {
        findings: [
          'Improves code sharing',
          'Reduces configuration duplication',
          'Enables atomic changes across packages',
        ],
        sourceEpisode: 'ep-insight',
      },
      importance: 'high',
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: ['monorepo', 'architecture', 'best-practices'],
    });

    // Verify both stores succeeded
    expect(backend.store).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// Integration Tests: Memory Lifecycle
// =============================================================================

describe('Memory Lifecycle', () => {
  let backend: ReturnType<typeof createMockMemoryBackend>;
  let typedMemory: TypedMemory;

  beforeEach(() => {
    backend = createMockMemoryBackend();
    typedMemory = new TypedMemory(backend);
  });

  it('should support full CRUD lifecycle', async () => {
    const factId = 'lifecycle-fact';

    // Create
    const createResult = await typedMemory.semantic.storeFact({
      factId,
      domain: 'test',
      subject: 'A',
      predicate: 'equals',
      object: 'B',
      confidence: 0.9,
      source: 'test',
    });
    expect(createResult.ok).toBe(true);

    // Read
    const readResult = await typedMemory.semantic.getFact(factId);
    expect(readResult.ok).toBe(true);

    // Update (invalidate)
    const updateResult = await typedMemory.semantic.invalidateFact(factId);
    expect(updateResult.ok).toBe(true);

    // Query
    const queryResult = await typedMemory.semantic.queryByDomain('test');
    expect(queryResult.ok).toBe(true);
  });

  it('should handle vault entry archival', async () => {
    const vaultId = 'archive-test';

    // Create entry
    await typedMemory.vault.store({
      vaultId,
      category: 'insight',
      title: 'Archive Test',
      content: { test: true },
      importance: 'normal',
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: ['archive'],
    });

    // Archive
    const archiveResult = await typedMemory.vault.archive(vaultId);
    expect(archiveResult.ok).toBe(true);

    // Should still be retrievable
    const retrieveResult = await typedMemory.vault.retrieve(vaultId);
    expect(retrieveResult.ok).toBe(true);
  });

  it('should track expired vault entries', async () => {
    const vaultId = 'expiring-entry';

    // Create entry with expiration
    await typedMemory.vault.store({
      vaultId,
      category: 'archive',
      title: 'Expiring Entry',
      content: { temporary: true },
      importance: 'normal',
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() - 1000), // Already expired
      tags: ['temporary'],
    });

    // Get expired entries
    const expiredResult = await typedMemory.vault.getExpired();
    expect(expiredResult.ok).toBe(true);
  });
});
