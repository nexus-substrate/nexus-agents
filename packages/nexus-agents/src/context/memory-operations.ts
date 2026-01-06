/**
 * nexus-agents/context - Memory Operations
 *
 * Query and mutation operations for the hybrid memory backend.
 *
 * @module context/memory-operations
 */

import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import type { ILogger } from '../core/logger.js';
import type {
  ISQLiteDatabase,
  MemoryEntry,
  MemoryMetadata,
  MemoryRow,
} from './memory-backend-types.js';
import { MemoryError } from './memory-backend-types.js';

/**
 * Converts a database row to a MemoryEntry.
 */
export function rowToEntry(row: MemoryRow): MemoryEntry {
  return {
    key: row.key,
    value: JSON.parse(row.value) as unknown,
    metadata: JSON.parse(row.metadata) as MemoryMetadata,
    createdAt: new Date(row.created_at),
    accessedAt: new Date(row.accessed_at),
  };
}

/**
 * Sanitizes a query string for FTS5.
 * Removes special FTS5 operators to prevent injection.
 */
export function sanitizeFtsQuery(query: string): string {
  return query
    .replace(/[*:^"(){}[\]]/g, ' ')
    .replace(/\bAND\b/gi, ' ')
    .replace(/\bOR\b/gi, ' ')
    .replace(/\bNOT\b/gi, ' ')
    .replace(/\bNEAR\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cleans up expired entries from the results.
 */
export function cleanupExpiredEntries(
  rows: MemoryRow[],
  database: ISQLiteDatabase,
  autoExpire: boolean,
  logger: ILogger
): { entries: MemoryEntry[]; expiredCount: number } {
  const now = Date.now();
  const entries: MemoryEntry[] = [];
  const expiredKeys: string[] = [];

  for (const row of rows) {
    if (autoExpire && row.expires_at !== null && row.expires_at < now) {
      expiredKeys.push(row.key);
      continue;
    }
    entries.push(rowToEntry(row));
  }

  if (expiredKeys.length > 0) {
    const deleteStmt = database.prepare(
      `DELETE FROM memories WHERE key IN (${expiredKeys.map(() => '?').join(',')})`
    );
    deleteStmt.run(...expiredKeys);
    logger.debug('Auto-expired memories', { count: expiredKeys.length });
  }

  return { entries, expiredCount: expiredKeys.length };
}

/**
 * Executes a search query against FTS5.
 */
export function executeSearch(
  database: ISQLiteDatabase,
  sanitizedQuery: string,
  limit: number,
  autoExpire: boolean,
  logger: ILogger
): Result<MemoryEntry[], MemoryError> {
  try {
    const stmt = database.prepare<MemoryRow>(`
      SELECT m.key, m.value, m.metadata, m.created_at, m.accessed_at, m.expires_at
      FROM memories m
      INNER JOIN memories_fts fts ON m.rowid = fts.rowid
      WHERE memories_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    const rows = stmt.all(sanitizedQuery, limit);
    const { entries } = cleanupExpiredEntries(rows, database, autoExpire, logger);

    return ok(entries);
  } catch (error) {
    const causeError = error instanceof Error ? error : new Error(String(error));
    return err(new MemoryError('Failed to execute search', { cause: causeError }));
  }
}

/**
 * Retrieves all memories with pagination.
 */
export function getAllMemories(
  database: ISQLiteDatabase,
  limit: number,
  autoExpire: boolean,
  logger: ILogger
): Result<MemoryEntry[], MemoryError> {
  try {
    const stmt = database.prepare<MemoryRow>(`
      SELECT key, value, metadata, created_at, accessed_at, expires_at
      FROM memories ORDER BY accessed_at DESC LIMIT ?
    `);

    const rows = stmt.all(limit);
    const { entries } = cleanupExpiredEntries(rows, database, autoExpire, logger);

    return ok(entries);
  } catch (error) {
    const causeError = error instanceof Error ? error : new Error(String(error));
    return err(new MemoryError('Failed to get all memories', { cause: causeError }));
  }
}

/**
 * Counts total memories in the database.
 */
export function countMemories(database: ISQLiteDatabase): Result<number, MemoryError> {
  try {
    const stmt = database.prepare<{ count: number }>('SELECT COUNT(*) as count FROM memories');
    const row = stmt.get();
    return ok(row?.count ?? 0);
  } catch (error) {
    const causeError = error instanceof Error ? error : new Error(String(error));
    return err(new MemoryError('Failed to count memories', { cause: causeError }));
  }
}

/**
 * Expires all entries that have passed their TTL.
 */
export function expireAllEntries(
  database: ISQLiteDatabase,
  logger: ILogger
): Result<number, MemoryError> {
  try {
    const stmt = database.prepare(
      'DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < ?'
    );
    const result = stmt.run(Date.now());
    logger.info('Expired memories', { count: result.changes });
    return ok(result.changes);
  } catch (error) {
    const causeError = error instanceof Error ? error : new Error(String(error));
    return err(new MemoryError('Failed to expire memories', { cause: causeError }));
  }
}

/**
 * Prunes entries older than the specified date.
 */
export function pruneOldEntries(
  database: ISQLiteDatabase,
  olderThan: Date,
  logger: ILogger
): Result<number, MemoryError> {
  try {
    const stmt = database.prepare('DELETE FROM memories WHERE created_at < ?');
    const result = stmt.run(olderThan.getTime());
    logger.info('Pruned old memories', {
      olderThan: olderThan.toISOString(),
      count: result.changes,
    });
    return ok(result.changes);
  } catch (error) {
    const causeError = error instanceof Error ? error : new Error(String(error));
    return err(
      new MemoryError('Failed to prune memories', {
        cause: causeError,
        context: { olderThan: olderThan.toISOString() },
      })
    );
  }
}
