/**
 * nexus-agents/testing/scoring - Outcome Scorer
 *
 * Scores responses against expected outcome specifications.
 * Extracted from rubric-scorer.ts for complexity reduction.
 */

import type { ExpectedOutcome } from '../task-types.js';
import type { CheckResult } from './scoring-checks.js';
import { checkRegexMatch, runLengthCheck } from './scoring-checks.js';

/**
 * Check required patterns against response.
 */
function checkRequiredPatterns(
  response: string,
  patterns: readonly string[],
  caseSensitive: boolean
): { score: number; matchedTerms: string[]; missingTerms: string[] } {
  let totalScore = 0;
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  for (const pattern of patterns) {
    const patternScore = checkRegexMatch(response, pattern, caseSensitive);
    totalScore += patternScore;
    if (patternScore > 0) {
      matchedTerms.push(pattern);
    } else {
      missingTerms.push(pattern);
    }
  }

  return { score: totalScore, matchedTerms, missingTerms };
}

/**
 * Check forbidden patterns against response.
 */
function checkForbiddenPatterns(
  response: string,
  patterns: readonly string[],
  caseSensitive: boolean
): { score: number; violationTerms: string[] } {
  let totalScore = 0;
  const violationTerms: string[] = [];

  for (const pattern of patterns) {
    const patternScore = checkRegexMatch(response, pattern, caseSensitive);
    if (patternScore > 0) {
      violationTerms.push(pattern);
      // No points for violations
    } else {
      totalScore += 100;
    }
  }

  return { score: totalScore, violationTerms };
}

/**
 * Check exact match against golden output.
 */
function checkGoldenOutput(
  response: string,
  goldenOutput: string,
  caseSensitive: boolean
): { score: number; matched: boolean } {
  const responseToCheck = caseSensitive ? response : response.toLowerCase();
  const goldenToCheck = caseSensitive ? goldenOutput : goldenOutput.toLowerCase();
  const matched = responseToCheck.trim() === goldenToCheck.trim();
  return { score: matched ? 100 : 0, matched };
}

/**
 * Aggregate the results from all outcome checks.
 */
interface OutcomeCheckAggregator {
  totalScore: number;
  totalChecks: number;
  feedbackParts: string[];
  matchedTerms: string[];
  missingTerms: string[];
  violationTerms: string[];
}

/**
 * Initialize the aggregator.
 */
function createAggregator(): OutcomeCheckAggregator {
  return {
    totalScore: 0,
    totalChecks: 0,
    feedbackParts: [],
    matchedTerms: [],
    missingTerms: [],
    violationTerms: [],
  };
}

/**
 * Add required pattern results to aggregator.
 */
function addRequiredPatternResults(
  aggregator: OutcomeCheckAggregator,
  response: string,
  patterns: readonly string[],
  caseSensitive: boolean
): void {
  const result = checkRequiredPatterns(response, patterns, caseSensitive);
  aggregator.totalScore += result.score;
  aggregator.totalChecks += patterns.length;
  aggregator.matchedTerms.push(...result.matchedTerms);
  aggregator.missingTerms.push(...result.missingTerms);

  if (result.missingTerms.length > 0) {
    aggregator.feedbackParts.push(`Missing patterns: ${String(result.missingTerms.length)}`);
  }
}

/**
 * Add forbidden pattern results to aggregator.
 */
function addForbiddenPatternResults(
  aggregator: OutcomeCheckAggregator,
  response: string,
  patterns: readonly string[],
  caseSensitive: boolean
): void {
  const result = checkForbiddenPatterns(response, patterns, caseSensitive);
  aggregator.totalScore += result.score;
  aggregator.totalChecks += patterns.length;
  aggregator.violationTerms.push(...result.violationTerms);

  if (result.violationTerms.length > 0) {
    aggregator.feedbackParts.push(
      `Forbidden pattern violations: ${String(result.violationTerms.length)}`
    );
  }
}

/**
 * Add golden output check to aggregator.
 */
function addGoldenOutputResult(
  aggregator: OutcomeCheckAggregator,
  response: string,
  goldenOutput: string,
  caseSensitive: boolean
): void {
  const result = checkGoldenOutput(response, goldenOutput, caseSensitive);
  aggregator.totalScore += result.score;
  aggregator.totalChecks += 1;

  if (!result.matched) {
    aggregator.feedbackParts.push('Does not match golden output');
  }
}

/**
 * Add length check to aggregator.
 */
function addLengthCheckResult(
  aggregator: OutcomeCheckAggregator,
  response: string,
  minLength: number | undefined,
  maxLength: number | undefined
): void {
  const result = runLengthCheck(response, minLength, maxLength);
  aggregator.totalScore += result.score;
  aggregator.totalChecks += 1;

  if (result.score < 100) {
    aggregator.feedbackParts.push(result.feedback);
  }
}

/**
 * Build final result from aggregator.
 */
function buildResultFromAggregator(aggregator: OutcomeCheckAggregator): CheckResult {
  const averageScore =
    aggregator.totalChecks > 0 ? Math.round(aggregator.totalScore / aggregator.totalChecks) : 100;

  const feedback =
    aggregator.feedbackParts.length > 0 ? aggregator.feedbackParts.join('; ') : 'All checks passed';

  return {
    score: averageScore,
    feedback,
    ...(aggregator.matchedTerms.length > 0 && { matchedTerms: aggregator.matchedTerms }),
    ...(aggregator.missingTerms.length > 0 && { missingTerms: aggregator.missingTerms }),
    ...(aggregator.violationTerms.length > 0 && { violationTerms: aggregator.violationTerms }),
  };
}

/**
 * Score a response against an expected outcome specification.
 */
export function scoreAgainstOutcome(
  response: string,
  expected: ExpectedOutcome,
  caseSensitive: boolean
): CheckResult {
  const aggregator = createAggregator();

  // Check required patterns
  if (expected.requiredPatterns !== undefined && expected.requiredPatterns.length > 0) {
    addRequiredPatternResults(aggregator, response, expected.requiredPatterns, caseSensitive);
  }

  // Check forbidden patterns
  if (expected.forbiddenPatterns !== undefined && expected.forbiddenPatterns.length > 0) {
    addForbiddenPatternResults(aggregator, response, expected.forbiddenPatterns, caseSensitive);
  }

  // Check golden output
  if (expected.goldenOutput !== undefined && expected.goldenOutput !== '') {
    addGoldenOutputResult(aggregator, response, expected.goldenOutput, caseSensitive);
  }

  // Check length constraints
  if (expected.minLength !== undefined || expected.maxLength !== undefined) {
    addLengthCheckResult(aggregator, response, expected.minLength, expected.maxLength);
  }

  return buildResultFromAggregator(aggregator);
}
