/**
 * Agentic Memory Helpers
 *
 * Helper functions for A-MEM attribute extraction.
 * Similarity/linking functions are in agentic-memory-linking.ts.
 *
 * Phase 1 uses rule-based extraction.
 * Phase 2 will add embeddings for semantic similarity.
 *
 * @module context/agentic-memory-helpers
 * (Source: Issue #122, arXiv:2502.12110)
 */

import type { MemoryRow, ISQLiteDatabase } from './memory-backend-types.js';
import type {
  MemoryAttributes,
  EntityReference,
  EntityType,
  ExtractionConfig,
  AgenticMemoryEntry,
} from './agentic-memory-types.js';
import { DEFAULT_EXTRACTION_CONFIG, DEFAULT_LINKING_CONFIG } from './agentic-memory-types.js';
import { memoryRowToEntry } from './adaptive-memory-helpers.js';

// Re-export similarity/linking functions for backward compatibility
export {
  calculateKeywordSimilarity,
  calculateEntitySimilarity,
  calculateOverallSimilarity,
  inferRelationType,
  generateLinkSuggestions,
  detectEvolutionPair,
  detectEvolution,
} from './agentic-memory-linking.js';

// ============================================================================
// Stopwords (common words to filter from keywords)
// ============================================================================

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'was',
  'were',
  'will',
  'with',
  'this',
  'they',
  'but',
  'have',
  'had',
  'what',
  'when',
  'where',
  'who',
  'which',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'can',
  'just',
  'should',
  'now',
  'i',
  'you',
  'we',
  'me',
  'my',
  'your',
  'our',
]);

// ============================================================================
// Tokenization
// ============================================================================

/**
 * Tokenize text into normalized words.
 * Removes punctuation, converts to lowercase, splits on whitespace.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Tokenize and filter stopwords.
 */
export function tokenizeFiltered(text: string): string[] {
  return tokenize(text).filter((t) => !STOPWORDS.has(t));
}

// ============================================================================
// Keyword Extraction (Rule-based)
// ============================================================================

/**
 * Extract keywords from text using TF-IDF-like frequency analysis.
 * Returns the most frequent significant words.
 */
export function extractKeywords(text: string, maxKeywords: number): string[] {
  const tokens = tokenizeFiltered(text);
  if (tokens.length === 0) return [];

  // Count frequencies
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }

  // Sort by frequency descending and take top
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

// ============================================================================
// Semantic Tag Extraction
// ============================================================================

const TAG_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  {
    pattern: /\b(function|class|method|interface|type|const|let|var|import|export)\b/i,
    tag: 'code',
  },
  { pattern: /\b(test|spec|expect|describe|it|assert|mock)\b/i, tag: 'testing' },
  { pattern: /\b(error|exception|bug|fix|issue|problem)\b/i, tag: 'debugging' },
  { pattern: /\b(api|endpoint|request|response|http|rest|graphql)\b/i, tag: 'api' },
  { pattern: /\b(database|sql|query|table|schema|migration)\b/i, tag: 'database' },
  { pattern: /\b(config|setting|option|parameter|environment)\b/i, tag: 'configuration' },
  { pattern: /\b(security|auth|token|permission|access|credential)\b/i, tag: 'security' },
  { pattern: /\b(performance|latency|throughput|optimize|cache)\b/i, tag: 'performance' },
  { pattern: /\b(deploy|release|pipeline|ci|cd|build)\b/i, tag: 'devops' },
  { pattern: /\b(documentation|readme|guide|tutorial|example)\b/i, tag: 'documentation' },
  { pattern: /\b(agent|workflow|task|orchestrate|delegate)\b/i, tag: 'agents' },
  { pattern: /\b(memory|context|recall|retrieve|store)\b/i, tag: 'memory' },
];

/**
 * Extract semantic tags by matching content against patterns.
 */
export function extractSemanticTags(text: string, maxTags: number): string[] {
  const matched: string[] = [];
  for (const { pattern, tag } of TAG_PATTERNS) {
    if (pattern.test(text)) {
      matched.push(tag);
      if (matched.length >= maxTags) break;
    }
  }
  return matched;
}

// ============================================================================
// Entity Extraction
// ============================================================================

const ENTITY_PATTERNS: Array<{ pattern: RegExp; type: EntityType }> = [
  { pattern: /(?:^|[\s'"(])((?:\.\/|\.\.\/|\/)[\w\-./]+\.\w+)/g, type: 'file' },
  { pattern: /(?:^|[\s'"(])([\w-]+\.(ts|js|tsx|jsx|py|go|rs|md|json|yaml|yml))/g, type: 'file' },
  { pattern: /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g, type: 'code' },
  { pattern: /\b([a-z]+_[a-z_]+)\b/g, type: 'code' },
  { pattern: /\b([A-Z][a-z]+(?: [A-Z][a-z]+)+)\b/g, type: 'concept' },
];

/**
 * Check if a string looks like PII (SSN, phone, email, etc.)
 */
function isPotentialPII(text: string): boolean {
  if (/^\d{3}-\d{2}-\d{4}$/.test(text)) return true; // SSN
  if (/^\d{3}[-.\s]?\d{3}[-.\s]?\d{4}$/.test(text)) return true; // Phone
  if (/^\+?\d{10,15}$/.test(text)) return true; // Intl phone
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(text)) return true; // Email
  if (/^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/.test(text)) return true; // CC
  return false;
}

/**
 * Extract entities from text using pattern matching.
 * PII filtering: excludes patterns that look like SSN, phone, email.
 */
export function extractEntities(text: string, maxEntities: number): EntityReference[] {
  const entities: EntityReference[] = [];
  const seen = new Set<string>();

  for (const { pattern, type } of ENTITY_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1];
      if (name === undefined) continue;
      if (seen.has(name.toLowerCase()) || name.length < 3) continue;
      if (isPotentialPII(name)) continue;

      seen.add(name.toLowerCase());
      entities.push({ name, type });
      if (entities.length >= maxEntities) break;
    }
    if (entities.length >= maxEntities) break;
  }
  return entities;
}

// ============================================================================
// Context Description Generation
// ============================================================================

/**
 * Generate a brief context description from text.
 */
export function generateContextDescription(text: string, maxLength: number): string {
  const firstSentence = text.match(/^[^.!?]+[.!?]/);
  if (firstSentence !== null && firstSentence[0].length <= maxLength) {
    return firstSentence[0].trim();
  }
  if (text.length <= maxLength) return text.trim();

  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    return truncated.slice(0, lastSpace).trim() + '...';
  }
  return truncated.trim() + '...';
}

// ============================================================================
// Attribute Extraction Pipeline
// ============================================================================

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

/**
 * Extract all A-MEM attributes from a value.
 */
export function extractAttributes(value: unknown, config: ExtractionConfig): MemoryAttributes {
  const text = stringifyValue(value);
  return {
    keywords: extractKeywords(text, config.maxKeywords),
    semanticTags: extractSemanticTags(text, config.maxSemanticTags),
    contextDescription: generateContextDescription(text, config.maxContextLength),
    entities: extractEntities(text, config.maxEntities),
    attributesUpdatedAt: new Date(),
  };
}

// ============================================================================
// Configuration Merging
// ============================================================================

/**
 * Merge partial extraction config with defaults.
 */
export function mergeExtractionConfig(partial?: Partial<ExtractionConfig>): ExtractionConfig {
  if (partial === undefined) return DEFAULT_EXTRACTION_CONFIG;
  return {
    maxKeywords: partial.maxKeywords ?? DEFAULT_EXTRACTION_CONFIG.maxKeywords,
    maxSemanticTags: partial.maxSemanticTags ?? DEFAULT_EXTRACTION_CONFIG.maxSemanticTags,
    maxContextLength: partial.maxContextLength ?? DEFAULT_EXTRACTION_CONFIG.maxContextLength,
    maxEntities: partial.maxEntities ?? DEFAULT_EXTRACTION_CONFIG.maxEntities,
  };
}

/**
 * Merge partial linking config with defaults.
 */
export function mergeLinkingConfig(
  partial?: Partial<import('./agentic-memory-types.js').LinkingConfig>
): import('./agentic-memory-types.js').LinkingConfig {
  if (partial === undefined) return DEFAULT_LINKING_CONFIG;
  return {
    suggestionThreshold: partial.suggestionThreshold ?? DEFAULT_LINKING_CONFIG.suggestionThreshold,
    maxSuggestions: partial.maxSuggestions ?? DEFAULT_LINKING_CONFIG.maxSuggestions,
    allowedTypes: partial.allowedTypes ?? DEFAULT_LINKING_CONFIG.allowedTypes,
  };
}

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
