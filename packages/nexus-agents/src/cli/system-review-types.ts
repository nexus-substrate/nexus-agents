/**
 * nexus-agents system-review types
 *
 * Type definitions for the system review command.
 *
 * (Source: Issue #211, Process Automation Epic #209)
 */

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
 */
export interface DocFreshness {
  readonly file: string;
  readonly daysSinceUpdate: number;
  readonly status: 'current' | 'review' | 'stale';
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
