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

// ============================================================================
// String Capitalization
// ============================================================================

/**
 * Capitalize the first character of a string.
 *
 * @param str - Input string
 * @returns String with first character uppercased
 * @example capitalize('hello') // 'Hello'
 */
export function capitalize(str: string): string {
  if (str.length === 0) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Capitalize the first character of each word in a string.
 *
 * @param str - Input string
 * @returns String with each word capitalized
 * @example capitalizeWords('hello world') // 'Hello World'
 */
export function capitalizeWords(str: string): string {
  return str
    .split(' ')
    .map((word) => capitalize(word))
    .join(' ');
}

/**
 * Convert a kebab-case string to Title Case.
 *
 * @param str - Kebab-case string
 * @returns Title Case string with hyphens replaced by spaces
 * @example capitalizeKebab('hello-world') // 'Hello World'
 */
export function capitalizeKebab(str: string): string {
  return str
    .split('-')
    .map((word) => capitalize(word))
    .join(' ');
}

// ============================================================================
// Text Truncation
// ============================================================================

/**
 * Truncate text to a maximum length with a suffix.
 *
 * @param text - Input text
 * @param maxLength - Maximum length including suffix
 * @param suffix - Suffix to append when truncated (default: '...')
 * @returns Truncated text with suffix if needed
 * @example truncateText('hello world', 8) // 'hello...'
 */
export function truncateText(text: string, maxLength: number, suffix = '...'): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Truncate text and include byte count information.
 * Commonly used for output truncation in CLI tools.
 *
 * @param text - Input text
 * @param maxLength - Maximum length before truncation marker
 * @returns Truncated text with byte count info
 * @example truncateWithInfo('hello world...', 5) // 'hello\n... [truncated 9 bytes]'
 */
export function truncateWithInfo(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncatedBytes = text.length - maxLength;
  return `${text.slice(0, maxLength)}\n... [truncated ${String(truncatedBytes)} bytes]`;
}

/**
 * Truncate to the first sentence or a maximum length.
 * Useful for extracting descriptions from longer text.
 *
 * @param text - Input text
 * @param maxLength - Maximum length (default: 150)
 * @returns First sentence or truncated text
 * @example truncateSentence('Hello world. More text.', 150) // 'Hello world.'
 */
export function truncateSentence(text: string, maxLength = 150): string {
  // Find first sentence ending
  const sentenceEnd = text.search(/[.!?](?:\s|$)/);
  if (sentenceEnd !== -1 && sentenceEnd < maxLength) {
    return text.slice(0, sentenceEnd + 1).trim();
  }
  // Fall back to truncation
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

// ============================================================================
// Line Splitting
// ============================================================================

/**
 * Split text into lines.
 * Handles both Unix (\n) and Windows (\r\n) line endings.
 *
 * @param text - Input text to split
 * @returns Array of lines (may include empty strings)
 * @example splitLines('a\nb\nc') // ['a', 'b', 'c']
 * @example splitLines('a\n\nb') // ['a', '', 'b']
 */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/**
 * Split text into non-empty lines.
 * Filters out empty lines and whitespace-only lines.
 *
 * @param text - Input text to split
 * @returns Array of non-empty lines
 * @example splitNonEmptyLines('a\n\nb\n  \nc') // ['a', 'b', 'c']
 */
export function splitNonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Split text into trimmed lines, preserving empty lines.
 * Trims each line but keeps empty lines in the output.
 *
 * @param text - Input text to split
 * @returns Array of trimmed lines
 * @example splitTrimmedLines('  a  \n\n  b  ') // ['a', '', 'b']
 */
export function splitTrimmedLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim());
}

// ============================================================================
// Sentence/Word Splitting
// ============================================================================

/**
 * Count the number of sentences in text.
 * Counts sentence-ending punctuation followed by space or end of string.
 *
 * @param text - Input text
 * @returns Number of sentences
 * @example countSentences('Hello world. How are you?') // 2
 */
export function countSentences(text: string): number {
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  return matches !== null ? matches.length : 0;
}

/**
 * Split text into sentences.
 * Splits on sentence-ending punctuation followed by space.
 *
 * @param text - Input text
 * @returns Array of sentences (trimmed)
 * @example splitSentences('Hello world. How are you?') // ['Hello world.', 'How are you?']
 */
export function splitSentences(text: string): string[] {
  // Split on sentence endings followed by space, keeping the punctuation
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Count the number of words in text.
 * Splits on whitespace and counts non-empty tokens.
 *
 * @param text - Input text
 * @returns Number of words
 * @example countWords('Hello world') // 2
 */
export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}
