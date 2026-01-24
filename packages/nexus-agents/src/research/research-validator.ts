/**
 * nexus-agents/research - Research Registry Validator
 *
 * Validates consistency between papers.yaml and techniques.yaml.
 * Checks for orphaned references, missing files, and data integrity.
 *
 * @see Issue #367 - Deterministic RESEARCH_INDEX.md generation
 * @see docs/research/RESEARCH_INDEX.md
 */

import type { Result } from '../core/result.js';
import type { ValidationResult } from './research-schemas.js';

// ============================================================================
// Re-exports for backward compatibility
// ============================================================================

export type { ValidatorOptions, ParsedRegistry } from './research-validator-types.js';
export { DEFAULT_VALIDATOR_OPTIONS } from './research-validator-types.js';

// ============================================================================
// Internal imports
// ============================================================================

import type { ParsedRegistry } from './research-validator-types.js';
import { DEFAULT_VALIDATOR_OPTIONS } from './research-validator-types.js';
import type { ValidatorOptions } from './research-validator-types.js';
import {
  validatePapers,
  validateTechniques,
  validateCrossReferences,
} from './research-validator-helpers.js';

// ============================================================================
// Main Validator
// ============================================================================

/**
 * Validate the research registry for consistency.
 */
export function validateRegistry(
  registry: ParsedRegistry,
  options: Partial<ValidatorOptions> = {}
): Result<ValidationResult, Error> {
  try {
    const opts = { ...DEFAULT_VALIDATOR_OPTIONS, ...options };
    const issues = collectValidationIssues(registry, opts);

    // Count issues by severity
    const stats = {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      infos: issues.filter((i) => i.severity === 'info').length,
    };

    // Determine validity
    const valid = opts.strict ? stats.errors === 0 && stats.warnings === 0 : stats.errors === 0;

    return {
      ok: true,
      value: { valid, issues, stats },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Collect all validation issues from the registry.
 */
function collectValidationIssues(
  registry: ParsedRegistry,
  opts: ValidatorOptions
): readonly import('./research-schemas.js').ValidationIssue[] {
  const issues: import('./research-schemas.js').ValidationIssue[] = [];

  // Build ID sets
  const paperIds = new Set(Object.keys(registry.papers.papers));
  const techniqueIds = new Set(Object.keys(registry.techniques.techniques));

  // Validate papers
  issues.push(...validatePapers(registry.papers, techniqueIds));

  // Validate techniques
  issues.push(...validateTechniques(registry.techniques, paperIds, opts));

  // Validate cross-references
  issues.push(...validateCrossReferences(registry.papers, registry.techniques));

  return issues;
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format validation result for CLI output.
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  // Summary
  if (result.valid) {
    lines.push('Registry validation passed');
  } else {
    lines.push('Registry validation failed');
  }
  lines.push('');

  // Stats
  lines.push(`Errors: ${String(result.stats.errors)}`);
  lines.push(`Warnings: ${String(result.stats.warnings)}`);
  lines.push(`Info: ${String(result.stats.infos)}`);

  // Issues
  if (result.issues.length > 0) {
    lines.push('');
    lines.push('Issues:');
    formatIssuesList(result.issues, lines);
  }

  return lines.join('\n');
}

/**
 * Format the issues list into output lines.
 */
function formatIssuesList(
  issues: readonly import('./research-schemas.js').ValidationIssue[],
  lines: string[]
): void {
  for (const issue of issues) {
    const prefix = getSeverityPrefix(issue.severity);
    const pathStr = issue.path !== undefined ? ` (${issue.path})` : '';
    lines.push(`  [${prefix}] ${issue.code}: ${issue.message}${pathStr}`);
    if (issue.suggestion !== undefined) {
      lines.push(`      Suggestion: ${issue.suggestion}`);
    }
  }
}

/**
 * Get the single-character prefix for a severity level.
 */
function getSeverityPrefix(severity: import('./research-schemas.js').ValidationSeverity): string {
  switch (severity) {
    case 'error':
      return 'E';
    case 'warning':
      return 'W';
    case 'info':
      return 'I';
  }
}

/**
 * Format validation result as JSON.
 */
export function formatValidationResultJson(result: ValidationResult): string {
  return JSON.stringify(result, null, 2);
}
