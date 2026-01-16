/**
 * nexus-agents/testing/scoring - Rubric Scorer
 *
 * Deterministic scoring of CLI responses based on scoring rubrics.
 * Supports exact, contains, regex, and semantic matching types.
 */

import type { Result } from '../../core/index.js';
import { ok } from '../../core/index.js';
import type {
  ScoringRubric,
  RubricCriterion,
  ExpectedOutcome,
  AutomatedCheckType,
} from '../task-types.js';
import type { CheckResult } from './scoring-checks.js';
import {
  runKeywordCheck,
  runPatternCheck,
  runLengthCheck,
  runJsonCheck,
  checkRegexMatch,
} from './scoring-checks.js';
import { scoreAgainstOutcome } from './outcome-scorer.js';
import { validateScoringInputs } from './rubric-validation.js';
import type {
  CriterionScore,
  QualityResult,
  ScoringError,
  RubricScorerConfig,
} from './rubric-types.js';

// Re-export types for backwards compatibility
export type {
  CriterionScore,
  QualityResult,
  ScoringError,
  RubricScorerConfig,
} from './rubric-types.js';
export { ScoringErrorCode } from './rubric-types.js';

const DEFAULT_CONFIG: RubricScorerConfig = {
  caseSensitive: false,
  trimWhitespace: true,
  normalizeWhitespace: true,
  semanticThreshold: 0.8,
};

/**
 * RubricScorer - Deterministic scoring of responses based on rubrics.
 */
export class RubricScorer {
  private readonly config: RubricScorerConfig;

  constructor(config: Partial<RubricScorerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Score a response against a rubric and expected outcome.
   */
  scoreResponse(
    response: string,
    rubric: ScoringRubric,
    expectedOutcome: ExpectedOutcome
  ): Result<QualityResult, ScoringError> {
    const validationResult = validateScoringInputs(response, rubric);
    if (!validationResult.ok) {
      return validationResult;
    }

    const processedResponse = this.preprocessResponse(response);
    const { criteriaScores, totalWeightedScore, maxWeightedScore } = this.scoreAllCriteria(
      processedResponse,
      rubric,
      expectedOutcome
    );

    const overallScore = this.calculateOverallScore(totalWeightedScore, maxWeightedScore);
    const passed = overallScore >= rubric.passingScore;

    return ok({
      score: overallScore,
      passed,
      passingScore: rubric.passingScore,
      criteriaScores,
      evaluationMethod: this.determineEvaluationMethod(rubric),
      totalWeightedScore,
      maxWeightedScore,
      summary: this.generateSummary(criteriaScores, overallScore, passed, rubric),
      evaluatedAt: new Date().toISOString(),
    });
  }

  /**
   * Score all criteria in the rubric.
   */
  private scoreAllCriteria(
    response: string,
    rubric: ScoringRubric,
    expected: ExpectedOutcome
  ): { criteriaScores: CriterionScore[]; totalWeightedScore: number; maxWeightedScore: number } {
    const criteriaScores: CriterionScore[] = [];
    let totalWeightedScore = 0;
    let maxWeightedScore = 0;

    for (const criterion of rubric.criteria) {
      const score = this.scoreCriterion(response, criterion, expected);
      criteriaScores.push(score);
      totalWeightedScore += score.weightedScore;
      maxWeightedScore += score.maxWeightedScore;
    }

    return { criteriaScores, totalWeightedScore, maxWeightedScore };
  }

  /**
   * Score a single criterion.
   */
  private scoreCriterion(
    response: string,
    criterion: RubricCriterion,
    expected: ExpectedOutcome
  ): CriterionScore {
    const checkResult = this.getCheckResult(response, criterion, expected);
    const finalScore = this.applyScoringType(checkResult.score, criterion);
    const weightedScore = (finalScore / 100) * criterion.maxPoints * criterion.weight;

    return this.buildCriterionScore(criterion, finalScore, weightedScore, checkResult);
  }

  /**
   * Get check result from automated check or expected outcome.
   */
  private getCheckResult(
    response: string,
    criterion: RubricCriterion,
    expected: ExpectedOutcome
  ): CheckResult {
    if (criterion.automatedCheck) {
      return this.runAutomatedCheck(
        response,
        criterion.automatedCheck.type,
        criterion.automatedCheck.config
      );
    }
    return scoreAgainstOutcome(response, expected, this.config.caseSensitive);
  }

  /**
   * Run an automated check.
   */
  private runAutomatedCheck(
    response: string,
    checkType: AutomatedCheckType,
    config: Readonly<Record<string, unknown>>
  ): CheckResult {
    switch (checkType) {
      case 'pattern_match': {
        const patterns = config['patterns'] as readonly string[] | undefined;
        return runPatternCheck({
          response,
          patterns: patterns ?? [],
          caseSensitive: this.config.caseSensitive,
        });
      }
      case 'keyword_presence':
        return runKeywordCheck({
          response,
          mustContain: config['mustContain'] as readonly string[] | undefined,
          mustNotContain: config['mustNotContain'] as readonly string[] | undefined,
          caseSensitive: this.config.caseSensitive,
        });
      case 'length_check':
        return runLengthCheck(
          response,
          config['minLength'] as number | undefined,
          config['maxLength'] as number | undefined
        );
      case 'json_schema':
        return runJsonCheck(response);
      case 'code_compile':
      case 'code_lint':
      case 'custom':
        return { score: 50, feedback: `${checkType} check requires external validation` };
      default:
        return { score: 0, feedback: `Unknown check type: ${String(checkType)}` };
    }
  }

  /**
   * Build the criterion score object.
   */
  private buildCriterionScore(
    criterion: RubricCriterion,
    finalScore: number,
    weightedScore: number,
    checkResult: CheckResult
  ): CriterionScore {
    return {
      criterion: criterion.id,
      criterionName: criterion.name,
      score: finalScore,
      weight: criterion.weight,
      weightedScore,
      maxWeightedScore: criterion.maxPoints * criterion.weight,
      feedback: checkResult.feedback,
      ...(checkResult.matchedTerms &&
        checkResult.matchedTerms.length > 0 && { matchedTerms: checkResult.matchedTerms }),
      ...(checkResult.missingTerms &&
        checkResult.missingTerms.length > 0 && { missingTerms: checkResult.missingTerms }),
      ...(checkResult.violationTerms &&
        checkResult.violationTerms.length > 0 && { violationTerms: checkResult.violationTerms }),
    };
  }

  /**
   * Apply scoring type to raw score.
   */
  private applyScoringType(rawScore: number, criterion: RubricCriterion): number {
    switch (criterion.scoringType) {
      case 'binary':
        return rawScore >= 50 ? 100 : 0;
      case 'scale':
        if (criterion.levels && criterion.levels.length > 0) {
          return this.scoreByLevels(rawScore, criterion.levels, criterion.maxPoints);
        }
        return rawScore;
      case 'percentage':
      case 'automated':
      default:
        return rawScore;
    }
  }

  /**
   * Score based on defined levels.
   */
  private scoreByLevels(
    rawScore: number,
    levels: readonly { points: number; description: string }[],
    maxPoints: number
  ): number {
    const sortedLevels = [...levels].sort((a, b) => b.points - a.points);
    for (const level of sortedLevels) {
      const levelThreshold = (level.points / maxPoints) * 100;
      if (rawScore >= levelThreshold) {
        return (level.points / maxPoints) * 100;
      }
    }
    return 0;
  }

  /**
   * Calculate overall score.
   */
  private calculateOverallScore(totalWeightedScore: number, maxWeightedScore: number): number {
    return maxWeightedScore > 0 ? Math.round((totalWeightedScore / maxWeightedScore) * 100) : 0;
  }

  /**
   * Preprocess response before scoring.
   */
  private preprocessResponse(response: string): string {
    let processed = response;
    if (this.config.trimWhitespace) {
      processed = processed.trim();
    }
    if (this.config.normalizeWhitespace) {
      processed = processed.replace(/\s+/g, ' ');
    }
    return processed;
  }

  /**
   * Generate summary feedback.
   */
  private generateSummary(
    criteriaScores: readonly CriterionScore[],
    overallScore: number,
    passed: boolean,
    rubric: ScoringRubric
  ): string {
    const parts: string[] = [];
    const passedStr = passed ? 'PASSED' : 'FAILED';
    parts.push(`Overall score: ${String(overallScore)}/100 (${passedStr})`);
    parts.push(`Passing threshold: ${String(rubric.passingScore)}`);

    const sorted = [...criteriaScores].sort((a, b) => a.score - b.score);
    if (sorted.length > 0) {
      const weakest = sorted[0];
      const strongest = sorted[sorted.length - 1];
      if (weakest !== undefined && weakest.score < 100) {
        parts.push(`Weakest: ${weakest.criterionName} (${String(weakest.score)}%)`);
      }
      if (strongest !== undefined && strongest !== weakest) {
        parts.push(`Strongest: ${strongest.criterionName} (${String(strongest.score)}%)`);
      }
    }
    return parts.join('. ');
  }

  /**
   * Determine the evaluation method based on rubric configuration.
   */
  private determineEvaluationMethod(rubric: ScoringRubric): 'rubric' | 'exact-match' | 'contains' {
    const allExact = rubric.criteria.every(
      (c) => c.automatedCheck?.type === 'pattern_match' && c.scoringType === 'binary'
    );
    if (allExact) return 'exact-match';

    const allContains = rubric.criteria.every((c) => c.automatedCheck?.type === 'keyword_presence');
    if (allContains) return 'contains';

    return 'rubric';
  }

  /**
   * Check if response contains all required terms.
   */
  checkContains(response: string, terms: string[], caseSensitive: boolean = false): number {
    if (terms.length === 0) return 100;
    const responseToCheck = caseSensitive ? response : response.toLowerCase();
    let foundCount = 0;
    for (const term of terms) {
      const termToCheck = caseSensitive ? term : term.toLowerCase();
      if (responseToCheck.includes(termToCheck)) foundCount++;
    }
    return Math.round((foundCount / terms.length) * 100);
  }

  /**
   * Check if response contains any forbidden terms.
   */
  checkMustNotContain(response: string, terms: string[], caseSensitive: boolean = false): number {
    if (terms.length === 0) return 100;
    const responseToCheck = caseSensitive ? response : response.toLowerCase();
    let violationCount = 0;
    for (const term of terms) {
      const termToCheck = caseSensitive ? term : term.toLowerCase();
      if (responseToCheck.includes(termToCheck)) violationCount++;
    }
    return Math.round(((terms.length - violationCount) / terms.length) * 100);
  }

  /**
   * Check if response exactly matches expected string.
   */
  checkExactMatch(response: string, expected: string, caseSensitive: boolean = false): number {
    const responseToCheck = caseSensitive ? response : response.toLowerCase();
    const expectedToCheck = caseSensitive ? expected : expected.toLowerCase();
    return responseToCheck.trim() === expectedToCheck.trim() ? 100 : 0;
  }

  /**
   * Check if response matches a regex pattern.
   */
  checkRegexMatch(response: string, pattern: string, caseSensitive: boolean = false): number {
    return checkRegexMatch(response, pattern, caseSensitive);
  }
}

/**
 * Factory function to create a RubricScorer.
 */
export function createRubricScorer(config?: Partial<RubricScorerConfig>): RubricScorer {
  return new RubricScorer(config);
}

/**
 * Create a scorer optimized for code evaluation.
 */
export function createCodeScorer(): RubricScorer {
  return new RubricScorer({
    caseSensitive: true,
    trimWhitespace: true,
    normalizeWhitespace: false,
    semanticThreshold: 0.9,
  });
}

/**
 * Create a scorer optimized for text/documentation evaluation.
 */
export function createTextScorer(): RubricScorer {
  return new RubricScorer({
    caseSensitive: false,
    trimWhitespace: true,
    normalizeWhitespace: true,
    semanticThreshold: 0.7,
  });
}
