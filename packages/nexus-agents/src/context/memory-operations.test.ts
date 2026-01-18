/**
 * Tests for Memory Operations Module
 *
 * Tests query and mutation operations for the hybrid memory backend.
 *
 * @module context/memory-operations.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  rowToEntry,
  sanitizeFtsQuery,
  cleanupExpiredEntries,
  countMemories,
  expireAllEntries,
  pruneOldEntries,
} from './memory-operations.js';
import type { ISQLiteDatabase, ISQLiteStatement, MemoryRow } from './memory-backend-types.js';
import { MemoryImportance } from './memory-backend-types.js';
import type { ILogger } from '../core/logger.js';

// =============================================================================
// Mock Logger
// =============================================================================

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
  };
}

// =============================================================================
// Mock Database
// =============================================================================

interface MockStore {
  memories: Map<string, MemoryRow>;
  deletedKeys: string[];
}

function createMockDatabase(): ISQLiteDatabase & { store: MockStore } {
  const store: MockStore = {
    memories: new Map(),
    deletedKeys: [],
  };

  return {
    store,
    exec: vi.fn(),
    prepare: <T = unknown>(sql: string): ISQLiteStatement<T> => ({
      // eslint-disable-next-line complexity -- Mock requires branching for different SQL patterns
      run: (...params: unknown[]): { changes: number } => {
        // Handle DELETE with key list
        if (sql.includes('DELETE') && sql.includes('key IN')) {
          const keys = params as string[];
          keys.forEach((key) => {
            if (store.memories.has(key)) {
              store.memories.delete(key);
              store.deletedKeys.push(key);
            }
          });
          return { changes: keys.length };
        }

        // Handle DELETE with expires_at
        if (sql.includes('DELETE') && sql.includes('expires_at')) {
          const cutoff = params[0] as number;
          let deleted = 0;
          for (const [key, row] of store.memories.entries()) {
            if (row.expires_at !== null && row.expires_at < cutoff) {
              store.memories.delete(key);
              store.deletedKeys.push(key);
              deleted++;
            }
          }
          return { changes: deleted };
        }

        // Handle DELETE with created_at
        if (sql.includes('DELETE') && sql.includes('created_at')) {
          const cutoff = params[0] as number;
          let deleted = 0;
          for (const [key, row] of store.memories.entries()) {
            if (row.created_at < cutoff) {
              store.memories.delete(key);
              store.deletedKeys.push(key);
              deleted++;
            }
          }
          return { changes: deleted };
        }

        return { changes: 0 };
      },
      get: (..._params: unknown[]): T | undefined => {
        if (sql.includes('COUNT')) {
          return { count: store.memories.size } as T;
        }
        return undefined;
      },
      all: (): T[] => [],
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

// =============================================================================
// Tests: rowToEntry
// =============================================================================

describe('rowToEntry', () => {
  it('should convert a MemoryRow to MemoryEntry', () => {
    const now = Date.now();
    const row: MemoryRow = {
      key: 'test-key',
      value: JSON.stringify({ nested: { data: 123 } }),
      metadata: JSON.stringify({
        importance: MemoryImportance.HIGH,
        tags: ['tag1', 'tag2'],
        ttl: 60000,
      }),
      created_at: now - 5000,
      accessed_at: now,
      expires_at: now + 55000,
    };

    const entry = rowToEntry(row);

    expect(entry.key).toBe('test-key');
    expect(entry.value).toEqual({ nested: { data: 123 } });
    expect(entry.metadata.importance).toBe(MemoryImportance.HIGH);
    expect(entry.metadata.tags).toEqual(['tag1', 'tag2']);
    expect(entry.metadata.ttl).toBe(60000);
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(entry.accessedAt).toBeInstanceOf(Date);
    expect(entry.createdAt.getTime()).toBe(now - 5000);
    expect(entry.accessedAt.getTime()).toBe(now);
  });

  it('should handle string values', () => {
    const row = createMemoryRow({ value: JSON.stringify('plain string value') });

    const entry = rowToEntry(row);

    expect(entry.value).toBe('plain string value');
  });

  it('should handle null values', () => {
    const row = createMemoryRow({ value: JSON.stringify(null) });

    const entry = rowToEntry(row);

    expect(entry.value).toBeNull();
  });

  it('should handle numeric values', () => {
    const row = createMemoryRow({ value: JSON.stringify(42.5) });

    const entry = rowToEntry(row);

    expect(entry.value).toBe(42.5);
  });

  it('should handle boolean values', () => {
    const row = createMemoryRow({ value: JSON.stringify(true) });

    const entry = rowToEntry(row);

    expect(entry.value).toBe(true);
  });

  it('should handle arrays', () => {
    const row = createMemoryRow({ value: JSON.stringify([1, 2, 3, 'four']) });

    const entry = rowToEntry(row);

    expect(entry.value).toEqual([1, 2, 3, 'four']);
  });

  it('should handle metadata without optional fields', () => {
    const row = createMemoryRow({
      metadata: JSON.stringify({ importance: MemoryImportance.LOW }),
    });

    const entry = rowToEntry(row);

    expect(entry.metadata.importance).toBe(MemoryImportance.LOW);
    expect(entry.metadata.tags).toBeUndefined();
    expect(entry.metadata.ttl).toBeUndefined();
  });
});

// =============================================================================
// Tests: sanitizeFtsQuery
// =============================================================================

describe('sanitizeFtsQuery', () => {
  it('should remove FTS5 special operators', () => {
    const query = 'test* OR value"';
    const sanitized = sanitizeFtsQuery(query);

    expect(sanitized).not.toContain('*');
    expect(sanitized).not.toContain('"');
    expect(sanitized).not.toContain('OR');
  });

  it('should remove all special characters', () => {
    const query = 'key:value^boost (group) {curly} [bracket]';
    const sanitized = sanitizeFtsQuery(query);

    expect(sanitized).not.toContain(':');
    expect(sanitized).not.toContain('^');
    expect(sanitized).not.toContain('(');
    expect(sanitized).not.toContain(')');
    expect(sanitized).not.toContain('{');
    expect(sanitized).not.toContain('}');
    expect(sanitized).not.toContain('[');
    expect(sanitized).not.toContain(']');
  });

  it('should remove FTS operators (AND, OR, NOT, NEAR)', () => {
    const query = 'hello AND world OR foo NOT bar NEAR test';
    const sanitized = sanitizeFtsQuery(query);

    expect(sanitized.toUpperCase()).not.toMatch(/\bAND\b/);
    expect(sanitized.toUpperCase()).not.toMatch(/\bOR\b/);
    expect(sanitized.toUpperCase()).not.toMatch(/\bNOT\b/);
    expect(sanitized.toUpperCase()).not.toMatch(/\bNEAR\b/);
  });

  it('should preserve normal words', () => {
    const query = 'simple search query';
    const sanitized = sanitizeFtsQuery(query);

    expect(sanitized).toBe('simple search query');
  });

  it('should collapse multiple spaces', () => {
    const query = 'hello    world   test';
    const sanitized = sanitizeFtsQuery(query);

    expect(sanitized).toBe('hello world test');
  });

  it('should trim whitespace', () => {
    const query = '  hello world  ';
    const sanitized = sanitizeFtsQuery(query);

    expect(sanitized).toBe('hello world');
  });

  it('should return empty string for all-special-char input', () => {
    const query = '*****';
    const sanitized = sanitizeFtsQuery(query);

    expect(sanitized).toBe('');
  });

  it('should handle mixed case operators', () => {
    const query = 'test And something Or other Not this';
    const sanitized = sanitizeFtsQuery(query);

    expect(sanitized.toLowerCase()).not.toMatch(/\band\b/);
    expect(sanitized.toLowerCase()).not.toMatch(/\bor\b/);
    expect(sanitized.toLowerCase()).not.toMatch(/\bnot\b/);
  });

  it('should handle empty string', () => {
    expect(sanitizeFtsQuery('')).toBe('');
  });

  it('should handle string with only whitespace', () => {
    expect(sanitizeFtsQuery('   ')).toBe('');
  });
});

// =============================================================================
// Tests: cleanupExpiredEntries
// =============================================================================

describe('cleanupExpiredEntries', () => {
  let mockDb: ISQLiteDatabase & { store: MockStore };
  let mockLogger: ILogger;

  beforeEach(() => {
    mockDb = createMockDatabase();
    mockLogger = createMockLogger();
  });

  it('should return all entries when none are expired', () => {
    const now = Date.now();
    const rows: MemoryRow[] = [
      createMemoryRow({ key: 'key1', expires_at: now + 60000 }),
      createMemoryRow({ key: 'key2', expires_at: now + 120000 }),
      createMemoryRow({ key: 'key3', expires_at: null }),
    ];

    const result = cleanupExpiredEntries(rows, mockDb, true, mockLogger);

    expect(result.entries.length).toBe(3);
    expect(result.expiredCount).toBe(0);
  });

  it('should filter out expired entries when autoExpire is true', () => {
    const now = Date.now();
    const rows: MemoryRow[] = [
      createMemoryRow({ key: 'valid', expires_at: now + 60000 }),
      createMemoryRow({ key: 'expired', expires_at: now - 1000 }),
    ];

    const result = cleanupExpiredEntries(rows, mockDb, true, mockLogger);

    expect(result.entries.length).toBe(1);
    expect(result.entries[0]?.key).toBe('valid');
    expect(result.expiredCount).toBe(1);
  });

  it('should not filter expired entries when autoExpire is false', () => {
    const now = Date.now();
    const rows: MemoryRow[] = [
      createMemoryRow({ key: 'valid', expires_at: now + 60000 }),
      createMemoryRow({ key: 'expired', expires_at: now - 1000 }),
    ];

    const result = cleanupExpiredEntries(rows, mockDb, false, mockLogger);

    expect(result.entries.length).toBe(2);
    expect(result.expiredCount).toBe(0);
  });

  it('should delete expired entries from database', () => {
    const now = Date.now();
    mockDb.store.memories.set('expired1', createMemoryRow({ key: 'expired1' }));
    mockDb.store.memories.set('expired2', createMemoryRow({ key: 'expired2' }));

    const rows: MemoryRow[] = [
      createMemoryRow({ key: 'expired1', expires_at: now - 1000 }),
      createMemoryRow({ key: 'expired2', expires_at: now - 2000 }),
    ];

    cleanupExpiredEntries(rows, mockDb, true, mockLogger);

    expect(mockDb.store.deletedKeys).toContain('expired1');
    expect(mockDb.store.deletedKeys).toContain('expired2');
  });

  it('should log when entries are expired', () => {
    const now = Date.now();
    const rows: MemoryRow[] = [createMemoryRow({ key: 'expired', expires_at: now - 1000 })];

    cleanupExpiredEntries(rows, mockDb, true, mockLogger);

    expect(mockLogger.debug).toHaveBeenCalledWith('Auto-expired memories', { count: 1 });
  });

  it('should handle entries without TTL (null expires_at)', () => {
    const rows: MemoryRow[] = [
      createMemoryRow({ key: 'no-ttl-1', expires_at: null }),
      createMemoryRow({ key: 'no-ttl-2', expires_at: null }),
    ];

    const result = cleanupExpiredEntries(rows, mockDb, true, mockLogger);

    expect(result.entries.length).toBe(2);
    expect(result.expiredCount).toBe(0);
  });

  it('should handle empty rows array', () => {
    const result = cleanupExpiredEntries([], mockDb, true, mockLogger);

    expect(result.entries).toEqual([]);
    expect(result.expiredCount).toBe(0);
  });

  it('should correctly convert rows to entries', () => {
    const now = Date.now();
    const rows: MemoryRow[] = [
      {
        key: 'test',
        value: JSON.stringify({ data: 'test' }),
        metadata: JSON.stringify({ importance: 'high', tags: ['a', 'b'] }),
        created_at: now - 10000,
        accessed_at: now,
        expires_at: null,
      },
    ];

    const result = cleanupExpiredEntries(rows, mockDb, true, mockLogger);

    expect(result.entries[0]?.key).toBe('test');
    expect(result.entries[0]?.value).toEqual({ data: 'test' });
    expect(result.entries[0]?.metadata.importance).toBe('high');
    expect(result.entries[0]?.metadata.tags).toEqual(['a', 'b']);
  });
});

// =============================================================================
// Tests: countMemories
// =============================================================================

describe('countMemories', () => {
  it('should return correct count', () => {
    const mockDb = createMockDatabase();
    mockDb.store.memories.set('key1', createMemoryRow({ key: 'key1' }));
    mockDb.store.memories.set('key2', createMemoryRow({ key: 'key2' }));
    mockDb.store.memories.set('key3', createMemoryRow({ key: 'key3' }));

    const result = countMemories(mockDb);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(3);
    }
  });

  it('should return 0 for empty database', () => {
    const mockDb = createMockDatabase();

    const result = countMemories(mockDb);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  it('should handle database errors', () => {
    const errorDb: ISQLiteDatabase = {
      exec: vi.fn(),
      prepare: () => {
        throw new Error('Database error');
      },
      close: vi.fn(),
    };

    const result = countMemories(errorDb);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Failed to count memories');
    }
  });
});

// =============================================================================
// Tests: expireAllEntries
// =============================================================================

describe('expireAllEntries', () => {
  let mockDb: ISQLiteDatabase & { store: MockStore };
  let mockLogger: ILogger;

  beforeEach(() => {
    mockDb = createMockDatabase();
    mockLogger = createMockLogger();
  });

  it('should expire entries with past TTL', () => {
    const now = Date.now();
    mockDb.store.memories.set(
      'expired1',
      createMemoryRow({
        key: 'expired1',
        expires_at: now - 1000,
      })
    );
    mockDb.store.memories.set(
      'expired2',
      createMemoryRow({
        key: 'expired2',
        expires_at: now - 2000,
      })
    );
    mockDb.store.memories.set(
      'valid',
      createMemoryRow({
        key: 'valid',
        expires_at: now + 60000,
      })
    );

    const result = expireAllEntries(mockDb, mockLogger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(2);
    }
  });

  it('should not expire entries with null expires_at', () => {
    mockDb.store.memories.set(
      'no-ttl',
      createMemoryRow({
        key: 'no-ttl',
        expires_at: null,
      })
    );

    const result = expireAllEntries(mockDb, mockLogger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
    expect(mockDb.store.memories.has('no-ttl')).toBe(true);
  });

  it('should log expired count', () => {
    const now = Date.now();
    mockDb.store.memories.set(
      'expired',
      createMemoryRow({
        key: 'expired',
        expires_at: now - 1000,
      })
    );

    expireAllEntries(mockDb, mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith('Expired memories', { count: 1 });
  });

  it('should return 0 when no entries to expire', () => {
    const now = Date.now();
    mockDb.store.memories.set(
      'valid1',
      createMemoryRow({
        key: 'valid1',
        expires_at: now + 60000,
      })
    );
    mockDb.store.memories.set(
      'valid2',
      createMemoryRow({
        key: 'valid2',
        expires_at: null,
      })
    );

    const result = expireAllEntries(mockDb, mockLogger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  it('should handle database errors', () => {
    const errorDb: ISQLiteDatabase = {
      exec: vi.fn(),
      prepare: () => {
        throw new Error('Database error');
      },
      close: vi.fn(),
    };

    const result = expireAllEntries(errorDb, mockLogger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Failed to expire memories');
    }
  });
});

// =============================================================================
// Tests: pruneOldEntries
// =============================================================================

describe('pruneOldEntries', () => {
  let mockDb: ISQLiteDatabase & { store: MockStore };
  let mockLogger: ILogger;

  beforeEach(() => {
    mockDb = createMockDatabase();
    mockLogger = createMockLogger();
  });

  it('should prune entries older than cutoff date', () => {
    const now = Date.now();
    const cutoff = new Date(now - 50000);

    mockDb.store.memories.set(
      'old1',
      createMemoryRow({
        key: 'old1',
        created_at: now - 100000, // 100 seconds ago
      })
    );
    mockDb.store.memories.set(
      'old2',
      createMemoryRow({
        key: 'old2',
        created_at: now - 60000, // 60 seconds ago
      })
    );
    mockDb.store.memories.set(
      'new',
      createMemoryRow({
        key: 'new',
        created_at: now - 10000, // 10 seconds ago
      })
    );

    const result = pruneOldEntries(mockDb, cutoff, mockLogger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(2);
    }
  });

  it('should return 0 when nothing to prune', () => {
    const now = Date.now();
    const cutoff = new Date(now - 1000000); // Very old cutoff

    mockDb.store.memories.set(
      'recent',
      createMemoryRow({
        key: 'recent',
        created_at: now - 1000,
      })
    );

    const result = pruneOldEntries(mockDb, cutoff, mockLogger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  it('should log pruning info', () => {
    const now = Date.now();
    const cutoff = new Date(now - 50000);

    mockDb.store.memories.set(
      'old',
      createMemoryRow({
        key: 'old',
        created_at: now - 100000,
      })
    );

    pruneOldEntries(mockDb, cutoff, mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith('Pruned old memories', {
      olderThan: cutoff.toISOString(),
      count: 1,
    });
  });

  it('should handle database errors', () => {
    const errorDb: ISQLiteDatabase = {
      exec: vi.fn(),
      prepare: () => {
        throw new Error('Database error');
      },
      close: vi.fn(),
    };

    const cutoff = new Date();
    const result = pruneOldEntries(errorDb, cutoff, mockLogger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Failed to prune memories');
      expect(result.error.context?.olderThan).toBe(cutoff.toISOString());
    }
  });

  it('should handle empty database', () => {
    const cutoff = new Date();
    const result = pruneOldEntries(mockDb, cutoff, mockLogger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });
});
