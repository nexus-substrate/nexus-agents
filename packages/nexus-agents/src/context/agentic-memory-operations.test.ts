/**
 * Tests for Agentic Memory Database Operations
 *
 * Tests pure database operation helpers for AgenticMemoryBackend.
 *
 * @module context/agentic-memory-operations.test
 * (Source: Issue #122, arXiv:2502.12110)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  queryMemoriesForAnalysis,
  queryMemoryByKey,
  queryCandidateMemories,
  queryMemoriesForEvolution,
  queryAllMemoriesExcept,
  updateMemoryMetadata,
  applyLinkSuggestions,
  prepareRefreshedMetadata,
  buildAgenticEntry,
} from './agentic-memory-operations.js';
import type { ISQLiteDatabase, ISQLiteStatement, MemoryRow } from './memory-backend-types.js';
import { MemoryImportance } from './memory-backend-types.js';
import type { MemoryAttributes, LinkSuggestion } from './agentic-memory-types.js';
import { DEFAULT_EXTRACTION_CONFIG } from './agentic-memory-types.js';
import { GraphMemoryBackend } from './graph-memory.js';
import { ok, err } from '../core/result.js';
import { MemoryError } from './memory-backend-types.js';

// =============================================================================
// Mock Database
// =============================================================================

interface MockStore {
  memories: Map<string, MemoryRow>;
  updateCalls: Array<{ metadata: string; key: string }>;
}

function createMockDatabase(): ISQLiteDatabase & { store: MockStore } {
  const store: MockStore = { memories: new Map(), updateCalls: [] };
  return {
    store,
    exec: vi.fn(),
    prepare: <T = unknown>(sql: string): ISQLiteStatement<T> => ({
      run: (...params: unknown[]): { changes: number } => {
        if (sql.includes('UPDATE') && sql.includes('metadata')) {
          const [metadata, key] = params as [string, string];
          store.updateCalls.push({ metadata, key });
          const row = store.memories.get(key);
          if (row !== undefined) {
            store.memories.set(key, { ...row, metadata });
          }
          return { changes: 1 };
        }
        return { changes: 0 };
      },
      get: (...params: unknown[]): T | undefined => {
        if (sql.includes('SELECT') && sql.includes('key = ?')) {
          const [key] = params as [string];
          return store.memories.get(key) as T | undefined;
        }
        return undefined;
      },
      all: (...params: unknown[]): T[] => {
        if (sql.includes('SELECT') && sql.includes('key !=')) {
          const [excludeKey, limit] = params as [string, number];
          return Array.from(store.memories.values())
            .filter((m) => m.key !== excludeKey)
            .sort((a, b) => {
              if (sql.includes('created_at')) {
                return b.created_at - a.created_at;
              }
              return b.accessed_at - a.accessed_at;
            })
            .slice(0, limit) as T[];
        }
        return [];
      },
    }),
    close: vi.fn(),
  };
}

// =============================================================================
// Test Helpers
// =============================================================================

function createMemoryRow(key: string, keywords: string[] = ['test']): MemoryRow {
  const now = Date.now();
  return {
    key,
    value: JSON.stringify({ data: `test data for ${key}` }),
    metadata: JSON.stringify({
      importance: MemoryImportance.MEDIUM,
      amem: {
        keywords,
        semanticTags: ['testing'],
        contextDescription: 'Test context',
        entities: [{ name: 'TestEntity', type: 'code' }],
        attributesUpdatedAt: now,
      },
    }),
    created_at: now - 1000,
    accessed_at: now,
    expires_at: null,
  };
}

// =============================================================================
// Tests: queryMemoriesForAnalysis
// =============================================================================

describe('queryMemoriesForAnalysis', () => {
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(() => {
    mockDb = createMockDatabase();
  });

  it('should query memories excluding specified key', () => {
    mockDb.store.memories.set('mem1', createMemoryRow('mem1', ['typescript']));
    mockDb.store.memories.set('mem2', createMemoryRow('mem2', ['memory']));
    mockDb.store.memories.set('mem3', createMemoryRow('mem3', ['backend']));

    const result = queryMemoriesForAnalysis(mockDb, 'mem1', DEFAULT_EXTRACTION_CONFIG);

    expect(result.length).toBe(2);
    expect(result.some((m) => m.key === 'mem1')).toBe(false);
    expect(result.some((m) => m.key === 'mem2')).toBe(true);
    expect(result.some((m) => m.key === 'mem3')).toBe(true);
  });

  it('should return memories with attributes', () => {
    mockDb.store.memories.set('mem1', createMemoryRow('mem1', ['typescript', 'memory']));
    mockDb.store.memories.set('mem2', createMemoryRow('mem2', ['backend']));

    const result = queryMemoriesForAnalysis(mockDb, 'other', DEFAULT_EXTRACTION_CONFIG);

    expect(result.length).toBe(2);
    expect(result[0]?.attrs.keywords).toBeDefined();
    expect(result[0]?.createdAt).toBeInstanceOf(Date);
  });

  it('should respect limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      mockDb.store.memories.set(`mem${String(i)}`, createMemoryRow(`mem${String(i)}`));
    }

    const result = queryMemoriesForAnalysis(mockDb, 'other', DEFAULT_EXTRACTION_CONFIG, 5);

    expect(result.length).toBe(5);
  });

  it('should return empty array when all memories match exclude key', () => {
    mockDb.store.memories.set('only-key', createMemoryRow('only-key'));

    const result = queryMemoriesForAnalysis(mockDb, 'only-key', DEFAULT_EXTRACTION_CONFIG);

    expect(result).toEqual([]);
  });
});

// =============================================================================
// Tests: queryMemoryByKey
// =============================================================================

describe('queryMemoryByKey', () => {
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(() => {
    mockDb = createMockDatabase();
  });

  it('should return memory row for existing key', () => {
    mockDb.store.memories.set('test-key', createMemoryRow('test-key'));

    const result = queryMemoryByKey(mockDb, 'test-key');

    expect(result).toBeDefined();
    expect(result?.key).toBe('test-key');
  });

  it('should return undefined for non-existent key', () => {
    const result = queryMemoryByKey(mockDb, 'non-existent');
    expect(result).toBeUndefined();
  });
});

// =============================================================================
// Tests: queryCandidateMemories
// =============================================================================

describe('queryCandidateMemories', () => {
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(() => {
    mockDb = createMockDatabase();
  });

  it('should query candidate memories for link suggestions', () => {
    mockDb.store.memories.set('source', createMemoryRow('source', ['typescript']));
    mockDb.store.memories.set('candidate1', createMemoryRow('candidate1', ['memory']));
    mockDb.store.memories.set('candidate2', createMemoryRow('candidate2', ['backend']));

    const result = queryCandidateMemories(mockDb, 'source', DEFAULT_EXTRACTION_CONFIG);

    expect(result.length).toBe(2);
    expect(result.every((m) => m.key !== 'source')).toBe(true);
    expect(result.every((m) => m.attrs !== undefined)).toBe(true);
  });

  it('should respect limit parameter', () => {
    for (let i = 0; i < 20; i++) {
      mockDb.store.memories.set(`mem${String(i)}`, createMemoryRow(`mem${String(i)}`));
    }

    const result = queryCandidateMemories(mockDb, 'source', DEFAULT_EXTRACTION_CONFIG, 5);

    expect(result.length).toBe(5);
  });
});

// =============================================================================
// Tests: queryMemoriesForEvolution
// =============================================================================

describe('queryMemoriesForEvolution', () => {
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(() => {
    mockDb = createMockDatabase();
  });

  it('should query memories for evolution detection', () => {
    mockDb.store.memories.set('new', createMemoryRow('new', ['typescript']));
    mockDb.store.memories.set('old1', createMemoryRow('old1', ['memory']));
    mockDb.store.memories.set('old2', createMemoryRow('old2', ['backend']));

    const result = queryMemoriesForEvolution(mockDb, 'new', DEFAULT_EXTRACTION_CONFIG);

    expect(result.length).toBe(2);
    expect(result.every((m) => m.key !== 'new')).toBe(true);
  });

  it('should return memories with createdAt dates', () => {
    mockDb.store.memories.set('mem1', createMemoryRow('mem1'));
    mockDb.store.memories.set('mem2', createMemoryRow('mem2'));

    const result = queryMemoriesForEvolution(mockDb, 'other', DEFAULT_EXTRACTION_CONFIG);

    expect(result.every((m) => m.createdAt instanceof Date)).toBe(true);
  });
});

// =============================================================================
// Tests: queryAllMemoriesExcept
// =============================================================================

describe('queryAllMemoriesExcept', () => {
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(() => {
    mockDb = createMockDatabase();
  });

  it('should return all memories except specified key', () => {
    mockDb.store.memories.set('exclude', createMemoryRow('exclude'));
    mockDb.store.memories.set('include1', createMemoryRow('include1'));
    mockDb.store.memories.set('include2', createMemoryRow('include2'));

    const result = queryAllMemoriesExcept(mockDb, 'exclude');

    expect(result.length).toBe(2);
    expect(result.some((m) => m.key === 'exclude')).toBe(false);
  });

  it('should return raw MemoryRow objects', () => {
    mockDb.store.memories.set('mem1', createMemoryRow('mem1'));

    const result = queryAllMemoriesExcept(mockDb, 'other');

    expect(result[0]).toHaveProperty('key');
    expect(result[0]).toHaveProperty('value');
    expect(result[0]).toHaveProperty('metadata');
    expect(result[0]).toHaveProperty('created_at');
  });
});

// =============================================================================
// Tests: updateMemoryMetadata
// =============================================================================

describe('updateMemoryMetadata', () => {
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(() => {
    mockDb = createMockDatabase();
  });

  it('should update metadata for existing key', () => {
    mockDb.store.memories.set('test-key', createMemoryRow('test-key'));
    const newMetadata = { importance: 'high', amem: { keywords: ['updated'] } };

    updateMemoryMetadata(mockDb, 'test-key', newMetadata);

    expect(mockDb.store.updateCalls.length).toBe(1);
    expect(mockDb.store.updateCalls[0]?.key).toBe('test-key');
    expect(JSON.parse(mockDb.store.updateCalls[0]?.metadata ?? '{}')).toEqual(newMetadata);
  });

  it('should serialize metadata to JSON', () => {
    mockDb.store.memories.set('key', createMemoryRow('key'));
    const metadata = { nested: { data: [1, 2, 3] } };

    updateMemoryMetadata(mockDb, 'key', metadata);

    const storedMetadata = mockDb.store.updateCalls[0]?.metadata ?? '';
    expect(JSON.parse(storedMetadata)).toEqual(metadata);
  });
});

// =============================================================================
// Tests: applyLinkSuggestions
// =============================================================================

describe('applyLinkSuggestions', () => {
  it('should apply link suggestions to graph backend', async () => {
    const mockGraph = {
      addRelationship: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as GraphMemoryBackend;

    const suggestions: LinkSuggestion[] = [
      {
        from: 'mem1',
        to: 'mem2',
        relationType: 'related_to',
        confidence: 0.8,
        reason: 'Keyword overlap',
      },
    ];

    const result = await applyLinkSuggestions(mockGraph, suggestions, false);

    expect(result).toBe(1);
    expect(mockGraph.addRelationship).toHaveBeenCalledWith('mem1', 'mem2', 'related_to', {
      weight: 0.8,
      metadata: { reason: 'Keyword overlap' },
    });
  });

  it('should create bidirectional links when requested', async () => {
    const mockGraph = {
      addRelationship: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as GraphMemoryBackend;

    const suggestions: LinkSuggestion[] = [
      {
        from: 'mem1',
        to: 'mem2',
        relationType: 'related_to',
        confidence: 0.9,
        reason: 'Test',
      },
    ];

    await applyLinkSuggestions(mockGraph, suggestions, true);

    expect(mockGraph.addRelationship).toHaveBeenCalledTimes(2);
    expect(mockGraph.addRelationship).toHaveBeenCalledWith('mem1', 'mem2', 'related_to', {
      weight: 0.9,
      metadata: { reason: 'Test' },
    });
    expect(mockGraph.addRelationship).toHaveBeenCalledWith('mem2', 'mem1', 'related_to', {
      weight: 0.9,
      metadata: { reason: 'Test' },
    });
  });

  it('should handle failed link creation gracefully', async () => {
    const mockGraph = {
      addRelationship: vi
        .fn()
        .mockResolvedValueOnce(err(new MemoryError('Failed')))
        .mockResolvedValueOnce(ok(undefined)),
    } as unknown as GraphMemoryBackend;

    const suggestions: LinkSuggestion[] = [
      { from: 'a', to: 'b', relationType: 'derived_from', confidence: 0.5, reason: 'r1' },
      { from: 'c', to: 'd', relationType: 'derived_from', confidence: 0.6, reason: 'r2' },
    ];

    const result = await applyLinkSuggestions(mockGraph, suggestions, false);

    expect(result).toBe(1); // Only second one succeeded
  });

  it('should return 0 for empty suggestions', async () => {
    const mockGraph = {
      addRelationship: vi.fn(),
    } as unknown as GraphMemoryBackend;

    const result = await applyLinkSuggestions(mockGraph, [], false);

    expect(result).toBe(0);
    expect(mockGraph.addRelationship).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Tests: prepareRefreshedMetadata
// =============================================================================

describe('prepareRefreshedMetadata', () => {
  it('should merge attributes into existing metadata', () => {
    const currentMeta = { importance: 'high', tags: ['test'] };
    const attributes: MemoryAttributes = {
      keywords: ['typescript', 'memory'],
      semanticTags: ['code'],
      contextDescription: 'Test memory',
      entities: [{ name: 'TestClass', type: 'code' }],
      attributesUpdatedAt: new Date(),
    };

    const result = prepareRefreshedMetadata(currentMeta, attributes);

    expect(result.importance).toBe('high');
    expect(result.tags).toEqual(['test']);
    expect(result.amem).toBeDefined();
    expect((result.amem as Record<string, unknown>).keywords).toEqual(['typescript', 'memory']);
    expect((result.amem as Record<string, unknown>).attributesUpdatedAt).toBeTypeOf('number');
  });

  it('should overwrite existing amem attributes', () => {
    const currentMeta = {
      importance: 'medium',
      amem: { keywords: ['old'], semanticTags: ['old-tag'] },
    };
    const newAttributes: MemoryAttributes = {
      keywords: ['new'],
      semanticTags: ['new-tag'],
      contextDescription: 'Updated',
      entities: [],
      attributesUpdatedAt: new Date(),
    };

    const result = prepareRefreshedMetadata(currentMeta, newAttributes);

    expect((result.amem as Record<string, unknown>).keywords).toEqual(['new']);
    expect((result.amem as Record<string, unknown>).semanticTags).toEqual(['new-tag']);
  });

  it('should set attributesUpdatedAt to current timestamp', () => {
    const before = Date.now();
    const attributes: MemoryAttributes = {
      keywords: [],
      semanticTags: [],
      contextDescription: '',
      entities: [],
      attributesUpdatedAt: new Date(0), // Old date
    };

    const result = prepareRefreshedMetadata({}, attributes);
    const after = Date.now();

    const updatedAt = (result.amem as Record<string, unknown>).attributesUpdatedAt as number;
    expect(updatedAt).toBeGreaterThanOrEqual(before);
    expect(updatedAt).toBeLessThanOrEqual(after);
  });
});

// =============================================================================
// Tests: buildAgenticEntry
// =============================================================================

describe('buildAgenticEntry', () => {
  it('should build complete agentic memory entry', () => {
    const now = new Date();
    const attributes: MemoryAttributes = {
      keywords: ['test'],
      semanticTags: ['code'],
      contextDescription: 'Test entry',
      entities: [],
      attributesUpdatedAt: now,
    };
    const metadata = { importance: MemoryImportance.HIGH };

    const result = buildAgenticEntry('test-key', { data: 'test' }, metadata, attributes, now);

    expect(result.key).toBe('test-key');
    expect(result.value).toEqual({ data: 'test' });
    expect(result.metadata).toEqual(metadata);
    expect(result.attributes).toEqual(attributes);
    expect(result.createdAt).toBe(now);
    expect(result.accessedAt).toBe(now);
  });

  it('should set accessedAt to match createdAt', () => {
    const createdAt = new Date();
    const attributes: MemoryAttributes = {
      keywords: [],
      semanticTags: [],
      contextDescription: '',
      entities: [],
      attributesUpdatedAt: createdAt,
    };

    const result = buildAgenticEntry(
      'key',
      'value',
      { importance: MemoryImportance.LOW },
      attributes,
      createdAt
    );

    expect(result.accessedAt.getTime()).toBe(result.createdAt.getTime());
  });

  it('should handle various value types', () => {
    const now = new Date();
    const attrs: MemoryAttributes = {
      keywords: [],
      semanticTags: [],
      contextDescription: '',
      entities: [],
      attributesUpdatedAt: now,
    };
    const meta = { importance: MemoryImportance.MEDIUM };

    // String value
    expect(buildAgenticEntry('k1', 'string', meta, attrs, now).value).toBe('string');

    // Number value
    expect(buildAgenticEntry('k2', 42, meta, attrs, now).value).toBe(42);

    // Null value
    expect(buildAgenticEntry('k3', null, meta, attrs, now).value).toBeNull();

    // Array value
    expect(buildAgenticEntry('k4', [1, 2, 3], meta, attrs, now).value).toEqual([1, 2, 3]);

    // Object value
    expect(buildAgenticEntry('k5', { nested: { deep: true } }, meta, attrs, now).value).toEqual({
      nested: { deep: true },
    });
  });
});
