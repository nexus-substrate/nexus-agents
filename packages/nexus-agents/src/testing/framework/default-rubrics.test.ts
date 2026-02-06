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

  it('criterion weights sum to approximately 1.0 per rubric', () => {
    for (const rubric of DEFAULT_RUBRICS) {
      const sum = rubric.criteria.reduce((acc, c) => acc + c.weight, 0);
      expect(sum).toBeCloseTo(1.0, 1);
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
// Specific rubric checks
// ============================================================================

describe('DEFAULT_RUBRICS - specific rubrics', () => {
  it('code-generation rubric exists with 3 criteria', () => {
    const rubric = DEFAULT_RUBRICS.find((r) => r.id === 'code-generation');
    expect(rubric).toBeDefined();
    expect(rubric?.criteria).toHaveLength(3);
  });

  it('code-review rubric exists with 3 criteria', () => {
    const rubric = DEFAULT_RUBRICS.find((r) => r.id === 'code-review');
    expect(rubric).toBeDefined();
    expect(rubric?.criteria).toHaveLength(3);
  });

  it('testing rubric exists with 3 criteria', () => {
    const rubric = DEFAULT_RUBRICS.find((r) => r.id === 'testing');
    expect(rubric).toBeDefined();
    expect(rubric?.criteria).toHaveLength(3);
  });

  it('large-context rubric exists with 2 criteria', () => {
    const rubric = DEFAULT_RUBRICS.find((r) => r.id === 'large-context');
    expect(rubric).toBeDefined();
    expect(rubric?.criteria).toHaveLength(2);
  });
});
