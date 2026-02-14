/**
 * nexus-agents/mcp - Repository Analyze Types
 *
 * Input/output types for the repo_analyze MCP tool.
 *
 * @module mcp/tools/repo-analyze-types
 * (Source: Issue #1074)
 */

import { z } from 'zod';

// ============================================================================
// Input Schema
// ============================================================================

export const RepoAnalyzeInputSchema = z.object({
  /** GitHub repository in "owner/name" format or full URL. */
  repo: z
    .string()
    .min(1)
    .describe('GitHub repository in "owner/name" format (e.g., "cloudfoundry/korifi") or full URL'),
  /** Analysis depth: shallow (tree + README) or deep (full analysis). */
  depth: z
    .enum(['shallow', 'deep'])
    .optional()
    .default('shallow')
    .describe('Analysis depth: shallow (tree + README) or deep (full analysis)'),
});

export type RepoAnalyzeInput = z.infer<typeof RepoAnalyzeInputSchema>;

// ============================================================================
// Output Types
// ============================================================================

/** Structured analysis of a GitHub repository. */
export interface RepoAnalysis {
  /** Repository name with owner (e.g., "owner/repo"). */
  readonly name: string;
  /** Primary programming language. */
  readonly language: string | null;
  /** Detected framework (e.g., "express", "react", "spring-boot"). */
  readonly framework: string | null;
  /** Package manager (e.g., "npm", "pip", "maven", "cargo"). */
  readonly packageManager: string | null;
  /** CI provider (e.g., "github-actions", "concourse", "jenkins"). */
  readonly ciProvider: string | null;
  /** Security tooling detected in the repo. */
  readonly securityTooling: readonly string[];
  /** Whether the repo has a Dockerfile. */
  readonly hasDockerfile: boolean;
  /** Whether the repo has Helm charts. */
  readonly hasHelmCharts: boolean;
  /** Whether the repo has a Makefile. */
  readonly hasMakefile: boolean;
  /** Whether the repo has tests. */
  readonly hasTests: boolean;
  /** License type (e.g., "MIT", "Apache-2.0"). */
  readonly license: string | null;
  /** Repository description. */
  readonly description: string | null;
  /** Default branch name. */
  readonly defaultBranch: string;
  /** Star count. */
  readonly stars: number;
  /** Top-level directory listing. */
  readonly topLevelEntries: readonly string[];
  /** Identified gaps or missing best practices. */
  readonly gaps: readonly string[];
}
