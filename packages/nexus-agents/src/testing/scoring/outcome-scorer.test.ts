/**
 * Tests for Outcome Scorer
 *
 * @module testing/scoring/outcome-scorer.test
 */

import { describe, it, expect } from 'vitest';
import { scoreAgainstOutcome } from './outcome-scorer.js';
import type { ExpectedOutcome } from '../task-types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeOutcome(overrides: Partial<ExpectedOutcome> = {}): ExpectedOutcome {
  return {
    outputType: 'text',
    ...overrides,
  };
}

// ============================================================================
// scoreAgainstOutcome — no checks
// ============================================================================

describe('scoreAgainstOutcome', () => {
  it('returns 100 with no constraints', () => {
    const result = scoreAgainstOutcome('any response', makeOutcome(), false);

    expect(result.score).toBe(100);
    expect(result.feedback).toBe('All checks passed');
  });

  // --------------------------------------------------------------------------
  // Required patterns
  // --------------------------------------------------------------------------

  it('scores 100 when all required patterns match', () => {
    const result = scoreAgainstOutcome(
      'function foo returns 42',
      makeOutcome({ requiredPatterns: ['function', '\\d+'] }),
      false
    );

    expect(result.score).toBe(100);
    expect(result.matchedTerms).toContain('function');
    expect(result.matchedTerms).toContain('\\d+');
  });

  it('penalizes missing required patterns', () => {
    const result = scoreAgainstOutcome(
      'hello world',
      makeOutcome({ requiredPatterns: ['function', '\\d+'] }),
      false
    );

    expect(result.score).toBeLessThan(100);
    expect(result.missingTerms).toContain('function');
    expect(result.missingTerms).toContain('\\d+');
  });

  // --------------------------------------------------------------------------
  // Forbidden patterns
  // --------------------------------------------------------------------------

  it('scores 100 when forbidden patterns absent', () => {
    const result = scoreAgainstOutcome(
      'clean output',
      makeOutcome({ forbiddenPatterns: ['error', 'warning'] }),
      false
    );

    expect(result.score).toBe(100);
  });

  it('penalizes forbidden pattern violations', () => {
    const result = scoreAgainstOutcome(
      'got an error here',
      makeOutcome({ forbiddenPatterns: ['error'] }),
      false
    );

    expect(result.score).toBe(0);
    expect(result.violationTerms).toContain('error');
  });

  // --------------------------------------------------------------------------
  // Golden output
  // --------------------------------------------------------------------------

  it('scores 100 for exact golden output match', () => {
    const result = scoreAgainstOutcome(
      'expected output',
      makeOutcome({ goldenOutput: 'expected output' }),
      false
    );

    expect(result.score).toBe(100);
  });

  it('scores 100 for golden output match ignoring case', () => {
    const result = scoreAgainstOutcome(
      'Expected Output',
      makeOutcome({ goldenOutput: 'expected output' }),
      false
    );

    expect(result.score).toBe(100);
  });

  it('scores 0 for golden output mismatch', () => {
    const result = scoreAgainstOutcome(
      'wrong output',
      makeOutcome({ goldenOutput: 'expected output' }),
      false
    );

    expect(result.score).toBe(0);
    expect(result.feedback).toContain('golden output');
  });

  it('respects case sensitivity for golden output', () => {
    const result = scoreAgainstOutcome(
      'Expected Output',
      makeOutcome({ goldenOutput: 'expected output' }),
      true
    );

    expect(result.score).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Length constraints
  // --------------------------------------------------------------------------

  it('scores 100 when length within bounds', () => {
    const result = scoreAgainstOutcome(
      'hello world',
      makeOutcome({ minLength: 5, maxLength: 20 }),
      false
    );

    expect(result.score).toBe(100);
  });

  it('penalizes too-short response', () => {
    const result = scoreAgainstOutcome('hi', makeOutcome({ minLength: 10 }), false);

    expect(result.score).toBeLessThan(100);
    expect(result.feedback).toContain('short');
  });

  it('penalizes too-long response', () => {
    const result = scoreAgainstOutcome(
      'a very long response that exceeds the limit',
      makeOutcome({ maxLength: 10 }),
      false
    );

    expect(result.score).toBeLessThan(100);
    expect(result.feedback).toContain('long');
  });

  // --------------------------------------------------------------------------
  // Combined checks
  // --------------------------------------------------------------------------

  it('averages scores from multiple check types', () => {
    const result = scoreAgainstOutcome(
      'function foo',
      makeOutcome({
        requiredPatterns: ['function'],
        forbiddenPatterns: ['error'],
        minLength: 5,
      }),
      false
    );

    // All three checks should pass → average 100
    expect(result.score).toBe(100);
  });

  it('averages across failing and passing checks', () => {
    const result = scoreAgainstOutcome(
      'hello',
      makeOutcome({
        requiredPatterns: ['hello'], // pass: 100
        goldenOutput: 'different text', // fail: 0
      }),
      false
    );

    // (100 + 0) / 2 = 50
    expect(result.score).toBe(50);
  });
});
