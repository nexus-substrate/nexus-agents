/**
 * Agentic Memory Database Helpers
 *
 * Database-related helper functions for A-MEM attribute storage and retrieval.
 * Extracted from agentic-memory-helpers.ts for file size compliance.
 *
 * @module context/agentic-memory-db-helpers
 * (Source: Issue #122, arXiv:2502.12110)
 */

import type { MemoryRow, ISQLiteDatabase } from './memory-backend-types.js';
import type {
  MemoryAttributes,
  EntityReference,
  ExtractionConfig,
  AgenticMemoryEntry,
} from './agentic-memory-types.js';
import { memoryRowToEntry } from './adaptive-memory-helpers.js';
import { extractAttributes } from './agentic-memory-helpers.js';

// ============================================================================
// Database Helpers
// ============================================================================

/**
 * Parse A-MEM attributes from memory metadata JSON.
 */
export function parseAmemAttributes(metadata: unknown): MemoryAttributes | null {
  if (typeof metadata !== 'object' || metadata === null) return null;

  const meta = metadata as Record<string, unknown>;
  if (meta.amem === undefined) return null;

  const amem = meta.amem as Record<string, unknown>;
  if (amem.keywords === undefined || amem.attributesUpdatedAt === undefined) return null;

  return {
    keywords: amem.keywords as string[],
    semanticTags: amem.semanticTags as string[],
    contextDescription: amem.contextDescription as string,
    entities: amem.entities as EntityReference[],
    attributesUpdatedAt: new Date(amem.attributesUpdatedAt as number),
  };
}

/**
 * Convert MemoryRow to AgenticMemoryEntry.
 */
export function memoryRowToAgenticEntry(
  row: MemoryRow,
  extractionConfig: ExtractionConfig
): AgenticMemoryEntry {
  const baseEntry = memoryRowToEntry(row);
  const parsedMeta = JSON.parse(row.metadata) as Record<string, unknown>;
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
  const meta = JSON.parse(row.metadata) as Record<string, unknown>;
  if (meta.amem !== undefined) {
    const amem = meta.amem as Record<string, unknown>;
    return {
      keywords: amem.keywords as string[],
      semanticTags: amem.semanticTags as string[],
      contextDescription: amem.contextDescription as string,
      entities: amem.entities as MemoryAttributes['entities'],
      attributesUpdatedAt: new Date(amem.attributesUpdatedAt as number),
    };
  }
  return extractAttributes(JSON.parse(row.value) as unknown, extractionConfig);
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
