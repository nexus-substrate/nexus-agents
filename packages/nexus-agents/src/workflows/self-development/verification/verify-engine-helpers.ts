/**
 * QA Verification Engine Helpers
 *
 * Pure helper functions extracted from VerifyEngine for maintainability.
 * These functions are stateless and operate on data passed as parameters.
 *
 * (Source: Issue #277 - QA cycle before issue closure)
 */

import { safeRegex } from '../../../core/safe-regex.js';
import type { CheckDefinition, CheckResult, CheckIssue } from './verify-types.js';

// ============================================================================
// Output Analysis
// ============================================================================

/**
 * Finds failure patterns in command output.
 */
export function findFailurePatterns(check: CheckDefinition, output: string): CheckIssue[] {
  const issues: CheckIssue[] = [];
  if (check.failurePatterns === undefined) return issues;

  for (const pattern of check.failurePatterns) {
    // Use safeRegex to prevent ReDoS attacks (Issue #341)
    const result = safeRegex(pattern, 'gi');
    if (!result.ok) {
      // Skip invalid patterns but log the issue
      issues.push({
        code: check.id,
        message: `Invalid regex pattern: ${pattern}`,
        severity: 'warning',
      });
      continue;
    }
    const matches = output.match(result.value);
    if (matches !== null) {
      for (const match of matches) {
        issues.push({ code: check.id, message: match, severity: 'error' });
      }
    }
  }
  return issues;
}

/**
 * Checks if any success pattern matches in output.
 */
export function hasSuccessPatternMatch(check: CheckDefinition, output: string): boolean {
  if (check.successPatterns === undefined || check.successPatterns.length === 0) {
    return false;
  }
  for (const pattern of check.successPatterns) {
    // Use safeRegex to prevent ReDoS attacks (Issue #341)
    const result = safeRegex(pattern, 'gi');
    if (!result.ok) {
      // Skip invalid patterns
      continue;
    }
    if (result.value.test(output)) {
      return true;
    }
  }
  return false;
}

/**
 * Result of output analysis.
 */
export interface AnalysisResult {
  readonly passed: boolean;
  readonly score: number;
  readonly issues: CheckIssue[];
}

/**
 * Analyzes check output to determine pass/fail and score.
 */
export function analyzeCheckOutput(
  check: CheckDefinition,
  output: string,
  error: string | null
): AnalysisResult {
  const issues = findFailurePatterns(check, output);
  const hasSuccessMatch = hasSuccessPatternMatch(check, output);
  const hasErrors = issues.some((i) => i.severity === 'error');

  const successPatternsEmpty =
    check.successPatterns === undefined || check.successPatterns.length === 0;
  const passed = error === null && !hasErrors && (successPatternsEmpty || hasSuccessMatch);

  const baseScore = passed ? 1.0 : 0.0;
  const issuePenalty = Math.min(issues.length * 0.1, 0.5);
  const score = Math.max(baseScore - issuePenalty, 0);

  return { passed, score, issues };
}

// ============================================================================
// Score Computation
// ============================================================================

/**
 * Result of score computation.
 */
export interface ScoreResult {
  readonly qualityScore: number;
  readonly confidence: number;
}

/**
 * Computes quality score and confidence from check results.
 */
export function computeScores(
  checkResults: readonly CheckResult[],
  checks: readonly CheckDefinition[]
): ScoreResult {
  if (checkResults.length === 0) {
    return { qualityScore: 0, confidence: 0 };
  }

  let totalWeight = 0;
  let weightedScore = 0;

  for (const result of checkResults) {
    const check = checks.find((c) => c.id === result.checkId);
    const weight = check?.weight ?? 0.1;
    totalWeight += weight;
    weightedScore += result.score * weight;
  }

  const qualityScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
  const executedRatio = checkResults.length / checks.length;
  const confidence = executedRatio * (1 - checkResults.filter((r) => !r.passed).length * 0.1);

  return { qualityScore, confidence: Math.max(confidence, 0) };
}

/**
 * Checks if all required checks passed.
 */
export function allRequiredPassed(
  checkResults: readonly CheckResult[],
  checks: readonly CheckDefinition[]
): boolean {
  for (const result of checkResults) {
    const check = checks.find((c) => c.id === result.checkId);
    if (check?.required === true && !result.passed) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// Feedback Generation
// ============================================================================

/**
 * Builds failure summary from check results.
 */
export function buildFailureSummary(
  checkResults: readonly CheckResult[],
  checks: readonly CheckDefinition[]
): string {
  const failed = checkResults.filter((r) => !r.passed);
  if (failed.length === 0) return 'Quality threshold not met';

  const names = failed.map((r) => {
    const check = checks.find((c) => c.id === r.checkId);
    return check?.name ?? r.checkId;
  });

  return `${String(failed.length)} check(s) failed: ${names.join(', ')}`;
}

/**
 * Builds recommendations for fixing failed checks.
 */
export function buildRecommendations(
  checkResults: readonly CheckResult[],
  checks: readonly CheckDefinition[]
): string[] {
  const recommendations: string[] = [];

  for (const result of checkResults) {
    if (!result.passed) {
      const check = checks.find((c) => c.id === result.checkId);
      if (check) {
        recommendations.push(`Fix ${check.name}: Run '${check.command}' and resolve issues`);
      }
      if (result.issues && result.issues.length > 0) {
        const topIssue = result.issues[0];
        if (topIssue) {
          recommendations.push(`Address: ${topIssue.message}`);
        }
      }
    }
  }

  return recommendations;
}

/**
 * Extracts files mentioned in check issues.
 */
export function extractFilesFromIssues(checkResults: readonly CheckResult[]): string[] {
  const files = new Set<string>();

  for (const result of checkResults) {
    if (result.issues !== undefined) {
      for (const issue of result.issues) {
        if (issue.file !== undefined && issue.file !== '') {
          files.add(issue.file);
        }
      }
    }
  }

  return Array.from(files);
}

/**
 * Prioritizes fixes based on check requirements.
 */
export function prioritizeFixes(
  failedChecks: readonly CheckResult[],
  checks: readonly CheckDefinition[]
): string[] {
  const prioritized: string[] = [];

  // Required checks first
  for (const result of failedChecks) {
    const check = checks.find((c) => c.id === result.checkId);
    if (check?.required === true) {
      prioritized.push(`[REQUIRED] Fix ${check.name}`);
    }
  }

  // Then optional checks
  for (const result of failedChecks) {
    const check = checks.find((c) => c.id === result.checkId);
    if (check?.required === false) {
      prioritized.push(`[OPTIONAL] Fix ${check.name}`);
    }
  }

  return prioritized;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Truncates output to reasonable length.
 */
export function truncateOutput(output: string, maxLength: number = 5000): string {
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength) + '\n... (truncated)';
}
