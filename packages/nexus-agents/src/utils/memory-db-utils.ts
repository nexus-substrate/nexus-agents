/**
 * nexus-agents/utils - Memory Database Utilities
 *
 * Shared utility functions for memory database operations.
 * Consolidates duplicate code from multiple memory systems per ADR-0013.
 *
 * Used by:
 * - context/adaptive-memory-helpers.ts
 * - context/graph-memory-helpers.ts
 *
 * @module utils/memory-db-utils
 * @see docs/adr/0013-memory-helpers-consolidation.md
 */

import type { MemoryEntry, MemoryRow, ISQLiteDatabase } from '../context/memory-backend-types.js';

// ============================================================================
// Row Conversion
// ============================================================================

/**
 * Convert a database MemoryRow to a MemoryEntry.
 *
 * Parses JSON fields (value, metadata) and converts timestamps to Date objects.
 *
 * @param row - Database row from memories table
 * @returns Parsed MemoryEntry object
 */
export function memoryRowToEntry(row: MemoryRow): MemoryEntry {
  return {
    key: row.key,
    value: JSON.parse(row.value) as unknown,
    metadata: JSON.parse(row.metadata) as MemoryEntry['metadata'],
    createdAt: new Date(row.created_at),
    accessedAt: new Date(row.accessed_at),
  };
}

// ============================================================================
// Existence Check
// ============================================================================

/**
 * Check if a memory key exists in the database.
 *
 * @param db - SQLite database instance
 * @param key - Memory key to check
 * @returns true if key exists, false otherwise
 */
export function memoryExists(db: ISQLiteDatabase, key: string): boolean {
  const stmt = db.prepare<{ count: number }>(
    'SELECT COUNT(*) as count FROM memories WHERE key = ?'
  );
  const result = stmt.get(key);
  return result !== undefined && result.count > 0;
}

// ============================================================================
// Memory Retrieval
// ============================================================================

/**
 * Get a memory entry by key.
 *
 * @param db - SQLite database instance
 * @param key - Memory key to retrieve
 * @returns MemoryEntry if found, undefined otherwise
 */
export function getMemoryEntry(db: ISQLiteDatabase, key: string): MemoryEntry | undefined {
  const stmt = db.prepare<MemoryRow>('SELECT * FROM memories WHERE key = ?');
  const row = stmt.get(key);
  return row !== undefined ? memoryRowToEntry(row) : undefined;
}

/**
 * Get a single memory row by key.
 *
 * @param db - SQLite database instance
 * @param key - Memory key to retrieve
 * @returns MemoryRow if found, undefined otherwise
 */
export function getMemoryRow(db: ISQLiteDatabase, key: string): MemoryRow | undefined {
  const stmt = db.prepare<MemoryRow>('SELECT * FROM memories WHERE key = ?');
  return stmt.get(key);
}

/**
 * Get all memory rows from the database with limit.
 *
 * @param db - SQLite database instance
 * @param limit - Maximum number of rows to return
 * @returns Array of MemoryRow objects
 */
export function getAllMemoryRows(db: ISQLiteDatabase, limit: number): MemoryRow[] {
  const stmt = db.prepare<MemoryRow>('SELECT * FROM memories ORDER BY accessed_at DESC LIMIT ?');
  return stmt.all(limit);
}
