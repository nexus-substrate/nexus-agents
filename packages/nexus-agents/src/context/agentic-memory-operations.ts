/**
 * Agentic Memory Database Operations
 *
 * Pure database operation helpers for AgenticMemoryBackend.
 * These functions take database instances as parameters to avoid
 * class state dependencies.
 *
 * @module context/agentic-memory-operations
 * (Source: Issue #122, arXiv:2502.12110)
 */

import { getTimeProvider } from '../core/index.js';
import type { ISQLiteDatabase, MemoryRow, MemoryMetadata } from './memory-backend-types.js';
import type {
  MemoryAttributes,
  ExtractionConfig,
  AgenticMemoryEntry,
  LinkSuggestion,
} from './agentic-memory-types.js';
import { getAttributesFromRow, memoryRowToAgenticEntry } from './agentic-memory-db-helpers.js';
import { GraphMemoryBackend } from './graph-memory.js';

// ============================================================================
// Database Query Operations
// ============================================================================

/**
 * Query existing memories for analysis, excluding a specific key.
 * Returns memories with their attributes for linking and evolution detection.
 */
export function queryMemoriesForAnalysis(
  db: ISQLiteDatabase,
  excludeKey: string,
  extractionConfig: ExtractionConfig,
  limit = 100
): Array<{ key: string; attrs: MemoryAttributes; createdAt: Date }> {
  const rows = db
    .prepare<MemoryRow>('SELECT * FROM memories WHERE key != ? ORDER BY accessed_at DESC LIMIT ?')
    .all(excludeKey, limit);
  return rows.map((row) => ({
    key: row.key,
    attrs: getAttributesFromRow(row, extractionConfig),
    createdAt: new Date(row.created_at),
  }));
}

/**
 * Query a single memory by key.
 */
export function queryMemoryByKey(db: ISQLiteDatabase, key: string): MemoryRow | undefined {
  return db.prepare<MemoryRow>('SELECT * FROM memories WHERE key = ?').get(key);
}

/**
 * Query candidate memories for link suggestions.
 */
export function queryCandidateMemories(
  db: ISQLiteDatabase,
  excludeKey: string,
  extractionConfig: ExtractionConfig,
  limit = 100
): Array<{ key: string; attrs: MemoryAttributes; createdAt: Date }> {
  const rows = db
    .prepare<MemoryRow>('SELECT * FROM memories WHERE key != ? ORDER BY accessed_at DESC LIMIT ?')
    .all(excludeKey, limit);
  return rows.map((row) => ({
    key: row.key,
    attrs: getAttributesFromRow(row, extractionConfig),
    createdAt: new Date(row.created_at),
  }));
}

/**
 * Query memories for evolution detection.
 */
export function queryMemoriesForEvolution(
  db: ISQLiteDatabase,
  excludeKey: string,
  extractionConfig: ExtractionConfig,
  limit = 50
): Array<{ key: string; attrs: MemoryAttributes; createdAt: Date }> {
  const rows = db
    .prepare<MemoryRow>('SELECT * FROM memories WHERE key != ? ORDER BY created_at DESC LIMIT ?')
    .all(excludeKey, limit);
  return rows.map((row) => ({
    key: row.key,
    attrs: getAttributesFromRow(row, extractionConfig),
    createdAt: new Date(row.created_at),
  }));
}

/**
 * Query all memories except one for attribute matching.
 */
export function queryAllMemoriesExcept(
  db: ISQLiteDatabase,
  excludeKey: string,
  limit = 200
): MemoryRow[] {
  return db
    .prepare<MemoryRow>('SELECT * FROM memories WHERE key != ? ORDER BY accessed_at DESC LIMIT ?')
    .all(excludeKey, limit);
}

/**
 * Update memory metadata with refreshed attributes.
 */
export function updateMemoryMetadata(
  db: ISQLiteDatabase,
  key: string,
  metadata: Record<string, unknown>
): void {
  db.prepare('UPDATE memories SET metadata = ? WHERE key = ?').run(JSON.stringify(metadata), key);
}

// ============================================================================
// Graph Relationship Operations
// ============================================================================

/**
 * Apply link suggestions to the graph backend.
 * Returns the number of links successfully created.
 */
export async function applyLinkSuggestions(
  graph: GraphMemoryBackend,
  suggestions: LinkSuggestion[],
  bidirectional: boolean
): Promise<number> {
  let count = 0;
  for (const s of suggestions) {
    const result = await graph.addRelationship(s.from, s.to, s.relationType, {
      weight: s.confidence,
      metadata: { reason: s.reason },
    });
    if (!result.ok) continue;
    count++;
    if (bidirectional) {
      await graph.addRelationship(s.to, s.from, s.relationType, {
        weight: s.confidence,
        metadata: { reason: s.reason },
      });
    }
  }
  return count;
}

// ============================================================================
// Attribute Refresh Operations
// ============================================================================

/**
 * Prepare updated metadata with refreshed attributes.
 */
export function prepareRefreshedMetadata(
  currentMeta: Record<string, unknown>,
  attributes: MemoryAttributes
): Record<string, unknown> {
  return {
    ...currentMeta,
    amem: { ...attributes, attributesUpdatedAt: getTimeProvider().now() },
  };
}

// ============================================================================
// Entry Conversion Operations
// ============================================================================

/**
 * Convert memory row to agentic entry with attributes.
 * Re-exported for convenience.
 */
export { memoryRowToAgenticEntry, getAttributesFromRow };

/**
 * Build agentic memory entry from components.
 */
export function buildAgenticEntry(
  key: string,
  value: unknown,
  metadata: MemoryMetadata,
  attributes: MemoryAttributes,
  createdAt: Date
): AgenticMemoryEntry {
  return {
    key,
    value,
    metadata,
    createdAt,
    accessedAt: createdAt,
    attributes,
  };
}
