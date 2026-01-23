/**
 * nexus-agents/swe-bench - Report Failure Analyzer
 *
 * Analyzes and categorizes failures in evaluation results.
 *
 * @module swe-bench/report-failure-analyzer
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { InstanceEvaluationResult } from './evaluation-harness-types.js';
import type {
  FailureStatistics,
  FailureCategory,
  FailurePattern,
  FailureAnalysis,
  ReportInstanceDetails,
  ReportConfig,
} from './evaluation-report-types.js';
import type { EvaluationRunResult } from './evaluation-harness-types.js';

// ============================================================================
// Failure Analysis Functions
// ============================================================================

/**
 * Generates failure statistics from evaluation results.
 */
export function generateFailureStatistics(result: EvaluationRunResult): FailureStatistics {
  const failures = result.instanceResults.filter((r) => !r.resolved);

  const byCategory = categorizeFailuresByType(failures);
  const commonPatterns = detectFailurePatterns(failures);
  const byRepository = groupFailuresByRepository(failures);

  return {
    byCategory,
    commonPatterns,
    byRepository,
  };
}

/**
 * Categorizes failures by type.
 */
export function categorizeFailuresByType(
  failures: readonly InstanceEvaluationResult[]
): Record<FailureCategory, number> {
  const categories: Record<FailureCategory, number> = {
    patch_not_applicable: 0,
    test_failure: 0,
    syntax_error: 0,
    runtime_error: 0,
    timeout: 0,
    missing_dependency: 0,
    wrong_file_modified: 0,
    incomplete_fix: 0,
    regression_introduced: 0,
    unknown: 0,
  };

  for (const failure of failures) {
    const category = categorizeFailure(failure);
    categories[category]++;
  }

  return categories;
}

/**
 * Categorizes a single failure.
 */
export function categorizeFailure(failure: InstanceEvaluationResult): FailureCategory {
  if (!failure.patchApplied) {
    return 'patch_not_applicable';
  }
  if (failure.status === 'timeout') {
    return 'timeout';
  }
  if (failure.status === 'error') {
    return 'runtime_error';
  }
  if (failure.testsFailed > 0) {
    return 'test_failure';
  }
  return 'unknown';
}

/**
 * Detects common failure patterns.
 */
export function detectFailurePatterns(
  failures: readonly InstanceEvaluationResult[]
): readonly FailurePattern[] {
  const patterns: FailurePattern[] = [];

  // Group by error message similarity
  const errorGroups = new Map<string, string[]>();
  for (const failure of failures) {
    if (failure.patchError !== undefined) {
      const key = normalizeErrorMessage(failure.patchError);
      const group = errorGroups.get(key) ?? [];
      group.push(failure.instanceId);
      errorGroups.set(key, group);
    }
  }

  for (const [description, instances] of errorGroups) {
    if (instances.length >= 2) {
      patterns.push({
        description,
        occurrences: instances.length,
        examples: instances.slice(0, 3),
      });
    }
  }

  return patterns;
}

/**
 * Normalizes error messages for pattern detection.
 */
export function normalizeErrorMessage(error: string): string {
  return error
    .replace(/line \d+/g, 'line N')
    .replace(/\d+ hunk/g, 'N hunk')
    .slice(0, 100);
}

/**
 * Groups failures by repository.
 */
export function groupFailuresByRepository(
  failures: readonly InstanceEvaluationResult[]
): Record<string, number> {
  const byRepo: Record<string, number> = {};

  for (const failure of failures) {
    const repo = extractRepo(failure.instanceId);
    byRepo[repo] = (byRepo[repo] ?? 0) + 1;
  }

  return byRepo;
}

/**
 * Extracts repository from instance ID.
 */
export function extractRepo(instanceId: string): string {
  const parts = instanceId.split('-');
  const repoPart = parts[0];
  return repoPart?.replace('__', '/') ?? 'unknown';
}

/**
 * Generates instance details for the report.
 */
export function generateInstanceDetails(
  result: EvaluationRunResult,
  config: ReportConfig
): ReportInstanceDetails | undefined {
  if (!config.includeInstanceDetails) {
    return undefined;
  }

  const resolved = result.instanceResults.filter((r) => r.resolved);
  const unresolvedResults = result.instanceResults.filter((r) => !r.resolved);

  const unresolved: FailureAnalysis[] = unresolvedResults.map((r) => ({
    instanceId: r.instanceId,
    category: categorizeFailure(r),
    errorMessage: r.patchError ?? 'Test failures',
    affectedFiles: [],
  }));

  const byFailureCategory = groupByFailureCategory(unresolved);

  return {
    resolved,
    unresolved,
    byFailureCategory,
  };
}

/**
 * Groups failure analyses by category.
 */
export function groupByFailureCategory(
  analyses: readonly FailureAnalysis[]
): Record<FailureCategory, readonly FailureAnalysis[]> {
  const result: Record<FailureCategory, FailureAnalysis[]> = {
    patch_not_applicable: [],
    test_failure: [],
    syntax_error: [],
    runtime_error: [],
    timeout: [],
    missing_dependency: [],
    wrong_file_modified: [],
    incomplete_fix: [],
    regression_introduced: [],
    unknown: [],
  };

  for (const analysis of analyses) {
    result[analysis.category].push(analysis);
  }

  return result;
}
