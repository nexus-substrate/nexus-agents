/**
 * Scenario Validator — checks execution results against acceptance criteria.
 *
 * Uses keyword-based matching to determine which acceptance criteria
 * from a parsed spec are satisfied by execution results.
 *
 * @module orchestration/scenario-validator
 * (Source: Issue #850 — Phase 3 of AI Software Factory Epic #843)
 */

import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import type { ParsedSpec } from './spec-parser-types.js';
import type { ScenarioResult, CriterionResult, ScenarioError } from './scenario-validator-types.js';

/** Stop words to exclude from keyword matching. */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'can',
  'could',
  'should',
  'would',
  'will',
  'shall',
  'may',
  'and',
  'or',
  'but',
  'not',
  'no',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'it',
  'its',
  'that',
  'this',
  'if',
  'then',
  'so',
  'all',
  'each',
]);

/** Minimum keyword length to consider significant. */
const MIN_KEYWORD_LENGTH = 3;

/** Minimum fraction of keywords that must match. */
const KEYWORD_MATCH_THRESHOLD = 0.5;

/**
 * Validates execution results against a spec's acceptance criteria.
 */
export function validateScenario(
  spec: ParsedSpec,
  results: readonly string[]
): Result<ScenarioResult, ScenarioError> {
  if (spec.acceptanceCriteria.length === 0) {
    return err({ message: 'No acceptance criteria to validate against' });
  }

  const criteria = spec.acceptanceCriteria.map((ac) => checkCriterion(ac, results));
  const metCount = criteria.filter((c) => c.met).length;
  const total = criteria.length;

  return ok({
    satisfaction: total > 0 ? metCount / total : 0,
    totalCriteria: total,
    metCount,
    criteria,
    allMet: metCount === total,
  });
}

/** Checks a single criterion against all results. */
function checkCriterion(criterion: string, results: readonly string[]): CriterionResult {
  const keywords = extractKeywords(criterion);
  const matched: string[] = [];

  for (const result of results) {
    if (matchesKeywords(result, keywords)) {
      matched.push(result);
    }
  }

  return { criterion, met: matched.length > 0, matchedResults: matched };
}

/** Extracts significant keywords from text. */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(w));
}

/** Checks if a result matches enough keywords from a criterion. */
function matchesKeywords(result: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const resultLower = result.toLowerCase();
  const matched = keywords.filter((kw) => resultLower.includes(kw));
  return matched.length / keywords.length >= KEYWORD_MATCH_THRESHOLD;
}
