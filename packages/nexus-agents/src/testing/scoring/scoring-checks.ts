/**
 * nexus-agents/testing/scoring - Scoring Checks
 *
 * Helper functions for automated scoring checks.
 * Extracted from rubric-scorer.ts for complexity reduction.
 */

/**
 * Result from a check operation.
 */
export interface CheckResult {
  readonly score: number;
  readonly feedback: string;
  readonly matchedTerms?: string[];
  readonly missingTerms?: string[];
  readonly violationTerms?: string[];
}

/**
 * Parameters for keyword check.
 */
export interface KeywordCheckParams {
  readonly response: string;
  readonly mustContain: readonly string[] | undefined;
  readonly mustNotContain: readonly string[] | undefined;
  readonly caseSensitive: boolean;
}

/**
 * Check if a term is contained in the response.
 */
function containsTerm(response: string, term: string, caseSensitive: boolean): boolean {
  const termToCheck = caseSensitive ? term : term.toLowerCase();
  const responseToCheck = caseSensitive ? response : response.toLowerCase();
  return responseToCheck.includes(termToCheck);
}

/**
 * Check mustContain terms and categorize them.
 */
function checkMustContainTerms(
  response: string,
  mustContain: readonly string[],
  caseSensitive: boolean
): { matchedTerms: string[]; missingTerms: string[] } {
  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  for (const term of mustContain) {
    if (containsTerm(response, term, caseSensitive)) {
      matchedTerms.push(term);
    } else {
      missingTerms.push(term);
    }
  }

  return { matchedTerms, missingTerms };
}

/**
 * Check mustNotContain terms for violations.
 */
function checkMustNotContainTerms(
  response: string,
  mustNotContain: readonly string[],
  caseSensitive: boolean
): string[] {
  const violationTerms: string[] = [];

  for (const term of mustNotContain) {
    if (containsTerm(response, term, caseSensitive)) {
      violationTerms.push(term);
    }
  }

  return violationTerms;
}

/**
 * Calculate the score from keyword check results.
 */
function calculateKeywordScore(
  matchedCount: number,
  totalMustContain: number,
  violationCount: number
): number {
  let score = 100;

  if (totalMustContain > 0) {
    score = Math.round((matchedCount / totalMustContain) * 100);
  }

  if (violationCount > 0) {
    score = Math.max(0, score - violationCount * 25);
  }

  return score;
}

/**
 * Generate feedback from keyword check results.
 */
function generateKeywordFeedback(
  missingTerms: readonly string[],
  violationTerms: readonly string[]
): string {
  const feedbackParts: string[] = [];

  if (missingTerms.length > 0) {
    feedbackParts.push(`Missing: ${missingTerms.join(', ')}`);
  }
  if (violationTerms.length > 0) {
    feedbackParts.push(`Violations: ${violationTerms.join(', ')}`);
  }
  if (feedbackParts.length === 0) {
    feedbackParts.push('All keyword requirements met');
  }

  return feedbackParts.join('; ');
}

/**
 * Build the check result with optional term arrays.
 */
function buildKeywordResult(
  score: number,
  feedback: string,
  matchedTerms: readonly string[],
  missingTerms: readonly string[],
  violationTerms: readonly string[]
): CheckResult {
  return {
    score,
    feedback,
    ...(matchedTerms.length > 0 && { matchedTerms: [...matchedTerms] }),
    ...(missingTerms.length > 0 && { missingTerms: [...missingTerms] }),
    ...(violationTerms.length > 0 && { violationTerms: [...violationTerms] }),
  };
}

/**
 * Run keyword presence check.
 * Checks for required terms and forbidden terms in the response.
 */
export function runKeywordCheck(params: KeywordCheckParams): CheckResult {
  const { response, mustContain, mustNotContain, caseSensitive } = params;

  // Check mustContain terms
  const { matchedTerms, missingTerms } =
    mustContain !== undefined && mustContain.length > 0
      ? checkMustContainTerms(response, mustContain, caseSensitive)
      : { matchedTerms: [], missingTerms: [] };

  // Check mustNotContain terms
  const violationTerms =
    mustNotContain !== undefined && mustNotContain.length > 0
      ? checkMustNotContainTerms(response, mustNotContain, caseSensitive)
      : [];

  // Calculate score
  const mustContainCount = mustContain?.length ?? 0;
  const score = calculateKeywordScore(matchedTerms.length, mustContainCount, violationTerms.length);

  // Generate feedback
  const feedback = generateKeywordFeedback(missingTerms, violationTerms);

  return buildKeywordResult(score, feedback, matchedTerms, missingTerms, violationTerms);
}

/**
 * Parameters for pattern match check.
 */
export interface PatternCheckParams {
  readonly response: string;
  readonly patterns: readonly string[];
  readonly caseSensitive: boolean;
}

/**
 * Check if a regex pattern matches the response.
 */
export function checkRegexMatch(response: string, pattern: string, caseSensitive: boolean): number {
  try {
    const flags = caseSensitive ? '' : 'i';
    const regex = new RegExp(pattern, flags);
    return regex.test(response) ? 100 : 0;
  } catch {
    return 0;
  }
}

/**
 * Run pattern match check (regex).
 */
export function runPatternCheck(params: PatternCheckParams): CheckResult {
  const { response, patterns, caseSensitive } = params;

  if (patterns.length === 0) {
    return { score: 100, feedback: 'No patterns to check' };
  }

  const matchedTerms: string[] = [];
  const missingTerms: string[] = [];

  for (const pattern of patterns) {
    const result = checkRegexMatch(response, pattern, caseSensitive);
    if (result > 0) {
      matchedTerms.push(pattern);
    } else {
      missingTerms.push(pattern);
    }
  }

  const score = Math.round((matchedTerms.length / patterns.length) * 100);
  const feedback =
    missingTerms.length > 0
      ? `Missing patterns: ${missingTerms.join(', ')}`
      : 'All patterns matched';

  return {
    score,
    feedback,
    ...(matchedTerms.length > 0 && { matchedTerms }),
    ...(missingTerms.length > 0 && { missingTerms }),
  };
}

/**
 * Run length check on response.
 */
export function runLengthCheck(
  response: string,
  minLength: number | undefined,
  maxLength: number | undefined
): { score: number; feedback: string } {
  const responseLength = response.length;

  if (minLength !== undefined && responseLength < minLength) {
    const ratio = responseLength / minLength;
    return {
      score: Math.round(ratio * 100),
      feedback: `Response too short: ${String(responseLength)} chars (min: ${String(minLength)})`,
    };
  }

  if (maxLength !== undefined && responseLength > maxLength) {
    const ratio = maxLength / responseLength;
    return {
      score: Math.round(ratio * 100),
      feedback: `Response too long: ${String(responseLength)} chars (max: ${String(maxLength)})`,
    };
  }

  return { score: 100, feedback: 'Length requirements met' };
}

/**
 * Run JSON schema check (basic validation).
 */
export function runJsonCheck(response: string): { score: number; feedback: string } {
  try {
    JSON.parse(response);
    return { score: 100, feedback: 'Valid JSON structure' };
  } catch {
    return { score: 0, feedback: 'Invalid JSON: parse error' };
  }
}
