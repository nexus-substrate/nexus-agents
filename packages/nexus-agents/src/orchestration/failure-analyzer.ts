/**
 * Failure Analyzer — detects failure patterns in spec execution results.
 *
 * Analyzes unmet acceptance criteria to categorize failures
 * and suggest improvements for the self-improvement loop.
 *
 * @module orchestration/failure-analyzer
 * (Source: Issue #852 — Phase 4 of AI Software Factory Epic #843)
 */

import type { Result } from '../core/index.js';
import { ok } from '../core/index.js';
import type { SpecExecutionResult } from './spec-executor-types.js';
import type { CriterionResult } from './scenario-validator-types.js';
import type {
  FailureAnalysis,
  CriterionFailure,
  ImprovementSuggestion,
  FailureType,
} from './failure-analyzer-types.js';

/**
 * Analyzes execution results for failure patterns.
 */
export function analyzeFailures(
  executionResult: SpecExecutionResult
): Result<FailureAnalysis, never> {
  const { validation, outputs } = executionResult;

  if (validation.allMet) {
    return ok({
      passed: true,
      satisfaction: validation.satisfaction,
      failures: [],
      suggestions: [],
    });
  }

  const unmet = validation.criteria.filter((c) => !c.met);
  const failures = unmet.map((c) => classifyFailure(c, outputs));
  const suggestions = unmet.map((c) => suggestImprovement(c));

  return ok({
    passed: false,
    satisfaction: validation.satisfaction,
    failures,
    suggestions,
  });
}

/** Classifies the type of failure for an unmet criterion. */
function classifyFailure(criterion: CriterionResult, outputs: readonly string[]): CriterionFailure {
  const failureType = determineFailureType(criterion, outputs);
  return {
    criterion: criterion.criterion,
    type: failureType,
    explanation: buildExplanation(failureType, criterion.criterion),
  };
}

/** Determines the failure type based on context. */
function determineFailureType(criterion: CriterionResult, outputs: readonly string[]): FailureType {
  if (outputs.length === 0) return 'no_output';
  if (criterion.matchedResults.length > 0) return 'partial_match';
  return 'missing_implementation';
}

/** Builds a human-readable explanation. */
function buildExplanation(type: FailureType, criterion: string): string {
  switch (type) {
    case 'no_output':
      return `No execution output produced for: "${criterion}"`;
    case 'partial_match':
      return `Partial match found but insufficient for: "${criterion}"`;
    case 'missing_implementation':
      return `No matching implementation found for: "${criterion}"`;
  }
}

/** Suggests an improvement for an unmet criterion. */
function suggestImprovement(criterion: CriterionResult): ImprovementSuggestion {
  const hasPartial = criterion.matchedResults.length > 0;
  return {
    action: hasPartial
      ? `Refine implementation to fully satisfy: "${criterion.criterion}"`
      : `Add subtask to implement: "${criterion.criterion}"`,
    targetCriterion: criterion.criterion,
    priority: hasPartial ? 2 : 1,
  };
}
