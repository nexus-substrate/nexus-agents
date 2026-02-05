/**
 * Tests for Scoring Helpers
 * @module testing/framework/scoring-helpers.test
 */

import { describe, it, expect } from 'vitest';
import { scorePatternMatch, scoreKeywordPresence, scoreLengthCheck } from './scoring-helpers.js';

// ============================================================================
// scorePatternMatch
// ============================================================================

describe('scorePatternMatch', () => {
  it('returns 0.5 for empty patterns and non-empty response', () => {
    expect(scorePatternMatch(undefined, 'hello')).toBe(0.5);
  });

  it('returns 0 for empty patterns and empty response', () => {
    expect(scorePatternMatch(undefined, '')).toBe(0);
  });

  it('returns 1 when all patterns match in matchAll mode', () => {
    const config = { patterns: ['hello', 'world'], matchAll: true };
    expect(scorePatternMatch(config, 'hello world')).toBe(1);
  });

  it('returns 0 when not all patterns match in matchAll mode', () => {
    const config = { patterns: ['hello', 'missing'], matchAll: true };
    expect(scorePatternMatch(config, 'hello world')).toBe(0);
  });

  it('returns fraction for partial match in any mode', () => {
    const config = { patterns: ['hello', 'missing'], matchAll: false };
    expect(scorePatternMatch(config, 'hello world')).toBe(0.5);
  });

  it('is case insensitive by default', () => {
    const config = { patterns: ['HELLO'] };
    expect(scorePatternMatch(config, 'hello')).toBe(1);
  });

  it('respects case sensitivity', () => {
    const config = { patterns: ['HELLO'], caseSensitive: true };
    expect(scorePatternMatch(config, 'hello')).toBe(0);
  });

  it('uses fallback patterns', () => {
    expect(scorePatternMatch(undefined, 'hello', ['hello'])).toBe(1);
  });

  it('returns 0 for no patterns and empty list', () => {
    const config = { patterns: [] as string[] };
    expect(scorePatternMatch(config, 'hello')).toBe(0.5);
  });
});

// ============================================================================
// scoreKeywordPresence
// ============================================================================

describe('scoreKeywordPresence', () => {
  it('returns 0.5 for undefined config and non-empty response', () => {
    expect(scoreKeywordPresence(undefined, 'hello')).toBe(0.5);
  });

  it('returns 0 for undefined config and empty response', () => {
    expect(scoreKeywordPresence(undefined, '')).toBe(0);
  });

  it('returns 0.5 for empty keywords', () => {
    expect(scoreKeywordPresence({ keywords: [] }, 'hello')).toBe(0.5);
  });

  it('scores based on found keywords ratio', () => {
    const config = { keywords: ['foo', 'bar', 'baz'] };
    // 2 of 3 found, >= minCount(1), so min(1, 2/3) = 0.667
    expect(scoreKeywordPresence(config, 'foo bar')).toBeCloseTo(0.667, 2);
  });

  it('scores partial when below minCount', () => {
    const config = { keywords: ['foo', 'bar'], minCount: 2 };
    // only 1 found, 1/2 = 0.5
    expect(scoreKeywordPresence(config, 'foo')).toBe(0.5);
  });

  it('is case insensitive by default', () => {
    const config = { keywords: ['HELLO'] };
    expect(scoreKeywordPresence(config, 'hello')).toBe(1);
  });

  it('respects case sensitivity', () => {
    const config = { keywords: ['HELLO'], caseSensitive: true };
    expect(scoreKeywordPresence(config, 'hello')).toBe(0);
  });
});

// ============================================================================
// scoreLengthCheck
// ============================================================================

describe('scoreLengthCheck', () => {
  it('returns 1 for non-empty response with no config', () => {
    expect(scoreLengthCheck(undefined, 'hello')).toBe(1);
  });

  it('returns 0 for empty response with no config', () => {
    expect(scoreLengthCheck(undefined, '')).toBe(0);
  });

  it('returns 1 when within bounds', () => {
    expect(scoreLengthCheck({ minLength: 3, maxLength: 10 }, 'hello')).toBe(1);
  });

  it('returns partial score when below minLength', () => {
    // length=2, minLength=10, so 2/10 = 0.2
    expect(scoreLengthCheck({ minLength: 10 }, 'hi')).toBeCloseTo(0.2);
  });

  it('returns partial score when above maxLength', () => {
    // length=20, maxLength=10, excess=10, penalty=min(1,10/10)=1, score=max(0,1-1)=0
    expect(scoreLengthCheck({ maxLength: 10 }, 'x'.repeat(20))).toBe(0);
  });

  it('scores based on target length', () => {
    const config = { targetLength: 10, maxLength: 20 };
    // length=10, distance=0, score=1
    expect(scoreLengthCheck(config, 'x'.repeat(10))).toBe(1);
  });

  it('penalizes distance from target', () => {
    const config = { targetLength: 10, maxLength: 20 };
    // length=15, distance=5, maxDistance=max(10, 20-10)=10, score=1-5/10=0.5
    expect(scoreLengthCheck(config, 'x'.repeat(15))).toBeCloseTo(0.5);
  });
});
