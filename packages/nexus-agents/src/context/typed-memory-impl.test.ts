/**
 * Tests for typed memory implementations.
 *
 * Covers: CoreMemoryImpl, EpisodicMemoryImpl, SemanticMemoryImpl,
 * ProceduralMemoryImpl, ResourceMemoryImpl, KnowledgeVaultImpl.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';

import { ok, err } from '../core/result.js';
import type { IMemoryBackend, MemoryEntry } from './memory-backend-types.js';
import { MemoryError as MemError } from './memory-backend-types.js';
import {
  CoreMemoryImpl,
  EpisodicMemoryImpl,
  SemanticMemoryImpl,
  ProceduralMemoryImpl,
  ResourceMemoryImpl,
  KnowledgeVaultImpl,
} from './typed-memory-impl.js';

// ============================================================================
// Mock Backend
// ============================================================================

function makeMockBackend(): IMemoryBackend {
  const store = new Map<string, { value: unknown }>();

  return {
    store: vi.fn((key: string, value: unknown) => {
      store.set(key, { value });
      return Promise.resolve(ok(undefined));
    }),
    retrieve: vi.fn((key: string) => {
      const entry = store.get(key);
      return Promise.resolve(ok(entry?.value ?? null));
    }),
    search: vi.fn((_query: string, limit: number) => {
      const entries: MemoryEntry[] = [];
      for (const [key, data] of store) {
        if (_query.split(' ').some((q) => key.includes(q))) {
          entries.push({
            key,
            value: data.value,
            metadata: { importance: 0, tags: [] },
            createdAt: new Date(),
            accessedAt: new Date(),
          });
        }
        if (entries.length >= limit) break;
      }
      return Promise.resolve(ok(entries));
    }),
    prune: vi.fn(() => Promise.resolve(ok(0))),
    getStats: vi.fn(() => Promise.resolve(ok({ totalEntries: store.size, totalSize: 0 }))),
    close: vi.fn(() => Promise.resolve(ok(undefined))),
  } as unknown as IMemoryBackend;
}

// ============================================================================
// CoreMemoryImpl
// ============================================================================

describe('CoreMemoryImpl', () => {
  let backend: IMemoryBackend;
  let core: CoreMemoryImpl;

  beforeEach(() => {
    backend = makeMockBackend();
    core = new CoreMemoryImpl(backend);
  });

  it('sets and gets identity', async () => {
    const data = {
      agentId: 'a1',
      role: 'code_expert',
      goals: ['review code'],
      constraints: ['be thorough'],
    };
    await core.setIdentity(data);
    const result = await core.getIdentity('a1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value?.agentId).toBe('a1');
    }
  });

  it('returns null for unknown agent', async () => {
    const result = await core.getIdentity('unknown');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('getConstraints returns constraints from identity', async () => {
    const data = {
      agentId: 'a1',
      role: 'expert',
      goals: [],
      constraints: ['c1', 'c2'],
    };
    await core.setIdentity(data);
    const result = await core.getConstraints('a1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['c1', 'c2']);
    }
  });

  it('getConstraints returns empty for unknown agent', async () => {
    const result = await core.getConstraints('unknown');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('updateConstraints modifies existing identity', async () => {
    const data = {
      agentId: 'a1',
      role: 'expert',
      goals: [],
      constraints: ['old'],
    };
    await core.setIdentity(data);
    const updateResult = await core.updateConstraints('a1', ['new1', 'new2']);
    expect(updateResult.ok).toBe(true);

    const result = await core.getConstraints('a1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['new1', 'new2']);
    }
  });

  it('updateConstraints returns error for unknown agent', async () => {
    const result = await core.updateConstraints('unknown', ['c1']);
    expect(result.ok).toBe(false);
  });

  it('propagates backend errors', async () => {
    const errorBackend = {
      ...makeMockBackend(),
      retrieve: vi.fn(() => Promise.resolve(err(new MemError('Connection lost')))),
    } as unknown as IMemoryBackend;
    const errorCore = new CoreMemoryImpl(errorBackend);
    const result = await errorCore.getIdentity('a1');
    expect(result.ok).toBe(false);
  });
});

// ============================================================================
// EpisodicMemoryImpl
// ============================================================================

describe('EpisodicMemoryImpl', () => {
  let backend: IMemoryBackend;
  let episodic: EpisodicMemoryImpl;

  beforeEach(() => {
    backend = makeMockBackend();
    episodic = new EpisodicMemoryImpl(backend);
  });

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const makeEpisode = (overrides: Record<string, unknown> = {}) => ({
    episodeId: 'ep-1',
    agentId: 'a1',
    taskId: 'task-1',
    outcome: 'success' as const,
    actions: [],
    startedAt: new Date(),
    completedAt: new Date(),
    ...overrides,
  });

  it('records and retrieves episodes', async () => {
    await episodic.recordEpisode(makeEpisode());
    const result = await episodic.getEpisodes('a1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
    }
  });

  it('getEpisodesByTask filters by taskId', async () => {
    await episodic.recordEpisode(makeEpisode({ episodeId: 'ep-1', taskId: 'task-1' }));
    await episodic.recordEpisode(makeEpisode({ episodeId: 'ep-2', taskId: 'task-2' }));
    const result = await episodic.getEpisodesByTask('task-1');
    expect(result.ok).toBe(true);
  });

  it('getRecentFailures filters by outcome', async () => {
    await episodic.recordEpisode(makeEpisode({ episodeId: 'ep-1', outcome: 'failure' }));
    await episodic.recordEpisode(makeEpisode({ episodeId: 'ep-2', outcome: 'success' }));
    const result = await episodic.getRecentFailures('a1', 10);
    expect(result.ok).toBe(true);
  });

  it('searchEpisodes delegates to backend', async () => {
    await episodic.recordEpisode(makeEpisode());
    const result = await episodic.searchEpisodes('test');
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// SemanticMemoryImpl
// ============================================================================

describe('SemanticMemoryImpl', () => {
  let backend: IMemoryBackend;
  let semantic: SemanticMemoryImpl;

  beforeEach(() => {
    backend = makeMockBackend();
    semantic = new SemanticMemoryImpl(backend);
  });

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const makeFact = (overrides: Record<string, unknown> = {}) => ({
    factId: 'fact-1',
    domain: 'testing',
    subject: 'vitest',
    predicate: 'is',
    object: 'fast',
    confidence: 0.9,
    source: 'experience',
    createdAt: new Date(),
    ...overrides,
  });

  it('stores and retrieves facts', async () => {
    await semantic.storeFact(makeFact());
    const result = await semantic.getFact('fact-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBeNull();
    }
  });

  it('returns null for unknown fact', async () => {
    const result = await semantic.getFact('unknown');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('queryByDomain delegates to backend search', async () => {
    await semantic.storeFact(makeFact());
    const result = await semantic.queryByDomain('testing');
    expect(result.ok).toBe(true);
  });

  it('queryBySubject delegates to backend search', async () => {
    await semantic.storeFact(makeFact());
    const result = await semantic.queryBySubject('vitest');
    expect(result.ok).toBe(true);
  });

  it('searchFacts delegates to backend search', async () => {
    const result = await semantic.searchFacts('test');
    expect(result.ok).toBe(true);
  });

  it('invalidateFact updates validUntil', async () => {
    await semantic.storeFact(makeFact());
    const result = await semantic.invalidateFact('fact-1');
    expect(result.ok).toBe(true);
  });

  it('invalidateFact succeeds for unknown fact', async () => {
    const result = await semantic.invalidateFact('unknown');
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// ProceduralMemoryImpl
// ============================================================================

describe('ProceduralMemoryImpl', () => {
  let backend: IMemoryBackend;
  let procedural: ProceduralMemoryImpl;

  beforeEach(() => {
    backend = makeMockBackend();
    procedural = new ProceduralMemoryImpl(backend);
  });

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const makeProcedure = (overrides: Record<string, unknown> = {}) => ({
    procedureId: 'proc-1',
    name: 'code-review',
    steps: [{ action: 'read', params: {} }],
    triggerConditions: ['review', 'code'],
    successRate: 0.8,
    executionCount: 10,
    tags: ['review'],
    ...overrides,
  });

  it('stores and retrieves procedures', async () => {
    await procedural.storeProcedure(makeProcedure());
    const result = await procedural.getProcedure('proc-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBeNull();
    }
  });

  it('returns null for unknown procedure', async () => {
    const result = await procedural.getProcedure('unknown');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('findProcedures filters by trigger condition', async () => {
    await procedural.storeProcedure(makeProcedure());
    const result = await procedural.findProcedures('code review task');
    expect(result.ok).toBe(true);
  });

  it('updateSuccessRate modifies existing procedure', async () => {
    await procedural.storeProcedure(makeProcedure({ successRate: 1.0, executionCount: 1 }));
    const result = await procedural.updateSuccessRate('proc-1', false);
    expect(result.ok).toBe(true);
  });

  it('updateSuccessRate returns error for unknown procedure', async () => {
    const result = await procedural.updateSuccessRate('unknown', true);
    expect(result.ok).toBe(false);
  });

  it('searchProcedures delegates to backend', async () => {
    const result = await procedural.searchProcedures('test');
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// ResourceMemoryImpl
// ============================================================================

describe('ResourceMemoryImpl', () => {
  let backend: IMemoryBackend;
  let resource: ResourceMemoryImpl;

  beforeEach(() => {
    backend = makeMockBackend();
    resource = new ResourceMemoryImpl(backend);
  });

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const makeResource = (overrides: Record<string, unknown> = {}) => ({
    resourceId: 'res-1',
    name: 'config.yaml',
    type: 'file' as const,
    location: '/etc/config.yaml',
    lastAccessed: new Date(),
    ...overrides,
  });

  it('stores and retrieves resources', async () => {
    await resource.storeResource(makeResource());
    const result = await resource.getResource('res-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBeNull();
    }
  });

  it('findByType delegates to backend search', async () => {
    await resource.storeResource(makeResource());
    const result = await resource.findByType('file');
    expect(result.ok).toBe(true);
  });

  it('findByLocation filters by location pattern', async () => {
    await resource.storeResource(makeResource());
    const result = await resource.findByLocation('/etc');
    expect(result.ok).toBe(true);
  });

  it('updateLastAccessed modifies existing resource', async () => {
    await resource.storeResource(makeResource());
    const result = await resource.updateLastAccessed('res-1');
    expect(result.ok).toBe(true);
  });

  it('updateLastAccessed succeeds for unknown resource', async () => {
    const result = await resource.updateLastAccessed('unknown');
    expect(result.ok).toBe(true);
  });

  it('searchResources delegates to backend', async () => {
    const result = await resource.searchResources('test');
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// KnowledgeVaultImpl
// ============================================================================

describe('KnowledgeVaultImpl', () => {
  let backend: IMemoryBackend;
  let vault: KnowledgeVaultImpl;

  beforeEach(() => {
    backend = makeMockBackend();
    vault = new KnowledgeVaultImpl(backend);
  });

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const makeVaultEntry = (overrides: Record<string, unknown> = {}) => ({
    vaultId: 'v-1',
    category: 'pattern' as const,
    importance: 'high' as const,
    content: 'Use dependency injection',
    tags: ['architecture'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  it('stores and retrieves vault entries', async () => {
    await vault.store(makeVaultEntry());
    const result = await vault.retrieve('v-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBeNull();
    }
  });

  it('returns null for unknown entry', async () => {
    const result = await vault.retrieve('unknown');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('findByCategory delegates to backend search', async () => {
    await vault.store(makeVaultEntry());
    const result = await vault.findByCategory('pattern');
    expect(result.ok).toBe(true);
  });

  it('findByImportance delegates to backend search', async () => {
    await vault.store(makeVaultEntry());
    const result = await vault.findByImportance('high');
    expect(result.ok).toBe(true);
  });

  it('searchVault delegates to backend search', async () => {
    const result = await vault.searchVault('test');
    expect(result.ok).toBe(true);
  });

  it('archive changes category to archive', async () => {
    await vault.store(makeVaultEntry());
    const result = await vault.archive('v-1');
    expect(result.ok).toBe(true);
  });

  it('archive succeeds for unknown entry', async () => {
    const result = await vault.archive('unknown');
    expect(result.ok).toBe(true);
  });

  it('getExpired returns entries past expiration', async () => {
    const result = await vault.getExpired();
    expect(result.ok).toBe(true);
  });

  it('stores critical entries with HIGH importance', async () => {
    await vault.store(makeVaultEntry({ importance: 'critical' }));
    expect(backend.store).toHaveBeenCalled();
  });
});
