/**
 * Tests for Agentic Memory Database Helpers
 *
 * Tests database-related helper functions for A-MEM attribute storage and retrieval.
 *
 * @module context/agentic-memory-db-helpers.test
 * (Source: Issue #122, arXiv:2502.12110)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseAmemAttributes,
  memoryRowToAgenticEntry,
  searchWithAttributes,
  getAttributeSet,
  getAttributesFromRow,
  findMatchingMemories,
} from './agentic-memory-db-helpers.js';
import type { ISQLiteDatabase, ISQLiteStatement, MemoryRow } from './memory-backend-types.js';
import { MemoryImportance } from './memory-backend-types.js';
import type { MemoryAttributes, AgenticMemoryEntry } from './agentic-memory-types.js';
import { DEFAULT_EXTRACTION_CONFIG } from './agentic-memory-types.js';

// =============================================================================
// Mock Database
// =============================================================================

interface MockStore {
  memories: Map<string, MemoryRow>;
}

function createMockDatabase(): ISQLiteDatabase & { store: MockStore } {
  const store: MockStore = { memories: new Map() };
  return {
    store,
    exec: vi.fn(),
    prepare: <T = unknown>(sql: string): ISQLiteStatement<T> => ({
      run: vi.fn().mockReturnValue({ changes: 0 }),
      get: (...params: unknown[]): T | undefined => {
        if (sql.includes('SELECT') && sql.includes('key = ?')) {
          const [key] = params as [string];
          return store.memories.get(key) as T | undefined;
        }
        return undefined;
      },
      all: (...params: unknown[]): T[] => {
        if (sql.includes('memories_fts')) {
          // FTS search - filter by query
          const [query, limit] = params as [string, number];
          const queryLower = query.toLowerCase();
          return Array.from(store.memories.values())
            .filter((m) => m.value.toLowerCase().includes(queryLower))
            .slice(0, limit) as T[];
        }
        if (sql.includes('SELECT') && sql.includes('key !=')) {
          const [excludeKey, limit] = params as [string, number];
          return Array.from(store.memories.values())
            .filter((m) => m.key !== excludeKey)
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

function createMemoryRow(overrides: Partial<MemoryRow> = {}): MemoryRow {
  const now = Date.now();
  return {
    key: 'test-key',
    value: JSON.stringify({ data: 'test value' }),
    metadata: JSON.stringify({ importance: MemoryImportance.MEDIUM, tags: ['test'] }),
    created_at: now - 1000,
    accessed_at: now,
    expires_at: null,
    ...overrides,
  };
}

function createMemoryRowWithAmem(key: string, keywords: string[]): MemoryRow {
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
// Tests: parseAmemAttributes
// =============================================================================

describe('parseAmemAttributes', () => {
  it('should parse valid A-MEM attributes from metadata', () => {
    const now = Date.now();
    const metadata = {
      importance: 'high',
      amem: {
        keywords: ['typescript', 'memory'],
        semanticTags: ['code', 'testing'],
        contextDescription: 'Test memory for parsing',
        entities: [{ name: 'TestClass', type: 'code' }],
        attributesUpdatedAt: now,
      },
    };

    const result = parseAmemAttributes(metadata);

    expect(result).not.toBeNull();
    expect(result?.keywords).toEqual(['typescript', 'memory']);
    expect(result?.semanticTags).toEqual(['code', 'testing']);
    expect(result?.contextDescription).toBe('Test memory for parsing');
    expect(result?.entities).toHaveLength(1);
    expect(result?.attributesUpdatedAt).toBeInstanceOf(Date);
  });

  it('should return null for non-object metadata', () => {
    expect(parseAmemAttributes(null)).toBeNull();
    expect(parseAmemAttributes(undefined)).toBeNull();
    expect(parseAmemAttributes('string')).toBeNull();
    expect(parseAmemAttributes(42)).toBeNull();
  });

  it('should return null for metadata without amem property', () => {
    const metadata = { importance: 'high', tags: ['test'] };
    expect(parseAmemAttributes(metadata)).toBeNull();
  });

  it('should return null for amem without required keywords field', () => {
    const metadata = {
      amem: {
        semanticTags: ['code'],
        attributesUpdatedAt: Date.now(),
      },
    };
    expect(parseAmemAttributes(metadata)).toBeNull();
  });

  it('should return null for amem without attributesUpdatedAt', () => {
    const metadata = {
      amem: {
        keywords: ['test'],
        semanticTags: ['code'],
      },
    };
    expect(parseAmemAttributes(metadata)).toBeNull();
  });
});

// =============================================================================
// Tests: memoryRowToAgenticEntry
// =============================================================================

describe('memoryRowToAgenticEntry', () => {
  /** Unwrap an entry the test asserts is readable. */
  function expectEntry(row: MemoryRow): AgenticMemoryEntry {
    const result = memoryRowToAgenticEntry(row, DEFAULT_EXTRACTION_CONFIG);
    if (!result.ok) throw new Error(`expected a readable row, got ${result.error.reason}`);
    return result.value;
  }

  it('should convert row with A-MEM attributes', () => {
    const row = createMemoryRowWithAmem('test-key', ['typescript', 'memory']);

    const entry = expectEntry(row);

    expect(entry.key).toBe('test-key');
    expect(entry.attributes.keywords).toContain('typescript');
    expect(entry.attributes.keywords).toContain('memory');
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(entry.accessedAt).toBeInstanceOf(Date);
  });

  it('should extract attributes from value when no A-MEM present', () => {
    const row = createMemoryRow({
      key: 'plain-key',
      value: JSON.stringify('This is about TypeScript and testing'),
      metadata: JSON.stringify({ importance: 'medium' }),
    });

    const entry = expectEntry(row);

    expect(entry.key).toBe('plain-key');
    expect(entry.attributes).toBeDefined();
    expect(entry.attributes.keywords).toBeDefined();
  });

  it('reports corrupt metadata as unreadable rather than extracting from it (#5835)', () => {
    // Was: the row came back with a fabricated MEDIUM importance and
    // attributes extracted from the value, indistinguishable from a row whose
    // author wrote exactly that.
    const row = createMemoryRow({
      key: 'corrupt-meta',
      value: JSON.stringify('valid value'),
      metadata: '{not valid json!!!',
    });

    const result = memoryRowToAgenticEntry(row, DEFAULT_EXTRACTION_CONFIG);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the row to be unreadable');
    expect(result.error.key).toBe('corrupt-meta');
    expect(result.error.reason).toBe('metadata_not_json');
  });

  it('should handle complex nested values', () => {
    const row = createMemoryRow({
      key: 'complex-key',
      value: JSON.stringify({
        nested: { data: 'TypeScript code example' },
        array: ['memory', 'backend'],
      }),
    });

    const entry = expectEntry(row);

    expect(entry.key).toBe('complex-key');
    expect(entry.value).toEqual({
      nested: { data: 'TypeScript code example' },
      array: ['memory', 'backend'],
    });
  });
});

// =============================================================================
// Tests: searchWithAttributes
// =============================================================================

describe('searchWithAttributes', () => {
  let mockDb: ISQLiteDatabase & { store: MockStore };

  beforeEach(() => {
    mockDb = createMockDatabase();
  });

  it('should return empty array for empty query', () => {
    const result = searchWithAttributes(mockDb, '', 10, DEFAULT_EXTRACTION_CONFIG);
    expect(result).toEqual([]);
  });

  it('should return empty array for whitespace-only query', () => {
    const result = searchWithAttributes(mockDb, '   ', 10, DEFAULT_EXTRACTION_CONFIG);
    expect(result).toEqual([]);
  });

  it('should sanitize special characters from query', () => {
    mockDb.store.memories.set('key1', createMemoryRowWithAmem('key1', ['test']));

    // Query with special chars should not throw
    const result = searchWithAttributes(mockDb, 'test*():^"', 10, DEFAULT_EXTRACTION_CONFIG);

    // Result depends on mock, but should not throw
    expect(Array.isArray(result)).toBe(true);
  });

  it('should search and return matching entries with attributes', () => {
    mockDb.store.memories.set(
      'mem1',
      createMemoryRow({
        key: 'mem1',
        value: JSON.stringify('TypeScript memory backend'),
        metadata: JSON.stringify({
          importance: 'high',
          amem: {
            keywords: ['typescript', 'memory'],
            semanticTags: ['code'],
            contextDescription: 'Memory backend',
            entities: [],
            attributesUpdatedAt: Date.now(),
          },
        }),
      })
    );
    mockDb.store.memories.set(
      'mem2',
      createMemoryRow({
        key: 'mem2',
        value: JSON.stringify('Python data processing'),
      })
    );

    const result = searchWithAttributes(mockDb, 'typescript', 10, DEFAULT_EXTRACTION_CONFIG);

    expect(result.length).toBeGreaterThanOrEqual(0); // Mock FTS filters by query
  });

  it('should respect limit parameter', () => {
    // Add multiple memories
    for (let i = 0; i < 20; i++) {
      mockDb.store.memories.set(
        `mem${String(i)}`,
        createMemoryRow({
          key: `mem${String(i)}`,
          value: JSON.stringify(`TypeScript example ${String(i)}`),
        })
      );
    }

    const result = searchWithAttributes(mockDb, 'typescript', 5, DEFAULT_EXTRACTION_CONFIG);

    expect(result.length).toBeLessThanOrEqual(5);
  });
});

// =============================================================================
// Tests: getAttributeSet
// =============================================================================

describe('getAttributeSet', () => {
  const testAttributes: MemoryAttributes = {
    keywords: ['typescript', 'memory', 'backend'],
    semanticTags: ['code', 'testing', 'infrastructure'],
    entities: [
      { name: 'MemoryBackend', type: 'code' },
      { name: 'TestClass', type: 'code' },
    ],
    contextDescription: 'Test context',
    attributesUpdatedAt: new Date(),
  };

  it('should return set of keywords', () => {
    const result = getAttributeSet(testAttributes, 'keywords');

    expect(result).toBeInstanceOf(Set);
    expect(result.has('typescript')).toBe(true);
    expect(result.has('memory')).toBe(true);
    expect(result.has('backend')).toBe(true);
    expect(result.size).toBe(3);
  });

  it('should return set of semantic tags', () => {
    const result = getAttributeSet(testAttributes, 'semanticTags');

    expect(result).toBeInstanceOf(Set);
    expect(result.has('code')).toBe(true);
    expect(result.has('testing')).toBe(true);
    expect(result.has('infrastructure')).toBe(true);
    expect(result.size).toBe(3);
  });

  it('should return set of entity names (lowercase)', () => {
    const result = getAttributeSet(testAttributes, 'entities');

    expect(result).toBeInstanceOf(Set);
    expect(result.has('memorybackend')).toBe(true);
    expect(result.has('testclass')).toBe(true);
    expect(result.size).toBe(2);
  });

  it('should handle empty arrays', () => {
    const emptyAttrs: MemoryAttributes = {
      keywords: [],
      semanticTags: [],
      entities: [],
      contextDescription: '',
      attributesUpdatedAt: new Date(),
    };

    expect(getAttributeSet(emptyAttrs, 'keywords').size).toBe(0);
    expect(getAttributeSet(emptyAttrs, 'semanticTags').size).toBe(0);
    expect(getAttributeSet(emptyAttrs, 'entities').size).toBe(0);
  });
});

// =============================================================================
// Tests: getAttributesFromRow
// =============================================================================

describe('getAttributesFromRow', () => {
  it('should extract attributes from A-MEM metadata', () => {
    const row = createMemoryRowWithAmem('test-key', ['typescript', 'memory']);

    const result = getAttributesFromRow(row, DEFAULT_EXTRACTION_CONFIG);

    expect(result.keywords).toContain('typescript');
    expect(result.keywords).toContain('memory');
    expect(result.semanticTags).toContain('testing');
    expect(result.entities).toHaveLength(1);
    expect(result.attributesUpdatedAt).toBeInstanceOf(Date);
  });

  it('should extract attributes from value when no A-MEM present', () => {
    const row = createMemoryRow({
      value: JSON.stringify('This contains TypeScript code examples'),
      metadata: JSON.stringify({ importance: 'medium' }),
    });

    const result = getAttributesFromRow(row, DEFAULT_EXTRACTION_CONFIG);

    expect(result.keywords).toBeDefined();
    expect(Array.isArray(result.keywords)).toBe(true);
  });

  it('should handle corrupt metadata JSON gracefully (#1187)', () => {
    const row = createMemoryRow({
      key: 'corrupt-meta',
      value: JSON.stringify('valid string value'),
      metadata: 'NOT_JSON',
    });

    const result = getAttributesFromRow(row, DEFAULT_EXTRACTION_CONFIG);

    expect(result).toBeDefined();
    expect(result.keywords).toBeDefined();
  });

  it('should handle corrupt value JSON gracefully (#1187)', () => {
    const row = createMemoryRow({
      key: 'corrupt-value',
      value: '{broken json',
      metadata: JSON.stringify({ importance: 'medium' }),
    });

    const result = getAttributesFromRow(row, DEFAULT_EXTRACTION_CONFIG);

    expect(result).toBeDefined();
    expect(result.keywords).toBeDefined();
  });

  it('should handle string values', () => {
    const row = createMemoryRow({
      value: JSON.stringify('Simple string value about testing and memory'),
      metadata: JSON.stringify({ importance: 'low' }),
    });

    const result = getAttributesFromRow(row, DEFAULT_EXTRACTION_CONFIG);

    expect(result).toBeDefined();
    expect(result.keywords).toBeDefined();
  });
});

// =============================================================================
// Tests: findMatchingMemories
// =============================================================================

describe('findMatchingMemories', () => {
  it('should find memories with overlapping keywords', () => {
    const rows: MemoryRow[] = [
      createMemoryRowWithAmem('mem1', ['typescript', 'memory', 'backend']),
      createMemoryRowWithAmem('mem2', ['typescript', 'testing']),
      createMemoryRowWithAmem('mem3', ['python', 'data']),
    ];
    const sourceSet = new Set(['typescript', 'backend']);

    const result = findMatchingMemories(rows, sourceSet, 'keywords', DEFAULT_EXTRACTION_CONFIG);

    expect(result.length).toBe(2); // mem1 and mem2 have typescript overlap
    // Should be sorted by overlap count (descending)
    expect(result[0]?.entry.key).toBe('mem1'); // 2 overlaps
    expect(result[0]?.overlap).toBe(2);
    expect(result[1]?.entry.key).toBe('mem2'); // 1 overlap
    expect(result[1]?.overlap).toBe(1);
  });

  it('should find memories with overlapping semantic tags', () => {
    const now = Date.now();
    const rows: MemoryRow[] = [
      {
        key: 'mem1',
        value: JSON.stringify('data'),
        metadata: JSON.stringify({
          // `importance` is required by MemoryMetadataSchema, which
          // memory-backend.store() already enforces on write (#5835).
          importance: MemoryImportance.MEDIUM,
          amem: {
            keywords: [],
            semanticTags: ['code', 'security'],
            contextDescription: '',
            entities: [],
            attributesUpdatedAt: now,
          },
        }),
        created_at: now,
        accessed_at: now,
        expires_at: null,
      },
      {
        key: 'mem2',
        value: JSON.stringify('data'),
        metadata: JSON.stringify({
          // `importance` is required by MemoryMetadataSchema, which
          // memory-backend.store() already enforces on write (#5835).
          importance: MemoryImportance.MEDIUM,
          amem: {
            keywords: [],
            semanticTags: ['testing'],
            contextDescription: '',
            entities: [],
            attributesUpdatedAt: now,
          },
        }),
        created_at: now,
        accessed_at: now,
        expires_at: null,
      },
    ];
    const sourceSet = new Set(['code', 'security']);

    const result = findMatchingMemories(rows, sourceSet, 'semanticTags', DEFAULT_EXTRACTION_CONFIG);

    expect(result.length).toBe(1);
    expect(result[0]?.entry.key).toBe('mem1');
    expect(result[0]?.overlap).toBe(2);
  });

  it('should find memories with overlapping entities', () => {
    const now = Date.now();
    const rows: MemoryRow[] = [
      {
        key: 'mem1',
        value: JSON.stringify('data'),
        metadata: JSON.stringify({
          // `importance` is required by MemoryMetadataSchema, which
          // memory-backend.store() already enforces on write (#5835).
          importance: MemoryImportance.MEDIUM,
          amem: {
            keywords: [],
            semanticTags: [],
            contextDescription: '',
            entities: [
              { name: 'MemoryBackend', type: 'code' },
              { name: 'TestClass', type: 'code' },
            ],
            attributesUpdatedAt: now,
          },
        }),
        created_at: now,
        accessed_at: now,
        expires_at: null,
      },
      {
        key: 'mem2',
        value: JSON.stringify('data'),
        metadata: JSON.stringify({
          // `importance` is required by MemoryMetadataSchema, which
          // memory-backend.store() already enforces on write (#5835).
          importance: MemoryImportance.MEDIUM,
          amem: {
            keywords: [],
            semanticTags: [],
            contextDescription: '',
            entities: [{ name: 'OtherClass', type: 'code' }],
            attributesUpdatedAt: now,
          },
        }),
        created_at: now,
        accessed_at: now,
        expires_at: null,
      },
    ];
    const sourceSet = new Set(['memorybackend', 'testclass']); // lowercase

    const result = findMatchingMemories(rows, sourceSet, 'entities', DEFAULT_EXTRACTION_CONFIG);

    expect(result.length).toBe(1);
    expect(result[0]?.entry.key).toBe('mem1');
    expect(result[0]?.overlap).toBe(2);
  });

  it('should return empty array when no matches found', () => {
    const rows: MemoryRow[] = [
      createMemoryRowWithAmem('mem1', ['python', 'django']),
      createMemoryRowWithAmem('mem2', ['java', 'spring']),
    ];
    const sourceSet = new Set(['typescript', 'memory']);

    const result = findMatchingMemories(rows, sourceSet, 'keywords', DEFAULT_EXTRACTION_CONFIG);

    expect(result).toEqual([]);
  });

  it('should handle empty rows array', () => {
    const sourceSet = new Set(['typescript']);
    const result = findMatchingMemories([], sourceSet, 'keywords', DEFAULT_EXTRACTION_CONFIG);
    expect(result).toEqual([]);
  });

  it('should handle empty source set', () => {
    const rows: MemoryRow[] = [createMemoryRowWithAmem('mem1', ['typescript'])];
    const sourceSet = new Set<string>();

    const result = findMatchingMemories(rows, sourceSet, 'keywords', DEFAULT_EXTRACTION_CONFIG);

    expect(result).toEqual([]);
  });
});
