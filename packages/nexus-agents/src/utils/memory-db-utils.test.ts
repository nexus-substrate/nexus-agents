/**
 * Tests for Memory Database Utilities
 * @module utils/memory-db-utils.test
 */

import { describe, it, expect } from 'vitest';
import type { MemoryRow, ISQLiteDatabase } from '../context/memory-backend-types.js';
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
  it('converts row to entry with parsed value', () => {
    const entry = memoryRowToEntry(makeRow());
    expect(entry.key).toBe('test-key');
    expect(entry.value).toEqual({ data: 'hello' });
  });

  it('parses metadata JSON', () => {
    const entry = memoryRowToEntry(makeRow());
    expect(entry.metadata).toEqual({ importance: 'medium' });
  });

  it('converts timestamps to Date objects', () => {
    const entry = memoryRowToEntry(makeRow());
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(entry.accessedAt).toBeInstanceOf(Date);
    expect(entry.createdAt.getTime()).toBe(1700000000000);
    expect(entry.accessedAt.getTime()).toBe(1700000001000);
  });

  it('handles complex value types', () => {
    const row = makeRow({ value: JSON.stringify([1, 2, 3]) });
    const entry = memoryRowToEntry(row);
    expect(entry.value).toEqual([1, 2, 3]);
  });

  it('handles metadata with tags', () => {
    const metadata = { importance: 'high', tags: ['a', 'b'] };
    const row = makeRow({ metadata: JSON.stringify(metadata) });
    const entry = memoryRowToEntry(row);
    expect(entry.metadata).toEqual(metadata);
  });

  it('handles corrupt value JSON gracefully (#1187)', () => {
    const row = makeRow({ value: '{broken json' });
    const entry = memoryRowToEntry(row);
    expect(entry.key).toBe('test-key');
    expect(entry.value).toBe('{broken json');
  });

  it('handles corrupt metadata JSON gracefully (#1187)', () => {
    const row = makeRow({ metadata: 'NOT_JSON' });
    const entry = memoryRowToEntry(row);
    expect(entry.key).toBe('test-key');
    expect(entry.metadata.importance).toBe('medium');
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
    const entry = getMemoryEntry(db, 'test-key');
    expect(entry).toBeDefined();
    expect(entry?.key).toBe('test-key');
    expect(entry?.value).toEqual({ data: 'hello' });
  });

  it('returns undefined when not found', () => {
    const db = createMockDb(undefined);
    expect(getMemoryEntry(db, 'missing')).toBeUndefined();
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
