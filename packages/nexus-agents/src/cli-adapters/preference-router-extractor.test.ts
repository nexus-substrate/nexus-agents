/**
 * Tests for QueryFeatureExtractor
 *
 * @module cli-adapters/preference-router-extractor.test
 */

import { describe, it, expect } from 'vitest';
import { QueryFeatureExtractor } from './preference-router-extractor.js';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('QueryFeatureExtractor', () => {
  const extractor = new QueryFeatureExtractor();

  // ---------------------------------------------------------------------------
  // TOKEN COUNT ESTIMATION
  // ---------------------------------------------------------------------------

  describe('tokenCount estimation', () => {
    it('estimates tokens for short query', () => {
      const result = extractor.extract('test');
      expect(result.tokenCount).toBe(1); // 4 chars / 4 = 1
    });

    it('estimates tokens for medium query', () => {
      const result = extractor.extract('implement a function');
      expect(result.tokenCount).toBe(5); // 20 chars / 4 = 5
    });

    it('estimates tokens for long query', () => {
      const longQuery = 'a'.repeat(100);
      const result = extractor.extract(longQuery);
      expect(result.tokenCount).toBe(25); // 100 / 4 = 25
    });

    it('rounds up fractional tokens', () => {
      const result = extractor.extract('hello'); // 5 chars
      expect(result.tokenCount).toBe(2); // ceil(5/4) = 2
    });

    it('handles empty string', () => {
      const result = extractor.extract('');
      expect(result.tokenCount).toBe(0); // ceil(0/4) = 0
    });
  });

  // ---------------------------------------------------------------------------
  // COMPLEXITY CALCULATION
  // ---------------------------------------------------------------------------

  describe('complexity calculation', () => {
    it('assigns low complexity to short simple query', () => {
      const result = extractor.extract('hello world');
      expect(result.complexity).toBeLessThan(0.2);
    });

    it('assigns higher complexity to long query', () => {
      const words = new Array(50).fill('word').join(' ');
      const result = extractor.extract(words);
      expect(result.complexity).toBeGreaterThan(0.1);
    });

    it('assigns higher complexity to technical query', () => {
      const result = extractor.extract(
        'implement function class import export const let var refactor debug'
      );
      expect(result.complexity).toBeGreaterThan(0.2);
    });

    it('assigns higher complexity to multi-sentence query', () => {
      const result = extractor.extract(
        'First sentence. Second sentence. Third sentence. Fourth sentence.'
      );
      expect(result.complexity).toBeGreaterThan(0.1);
    });

    it('assigns higher complexity to query with question words', () => {
      const result = extractor.extract('what why how when where which');
      expect(result.complexity).toBeGreaterThan(0.1);
    });

    it('caps complexity at 1.0', () => {
      const longTechnical = new Array(200)
        .fill('function class import export analyze compare evaluate')
        .join(' ');
      const result = extractor.extract(longTechnical);
      expect(result.complexity).toBeLessThanOrEqual(1.0);
      expect(result.complexity).toBeGreaterThan(0.6);
    });

    it('handles empty string complexity', () => {
      const result = extractor.extract('');
      expect(result.complexity).toBeGreaterThanOrEqual(0);
      expect(result.complexity).toBeLessThan(0.1);
    });
  });

  // ---------------------------------------------------------------------------
  // REQUIRES REASONING
  // ---------------------------------------------------------------------------

  describe('requiresReasoning detection', () => {
    it('detects reasoning keywords', () => {
      const result = extractor.extract('analyze this problem');
      expect(result.requiresReasoning).toBe(true);
    });

    it('detects multiple reasoning keywords', () => {
      const result = extractor.extract('compare and evaluate these options');
      expect(result.requiresReasoning).toBe(true);
    });

    it('detects why/how questions', () => {
      const reasoningQueries = ['why does this work', 'how to explain', 'prove this theorem'];
      reasoningQueries.forEach((query) => {
        const result = extractor.extract(query);
        expect(result.requiresReasoning).toBe(true);
      });
    });

    it('returns false for non-reasoning query', () => {
      const result = extractor.extract('hello world');
      expect(result.requiresReasoning).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // REQUIRES CODE
  // ---------------------------------------------------------------------------

  describe('requiresCode detection', () => {
    it('detects code keywords', () => {
      const result = extractor.extract('implement a function');
      expect(result.requiresCode).toBe(true);
    });

    it('detects programming language names', () => {
      const codeQueries = ['write typescript code', 'debug python script', 'refactor javascript'];
      codeQueries.forEach((query) => {
        const result = extractor.extract(query);
        expect(result.requiresCode).toBe(true);
      });
    });

    it('detects code structure keywords', () => {
      const result = extractor.extract('create a class with import and export');
      expect(result.requiresCode).toBe(true);
    });

    it('returns false for non-code query', () => {
      const result = extractor.extract('tell me a story');
      expect(result.requiresCode).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // REQUIRES CREATIVITY
  // ---------------------------------------------------------------------------

  describe('requiresCreativity detection', () => {
    it('detects creative keywords', () => {
      const result = extractor.extract('create a story');
      expect(result.requiresCreativity).toBe(true);
    });

    it('detects design keywords', () => {
      const result = extractor.extract('design an innovative solution');
      expect(result.requiresCreativity).toBe(true);
    });

    it('detects brainstorming requests', () => {
      const result = extractor.extract('brainstorm ideas for this project');
      expect(result.requiresCreativity).toBe(true);
    });

    it('returns false for non-creative query', () => {
      const result = extractor.extract('analyze this data');
      expect(result.requiresCreativity).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // HAS AMBIGUITY
  // ---------------------------------------------------------------------------

  describe('hasAmbiguity detection', () => {
    it('detects ambiguity indicators', () => {
      const result = extractor.extract('maybe this could work');
      expect(result.hasAmbiguity).toBe(true);
    });

    it('detects uncertainty words', () => {
      const ambiguousQueries = ['might be possible', 'possibly unclear', 'depends on context'];
      ambiguousQueries.forEach((query) => {
        const result = extractor.extract(query);
        expect(result.hasAmbiguity).toBe(true);
      });
    });

    it('detects or operator', () => {
      const result = extractor.extract('choose this or that');
      expect(result.hasAmbiguity).toBe(true);
    });

    it('returns false for definite query', () => {
      const result = extractor.extract('implement this function');
      expect(result.hasAmbiguity).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // DOMAIN DETECTION
  // ---------------------------------------------------------------------------

  describe('domain detection', () => {
    it('detects coding domain', () => {
      const result = extractor.extract('implement function class import export');
      expect(result.domain).toBe('coding');
    });

    it('detects reasoning domain', () => {
      const result = extractor.extract('analyze compare evaluate why how explain');
      expect(result.domain).toBe('reasoning');
    });

    it('detects creative domain', () => {
      const result = extractor.extract('create design imagine brainstorm story');
      expect(result.domain).toBe('creative');
    });

    it('returns general for mixed domains', () => {
      const result = extractor.extract('hello world');
      expect(result.domain).toBe('general');
    });

    it('returns general for empty query', () => {
      const result = extractor.extract('');
      expect(result.domain).toBe('general');
    });

    it('selects domain with highest keyword count', () => {
      const result = extractor.extract('function class import analyze');
      expect(result.domain).toBe('coding'); // 3 code keywords vs 1 reasoning
    });
  });

  // ---------------------------------------------------------------------------
  // KEYWORD SIGNATURE
  // ---------------------------------------------------------------------------

  describe('keywordSignature generation', () => {
    it('generates 16-character hex signature', () => {
      const result = extractor.extract('implement function');
      expect(result.keywordSignature).toMatch(/^[0-9a-f]{16}$/);
    });

    it('generates deterministic signature for same input', () => {
      const result1 = extractor.extract('implement function class');
      const result2 = extractor.extract('implement function class');
      expect(result1.keywordSignature).toBe(result2.keywordSignature);
    });

    it('generates different signatures for different keywords', () => {
      const result1 = extractor.extract('implement function');
      const result2 = extractor.extract('analyze compare');
      expect(result1.keywordSignature).not.toBe(result2.keywordSignature);
    });

    it('generates same signature regardless of word order', () => {
      const result1 = extractor.extract('function implement class');
      const result2 = extractor.extract('class function implement');
      expect(result1.keywordSignature).toBe(result2.keywordSignature);
    });

    it('generates signature for empty query', () => {
      const result = extractor.extract('');
      expect(result.keywordSignature).toMatch(/^[0-9a-f]{16}$/);
    });

    it('ignores non-keyword words in signature', () => {
      const result1 = extractor.extract('implement function');
      const result2 = extractor.extract('implement function with extra words');
      expect(result1.keywordSignature).toBe(result2.keywordSignature);
    });
  });

  // ---------------------------------------------------------------------------
  // EDGE CASES
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles single word query', () => {
      const result = extractor.extract('function');
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.requiresCode).toBe(true);
      expect(result.domain).toBe('coding');
    });

    it('handles very long query', () => {
      const longQuery = new Array(500).fill('function class import').join(' ');
      const result = extractor.extract(longQuery);
      expect(result.tokenCount).toBeGreaterThan(100);
      expect(result.complexity).toBeGreaterThan(0.5);
      expect(result.requiresCode).toBe(true);
    });

    it('handles query with mixed case', () => {
      const result = extractor.extract('IMPLEMENT Function CLASS');
      expect(result.requiresCode).toBe(true);
      expect(result.domain).toBe('coding');
    });

    it('handles query with punctuation', () => {
      const result = extractor.extract('implement function class test');
      expect(result.requiresCode).toBe(true);
    });

    it('handles query with special characters', () => {
      const result = extractor.extract('implement @function #class $export');
      expect(result.requiresCode).toBe(true);
    });

    it('handles whitespace-only query', () => {
      const result = extractor.extract('   ');
      expect(result.tokenCount).toBeLessThanOrEqual(1);
      expect(result.complexity).toBeGreaterThanOrEqual(0);
      expect(result.complexity).toBeLessThan(0.2);
      expect(result.domain).toBe('general');
    });
  });

  // ---------------------------------------------------------------------------
  // INTEGRATION TESTS
  // ---------------------------------------------------------------------------

  describe('integration scenarios', () => {
    it('extracts features for coding task', () => {
      const result = extractor.extract('implement a typescript function to export data');
      expect(result.requiresCode).toBe(true);
      expect(result.requiresReasoning).toBe(false);
      expect(result.requiresCreativity).toBe(false);
      expect(result.domain).toBe('coding');
      expect(result.hasAmbiguity).toBe(false);
    });

    it('extracts features for reasoning task', () => {
      const result = extractor.extract('analyze why this algorithm works and explain the logic');
      expect(result.requiresReasoning).toBe(true);
      expect(result.requiresCode).toBe(false);
      expect(result.domain).toBe('reasoning');
    });

    it('extracts features for creative task', () => {
      const result = extractor.extract('create an innovative design for a story');
      expect(result.requiresCreativity).toBe(true);
      expect(result.requiresCode).toBe(false);
      expect(result.domain).toBe('creative');
    });

    it('extracts features for ambiguous query', () => {
      const result = extractor.extract('maybe implement this or possibly refactor that');
      expect(result.hasAmbiguity).toBe(true);
      expect(result.requiresCode).toBe(true);
    });

    it('extracts features for complex multi-domain query', () => {
      const result = extractor.extract(
        'analyze this function implementation and create innovative test cases'
      );
      expect(result.requiresReasoning).toBe(true);
      expect(result.requiresCode).toBe(true);
      expect(result.requiresCreativity).toBe(true);
      expect(result.complexity).toBeGreaterThan(0.2);
    });
  });
});
