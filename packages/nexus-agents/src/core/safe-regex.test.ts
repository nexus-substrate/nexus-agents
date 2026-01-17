/**
 * Safe RegExp Utilities Tests
 *
 * Tests for ReDoS prevention utilities.
 * (Source: Issue #341, CODING_STANDARDS.md Section 7)
 */

import { describe, it, expect } from 'vitest';
import {
  escapeRegex,
  validatePattern,
  safeRegex,
  literalRegex,
  safeTest,
  safeMatch,
  safeReplace,
  SafeRegexError,
  MAX_PATTERN_LENGTH,
} from './safe-regex.js';
import { isErr, isOk } from './result.js';

describe('escapeRegex', () => {
  it('escapes special regex characters', () => {
    expect(escapeRegex('file.txt')).toBe('file\\.txt');
    expect(escapeRegex('foo[bar]')).toBe('foo\\[bar\\]');
    expect(escapeRegex('a+b*c?')).toBe('a\\+b\\*c\\?');
    expect(escapeRegex('$100')).toBe('\\$100');
    expect(escapeRegex('^start')).toBe('\\^start');
    expect(escapeRegex('end$')).toBe('end\\$');
    expect(escapeRegex('a|b')).toBe('a\\|b');
    expect(escapeRegex('(group)')).toBe('\\(group\\)');
    expect(escapeRegex('{1,2}')).toBe('\\{1,2\\}');
  });

  it('leaves safe characters unchanged', () => {
    expect(escapeRegex('hello')).toBe('hello');
    expect(escapeRegex('test123')).toBe('test123');
    expect(escapeRegex('foo-bar_baz')).toBe('foo-bar_baz');
  });

  it('handles empty string', () => {
    expect(escapeRegex('')).toBe('');
  });
});

describe('validatePattern', () => {
  it('accepts valid patterns', () => {
    expect(isOk(validatePattern('hello'))).toBe(true);
    expect(isOk(validatePattern('\\d+'))).toBe(true);
    expect(isOk(validatePattern('[a-z]+'))).toBe(true);
    expect(isOk(validatePattern('(?:non-capturing)'))).toBe(true);
  });

  it('rejects patterns that are too long', () => {
    const longPattern = 'a'.repeat(MAX_PATTERN_LENGTH + 1);
    const result = validatePattern(longPattern);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.reason).toBe('too_long');
    }
  });

  it('rejects nested quantifiers (ReDoS prone)', () => {
    const result = validatePattern('(a+)+');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.reason).toBe('dangerous');
    }
  });

  it('rejects (.*)+  pattern (ReDoS prone)', () => {
    const result = validatePattern('(.*)+');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.reason).toBe('dangerous');
    }
  });

  it('rejects invalid regex syntax', () => {
    const result = validatePattern('[unclosed');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.reason).toBe('invalid');
    }
  });

  it('allows non-capturing groups', () => {
    expect(isOk(validatePattern('(?:foo)'))).toBe(true);
    expect(isOk(validatePattern('(?:a|b)+'))).toBe(true);
  });
});

describe('safeRegex', () => {
  it('creates regex for valid patterns', () => {
    const result = safeRegex('hello', 'i');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.test('Hello')).toBe(true);
      expect(result.value.test('world')).toBe(false);
    }
  });

  it('returns error for dangerous patterns', () => {
    const result = safeRegex('(a+)+');
    expect(isErr(result)).toBe(true);
  });

  it('returns error for invalid patterns', () => {
    const result = safeRegex('[invalid');
    expect(isErr(result)).toBe(true);
  });

  it('applies flags correctly', () => {
    const result = safeRegex('test', 'gi');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.flags).toBe('gi');
    }
  });
});

describe('literalRegex', () => {
  it('matches literal strings with special characters', () => {
    const regex = literalRegex('file.txt');
    expect(regex.test('file.txt')).toBe(true);
    expect(regex.test('filextxt')).toBe(false);
  });

  it('handles regex special characters safely', () => {
    const regex = literalRegex('(a+b)*');
    expect(regex.test('(a+b)*')).toBe(true);
    expect(regex.test('aaab')).toBe(false);
  });

  it('applies flags correctly', () => {
    const regex = literalRegex('TEST', 'i');
    expect(regex.test('test')).toBe(true);
    expect(regex.test('TEST')).toBe(true);
  });
});

describe('safeTest', () => {
  it('returns true for matching patterns', () => {
    expect(safeTest('hello world', 'world')).toBe(true);
    expect(safeTest('test123', '\\d+')).toBe(true);
  });

  it('returns false for non-matching patterns', () => {
    expect(safeTest('hello', 'world')).toBe(false);
  });

  it('returns false for dangerous patterns', () => {
    expect(safeTest('aaaa', '(a+)+')).toBe(false);
  });

  it('returns false for invalid patterns', () => {
    expect(safeTest('test', '[invalid')).toBe(false);
  });
});

describe('safeMatch', () => {
  it('returns matches for valid patterns', () => {
    const result = safeMatch('hello123world456', '\\d+', 'g');
    expect(result).toEqual(['123', '456']);
  });

  it('returns null for non-matching patterns', () => {
    expect(safeMatch('hello', '\\d+')).toBeNull();
  });

  it('returns null for dangerous patterns', () => {
    expect(safeMatch('aaaa', '(a+)+')).toBeNull();
  });
});

describe('safeReplace', () => {
  it('replaces matches for valid patterns', () => {
    const result = safeReplace('hello world', 'world', 'universe');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe('hello universe');
    }
  });

  it('replaces with regex patterns', () => {
    const result = safeReplace('hello123', '\\d+', 'XYZ');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe('helloXYZ');
    }
  });

  it('returns error for dangerous patterns', () => {
    const result = safeReplace('aaaa', '(a+)+', 'b');
    expect(isErr(result)).toBe(true);
  });
});

describe('SafeRegexError', () => {
  it('has correct properties', () => {
    const error = new SafeRegexError('test message', 'pattern', 'dangerous');
    expect(error.name).toBe('SafeRegexError');
    expect(error.message).toBe('test message');
    expect(error.pattern).toBe('pattern');
    expect(error.reason).toBe('dangerous');
  });

  it('extends Error', () => {
    const error = new SafeRegexError('test', 'p', 'invalid');
    expect(error instanceof Error).toBe(true);
  });
});
