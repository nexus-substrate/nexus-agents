/**
 * Tests for Scoring Checks
 *
 * @module testing/scoring/scoring-checks.test
 */

import { describe, it, expect } from 'vitest';
import {
  runKeywordCheck,
  runPatternCheck,
  checkRegexMatch,
  runLengthCheck,
  runJsonCheck,
} from './scoring-checks.js';

// ============================================================================
// runKeywordCheck
// ============================================================================

describe('runKeywordCheck', () => {
  it('scores 100 when all mustContain terms found', () => {
    const result = runKeywordCheck({
      response: 'The function returns a valid result object',
      mustContain: ['function', 'result'],
      mustNotContain: undefined,
      caseSensitive: false,
    });

    expect(result.score).toBe(100);
    expect(result.feedback).toBe('All keyword requirements met');
    expect(result.matchedTerms).toContain('function');
    expect(result.matchedTerms).toContain('result');
  });

  it('scores proportionally for partial matches', () => {
    const result = runKeywordCheck({
      response: 'The function is correct',
      mustContain: ['function', 'result', 'error', 'test'],
      mustNotContain: undefined,
      caseSensitive: false,
    });

    expect(result.score).toBe(25); // 1 out of 4
    expect(result.missingTerms).toContain('result');
    expect(result.missingTerms).toContain('error');
    expect(result.missingTerms).toContain('test');
  });

  it('scores 0 when no mustContain terms found', () => {
    const result = runKeywordCheck({
      response: 'nothing here',
      mustContain: ['function', 'result'],
      mustNotContain: undefined,
      caseSensitive: false,
    });

    expect(result.score).toBe(0);
  });

  it('penalizes for mustNotContain violations', () => {
    const result = runKeywordCheck({
      response: 'The error and the bug are present',
      mustContain: undefined,
      mustNotContain: ['error', 'bug'],
      caseSensitive: false,
    });

    expect(result.score).toBeLessThan(100);
    expect(result.violationTerms).toContain('error');
    expect(result.violationTerms).toContain('bug');
  });

  it('handles case-sensitive matching', () => {
    const result = runKeywordCheck({
      response: 'The Function is uppercase',
      mustContain: ['function'],
      mustNotContain: undefined,
      caseSensitive: true,
    });

    expect(result.score).toBe(0);
    expect(result.missingTerms).toContain('function');
  });

  it('handles case-insensitive matching', () => {
    const result = runKeywordCheck({
      response: 'The Function is uppercase',
      mustContain: ['function'],
      mustNotContain: undefined,
      caseSensitive: false,
    });

    expect(result.score).toBe(100);
  });

  it('returns 100 with no terms to check', () => {
    const result = runKeywordCheck({
      response: 'anything',
      mustContain: undefined,
      mustNotContain: undefined,
      caseSensitive: false,
    });

    expect(result.score).toBe(100);
  });

  it('combines mustContain and mustNotContain checks', () => {
    const result = runKeywordCheck({
      response: 'function with error',
      mustContain: ['function'],
      mustNotContain: ['error'],
      caseSensitive: false,
    });

    // 100% match on mustContain, but penalty for violation
    expect(result.score).toBeLessThan(100);
    expect(result.matchedTerms).toContain('function');
    expect(result.violationTerms).toContain('error');
  });
});

// ============================================================================
// checkRegexMatch
// ============================================================================

describe('checkRegexMatch', () => {
  it('returns 100 for matching pattern', () => {
    expect(checkRegexMatch('hello world 42', '\\d+', false)).toBe(100);
  });

  it('returns 0 for non-matching pattern', () => {
    expect(checkRegexMatch('hello world', '\\d+', false)).toBe(0);
  });

  it('respects case sensitivity', () => {
    expect(checkRegexMatch('Hello World', 'hello', true)).toBe(0);
    expect(checkRegexMatch('Hello World', 'hello', false)).toBe(100);
  });

  it('returns 0 for invalid regex', () => {
    expect(checkRegexMatch('test', '[invalid', false)).toBe(0);
  });
});

// ============================================================================
// runPatternCheck
// ============================================================================

describe('runPatternCheck', () => {
  it('scores 100 when all patterns match', () => {
    const result = runPatternCheck({
      response: 'function foo(bar: string): number { return 42; }',
      patterns: ['function', '\\d+', 'string'],
      caseSensitive: false,
    });

    expect(result.score).toBe(100);
    expect(result.feedback).toBe('All patterns matched');
  });

  it('scores proportionally for partial matches', () => {
    const result = runPatternCheck({
      response: 'function foo',
      patterns: ['function', '\\d+'],
      caseSensitive: false,
    });

    expect(result.score).toBe(50);
    expect(result.missingTerms).toContain('\\d+');
  });

  it('returns 100 for empty patterns', () => {
    const result = runPatternCheck({
      response: 'anything',
      patterns: [],
      caseSensitive: false,
    });

    expect(result.score).toBe(100);
    expect(result.feedback).toBe('No patterns to check');
  });

  it('handles invalid regex gracefully', () => {
    const result = runPatternCheck({
      response: 'test',
      patterns: ['[invalid'],
      caseSensitive: false,
    });

    expect(result.score).toBe(0);
  });
});

// ============================================================================
// runLengthCheck
// ============================================================================

describe('runLengthCheck', () => {
  it('passes when within bounds', () => {
    const result = runLengthCheck('hello world', 5, 20);
    expect(result.score).toBe(100);
    expect(result.feedback).toBe('Length requirements met');
  });

  it('fails when too short', () => {
    const result = runLengthCheck('hi', 10, undefined);
    expect(result.score).toBeLessThan(100);
    expect(result.feedback).toContain('too short');
  });

  it('fails when too long', () => {
    const result = runLengthCheck('a very long response here', undefined, 5);
    expect(result.score).toBeLessThan(100);
    expect(result.feedback).toContain('too long');
  });

  it('passes with no constraints', () => {
    const result = runLengthCheck('anything', undefined, undefined);
    expect(result.score).toBe(100);
  });

  it('scores proportionally based on how close to min length', () => {
    // 5 chars, min 10 → ratio 0.5 → score 50
    const result = runLengthCheck('hello', 10, undefined);
    expect(result.score).toBe(50);
  });

  it('scores proportionally based on how much over max length', () => {
    // 10 chars, max 5 → ratio 0.5 → score 50
    const result = runLengthCheck('0123456789', undefined, 5);
    expect(result.score).toBe(50);
  });
});

// ============================================================================
// runJsonCheck
// ============================================================================

describe('runJsonCheck', () => {
  it('passes for valid JSON object', () => {
    const result = runJsonCheck('{"key": "value"}');
    expect(result.score).toBe(100);
    expect(result.feedback).toBe('Valid JSON structure');
  });

  it('passes for valid JSON array', () => {
    const result = runJsonCheck('[1, 2, 3]');
    expect(result.score).toBe(100);
  });

  it('passes for JSON primitives', () => {
    expect(runJsonCheck('"string"').score).toBe(100);
    expect(runJsonCheck('42').score).toBe(100);
    expect(runJsonCheck('true').score).toBe(100);
    expect(runJsonCheck('null').score).toBe(100);
  });

  it('fails for invalid JSON', () => {
    const result = runJsonCheck('not json');
    expect(result.score).toBe(0);
    expect(result.feedback).toContain('Invalid JSON');
  });

  it('fails for empty string', () => {
    const result = runJsonCheck('');
    expect(result.score).toBe(0);
  });
});
