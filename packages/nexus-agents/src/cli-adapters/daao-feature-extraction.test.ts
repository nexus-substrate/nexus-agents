/**
 * Tests for DAAO feature extraction utilities.
 *
 * Covers: tokenize, normalize, saturate, countKeywordMatches,
 * extractLexicalComplexity, extractSyntacticComplexity, extractSemanticDensity,
 * extractTechnicalSpecificity, extractTaskScope, extractConstraintComplexity,
 * extractClarity, extractOutputComplexity, and keyword constants.
 */

import { describe, expect, it } from 'vitest';

import {
  LEXICAL_THRESHOLDS,
  COMPLEX_SYNTAX_MARKERS,
  TECHNICAL_KEYWORDS,
  SCOPE_KEYWORDS,
  CONSTRAINT_KEYWORDS,
  CLARITY_KEYWORDS,
  AMBIGUITY_KEYWORDS,
  OUTPUT_COMPLEXITY_KEYWORDS,
  ADVANCED_VOCABULARY,
  CONCEPT_INDICATORS,
  ABSTRACT_TERMS,
  tokenize,
  normalize,
  saturate,
  countKeywordMatches,
  extractLexicalComplexity,
  extractSyntacticComplexity,
  extractSemanticDensity,
  extractTechnicalSpecificity,
  extractTaskScope,
  extractConstraintComplexity,
  extractClarity,
  extractOutputComplexity,
} from './daao-feature-extraction.js';

// ============================================================================
// Constants
// ============================================================================

describe('DAAO constants', () => {
  it('LEXICAL_THRESHOLDS has simple and complex values', () => {
    expect(LEXICAL_THRESHOLDS.simple).toBe(4);
    expect(LEXICAL_THRESHOLDS.complex).toBe(7);
  });

  it('keyword arrays are non-empty', () => {
    expect(COMPLEX_SYNTAX_MARKERS.length).toBeGreaterThan(0);
    expect(TECHNICAL_KEYWORDS.length).toBeGreaterThan(0);
    expect(SCOPE_KEYWORDS.length).toBeGreaterThan(0);
    expect(CONSTRAINT_KEYWORDS.length).toBeGreaterThan(0);
    expect(CLARITY_KEYWORDS.length).toBeGreaterThan(0);
    expect(AMBIGUITY_KEYWORDS.length).toBeGreaterThan(0);
    expect(OUTPUT_COMPLEXITY_KEYWORDS.length).toBeGreaterThan(0);
    expect(ADVANCED_VOCABULARY.length).toBeGreaterThan(0);
    expect(CONCEPT_INDICATORS.length).toBeGreaterThan(0);
    expect(ABSTRACT_TERMS.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// tokenize
// ============================================================================

describe('tokenize', () => {
  it('splits text into words', () => {
    expect(tokenize('hello world')).toEqual(['hello', 'world']);
  });

  it('handles multiple whitespace types', () => {
    expect(tokenize('hello\tworld\nfoo')).toEqual(['hello', 'world', 'foo']);
  });

  it('strips punctuation from words', () => {
    expect(tokenize('hello, world!')).toEqual(['hello', 'world']);
  });

  it('preserves hyphens and apostrophes', () => {
    expect(tokenize("end-to-end it's")).toEqual(['end-to-end', "it's"]);
  });

  it('filters empty tokens', () => {
    expect(tokenize('  hello   world  ')).toEqual(['hello', 'world']);
  });

  it('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });
});

// ============================================================================
// normalize
// ============================================================================

describe('normalize', () => {
  it('normalizes value to 0-1 range', () => {
    expect(normalize(50, 0, 100)).toBe(0.5);
    expect(normalize(0, 0, 100)).toBe(0);
    expect(normalize(100, 0, 100)).toBe(1);
  });

  it('clamps values below min to 0', () => {
    expect(normalize(-10, 0, 100)).toBe(0);
  });

  it('clamps values above max to 1', () => {
    expect(normalize(200, 0, 100)).toBe(1);
  });

  it('returns 0.5 when min equals max', () => {
    expect(normalize(5, 5, 5)).toBe(0.5);
  });

  it('handles negative ranges', () => {
    expect(normalize(0, -10, 10)).toBe(0.5);
  });
});

// ============================================================================
// saturate
// ============================================================================

describe('saturate', () => {
  it('returns 0 for zero count', () => {
    expect(saturate(0, 10)).toBe(0);
  });

  it('returns 0 for negative count', () => {
    expect(saturate(-5, 10)).toBe(0);
  });

  it('approaches 1 at saturation point', () => {
    const result = saturate(10, 10);
    expect(result).toBe(1);
  });

  it('returns 1 at saturation point', () => {
    expect(saturate(10, 10)).toBe(1);
  });

  it('clamps to 1 beyond saturation point (Issue #760)', () => {
    // Ratio is capped at 1 so values beyond saturation stay at 1
    expect(saturate(15, 10)).toBe(1);
    expect(saturate(20, 10)).toBe(1);
    expect(saturate(100, 10)).toBe(1);
  });

  it('applies soft curve for intermediate values', () => {
    const half = saturate(5, 10);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    // Soft saturation: ratio * (2 - ratio) = 0.5 * 1.5 = 0.75
    expect(half).toBeCloseTo(0.75);
  });
});

// ============================================================================
// countKeywordMatches
// ============================================================================

describe('countKeywordMatches', () => {
  it('counts matching keywords', () => {
    expect(countKeywordMatches('hello world', ['hello', 'world'])).toBe(2);
  });

  it('returns 0 when no matches', () => {
    expect(countKeywordMatches('hello world', ['foo', 'bar'])).toBe(0);
  });

  it('handles multi-word keywords', () => {
    expect(countKeywordMatches('in order to do this', ['in order to'])).toBe(1);
  });

  it('handles empty keyword list', () => {
    expect(countKeywordMatches('hello world', [])).toBe(0);
  });

  it('handles empty text', () => {
    expect(countKeywordMatches('', ['hello'])).toBe(0);
  });
});

// ============================================================================
// extractLexicalComplexity
// ============================================================================

describe('extractLexicalComplexity', () => {
  it('returns 0 for empty words', () => {
    expect(extractLexicalComplexity([])).toBe(0);
  });

  it('returns low complexity for simple words', () => {
    const words = ['the', 'cat', 'sat', 'on', 'the', 'mat'];
    const result = extractLexicalComplexity(words);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('returns higher complexity for advanced vocabulary', () => {
    const simpleWords = ['simple', 'code', 'task'];
    const advancedWords = [
      'idempotent',
      'polymorphism',
      'deterministic',
      'covariance',
      'invariant',
    ];
    const simpleResult = extractLexicalComplexity(simpleWords);
    const advancedResult = extractLexicalComplexity(advancedWords);
    expect(advancedResult).toBeGreaterThan(simpleResult);
  });

  it('factors in word diversity', () => {
    const repeated = ['code', 'code', 'code', 'code'];
    const diverse = ['code', 'test', 'build', 'deploy'];
    const repeatedResult = extractLexicalComplexity(repeated);
    const diverseResult = extractLexicalComplexity(diverse);
    expect(diverseResult).toBeGreaterThan(repeatedResult);
  });

  it('returns value between 0 and 1', () => {
    const result = extractLexicalComplexity(['hello', 'world']);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// extractSyntacticComplexity
// ============================================================================

describe('extractSyntacticComplexity', () => {
  it('returns low complexity for simple sentences', () => {
    const content = 'Fix the bug.';
    const result = extractSyntacticComplexity(content, content.toLowerCase());
    expect(result).toBeLessThan(0.5);
  });

  it('returns higher complexity with syntax markers', () => {
    const simple = 'Fix the bug.';
    const complex =
      'However, the bug must be fixed. Furthermore, the system should be tested. Nevertheless, the deployment must proceed.';
    const simpleResult = extractSyntacticComplexity(simple, simple.toLowerCase());
    const complexResult = extractSyntacticComplexity(complex, complex.toLowerCase());
    expect(complexResult).toBeGreaterThan(simpleResult);
  });

  it('factors in nesting depth', () => {
    const flat = 'Implement the feature.';
    const nested =
      'Implement the feature (including sub-features [like validation {and error handling}]).';
    const flatResult = extractSyntacticComplexity(flat, flat.toLowerCase());
    const nestedResult = extractSyntacticComplexity(nested, nested.toLowerCase());
    expect(nestedResult).toBeGreaterThan(flatResult);
  });

  it('returns value between 0 and 1', () => {
    const content = 'A test sentence.';
    const result = extractSyntacticComplexity(content, content.toLowerCase());
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// extractSemanticDensity
// ============================================================================

describe('extractSemanticDensity', () => {
  it('returns 0 for empty words', () => {
    expect(extractSemanticDensity([], '')).toBe(0);
  });

  it('returns higher density with more concept indicators', () => {
    const simple = 'fix bug';
    const dense =
      'implement design analyze optimize evaluate process handle manage configure transform validate integrate';
    const simpleResult = extractSemanticDensity(tokenize(simple), simple);
    const denseResult = extractSemanticDensity(tokenize(dense), dense);
    expect(denseResult).toBeGreaterThan(simpleResult);
  });

  it('factors in abstract terms', () => {
    const concrete = 'write function code';
    const abstract = 'concept principle pattern paradigm framework methodology strategy approach';
    const concreteResult = extractSemanticDensity(tokenize(concrete), concrete);
    const abstractResult = extractSemanticDensity(tokenize(abstract), abstract);
    expect(abstractResult).toBeGreaterThan(concreteResult);
  });

  it('returns value between 0 and 1', () => {
    const text = 'implement a design pattern';
    const result = extractSemanticDensity(tokenize(text), text);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// extractTechnicalSpecificity
// ============================================================================

describe('extractTechnicalSpecificity', () => {
  it('returns 0 for non-technical text', () => {
    expect(extractTechnicalSpecificity('hello world')).toBe(0);
  });

  it('returns higher value with technical keywords', () => {
    const nonTech = 'write a simple story';
    const tech =
      'implement the algorithm for distributed authentication with encryption and optimization';
    expect(extractTechnicalSpecificity(tech)).toBeGreaterThan(extractTechnicalSpecificity(nonTech));
  });

  it('saturates at 1 with many technical keywords', () => {
    // With the fix for Issue #760, saturate clamps at 1 for all values >= saturation point
    const veryTech = TECHNICAL_KEYWORDS.join(' ');
    const result = extractTechnicalSpecificity(veryTech);
    expect(result).toBe(1);
  });
});

// ============================================================================
// extractTaskScope
// ============================================================================

describe('extractTaskScope', () => {
  it('returns low scope for small tasks', () => {
    expect(extractTaskScope('fix bug')).toBeLessThan(0.5);
  });

  it('returns higher scope with scope keywords', () => {
    const small = 'fix a bug';
    const large = 'comprehensive end-to-end system-wide refactoring across the entire codebase';
    expect(extractTaskScope(large)).toBeGreaterThan(extractTaskScope(small));
  });

  it('factors in text length', () => {
    const short = 'fix bug';
    const long =
      'fix the bug in the authentication module by refactoring the validation logic and updating all related unit tests to ensure proper coverage of edge cases and error scenarios in the production environment with proper error handling and logging mechanisms';
    expect(extractTaskScope(long)).toBeGreaterThan(extractTaskScope(short));
  });
});

// ============================================================================
// extractConstraintComplexity
// ============================================================================

describe('extractConstraintComplexity', () => {
  it('returns 0 for unconstrained task', () => {
    expect(extractConstraintComplexity('write code')).toBe(0);
  });

  it('returns higher value with constraint keywords', () => {
    const constrained =
      'must ensure validation with error handling, edge case coverage, and timeout retry fallback';
    expect(extractConstraintComplexity(constrained)).toBeGreaterThan(0.5);
  });
});

// ============================================================================
// extractClarity
// ============================================================================

describe('extractClarity', () => {
  it('returns higher clarity with explicit language', () => {
    const clear =
      'specifically, exactly implement the function as defined, namely the sort algorithm, e.g. quicksort';
    const vague = 'maybe do something flexible with whatever seems appropriate';
    expect(extractClarity(clear)).toBeGreaterThan(extractClarity(vague));
  });

  it('returns value between 0 and 1', () => {
    const result = extractClarity('implement feature');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('returns lower clarity with ambiguous language', () => {
    const ambiguous = 'maybe perhaps possibly might could somehow';
    const result = extractClarity(ambiguous);
    expect(result).toBeLessThan(0.5);
  });
});

// ============================================================================
// extractOutputComplexity
// ============================================================================

describe('extractOutputComplexity', () => {
  it('returns 0 for no output indicators', () => {
    expect(extractOutputComplexity('hello world')).toBe(0);
  });

  it('returns higher value for complex output requirements', () => {
    const simple = 'fix a bug';
    const complex =
      'implement and create a comprehensive detailed complete system with extensive documentation';
    expect(extractOutputComplexity(complex)).toBeGreaterThan(extractOutputComplexity(simple));
  });
});
