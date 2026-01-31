/**
 * nexus-agents/utils - Text Processing Utilities
 *
 * Shared utility functions for text tokenization and processing.
 * Consolidates duplicate code from multiple modules per ADR-0013.
 *
 * Used by:
 * - context/agentic-memory-extraction.ts
 * - context/adaptive-memory-helpers.ts
 * - cli-adapters/daao-feature-extraction.ts
 * - cli-adapters/agreement-cascade-helpers.ts
 *
 * @module utils/text-utils
 * @see docs/adr/0013-memory-helpers-consolidation.md
 */

// ============================================================================
// Stopwords
// ============================================================================

/**
 * Common English stopwords to filter from keyword extraction.
 */
export const STOPWORDS = new Set([
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
  'their',
  'him',
  'her',
  'them',
  'his',
  'hers',
  'able',
]);

// ============================================================================
// Tokenization
// ============================================================================

/**
 * Tokenize text into normalized words.
 *
 * Process:
 * 1. Convert to lowercase
 * 2. Replace non-alphanumeric characters with spaces
 * 3. Split on whitespace
 * 4. Filter tokens by minimum length
 *
 * @param text - Input text to tokenize
 * @param minLength - Minimum token length (default: 2)
 * @returns Array of normalized tokens
 */
export function tokenize(text: string, minLength = 2): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= minLength);
}

/**
 * Tokenize text and return as a Set for fast lookups.
 *
 * @param text - Input text to tokenize
 * @param minLength - Minimum token length (default: 2)
 * @returns Set of normalized tokens
 */
export function tokenizeToSet(text: string, minLength = 2): Set<string> {
  return new Set(tokenize(text, minLength));
}

/**
 * Tokenize text with stopword filtering.
 *
 * @param text - Input text to tokenize
 * @param minLength - Minimum token length (default: 2)
 * @returns Array of tokens with stopwords removed
 */
export function tokenizeFiltered(text: string, minLength = 2): string[] {
  return tokenize(text, minLength).filter((t) => !STOPWORDS.has(t));
}

// ============================================================================
// Value Stringification
// ============================================================================

/**
 * Convert a value to string for text processing.
 *
 * @param value - Value to stringify
 * @returns String representation
 */
export function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}
