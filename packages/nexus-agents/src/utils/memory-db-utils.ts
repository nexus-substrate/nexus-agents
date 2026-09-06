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

import {
  type MemoryEntry,
  type MemoryMetadata,
  type MemoryRow,
  type ISQLiteDatabase,
  MemoryMetadataSchema,
} from '../context/memory-backend-types.js';
import { createLogger } from '../core/index.js';
import { type Result, ok, err } from '../core/result.js';

const logger = createLogger({ component: 'MemoryDbUtils' });

// ============================================================================
// Row Conversion
// ============================================================================

/**
 * Safely parse JSON, returning fallback on corrupt data instead of throwing.
 */
function safeJsonParse<T>(json: string, fallback: T, context: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    logger.warn('Corrupt JSON in memory database row', { context });
    return fallback;
  }
}

/** A row that exists but cannot be read as a typed entry. */
export interface UnreadableMemoryRow {
  readonly key: string;
  /**
   * Why the row could not be read back as a typed {@link MemoryEntry}.
   *
   * - `metadata_not_json` — the metadata column is not parseable JSON.
   * - `metadata_wrong_shape` — it parses, but is not a `MemoryMetadata`
   *   (`null`, an array, a missing/unknown `importance`, and so on).
   */
  readonly reason: 'metadata_not_json' | 'metadata_wrong_shape';
  /** Parser or schema message, for the log line and the error context. */
  readonly detail: string;
}

/** Outcome of a keyed lookup: the two failures the old `undefined` conflated. */
export type MemoryLookupFailure =
  | { readonly kind: 'not_found'; readonly key: string }
  | { readonly kind: 'unreadable'; readonly unreadable: UnreadableMemoryRow };

/**
 * Validate the metadata column against {@link MemoryMetadataSchema}.
 *
 * Validation is `loose` on purpose: unknown keys (A-MEM attributes, for one)
 * are preserved rather than stripped. Stripping them would swap one silent
 * misrepresentation for another.
 */
function parseMetadata(row: MemoryRow): Result<MemoryMetadata, UnreadableMemoryRow> {
  let raw: unknown;
  try {
    raw = JSON.parse(row.metadata);
  } catch (error) {
    return err({
      key: row.key,
      reason: 'metadata_not_json',
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const parsed = MemoryMetadataSchema.loose().safeParse(raw);
  if (!parsed.success) {
    return err({
      key: row.key,
      reason: 'metadata_wrong_shape',
      detail: parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; '),
    });
  }
  // Rebuild under exactOptionalPropertyTypes: `tags?: string[]` does not accept
  // `string[] | undefined`. `rest` carries the loose keys through untouched.
  const { importance, tags, ttl, ...rest } = parsed.data;
  const metadata: MemoryMetadata = {
    ...rest,
    importance,
    ...(tags !== undefined && { tags }),
    ...(ttl !== undefined && { ttl }),
  };
  return ok(metadata);
}

/**
 * Convert a database MemoryRow to a MemoryEntry.
 *
 * Parses JSON fields (value, metadata) and converts timestamps to Date objects.
 * A corrupt or wrong-shaped metadata column makes the row **unreadable** — the
 * function reports it rather than substituting an importance the writer never
 * chose. Fabricating `MEDIUM` made a memory stored as `HIGH` fail a `HIGH`
 * filter with nothing in the record to say why (#5835).
 *
 * The value column keeps its fallback: a value that is not JSON is a plain
 * string, which is a faithful reading of what was stored.
 *
 * @param row - Database row from memories table
 * @returns The parsed entry, or the reason the row cannot be read
 */
export function memoryRowToEntry(row: MemoryRow): Result<MemoryEntry, UnreadableMemoryRow> {
  const metadata = parseMetadata(row);
  if (!metadata.ok) {
    logger.warn('Unreadable metadata in memory database row', {
      key: row.key,
      reason: metadata.error.reason,
      detail: metadata.error.detail,
    });
    return metadata;
  }

  return ok({
    key: row.key,
    value: safeJsonParse<unknown>(row.value, row.value, `value for key="${row.key}"`),
    metadata: metadata.value,
    createdAt: new Date(row.created_at),
    accessedAt: new Date(row.accessed_at),
  });
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
 * @returns The entry, or whether it was absent versus present-but-unreadable
 */
export function getMemoryEntry(
  db: ISQLiteDatabase,
  key: string
): Result<MemoryEntry, MemoryLookupFailure> {
  const stmt = db.prepare<MemoryRow>('SELECT * FROM memories WHERE key = ?');
  const row = stmt.get(key);
  if (row === undefined) return err({ kind: 'not_found', key });

  const entry = memoryRowToEntry(row);
  if (!entry.ok) return err({ kind: 'unreadable', unreadable: entry.error });
  return entry;
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
