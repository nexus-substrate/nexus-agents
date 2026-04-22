/**
 * nexus-agents/testing/scoring - Scoring Utilities
 *
 * Metrics calculation and scoring for CLI testing framework.
 */

// Rubric scorer
export {
  RubricScorer,
  createRubricScorer,
  createCodeScorer,
  createTextScorer,
  ScoringErrorCode,
} from './rubric-scorer.js';

export type {
  CriterionScore,
  QualityResult,
  ScoringError,
  RubricScorerConfig,
} from './rubric-scorer.js';
