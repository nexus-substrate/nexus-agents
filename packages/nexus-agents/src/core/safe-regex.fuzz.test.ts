/**
 * Property-based fuzzing tests for safe-regex utilities.
 *
 * Verifies that regex sanitization and safe matching never throw,
 * handle arbitrary input gracefully, and complete in bounded time.
 *
 * Satisfies OSSF Scorecard "Fuzzing" check.
 *
 * @module core/safe-regex.fuzz
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { escapeRegex, safeMatch, safeTest, validatePattern } from './safe-regex.js';

describe('escapeRegex — fuzzing', () => {
  it('never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = escapeRegex(input);
        expect(typeof result).toBe('string');
      }),
      { numRuns: 1000 }
    );
  });

  it('output is always safe to use in RegExp constructor', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const escaped = escapeRegex(input);
        const re = new RegExp(escaped);
        expect(re).toBeInstanceOf(RegExp);
      }),
      { numRuns: 1000 }
    );
  });
});

describe('validatePattern — fuzzing', () => {
  it('never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = validatePattern(input);
        expect(typeof result.ok).toBe('boolean');
      }),
      { numRuns: 1000 }
    );
  });
});

describe('safeTest — fuzzing', () => {
  it('never throws on arbitrary text + pattern', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (text, pattern) => {
        const result = safeTest(text, pattern);
        expect(typeof result).toBe('boolean');
      }),
      { numRuns: 1000 }
    );
  });
});

describe('safeMatch — fuzzing', () => {
  it('never throws on arbitrary text + pattern', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (text, pattern) => {
        const result = safeMatch(text, pattern);
        // Result is either null or a RegExpMatchArray
        expect(result === null || Array.isArray(result)).toBe(true);
      }),
      { numRuns: 1000 }
    );
  });

  it('completes in bounded time even with pathological patterns', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 50 }), fc.string({ maxLength: 100 }), (pattern, text) => {
        const start = performance.now();
        safeMatch(text, pattern);
        const elapsed = performance.now() - start;
        // Must complete within 500ms (generous for property testing)
        expect(elapsed).toBeLessThan(500);
      }),
      { numRuns: 500 }
    );
  });
});
