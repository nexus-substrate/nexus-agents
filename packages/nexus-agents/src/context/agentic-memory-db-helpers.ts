/**
 * Agentic Memory Database Helpers
 *
 * Database-related helper functions for A-MEM attribute storage and retrieval.
 *
 * @module context/agentic-memory-db-helpers
 * (Source: Issue #122, arXiv:2502.12110)
 */

import type { MemoryRow, ISQLiteDatabase } from './memory-backend-types.js';
import type {
  MemoryAttributes,
  ExtractionConfig,
  AgenticMemoryEntry,
} from './agentic-memory-types.js';
// Shared utilities per ADR-0013
import { memoryRowToEntry } from '../utils/memory-db-utils.js';
import { extractAttributes } from './agentic-memory-extraction.js';
import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'AgenticMemoryDbHelpers' });

// ============================================================================
// Database Helpers
// ============================================================================

/**
 * Safely extract MemoryAttributes from a raw amem record using type guards.
 * Returns null if the record shape is invalid.
 */
function safeExtractAttributes(amem: Record<string, unknown>): MemoryAttributes | null {
  if (!Array.isArray(amem.keywords) || amem.attributesUpdatedAt === undefined) return null;

  const updatedAt = amem.attributesUpdatedAt;
  if (typeof updatedAt !== 'number' && typeof updatedAt !== 'string') return null;

  return {
    keywords: amem.keywords.filter((k): k is string => typeof k === 'string'),
    semanticTags: Array.isArray(amem.semanticTags)
      ? amem.semanticTags.filter((t): t is string => typeof t === 'string')
      : [],
    contextDescription: typeof amem.contextDescription === 'string' ? amem.contextDescription : '',
    entities: Array.isArray(amem.entities) ? (amem.entities as MemoryAttributes['entities']) : [],
    attributesUpdatedAt: new Date(updatedAt),
  };
}

/**
 * Parse A-MEM attributes from memory metadata JSON.
 */
export function parseAmemAttributes(metadata: unknown): MemoryAttributes | null {
  if (typeof metadata !== 'object' || metadata === null) return null;

  const meta = metadata as Record<string, unknown>;
  if (meta.amem === undefined || typeof meta.amem !== 'object' || meta.amem === null) return null;

  return safeExtractAttributes(meta.amem as Record<string, unknown>);
}

/**
 * Convert MemoryRow to AgenticMemoryEntry.
 */
export function memoryRowToAgenticEntry(
  row: MemoryRow,
  extractionConfig: ExtractionConfig
): AgenticMemoryEntry {
  const baseEntry = memoryRowToEntry(row);

  let parsedMeta: Record<string, unknown> = {};
  try {
    parsedMeta = JSON.parse(row.metadata) as Record<string, unknown>;
  } catch {
    logger.warn('Corrupt metadata JSON in memory row, using fallback extraction', {
      key: row.key,
    });
  }

  const attributes =
    parseAmemAttributes(parsedMeta) ?? extractAttributes(baseEntry.value, extractionConfig);

  return { ...baseEntry, attributes };
}

/**
 * Search for memories with FTS and return with A-MEM attributes.
 */
export function searchWithAttributes(
  db: ISQLiteDatabase,
  query: string,
  limit: number,
  extractionConfig: ExtractionConfig
): AgenticMemoryEntry[] {
  const sanitized = query
    .replace(/[*()":^]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (sanitized.length === 0) return [];

  const stmt = db.prepare<MemoryRow>(`
    SELECT m.key, m.value, m.metadata, m.created_at, m.accessed_at, m.expires_at
    FROM memories m INNER JOIN memories_fts fts ON m.rowid = fts.rowid
    WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?
  `);

  const rows = stmt.all(sanitized, limit);
  return rows.map((row) => memoryRowToAgenticEntry(row, extractionConfig));
}

/**
 * Get a set of attribute values for comparison.
 */
export function getAttributeSet(
  attrs: MemoryAttributes,
  type: 'keywords' | 'semanticTags' | 'entities'
): Set<string> {
  switch (type) {
    case 'keywords':
      return new Set(attrs.keywords);
    case 'semanticTags':
      return new Set(attrs.semanticTags);
    case 'entities':
      return new Set(attrs.entities.map((e) => e.name.toLowerCase()));
  }
}

/**
 * Extract attributes from a memory row's metadata or value.
 */
export function getAttributesFromRow(
  row: MemoryRow,
  extractionConfig: ExtractionConfig
): MemoryAttributes {
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(row.metadata) as Record<string, unknown>;
  } catch {
    logger.warn('Corrupt metadata JSON in getAttributesFromRow, using value extraction', {
      key: row.key,
    });
  }

  if (meta.amem !== undefined && typeof meta.amem === 'object' && meta.amem !== null) {
    const parsed = safeExtractAttributes(meta.amem as Record<string, unknown>);
    if (parsed !== null) return parsed;
  }

  let parsedValue: unknown = row.value;
  try {
    parsedValue = JSON.parse(row.value);
  } catch {
    logger.warn('Corrupt value JSON in getAttributesFromRow, using raw string', {
      key: row.key,
    });
  }

  return extractAttributes(parsedValue, extractionConfig);
}

/**
 * Find memories with overlapping attributes.
 */
export function findMatchingMemories(
  rows: MemoryRow[],
  sourceSet: Set<string>,
  attributeType: 'keywords' | 'semanticTags' | 'entities',
  extractionConfig: ExtractionConfig
): Array<{ entry: AgenticMemoryEntry; overlap: number }> {
  const matches: Array<{ entry: AgenticMemoryEntry; overlap: number }> = [];
  for (const row of rows) {
    const attrs = getAttributesFromRow(row, extractionConfig);
    const targetSet = getAttributeSet(attrs, attributeType);
    let overlap = 0;
    for (const item of sourceSet) if (targetSet.has(item)) overlap++;
    if (overlap > 0)
      matches.push({ entry: memoryRowToAgenticEntry(row, extractionConfig), overlap });
  }
  matches.sort((a, b) => b.overlap - a.overlap);
  return matches;
}
