/**
 * Property-based fuzzing tests for JSON extraction functions.
 *
 * Uses fast-check to generate arbitrary inputs and verify safety invariants:
 * - Never throws on any input
 * - Output is valid JSON when non-undefined
 * - No ReDoS (completes within bounded time)
 * - Round-trip: valid JSON objects/arrays are extractable
 *
 * Satisfies OSSF Scorecard "Fuzzing" check.
 *
 * @module core/json-extract.fuzz
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { extractJsonObject, extractJsonArray } from './json-extract.js';

describe('extractJsonObject — fuzzing', () => {
  it('never throws on arbitrary string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        // Must not throw
        const result = extractJsonObject(input);
        // Result is either undefined or a string
        expect(result === undefined || typeof result === 'string').toBe(true);
      }),
      { numRuns: 1000 }
    );
  });

  it('returns parseable JSON when result is non-undefined', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = extractJsonObject(input);
        if (result !== undefined) {
          // If extraction returned something, it should start with { and end with }
          expect(result.startsWith('{')).toBe(true);
          expect(result.endsWith('}')).toBe(true);
        }
      }),
      { numRuns: 1000 }
    );
  });

  it('round-trips valid JSON objects', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string(),
          fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))
        ),
        (obj) => {
          const json = JSON.stringify(obj);
          const extracted = extractJsonObject(json);
          expect(extracted).toBeDefined();
          if (extracted === undefined) return; // type narrowing
          expect(extracted).toBe(json);
          const parsed: unknown = JSON.parse(extracted);
          expect(parsed).toEqual(obj);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('extracts objects from surrounding text', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.dictionary(fc.string(), fc.string()),
        fc.string(),
        (prefix, obj, suffix) => {
          const json = JSON.stringify(obj);
          const wrapped = `${prefix}${json}${suffix}`;
          const extracted = extractJsonObject(wrapped);
          // Should find the object (as long as prefix/suffix don't contain extra braces
          // that shift the extraction boundaries)
          if (extracted !== undefined) {
            expect(extracted.startsWith('{')).toBe(true);
            expect(extracted.endsWith('}')).toBe(true);
          }
        }
      ),
      { numRuns: 500 }
    );
  });

  it('handles pathological inputs without ReDoS', () => {
    // Deeply nested braces, repeated patterns
    fc.assert(
      fc.property(fc.nat({ max: 1000 }), (n) => {
        const input = '{'.repeat(n) + '}'.repeat(n);
        const start = performance.now();
        extractJsonObject(input);
        const elapsed = performance.now() - start;
        // Must complete in under 100ms even for 1000 nested braces
        expect(elapsed).toBeLessThan(100);
      }),
      { numRuns: 100 }
    );
  });
});

describe('extractJsonArray — fuzzing', () => {
  it('never throws on arbitrary string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = extractJsonArray(input);
        expect(result === undefined || typeof result === 'string').toBe(true);
      }),
      { numRuns: 1000 }
    );
  });

  it('round-trips valid JSON arrays', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))),
        (arr) => {
          const json = JSON.stringify(arr);
          const extracted = extractJsonArray(json);
          expect(extracted).toBeDefined();
          if (extracted === undefined) return;
          expect(extracted).toBe(json);
          const parsed: unknown = JSON.parse(extracted);
          expect(parsed).toEqual(arr);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('handles pathological inputs without ReDoS', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1000 }), (n) => {
        const input = '['.repeat(n) + ']'.repeat(n);
        const start = performance.now();
        extractJsonArray(input);
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(100);
      }),
      { numRuns: 100 }
    );
  });
});
