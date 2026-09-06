/**
 * Tests for Memory Database Utilities
 * @module utils/memory-db-utils.test
 */

import { describe, it, expect } from 'vitest';
import type { MemoryEntry, MemoryRow, ISQLiteDatabase } from '../context/memory-backend-types.js';
import {
  memoryRowToEntry,
  memoryExists,
  getMemoryEntry,
  getMemoryRow,
  getAllMemoryRows,
} from './memory-db-utils.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeRow(overrides: Partial<MemoryRow> = {}): MemoryRow {
  return {
    key: 'test-key',
    value: JSON.stringify({ data: 'hello' }),
    metadata: JSON.stringify({ importance: 'medium' }),
    created_at: 1700000000000,
    accessed_at: 1700000001000,
    expires_at: null,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockDb(getResult?: MemoryRow, allResult?: MemoryRow[]) {
  return {
    prepare: () => ({
      get: () => getResult,
      all: () => allResult ?? [],
      run: () => ({ changes: 0 }),
    }),
    exec: () => undefined,
    close: () => undefined,
  } as unknown as ISQLiteDatabase;
}

// ============================================================================
// memoryRowToEntry
// ============================================================================

describe('memoryRowToEntry', () => {
  /** Unwrap an entry the test asserts is readable. */
  function expectEntry(row: MemoryRow): MemoryEntry {
    const result = memoryRowToEntry(row);
    if (!result.ok) throw new Error(`expected a readable row, got ${result.error.reason}`);
    return result.value;
  }

  it('converts row to entry with parsed value', () => {
    const entry = expectEntry(makeRow());
    expect(entry.key).toBe('test-key');
    expect(entry.value).toEqual({ data: 'hello' });
  });

  it('parses metadata JSON', () => {
    const entry = expectEntry(makeRow());
    expect(entry.metadata).toEqual({ importance: 'medium' });
  });

  it('converts timestamps to Date objects', () => {
    const entry = expectEntry(makeRow());
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(entry.accessedAt).toBeInstanceOf(Date);
    expect(entry.createdAt.getTime()).toBe(1700000000000);
    expect(entry.accessedAt.getTime()).toBe(1700000001000);
  });

  it('handles complex value types', () => {
    const row = makeRow({ value: JSON.stringify([1, 2, 3]) });
    expect(expectEntry(row).value).toEqual([1, 2, 3]);
  });

  it('handles metadata with tags', () => {
    const metadata = { importance: 'high', tags: ['a', 'b'] };
    const row = makeRow({ metadata: JSON.stringify(metadata) });
    expect(expectEntry(row).metadata).toEqual(metadata);
  });

  it('keeps metadata keys the schema does not name (#5835)', () => {
    // A-MEM stores its attributes alongside `importance`. A strict parse would
    // strip them, trading one silent misrepresentation for another.
    const metadata = { importance: 'high', amem: { keywords: ['zod'] } };
    const row = makeRow({ metadata: JSON.stringify(metadata) });
    expect(expectEntry(row).metadata).toEqual(metadata);
  });

  it('handles corrupt value JSON gracefully (#1187)', () => {
    const row = makeRow({ value: '{broken json' });
    const entry = expectEntry(row);
    expect(entry.key).toBe('test-key');
    expect(entry.value).toBe('{broken json');
  });

  it('reports unparseable metadata instead of fabricating an importance (#5835)', () => {
    // Was: importance silently became MEDIUM, so a memory written as HIGH
    // failed a HIGH filter with nothing in the record to say why.
    const result = memoryRowToEntry(makeRow({ metadata: 'NOT_JSON' }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the row to be unreadable');
    expect(result.error.key).toBe('test-key');
    expect(result.error.reason).toBe('metadata_not_json');
    expect(result.error.detail.length).toBeGreaterThan(0);
  });

  it('reports well-formed metadata of the wrong shape (#5835)', () => {
    // The second edge: `JSON.parse` succeeds, so a parse-only guard passes it
    // through and the TypeError surfaces later, far from the corrupt row.
    for (const metadata of ['null', '[]', '"medium"', '{}', '{"importance":"urgent"}']) {
      const result = memoryRowToEntry(makeRow({ metadata }));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.reason).toBe('metadata_wrong_shape');
    }
  });

  it('does not treat every row as unreadable', () => {
    // Pair test: the guard above must fire on corrupt metadata only.
    const row = makeRow({ metadata: JSON.stringify({ importance: 'high', ttl: 1000 }) });
    expect(memoryRowToEntry(row).ok).toBe(true);
  });
});

// ============================================================================
// memoryExists
// ============================================================================

describe('memoryExists', () => {
  it('returns true when row exists', () => {
    const db = {
      prepare: () => ({
        get: () => ({ count: 1 }),
        all: () => [],
        run: () => ({ changes: 0 }),
      }),
      exec: () => undefined,
      close: () => undefined,
    } as unknown as ISQLiteDatabase;
    expect(memoryExists(db, 'my-key')).toBe(true);
  });

  it('returns false when count is 0', () => {
    const db = {
      prepare: () => ({
        get: () => ({ count: 0 }),
        all: () => [],
        run: () => ({ changes: 0 }),
      }),
      exec: () => undefined,
      close: () => undefined,
    } as unknown as ISQLiteDatabase;
    expect(memoryExists(db, 'missing')).toBe(false);
  });

  it('returns false when result is undefined', () => {
    const db = {
      prepare: () => ({
        get: () => undefined,
        all: () => [],
        run: () => ({ changes: 0 }),
      }),
      exec: () => undefined,
      close: () => undefined,
    } as unknown as ISQLiteDatabase;
    expect(memoryExists(db, 'missing')).toBe(false);
  });
});

// ============================================================================
// getMemoryEntry
// ============================================================================

describe('getMemoryEntry', () => {
  it('returns parsed entry when found', () => {
    const db = createMockDb(makeRow());
    const result = getMemoryEntry(db, 'test-key');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected the entry to be readable');
    expect(result.value.key).toBe('test-key');
    expect(result.value.value).toEqual({ data: 'hello' });
  });

  it('reports not_found when the key is absent', () => {
    const db = createMockDb(undefined);
    const result = getMemoryEntry(db, 'missing');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a lookup failure');
    expect(result.error.kind).toBe('not_found');
  });

  it('distinguishes a corrupt row from a missing one (#5835)', () => {
    // Both used to return `undefined`, so a caller could not tell a memory it
    // never stored apart from one it stored and can no longer read.
    const db = createMockDb(makeRow({ metadata: 'NOT_JSON' }));
    const result = getMemoryEntry(db, 'test-key');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a lookup failure');
    expect(result.error.kind).toBe('unreadable');
    if (result.error.kind !== 'unreadable') return;
    expect(result.error.unreadable.key).toBe('test-key');
  });
});

// ============================================================================
// getMemoryRow
// ============================================================================

describe('getMemoryRow', () => {
  it('returns raw row when found', () => {
    const row = makeRow();
    const db = createMockDb(row);
    const result = getMemoryRow(db, 'test-key');
    expect(result).toBe(row);
  });

  it('returns undefined when not found', () => {
    const db = createMockDb(undefined);
    expect(getMemoryRow(db, 'missing')).toBeUndefined();
  });
});

// ============================================================================
// getAllMemoryRows
// ============================================================================

describe('getAllMemoryRows', () => {
  it('returns all rows up to limit', () => {
    const rows = [makeRow({ key: 'a' }), makeRow({ key: 'b' })];
    const db = createMockDb(undefined, rows);
    const result = getAllMemoryRows(db, 10);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no rows', () => {
    const db = createMockDb(undefined, []);
    expect(getAllMemoryRows(db, 10)).toHaveLength(0);
  });
});
