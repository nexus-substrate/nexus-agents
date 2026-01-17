/**
 * Safe RegExp Utilities
 *
 * Provides safe regex operations to prevent ReDoS (Regular Expression
 * Denial of Service) attacks. All dynamic regex construction should
 * use these utilities.
 *
 * (Source: Issue #341, CODING_STANDARDS.md Section 7)
 *
 * @module core/safe-regex
 */

import type { Result } from './result.js';
import { ok, err, isErr } from './result.js';

/**
 * Maximum allowed pattern length to prevent memory issues.
 */
export const MAX_PATTERN_LENGTH = 500;

/**
 * Characters that are dangerous in regex patterns and need escaping.
 */
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

/**
 * Patterns that indicate potentially dangerous regex (ReDoS prone).
 * These patterns can cause catastrophic backtracking.
 *
 * ReDoS occurs when regex has:
 * - Nested quantifiers: (a+)+, (a*)*
 * - Overlapping alternations with quantifiers
 * - Repetitive groupings followed by similar patterns
 */
const DANGEROUS_PATTERNS = [
  /\([^)]*[+*]\)[+*]/, // Nested quantifiers: (a+)+, (a*)+, (ab+)*, etc.
  /\(\?(?!:|\))/, // Lookahead/behind (allow non-capturing groups (?:) and (?))
  /([+*]){2,}/, // Multiple adjacent quantifiers: a++, a**
  /\.\*\.\*/, // Multiple .* patterns in sequence
  /\.\+\.\+/, // Multiple .+ patterns in sequence
];

/**
 * Error thrown when regex validation fails.
 */
export class SafeRegexError extends Error {
  constructor(
    message: string,
    public readonly pattern: string,
    public readonly reason: 'invalid' | 'too_long' | 'dangerous'
  ) {
    super(message);
    this.name = 'SafeRegexError';
  }
}

/**
 * Escape special regex characters in a string.
 * Use this when you need to match a literal string.
 *
 * @param str - The string to escape
 * @returns The escaped string safe for use in RegExp
 *
 * @example
 * ```typescript
 * const literal = escapeRegex('file.txt'); // 'file\\.txt'
 * const regex = new RegExp(literal);
 * ```
 */
export function escapeRegex(str: string): string {
  return str.replace(REGEX_SPECIAL_CHARS, '\\$&');
}

/**
 * Validate that a regex pattern is safe to compile.
 *
 * @param pattern - The regex pattern string to validate
 * @returns Result with void on success, SafeRegexError on failure
 */
export function validatePattern(pattern: string): Result<void, SafeRegexError> {
  // Check length
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return err(
      new SafeRegexError(
        `Pattern exceeds maximum length of ${String(MAX_PATTERN_LENGTH)}`,
        pattern,
        'too_long'
      )
    );
  }

  // Check for dangerous patterns
  for (const dangerous of DANGEROUS_PATTERNS) {
    if (dangerous.test(pattern)) {
      return err(
        new SafeRegexError(
          'Pattern contains potentially dangerous constructs that may cause ReDoS',
          pattern,
          'dangerous'
        )
      );
    }
  }

  // Try to compile to catch syntax errors
  try {
    new RegExp(pattern);
  } catch {
    return err(new SafeRegexError('Invalid regex pattern', pattern, 'invalid'));
  }

  return ok(undefined);
}

/**
 * Safely create a RegExp from a pattern string.
 * Validates the pattern before compilation to prevent ReDoS.
 *
 * @param pattern - The regex pattern string
 * @param flags - Optional regex flags
 * @returns Result with RegExp on success, SafeRegexError on failure
 *
 * @example
 * ```typescript
 * const result = safeRegex('error:\\s+(\\w+)', 'gi');
 * if (result.ok) {
 *   const matches = text.match(result.value);
 * }
 * ```
 */
export function safeRegex(pattern: string, flags?: string): Result<RegExp, SafeRegexError> {
  const validation = validatePattern(pattern);
  if (isErr(validation)) {
    return err(validation.error);
  }

  try {
    return ok(new RegExp(pattern, flags));
  } catch {
    return err(new SafeRegexError('Failed to compile regex pattern', pattern, 'invalid'));
  }
}

/**
 * Create a RegExp that matches a literal string (escaped).
 * Safe for any input since all special characters are escaped.
 *
 * @param literal - The literal string to match
 * @param flags - Optional regex flags
 * @returns RegExp that matches the literal string
 *
 * @example
 * ```typescript
 * const regex = literalRegex('file.txt', 'i');
 * regex.test('file.txt'); // true
 * regex.test('filextxt'); // false
 * ```
 */
export function literalRegex(literal: string, flags?: string): RegExp {
  return new RegExp(escapeRegex(literal), flags);
}

/**
 * Test if a pattern matches text, with safety validation.
 *
 * @param text - The text to test
 * @param pattern - The regex pattern
 * @param flags - Optional regex flags
 * @returns True if pattern matches, false otherwise (including on invalid pattern)
 */
export function safeTest(text: string, pattern: string, flags?: string): boolean {
  const result = safeRegex(pattern, flags);
  if (!result.ok) {
    return false;
  }
  return result.value.test(text);
}

/**
 * Match text against a pattern with safety validation.
 *
 * @param text - The text to match
 * @param pattern - The regex pattern
 * @param flags - Optional regex flags
 * @returns Match array or null (null on invalid pattern)
 */
export function safeMatch(text: string, pattern: string, flags?: string): RegExpMatchArray | null {
  const result = safeRegex(pattern, flags);
  if (!result.ok) {
    return null;
  }
  return text.match(result.value);
}

/**
 * Replace text using a pattern with safety validation.
 *
 * @param text - The text to transform
 * @param pattern - The regex pattern
 * @param replacement - The replacement string
 * @param flags - Optional regex flags
 * @returns Result with transformed string or SafeRegexError
 */
export function safeReplace(
  text: string,
  pattern: string,
  replacement: string,
  flags?: string
): Result<string, SafeRegexError> {
  const result = safeRegex(pattern, flags);
  if (isErr(result)) {
    return err(result.error);
  }
  return ok(text.replace(result.value, replacement));
}
