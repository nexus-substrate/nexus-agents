/**
 * nexus-agents/testing/framework - Rubric Scorer
 *
 * Scores task responses against evaluation rubrics.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 */

import type {
  EvaluationTask,
  EvaluationRubric,
  RubricCriterion,
  RubricScore,
  CriterionScore,
  TaskCategory,
} from './types.js';
import type {
  PatternMatchConfig,
  KeywordPresenceConfig,
  LengthCheckConfig,
} from './scoring-helpers.js';
import { scorePatternMatch, scoreKeywordPresence, scoreLengthCheck } from './scoring-helpers.js';

// Re-export from split files
export { DEFAULT_RUBRICS } from './default-rubrics.js';

/**
 * Scores task responses against evaluation rubrics.
 */
export class RubricScorer {
  private readonly rubrics: Map<string, EvaluationRubric> = new Map();

  /**
   * Registers a rubric with the scorer.
   */
  registerRubric(rubric: EvaluationRubric): void {
    this.rubrics.set(rubric.id, rubric);
  }

  /**
   * Registers multiple rubrics.
   */
  registerRubrics(rubrics: readonly EvaluationRubric[]): void {
    for (const rubric of rubrics) {
      this.registerRubric(rubric);
    }
  }

  /**
   * Gets a rubric by ID.
   */
  getRubric(id: string): EvaluationRubric | undefined {
    return this.rubrics.get(id);
  }

  /**
   * Gets a rubric for a task category.
   */
  getRubricForCategory(category: TaskCategory): EvaluationRubric | undefined {
    for (const rubric of this.rubrics.values()) {
      if (rubric.categories.includes(category)) {
        return rubric;
      }
    }
    return undefined;
  }

  /**
   * Scores a response against a task's expected patterns and rubric.
   */
  score(task: EvaluationTask, response: string): RubricScore {
    const rubric = this.getRubricForCategory(task.category);

    if (rubric !== undefined) {
      return this.scoreWithRubric(rubric, response, task);
    }

    return this.scoreWithPatterns(task, response);
  }

  /**
   * Scores a response using a specific rubric.
   */
  scoreWithRubric(rubric: EvaluationRubric, response: string, task?: EvaluationTask): RubricScore {
    const criterionScores: CriterionScore[] = [];
    let totalWeight = 0;
    let weightedSum = 0;

    for (const criterion of rubric.criteria) {
      const rawScore = this.scoreCriterion(criterion, response, task);
      const weightedScore = rawScore * criterion.weight;

      criterionScores.push({
        criterionId: criterion.id,
        score: rawScore,
        weightedScore,
        explanation: this.getExplanation(criterion, rawScore),
      });

      totalWeight += criterion.weight;
      weightedSum += weightedScore;
    }

    const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    return {
      overallScore: Math.min(1, Math.max(0, overallScore)),
      criterionScores,
      rubricId: rubric.id,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Scores a response using only the task's expected patterns.
   */
  private scoreWithPatterns(task: EvaluationTask, response: string): RubricScore {
    const patterns = task.expectedPatterns ?? [];
    const criterionScores: CriterionScore[] = [];

    if (patterns.length === 0) {
      return this.scoreEmptyPatterns(response, criterionScores);
    }

    return this.scorePatternMatches(patterns, response, criterionScores);
  }

  /**
   * Scores when no patterns are defined.
   */
  private scoreEmptyPatterns(response: string, criterionScores: CriterionScore[]): RubricScore {
    const hasContent = response.trim().length > 0;
    const baseScore = hasContent ? 0.5 : 0;

    criterionScores.push({
      criterionId: 'content-presence',
      score: baseScore,
      weightedScore: baseScore,
      explanation: hasContent ? 'Response has content' : 'Response is empty',
    });

    return {
      overallScore: baseScore,
      criterionScores,
      rubricId: 'fallback-patterns',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Scores pattern matches.
   */
  private scorePatternMatches(
    patterns: readonly string[],
    response: string,
    criterionScores: CriterionScore[]
  ): RubricScore {
    const lowerResponse = response.toLowerCase();
    let matchCount = 0;

    for (const pattern of patterns) {
      const matches = lowerResponse.includes(pattern.toLowerCase());
      if (matches) {
        matchCount++;
      }

      criterionScores.push({
        criterionId: `pattern-${pattern}`,
        score: matches ? 1 : 0,
        weightedScore: matches ? 1 / patterns.length : 0,
        explanation: matches ? `Pattern "${pattern}" found` : `Pattern "${pattern}" not found`,
      });
    }

    const overallScore = patterns.length > 0 ? matchCount / patterns.length : 0;

    return {
      overallScore,
      criterionScores,
      rubricId: 'fallback-patterns',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Scores a single criterion.
   */
  private scoreCriterion(
    criterion: RubricCriterion,
    response: string,
    task?: EvaluationTask
  ): number {
    switch (criterion.scoringFunction) {
      case 'pattern_match':
        return scorePatternMatch(
          criterion.config as unknown as PatternMatchConfig | undefined,
          response,
          task?.expectedPatterns
        );
      case 'keyword_presence':
        return scoreKeywordPresence(
          criterion.config as unknown as KeywordPresenceConfig | undefined,
          response
        );
      case 'length_check':
        return scoreLengthCheck(
          criterion.config as unknown as LengthCheckConfig | undefined,
          response
        );
      case 'custom':
        return this.scoreCustom(response);
      default:
        return 0;
    }
  }

  /**
   * Scores custom criteria (placeholder for extensibility).
   */
  private scoreCustom(response: string): number {
    return response.trim().length > 0 ? 0.5 : 0;
  }

  /**
   * Generates an explanation for a criterion score.
   */
  private getExplanation(criterion: RubricCriterion, score: number): string {
    const level = this.getScoreLevel(score);
    return `${criterion.description}: ${level} (${(score * 100).toFixed(0)}%)`;
  }

  /**
   * Gets the level description for a score.
   */
  private getScoreLevel(score: number): string {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.6) return 'good';
    if (score >= 0.4) return 'fair';
    return 'poor';
  }
}

/**
 * Creates a new rubric scorer.
 */
export function createRubricScorer(rubrics?: readonly EvaluationRubric[]): RubricScorer {
  const scorer = new RubricScorer();
  if (rubrics !== undefined) {
    scorer.registerRubrics(rubrics);
  }
  return scorer;
}
