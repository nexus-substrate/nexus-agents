/**
 * nexus-agents/context - Memory Operations
 *
 * Query and mutation operations for the hybrid memory backend.
 *
 * @module context/memory-operations
 */

import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { getTimeProvider } from '../core/index.js';
import type { ILogger } from '../core/logger.js';
import type {
  ISQLiteDatabase,
  MemoryEntry,
  MemoryMetadata,
  MemoryRow,
} from './memory-backend-types.js';
import { MemoryError } from './memory-backend-types.js';

/** Safely parse JSON from a DB column, returning null on corrupt data. */
function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Parse metadata JSON or return safe defaults for corrupt rows. */
function parseMetadataOrDefault(raw: string): MemoryMetadata {
  const parsed = safeParseJson(raw);
  if (parsed !== null && typeof parsed === 'object') return parsed as MemoryMetadata;
  return { importance: 'medium' };
}

/**
 * Converts a database row to a MemoryEntry.
 * Gracefully handles corrupt JSON in DB rows (#1680 quality scan).
 */
export function rowToEntry(row: MemoryRow): MemoryEntry {
  return {
    key: row.key,
    value: safeParseJson(row.value),
    metadata: parseMetadataOrDefault(row.metadata),
    createdAt: new Date(row.created_at),
    accessedAt: new Date(row.accessed_at),
  };
}

/** Bare words FTS5 reads as operators; dropped rather than required as terms. */
const FTS_OPERATOR_WORDS = new Set(['AND', 'OR', 'NOT', 'NEAR']);

/** A term the default `unicode61` tokenizer can index: at least one letter or digit. */
const HAS_TOKEN_CHAR = /[\p{L}\p{N}]/u;

/**
 * Builds an FTS5 MATCH expression from free-text user input (#6731).
 *
 * The single place a user query becomes MATCH syntax. Every whitespace-separated
 * term is emitted as an FTS5 string literal (`"term"`, embedded `"` doubled), so
 * no character in the input — `.`, `-`, `:`, `*`, `^`, `(`, `)`, `"` — can reach
 * the FTS5 query parser as syntax. A dotted term such as `8.104.8` becomes a
 * phrase of its tokens, which matches the same text in a stored memory.
 * Literals are joined by spaces: FTS5's implicit AND, as before.
 *
 * Bare `AND`/`OR`/`NOT`/`NEAR` (any case) and terms with no letter or digit are
 * dropped. Empty result means "no usable terms": callers return `[]` for it
 * rather than running MATCH.
 */
export function buildFtsMatchQuery(query: string): string {
  return query
    .split(/\s+/)
    .filter((term) => HAS_TOKEN_CHAR.test(term) && !FTS_OPERATOR_WORDS.has(term.toUpperCase()))
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(' ');
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
  const now = getTimeProvider().now();
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
    const result = stmt.run(getTimeProvider().now());
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
