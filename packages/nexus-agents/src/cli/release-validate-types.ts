/**
 * Release Validate Types
 *
 * Type definitions for the release-validate CLI command.
 *
 * @module cli/release-validate-types
 * (Source: Issue #640 - Multi-model release validation swarm)
 */

/**
 * Options for the release-validate command.
 */
export interface ReleaseValidateOptions {
  /** Version to validate. */
  version?: string;
  /** Whether to run in verbose mode. */
  verbose: boolean;
  /** Whether to fail on warnings (default: only fail on errors). */
  strict: boolean;
  /** Skip specific validations. */
  skip?: string[];
}

/**
 * Severity level for validation findings.
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * A single validation finding.
 */
export interface ValidationFinding {
  /** Severity of the finding. */
  severity: ValidationSeverity;
  /** Category (security, architecture, docs, ci). */
  category: string;
  /** Finding title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** Suggested remediation. */
  remediation?: string;
}

/**
 * Result from a single expert validation.
 */
export interface ExpertValidationResult {
  /** Expert name (security, architecture, docs, devops). */
  expert: string;
  /** Whether validation passed. */
  passed: boolean;
  /** Confidence score (0-1). */
  confidence: number;
  /** Findings from this expert. */
  findings: ValidationFinding[];
  /** Duration in milliseconds. */
  durationMs: number;
}

/**
 * Aggregated release validation result.
 */
export interface ReleaseValidateResult {
  /** Whether the command succeeded. */
  success: boolean;
  /** Version being validated. */
  version: string;
  /** Overall pass/fail status. */
  passed: boolean;
  /** Individual expert results. */
  experts: ExpertValidationResult[];
  /** Total findings by severity. */
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
  /** Fitness score (from fitness-audit). */
  fitnessScore?: number;
  /** Duration in milliseconds. */
  durationMs: number;
}

/**
 * Expert validator function signature.
 */
export type ExpertValidator = (options: {
  version: string;
  verbose: boolean;
}) => Promise<ExpertValidationResult>;
