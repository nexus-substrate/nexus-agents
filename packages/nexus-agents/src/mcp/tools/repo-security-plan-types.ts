/**
 * nexus-agents/mcp - Repository Security Plan Types
 *
 * Input/output types for the repo_security_plan MCP tool.
 *
 * @module mcp/tools/repo-security-plan-types
 * (Source: Issue #1079)
 */

import { z } from 'zod';

// ============================================================================
// Input Schema
// ============================================================================

export const RepoSecurityPlanInputSchema = z.object({
  /** GitHub repository in "owner/name" format or full URL. */
  repo: z.string().min(1).describe('GitHub repository in "owner/name" format or full URL'),
  /** Filter to specific scanner categories. */
  categories: z
    .array(z.string())
    .optional()
    .describe('Filter to specific categories (e.g., ["sast", "sca", "secrets"])'),
  /** Maximum number of scanners to recommend. */
  maxScanners: z
    .number()
    .min(1)
    .max(20)
    .optional()
    .default(10)
    .describe('Maximum scanners to recommend (default: 10)'),
});

export type RepoSecurityPlanInput = z.infer<typeof RepoSecurityPlanInputSchema>;

// ============================================================================
// Output Types
// ============================================================================

/** A single scanner recommendation with rationale. */
export interface ScannerRecommendation {
  readonly name: string;
  readonly displayName: string;
  readonly category: string;
  readonly license: string;
  readonly pricingModel: string;
  readonly rationale: string;
  readonly priority: 'critical' | 'recommended' | 'optional';
  readonly ciSnippet: string | null;
}

/** A conflict or redundancy warning. */
export interface ConflictWarning {
  readonly scanners: readonly string[];
  readonly type: 'redundant' | 'superseded';
  readonly recommendation: string;
}

/** Coverage analysis by category. */
export interface CoverageAnalysis {
  readonly category: string;
  readonly covered: boolean;
  readonly scanners: readonly string[];
}

/** Complete security scanning plan for a repository. */
export interface RepoSecurityPlan {
  readonly repo: string;
  readonly language: string | null;
  readonly framework: string | null;
  readonly ciProvider: string | null;
  readonly existingTooling: readonly string[];
  readonly recommendations: readonly ScannerRecommendation[];
  readonly conflicts: readonly ConflictWarning[];
  readonly coverage: readonly CoverageAnalysis[];
  readonly gapsSummary: readonly string[];
}
