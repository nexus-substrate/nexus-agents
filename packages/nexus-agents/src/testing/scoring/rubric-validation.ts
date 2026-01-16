/**
 * nexus-agents/testing/scoring - Rubric Validation
 *
 * Validates rubric and criterion configurations.
 * Extracted from rubric-scorer.ts for complexity reduction.
 */

import type { Result } from '../../core/index.js';
import { ok, err } from '../../core/index.js';
import type { ScoringRubric, RubricCriterion } from '../task-types.js';
import type { ScoringError } from './rubric-types.js';
import { ScoringErrorCode } from './rubric-types.js';

/**
 * Validate that response is not empty.
 */
function validateResponse(response: string): Result<void, ScoringError> {
  if (response.trim().length === 0) {
    return err({
      code: ScoringErrorCode.EMPTY_RESPONSE,
      message: 'Response is empty or contains only whitespace',
    });
  }
  return ok(undefined);
}

/**
 * Validate that rubric has criteria.
 */
function validateRubricCriteria(rubric: ScoringRubric): Result<void, ScoringError> {
  if (rubric.criteria.length === 0) {
    return err({
      code: ScoringErrorCode.INVALID_RUBRIC,
      message: 'Rubric has no criteria defined',
    });
  }
  return ok(undefined);
}

/**
 * Validate that criteria weights are valid.
 */
function validateCriteriaWeights(rubric: ScoringRubric): Result<void, ScoringError> {
  const totalWeight = rubric.criteria.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight <= 0) {
    return err({
      code: ScoringErrorCode.INVALID_RUBRIC,
      message: 'Rubric criteria weights sum to zero or less',
    });
  }
  return ok(undefined);
}

/**
 * Validate criterion id and name.
 */
function validateCriterionIdentity(criterion: RubricCriterion): Result<void, ScoringError> {
  if (criterion.id === '' || criterion.name === '') {
    return err({
      code: ScoringErrorCode.INVALID_CRITERION,
      message: 'Criterion missing id or name',
      criterion: criterion.id === '' ? 'unknown' : criterion.id,
    });
  }
  return ok(undefined);
}

/**
 * Validate criterion maxPoints.
 */
function validateCriterionPoints(criterion: RubricCriterion): Result<void, ScoringError> {
  if (criterion.maxPoints < 0) {
    return err({
      code: ScoringErrorCode.INVALID_CRITERION,
      message: 'Criterion maxPoints cannot be negative',
      criterion: criterion.id,
    });
  }
  return ok(undefined);
}

/**
 * Validate criterion weight.
 */
function validateCriterionWeight(criterion: RubricCriterion): Result<void, ScoringError> {
  if (criterion.weight < 0 || criterion.weight > 1) {
    return err({
      code: ScoringErrorCode.INVALID_CRITERION,
      message: 'Criterion weight must be between 0 and 1',
      criterion: criterion.id,
    });
  }
  return ok(undefined);
}

/**
 * Validate a single criterion.
 */
function validateCriterion(criterion: RubricCriterion): Result<void, ScoringError> {
  const identityResult = validateCriterionIdentity(criterion);
  if (!identityResult.ok) return identityResult;

  const pointsResult = validateCriterionPoints(criterion);
  if (!pointsResult.ok) return pointsResult;

  return validateCriterionWeight(criterion);
}

/**
 * Validate all criteria in a rubric.
 */
function validateAllCriteria(rubric: ScoringRubric): Result<void, ScoringError> {
  for (const criterion of rubric.criteria) {
    const result = validateCriterion(criterion);
    if (!result.ok) return result;
  }
  return ok(undefined);
}

/**
 * Validate inputs for rubric scoring.
 *
 * @param response - The response to validate
 * @param rubric - The rubric to validate
 * @returns Result indicating success or validation error
 */
export function validateScoringInputs(
  response: string,
  rubric: ScoringRubric
): Result<void, ScoringError> {
  // Check for empty response
  const responseResult = validateResponse(response);
  if (!responseResult.ok) return responseResult;

  // Validate rubric has criteria
  const criteriaResult = validateRubricCriteria(rubric);
  if (!criteriaResult.ok) return criteriaResult;

  // Validate weights
  const weightsResult = validateCriteriaWeights(rubric);
  if (!weightsResult.ok) return weightsResult;

  // Validate each criterion
  return validateAllCriteria(rubric);
}
