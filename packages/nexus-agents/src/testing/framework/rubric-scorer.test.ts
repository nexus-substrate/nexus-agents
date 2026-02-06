/**
 * Tests for Rubric Scorer
 *
 * @module testing/framework/rubric-scorer.test
 */

import { describe, it, expect } from 'vitest';
import { RubricScorer, createRubricScorer } from './rubric-scorer.js';
import type { EvaluationRubric, EvaluationTask, RubricCriterion } from './types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeCriterion(overrides: Partial<RubricCriterion> = {}): RubricCriterion {
  return {
    id: 'c1',
    description: 'Test criterion',
    weight: 1.0,
    scoringFunction: 'pattern_match',
    ...overrides,
  };
}

function makeRubric(overrides: Partial<EvaluationRubric> = {}): EvaluationRubric {
  return {
    id: 'rubric-1',
    categories: ['code_generation'],
    criteria: [makeCriterion()],
    ...overrides,
  };
}

function makeTask(overrides: Partial<EvaluationTask> = {}): EvaluationTask {
  return {
    id: 'task-1',
    name: 'Test Task',
    description: 'Test description',
    category: 'code_generation',
    difficulty: 'medium',
    expectedTaskType: 'code_generation',
    ...overrides,
  };
}

// ============================================================================
// RubricScorer — registration
// ============================================================================

describe('RubricScorer registration', () => {
  it('registers and retrieves a rubric by ID', () => {
    const scorer = new RubricScorer();
    const rubric = makeRubric({ id: 'my-rubric' });
    scorer.registerRubric(rubric);

    expect(scorer.getRubric('my-rubric')).toBe(rubric);
  });

  it('returns undefined for unknown rubric', () => {
    const scorer = new RubricScorer();
    expect(scorer.getRubric('nonexistent')).toBeUndefined();
  });

  it('registers multiple rubrics at once', () => {
    const scorer = new RubricScorer();
    const r1 = makeRubric({ id: 'r1', categories: ['code_generation'] });
    const r2 = makeRubric({ id: 'r2', categories: ['debugging'] });
    scorer.registerRubrics([r1, r2]);

    expect(scorer.getRubric('r1')).toBe(r1);
    expect(scorer.getRubric('r2')).toBe(r2);
  });

  it('finds rubric by category', () => {
    const scorer = new RubricScorer();
    const rubric = makeRubric({ categories: ['architecture', 'debugging'] });
    scorer.registerRubric(rubric);

    expect(scorer.getRubricForCategory('architecture')).toBe(rubric);
    expect(scorer.getRubricForCategory('debugging')).toBe(rubric);
    expect(scorer.getRubricForCategory('testing')).toBeUndefined();
  });
});

// ============================================================================
// RubricScorer — pattern scoring
// ============================================================================

describe('RubricScorer pattern scoring', () => {
  it('scores all patterns matching as 1.0', () => {
    const scorer = new RubricScorer();
    const task = makeTask({
      category: 'testing', // no rubric registered for this
      expectedPatterns: ['function', 'return'],
    });

    const result = scorer.score(task, 'function foo() { return 42; }');
    expect(result.overallScore).toBe(1.0);
  });

  it('scores partial pattern matches proportionally', () => {
    const scorer = new RubricScorer();
    const task = makeTask({
      category: 'testing',
      expectedPatterns: ['function', 'class', 'interface', 'type'],
    });

    const result = scorer.score(task, 'function foo() { return 42; }');
    expect(result.overallScore).toBe(0.25); // 1 out of 4
  });

  it('scores no patterns as 0', () => {
    const scorer = new RubricScorer();
    const task = makeTask({
      category: 'testing',
      expectedPatterns: ['class', 'interface'],
    });

    const result = scorer.score(task, 'nothing matches here');
    expect(result.overallScore).toBe(0);
  });

  it('gives 0.5 for empty patterns with content', () => {
    const scorer = new RubricScorer();
    const task = makeTask({ category: 'testing' });

    const result = scorer.score(task, 'some content');
    expect(result.overallScore).toBe(0.5);
  });

  it('gives 0 for empty patterns with empty response', () => {
    const scorer = new RubricScorer();
    const task = makeTask({ category: 'testing' });

    const result = scorer.score(task, '');
    expect(result.overallScore).toBe(0);
  });

  it('pattern matching is case-insensitive', () => {
    const scorer = new RubricScorer();
    const task = makeTask({
      category: 'testing',
      expectedPatterns: ['FUNCTION'],
    });

    const result = scorer.score(task, 'function foo()');
    expect(result.overallScore).toBe(1.0);
  });
});

// ============================================================================
// RubricScorer — rubric scoring
// ============================================================================

describe('RubricScorer rubric scoring', () => {
  it('uses rubric when category matches', () => {
    const scorer = new RubricScorer();
    const rubric = makeRubric({
      categories: ['code_generation'],
      criteria: [
        makeCriterion({
          id: 'kw',
          scoringFunction: 'keyword_presence',
          weight: 1.0,
          config: { keywords: ['function', 'return'] },
        }),
      ],
    });
    scorer.registerRubric(rubric);

    const task = makeTask({ category: 'code_generation' });
    const result = scorer.score(task, 'function foo() { return 42; }');

    expect(result.rubricId).toBe('rubric-1');
    expect(result.overallScore).toBeGreaterThan(0);
  });

  it('clamps overall score to [0, 1]', () => {
    const scorer = new RubricScorer();
    const rubric = makeRubric({
      categories: ['code_generation'],
      criteria: [makeCriterion({ weight: 1.0, scoringFunction: 'pattern_match' })],
    });
    scorer.registerRubric(rubric);

    const task = makeTask({
      category: 'code_generation',
      expectedPatterns: ['foo'],
    });
    const result = scorer.score(task, 'foo bar');

    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(1);
  });

  it('handles zero total weight gracefully', () => {
    const scorer = new RubricScorer();
    const rubric = makeRubric({
      categories: ['code_generation'],
      criteria: [],
    });
    scorer.registerRubric(rubric);

    const task = makeTask({ category: 'code_generation' });
    const result = scorer.scoreWithRubric(rubric, 'any response', task);

    expect(result.overallScore).toBe(0);
    expect(result.criterionScores).toHaveLength(0);
  });

  it('scores custom criterion as 0.5 when response has content', () => {
    const scorer = new RubricScorer();
    const rubric = makeRubric({
      criteria: [makeCriterion({ scoringFunction: 'custom', weight: 1.0 })],
    });

    const result = scorer.scoreWithRubric(rubric, 'some content');
    expect(result.overallScore).toBeCloseTo(0.5, 5);
  });

  it('scores custom criterion as 0 for empty response', () => {
    const scorer = new RubricScorer();
    const rubric = makeRubric({
      criteria: [makeCriterion({ scoringFunction: 'custom', weight: 1.0 })],
    });

    const result = scorer.scoreWithRubric(rubric, '  ');
    expect(result.overallScore).toBe(0);
  });

  it('returns 0 for unknown scoring function', () => {
    const scorer = new RubricScorer();
    const rubric = makeRubric({
      criteria: [
        makeCriterion({
          scoringFunction: 'nonexistent' as 'custom',
          weight: 1.0,
        }),
      ],
    });

    const result = scorer.scoreWithRubric(rubric, 'any response');
    expect(result.overallScore).toBe(0);
  });

  it('weights criteria correctly', () => {
    const scorer = new RubricScorer();
    const rubric = makeRubric({
      criteria: [
        makeCriterion({
          id: 'c1',
          scoringFunction: 'custom',
          weight: 0.8, // → 0.5 score
        }),
        makeCriterion({
          id: 'c2',
          scoringFunction: 'custom',
          weight: 0.2, // → 0.5 score
        }),
      ],
    });

    const result = scorer.scoreWithRubric(rubric, 'content');
    // Both custom criteria score 0.5
    // weighted sum = (0.5 * 0.8 + 0.5 * 0.2) / (0.8 + 0.2) = 0.5 / 1.0 = 0.5
    expect(result.overallScore).toBeCloseTo(0.5, 5);
    expect(result.criterionScores).toHaveLength(2);
  });

  it('includes explanations in criterion scores', () => {
    const scorer = new RubricScorer();
    const rubric = makeRubric({
      criteria: [
        makeCriterion({
          description: 'Code quality',
          scoringFunction: 'custom',
          weight: 1.0,
        }),
      ],
    });

    const result = scorer.scoreWithRubric(rubric, 'content');
    expect(result.criterionScores[0]?.explanation).toContain('Code quality');
    expect(result.criterionScores[0]?.explanation).toContain('50%');
  });

  it('has timestamp in ISO format', () => {
    const scorer = new RubricScorer();
    const rubric = makeRubric({
      criteria: [makeCriterion({ scoringFunction: 'custom', weight: 1.0 })],
    });

    const result = scorer.scoreWithRubric(rubric, 'content');
    expect(result.timestamp).toBeDefined();
    expect(typeof result.timestamp).toBe('string');
  });
});

// ============================================================================
// createRubricScorer factory
// ============================================================================

describe('createRubricScorer', () => {
  it('creates scorer without rubrics', () => {
    const scorer = createRubricScorer();
    expect(scorer.getRubric('any')).toBeUndefined();
  });

  it('creates scorer with pre-registered rubrics', () => {
    const rubric = makeRubric({ id: 'pre-registered' });
    const scorer = createRubricScorer([rubric]);
    expect(scorer.getRubric('pre-registered')).toBe(rubric);
  });
});
