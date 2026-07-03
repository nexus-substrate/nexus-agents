/**
 * Tests for default-rubrics.ts
 *
 * Validates the structural integrity of the DEFAULT_RUBRICS constant:
 * unique IDs, valid weights, required fields, and category coverage.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_RUBRICS } from './default-rubrics.js';

// ============================================================================
// Structural validation
// ============================================================================

describe('DEFAULT_RUBRICS - structure', () => {
  it('has at least one rubric', () => {
    expect(DEFAULT_RUBRICS.length).toBeGreaterThan(0);
  });

  it('all rubrics have unique IDs', () => {
    const ids = DEFAULT_RUBRICS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all rubrics have at least one category', () => {
    for (const rubric of DEFAULT_RUBRICS) {
      expect(rubric.categories.length).toBeGreaterThan(0);
    }
  });

  it('all rubrics have at least one criterion', () => {
    for (const rubric of DEFAULT_RUBRICS) {
      expect(rubric.criteria.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Criterion validation
// ============================================================================

describe('DEFAULT_RUBRICS - criteria', () => {
  it('all criteria have required fields', () => {
    for (const rubric of DEFAULT_RUBRICS) {
      for (const criterion of rubric.criteria) {
        expect(criterion.id).toBeDefined();
        expect(criterion.description).toBeDefined();
        expect(criterion.weight).toBeDefined();
        expect(criterion.scoringFunction).toBeDefined();
      }
    }
  });

  it('all criteria have positive weights', () => {
    for (const rubric of DEFAULT_RUBRICS) {
      for (const criterion of rubric.criteria) {
        expect(criterion.weight).toBeGreaterThan(0);
      }
    }
  });

  it('criterion weights sum to 1.0 per rubric', () => {
    for (const rubric of DEFAULT_RUBRICS) {
      const sum = rubric.criteria.reduce((acc, c) => acc + c.weight, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });

  it('all criteria have unique IDs within their rubric', () => {
    for (const rubric of DEFAULT_RUBRICS) {
      const ids = rubric.criteria.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('all scoring functions are recognized types', () => {
    const validFunctions = new Set(['pattern_match', 'keyword_presence', 'length_check']);
    for (const rubric of DEFAULT_RUBRICS) {
      for (const criterion of rubric.criteria) {
        expect(validFunctions.has(criterion.scoringFunction)).toBe(true);
      }
    }
  });
});

// ============================================================================
// Category coverage
// ============================================================================

describe('DEFAULT_RUBRICS - categories', () => {
  it('covers code_generation', () => {
    const found = DEFAULT_RUBRICS.some((r) => r.categories.includes('code_generation'));
    expect(found).toBe(true);
  });

  it('covers code_review', () => {
    const found = DEFAULT_RUBRICS.some((r) => r.categories.includes('code_review'));
    expect(found).toBe(true);
  });

  it('covers architecture', () => {
    const found = DEFAULT_RUBRICS.some((r) => r.categories.includes('architecture'));
    expect(found).toBe(true);
  });

  it('covers testing', () => {
    const found = DEFAULT_RUBRICS.some((r) => r.categories.includes('testing'));
    expect(found).toBe(true);
  });

  it('covers documentation', () => {
    const found = DEFAULT_RUBRICS.some((r) => r.categories.includes('documentation'));
    expect(found).toBe(true);
  });
});

// ============================================================================
// Content pins (#4181)
//
// These rubrics score agent outputs via rubric-scorer, so the keyword lists,
// minCount/length bounds, and weight splits are load-bearing. Pin them exactly
// — a silent edit to any of them changes every score downstream.
// ============================================================================

describe('DEFAULT_RUBRICS - content pins', () => {
  it('pins the rubric IDs in order', () => {
    expect(DEFAULT_RUBRICS.map((r) => r.id)).toEqual([
      'code-generation',
      'code-review',
      'architecture',
      'testing',
      'documentation',
      'large-context',
    ]);
  });

  it('pins the code-generation rubric (0.3/0.4/0.3 split)', () => {
    const rubric = DEFAULT_RUBRICS.find((r) => r.id === 'code-generation');
    expect(rubric?.categories).toEqual(['code_generation', 'refactoring']);
    expect(rubric?.criteria).toEqual([
      {
        id: 'syntax-correctness',
        description: 'Code has correct syntax',
        weight: 0.3,
        scoringFunction: 'keyword_presence',
        config: {
          keywords: ['function', 'const', 'let', 'class', 'return', 'async', '=>'],
          minCount: 2,
        },
      },
      {
        id: 'pattern-coverage',
        description: 'Response includes expected patterns',
        weight: 0.4,
        scoringFunction: 'pattern_match',
        config: { matchAll: false },
      },
      {
        id: 'response-length',
        description: 'Response has appropriate length',
        weight: 0.3,
        scoringFunction: 'length_check',
        config: { minLength: 50, maxLength: 10000 },
      },
    ]);
  });

  it('pins the code-review rubric (0.4/0.3/0.3 split, fix-suggestion keywords + minCount 2)', () => {
    const rubric = DEFAULT_RUBRICS.find((r) => r.id === 'code-review');
    expect(rubric?.categories).toEqual(['code_review', 'debugging']);
    expect(rubric?.criteria).toEqual([
      {
        id: 'issue-identification',
        description: 'Identifies issues in the code',
        weight: 0.4,
        scoringFunction: 'pattern_match',
        config: { matchAll: false },
      },
      {
        id: 'explanation-quality',
        description: 'Provides clear explanations',
        weight: 0.3,
        scoringFunction: 'length_check',
        config: { minLength: 100, maxLength: 5000 },
      },
      {
        id: 'fix-suggestion',
        description: 'Suggests fixes or improvements',
        weight: 0.3,
        scoringFunction: 'keyword_presence',
        config: {
          keywords: ['fix', 'change', 'instead', 'should', 'recommend', 'suggest', 'better'],
          minCount: 2,
        },
      },
    ]);
  });

  it('pins the architecture rubric (0.3/0.4/0.3 split)', () => {
    const rubric = DEFAULT_RUBRICS.find((r) => r.id === 'architecture');
    expect(rubric?.categories).toEqual(['architecture']);
    expect(rubric?.criteria).toEqual([
      {
        id: 'component-description',
        description: 'Describes system components',
        weight: 0.3,
        scoringFunction: 'keyword_presence',
        config: {
          keywords: ['service', 'component', 'module', 'layer', 'api', 'database', 'interface'],
          minCount: 3,
        },
      },
      {
        id: 'pattern-coverage',
        description: 'Response includes expected patterns',
        weight: 0.4,
        scoringFunction: 'pattern_match',
        config: { matchAll: false },
      },
      {
        id: 'thoroughness',
        description: 'Provides thorough analysis',
        weight: 0.3,
        scoringFunction: 'length_check',
        config: { minLength: 200, maxLength: 15000 },
      },
    ]);
  });

  it('pins the testing rubric (0.4/0.4/0.2 split)', () => {
    const rubric = DEFAULT_RUBRICS.find((r) => r.id === 'testing');
    expect(rubric?.categories).toEqual(['testing']);
    expect(rubric?.criteria).toEqual([
      {
        id: 'test-structure',
        description: 'Has proper test structure',
        weight: 0.4,
        scoringFunction: 'keyword_presence',
        config: {
          keywords: ['describe', 'it', 'test', 'expect', 'assert', 'mock', 'beforeEach'],
          minCount: 3,
        },
      },
      {
        id: 'pattern-coverage',
        description: 'Response includes expected patterns',
        weight: 0.4,
        scoringFunction: 'pattern_match',
        config: { matchAll: false },
      },
      {
        id: 'test-count',
        description: 'Contains multiple test cases',
        weight: 0.2,
        scoringFunction: 'length_check',
        config: { minLength: 100, maxLength: 10000 },
      },
    ]);
  });

  it('pins the documentation rubric (0.4/0.4/0.2 split)', () => {
    const rubric = DEFAULT_RUBRICS.find((r) => r.id === 'documentation');
    expect(rubric?.categories).toEqual(['documentation']);
    expect(rubric?.criteria).toEqual([
      {
        id: 'documentation-format',
        description: 'Uses proper documentation format',
        weight: 0.4,
        scoringFunction: 'keyword_presence',
        config: {
          keywords: ['@param', '@returns', '@example', '@description', '/**', '*/'],
          minCount: 2,
        },
      },
      {
        id: 'pattern-coverage',
        description: 'Response includes expected patterns',
        weight: 0.4,
        scoringFunction: 'pattern_match',
        config: { matchAll: false },
      },
      {
        id: 'content-length',
        description: 'Appropriate documentation length',
        weight: 0.2,
        scoringFunction: 'length_check',
        config: { minLength: 50, maxLength: 5000 },
      },
    ]);
  });

  it('pins the large-context rubric (0.5/0.5 split)', () => {
    const rubric = DEFAULT_RUBRICS.find((r) => r.id === 'large-context');
    expect(rubric?.categories).toEqual(['large_context']);
    expect(rubric?.criteria).toEqual([
      {
        id: 'comprehensiveness',
        description: 'Addresses the full context',
        weight: 0.5,
        scoringFunction: 'pattern_match',
        config: { matchAll: false },
      },
      {
        id: 'thoroughness',
        description: 'Provides thorough analysis',
        weight: 0.5,
        scoringFunction: 'length_check',
        config: { minLength: 200, maxLength: 20000 },
      },
    ]);
  });
});
