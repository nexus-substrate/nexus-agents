/**
 * nexus-agents system-review types
 *
 * Type definitions for the system review command.
 *
 * (Source: Issue #211, Process Automation Epic #209)
 */

/**
 * System review constants.
 * Extracted from magic numbers for maintainability (Issue #384).
 */
export const SYSTEM_REVIEW_CONSTANTS = {
  /** Time thresholds */
  STALE_ISSUE_DAYS: 30,
  MS_PER_DAY: 24 * 60 * 60 * 1000,

  /** Quality thresholds */
  COVERAGE_TARGET_PERCENT: 80,
  LOW_ISSUE_COUNT_THRESHOLD: 5,
  NOT_STARTED_TECHNIQUE_THRESHOLD: 5,

  /** Health score calculation */
  HEALTH_SCORE_BASE: 100,
  HEALTH_SCORE_WARN_THRESHOLD: 60,
  HEALTH_SCORE_PASS_THRESHOLD: 80,

  /** Doc staleness penalties */
  DOC_STALE_PENALTY: 5,
  DOC_REVIEW_PENALTY: 2,

  /** Security severity penalties */
  SECURITY_HIGH_PENALTY: 20,
  SECURITY_MODERATE_PENALTY: 5,
  /**
   * Applied when the audit could not run (#4838). An unmeasured audit is not
   * evidence of health, so it must not score the same as a clean one; it is
   * set below SECURITY_HIGH_PENALTY because "unknown" is not "known bad".
   */
  SECURITY_UNMEASURED_PENALTY: 10,

  /** Code quality penalties */
  TYPECHECK_FAIL_PENALTY: 15,
  LINT_FAIL_PENALTY: 15,
  LOW_COVERAGE_PENALTY: 10,

  /** Issue penalties */
  STALE_ISSUE_PENALTY: 2,
} as const;

/**
 * Options for system-review command.
 */
export interface SystemReviewOptions {
  readonly createIssue?: boolean;
  readonly fix?: boolean;
  readonly verbose?: boolean;
  readonly projectRoot?: string;
}

/**
 * Technique status from registry.
 */
export interface TechniqueStats {
  readonly implemented: number;
  readonly planned: number;
  readonly notStarted: number;
  readonly rejected: number;
}

/**
 * Documentation freshness data.
 * Enhanced in Epic #261 to track source dependencies.
 */
export interface DocFreshness {
  readonly file: string;
  readonly daysSinceUpdate: number;
  readonly status: 'current' | 'review' | 'stale';
  /** Source files that this document depends on */
  readonly dependencies?: readonly string[];
  /** Dependencies that have been modified more recently than the document */
  readonly newerDependencies?: readonly string[];
}

/**
 * Issue health data.
 */
export interface IssueHealth {
  readonly openCount: number;
  readonly staleCount: number;
  readonly byLabel: Record<string, number>;
}

/**
 * Security audit data.
 */
export interface SecurityAudit {
  readonly totalVulns: number;
  readonly high: number;
  readonly moderate: number;
  readonly low: number;
  /**
   * True when the audit did not produce a usable result, so the counts above
   * are defaults rather than measurements (#515). Every consumer must branch
   * on this before reading the counts: zero-because-unmeasured and
   * zero-because-clean are the same numbers with opposite meanings (#4838).
   */
  readonly parseError?: boolean;
}

/**
 * Code quality data.
 */
export interface CodeQuality {
  readonly typecheckPass: boolean;
  readonly lintPass: boolean;
  readonly coveragePercent: number | null;
}

/**
 * Complete system review result.
 */
export interface SystemReviewResult {
  readonly timestamp: Date;
  readonly techniques: TechniqueStats;
  readonly docs: DocFreshness[];
  readonly issues: IssueHealth;
  readonly security: SecurityAudit;
  readonly quality: CodeQuality;
  readonly actionItems: string[];
  readonly fixesApplied: string[];
}

/**
 * Type for GitHub issue list response.
 */
export interface GhIssueItem {
  number: number;
}

/**
 * Type for parsed audit metadata.
 */
export interface AuditMetadata {
  vulnerabilities?: {
    total?: number;
    high?: number;
    moderate?: number;
    low?: number;
  };
}

/**
 * Type for coverage data.
 */
export interface CoverageData {
  total?: { lines?: { pct?: number } };
}
