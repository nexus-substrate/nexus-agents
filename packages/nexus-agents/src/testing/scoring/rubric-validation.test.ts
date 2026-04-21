/**
 * Tests for rubric-validation.ts
 *
 * Covers response validation, rubric criteria presence, weight validation,
 * criterion identity/points/weight validation, and the combined validation chain.
 */

import { describe, it, expect } from 'vitest';
import { validateScoringInputs } from './rubric-validation.js';
import { ScoringErrorCode } from './rubric-types.js';
import type { ScoringRubric, RubricCriterion } from '../task-types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeCriterion(overrides: Partial<RubricCriterion> = {}): RubricCriterion {
  return {
    id: 'crit-1',
    name: 'Quality',
    description: 'Code quality check',
    maxPoints: 10,
    weight: 0.5,
    scoringType: 'binary',
    ...overrides,
  };
}

function makeRubric(overrides: Partial<ScoringRubric> = {}): ScoringRubric {
  return {
    id: 'rubric-1',
    name: 'Test Rubric',
    totalPoints: 10,
    passingScore: 5,
    criteria: [makeCriterion()],
    ...overrides,
  };
}

// ============================================================================
// validateScoringInputs — response validation
// ============================================================================

describe('validateScoringInputs - response', () => {
  it('rejects empty response', () => {
    const result = validateScoringInputs('', makeRubric());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.EMPTY_RESPONSE);
    }
  });

  it('rejects whitespace-only response', () => {
    const result = validateScoringInputs('   \n\t  ', makeRubric());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.EMPTY_RESPONSE);
    }
  });

  it('accepts non-empty response', () => {
    const result = validateScoringInputs('Hello world', makeRubric());
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// validateScoringInputs — rubric criteria presence
// ============================================================================

describe('validateScoringInputs - rubric criteria', () => {
  it('rejects rubric with no criteria', () => {
    const rubric = makeRubric({ criteria: [] });
    const result = validateScoringInputs('valid response', rubric);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.INVALID_RUBRIC);
      expect(result.error.message).toContain('no criteria');
    }
  });

  it('accepts rubric with one criterion', () => {
    const result = validateScoringInputs('valid response', makeRubric());
    expect(result.ok).toBe(true);
  });

  it('accepts rubric with multiple criteria', () => {
    const rubric = makeRubric({
      criteria: [
        makeCriterion({ id: 'c1', weight: 0.3 }),
        makeCriterion({ id: 'c2', weight: 0.7 }),
      ],
    });
    const result = validateScoringInputs('valid response', rubric);
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// validateScoringInputs — criteria weights
// ============================================================================

describe('validateScoringInputs - weights', () => {
  it('rejects when all weights are zero', () => {
    const rubric = makeRubric({
      criteria: [makeCriterion({ weight: 0 }), makeCriterion({ id: 'c2', weight: 0 })],
    });
    const result = validateScoringInputs('valid response', rubric);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.INVALID_RUBRIC);
      expect(result.error.message).toContain('weight');
    }
  });

  it('accepts when at least one weight is positive', () => {
    const rubric = makeRubric({
      criteria: [makeCriterion({ weight: 0 }), makeCriterion({ id: 'c2', weight: 0.5 })],
    });
    const result = validateScoringInputs('valid response', rubric);
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// validateScoringInputs — criterion identity
// ============================================================================

describe('validateScoringInputs - criterion identity', () => {
  it('rejects criterion with empty id', () => {
    const rubric = makeRubric({ criteria: [makeCriterion({ id: '' })] });
    const result = validateScoringInputs('valid response', rubric);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.INVALID_CRITERION);
      expect(result.error.criterion).toBe('unknown');
    }
  });

  it('rejects criterion with empty name', () => {
    const rubric = makeRubric({ criteria: [makeCriterion({ name: '' })] });
    const result = validateScoringInputs('valid response', rubric);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.INVALID_CRITERION);
      expect(result.error.criterion).toBe('crit-1');
    }
  });

  it('sets criterion to "unknown" when id is empty', () => {
    const rubric = makeRubric({ criteria: [makeCriterion({ id: '', name: '' })] });
    const result = validateScoringInputs('valid response', rubric);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.criterion).toBe('unknown');
    }
  });
});

// ============================================================================
// validateScoringInputs — criterion points
// ============================================================================

describe('validateScoringInputs - criterion points', () => {
  it('rejects negative maxPoints', () => {
    const rubric = makeRubric({ criteria: [makeCriterion({ maxPoints: -1 })] });
    const result = validateScoringInputs('valid response', rubric);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.INVALID_CRITERION);
      expect(result.error.message).toContain('negative');
    }
  });

  it('accepts zero maxPoints', () => {
    const rubric = makeRubric({ criteria: [makeCriterion({ maxPoints: 0 })] });
    const result = validateScoringInputs('valid response', rubric);
    expect(result.ok).toBe(true);
  });

  it('accepts positive maxPoints', () => {
    const rubric = makeRubric({ criteria: [makeCriterion({ maxPoints: 100 })] });
    const result = validateScoringInputs('valid response', rubric);
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// validateScoringInputs — criterion weight boundaries
// ============================================================================

describe('validateScoringInputs - criterion weight', () => {
  it('rejects weight below 0', () => {
    const rubric = makeRubric({
      criteria: [makeCriterion({ weight: -0.1 }), makeCriterion({ id: 'c2', weight: 1 })],
    });
    const result = validateScoringInputs('valid response', rubric);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.INVALID_CRITERION);
      expect(result.error.message).toContain('between 0 and 1');
    }
  });

  it('rejects weight above 1', () => {
    const rubric = makeRubric({ criteria: [makeCriterion({ weight: 1.5 })] });
    const result = validateScoringInputs('valid response', rubric);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.INVALID_CRITERION);
    }
  });

  it('accepts weight at boundary 0', () => {
    const rubric = makeRubric({
      criteria: [makeCriterion({ weight: 0 }), makeCriterion({ id: 'c2', weight: 1 })],
    });
    const result = validateScoringInputs('valid response', rubric);
    expect(result.ok).toBe(true);
  });

  it('accepts weight at boundary 1', () => {
    const rubric = makeRubric({ criteria: [makeCriterion({ weight: 1 })] });
    const result = validateScoringInputs('valid response', rubric);
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// validateScoringInputs — validation chain order
// ============================================================================

describe('validateScoringInputs - chain order', () => {
  it('checks response before rubric', () => {
    const rubric = makeRubric({ criteria: [] });
    const result = validateScoringInputs('', rubric);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Should fail on empty response, not empty criteria
      expect(result.error.code).toBe(ScoringErrorCode.EMPTY_RESPONSE);
    }
  });

  it('checks criteria presence before weights', () => {
    const rubric = makeRubric({ criteria: [] });
    const result = validateScoringInputs('valid', rubric);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ScoringErrorCode.INVALID_RUBRIC);
      expect(result.error.message).toContain('no criteria');
    }
  });

  it('checks identity before points', () => {
    const rubric = makeRubric({
      criteria: [makeCriterion({ id: '', maxPoints: -1 })],
    });
    const result = validateScoringInputs('valid', rubric);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('id or name');
    }
  });

  it('checks points before weight', () => {
    const rubric = makeRubric({
      criteria: [makeCriterion({ maxPoints: -5, weight: 2 })],
    });
    const result = validateScoringInputs('valid', rubric);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('negative');
    }
  });

  it('stops at first invalid criterion', () => {
    const rubric = makeRubric({
      criteria: [
        makeCriterion({ id: 'ok', weight: 0.5 }),
        makeCriterion({ id: '', name: '', weight: 0.5 }),
      ],
    });
    const result = validateScoringInputs('valid', rubric);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.criterion).toBe('unknown');
    }
  });
});
