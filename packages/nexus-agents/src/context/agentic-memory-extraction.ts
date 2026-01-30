/**
 * Agentic Memory Extraction Helpers
 *
 * Attribute extraction functions for A-MEM.
 * Extracted to break circular dependency between agentic-memory-helpers
 * and agentic-memory-db-helpers.
 *
 * @module context/agentic-memory-extraction
 * (Source: Issue #392 - Circular dependency resolution)
 */

import { getTimeProvider } from '../core/index.js';
import type {
  MemoryAttributes,
  EntityReference,
  EntityType,
  ExtractionConfig,
} from './agentic-memory-types.js';

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
  'but',
  'they',
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
    attributesUpdatedAt: new Date(getTimeProvider().now()),
  };
}
