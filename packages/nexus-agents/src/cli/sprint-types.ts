/**
 * nexus-agents sprint command types
 *
 * Type definitions for the sprint planning CLI command.
 *
 * (Source: Issue #230, Epic #225)
 * (Source: Issue #584 - CommandResult consolidation)
 */

import { z } from 'zod';
import type { CommandResult } from '../core/index.js';

/**
 * Priority levels for sprint items.
 */
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

/**
 * GitHub issue summary for sprint planning.
 */
export interface SprintIssue {
  readonly number: number;
  readonly title: string;
  readonly labels: readonly string[];
  readonly priority: Priority | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Issue type derived from title prefix */
  readonly type: 'feat' | 'bug' | 'task' | 'refactor' | 'docs' | 'other';
  /** Estimated effort if found in body */
  readonly estimatedEffort?: string;
}

/**
 * Sprint proposal generated from open issues.
 */
export interface SprintProposal {
  /** Sprint title */
  readonly title: string;
  /** Sprint goals summary */
  readonly goals: readonly string[];
  /** Issues grouped by priority */
  readonly p1Issues: readonly SprintIssue[];
  readonly p2Issues: readonly SprintIssue[];
  readonly p3Issues: readonly SprintIssue[];
  readonly p4Issues: readonly SprintIssue[];
  /** Total estimated effort */
  readonly totalEffort?: string;
  /** Generated proposal body for GitHub issue */
  readonly body: string;
}

/**
 * Sprint planning result.
 * Extends CommandResult with sprint-specific fields.
 */
export interface SprintPlanResult extends CommandResult {
  /** Generated proposal */
  readonly proposal?: SprintProposal;
  /** Vote result if vote was requested */
  readonly voteOutcome?: 'approved' | 'rejected' | 'pending' | 'skipped';
  /** Created issue number if issue was created */
  readonly createdIssueNumber?: number;
}

/**
 * Options for the sprint command.
 */
export interface SprintCommandOptions {
  /** Subcommand: 'plan' or 'list' */
  readonly subcommand: 'plan' | 'list';
  /** Run consensus vote on the proposal */
  readonly vote?: boolean;
  /** Create GitHub issue if approved */
  readonly createIssue?: boolean;
  /** Output format */
  readonly format?: 'text' | 'json';
  /** Dry run mode */
  readonly dryRun?: boolean;
  /** Maximum issues to include per priority */
  readonly maxPerPriority?: number;
  /** Sprint duration hint (e.g., "1 week", "2 weeks") */
  readonly duration?: string;
}

/**
 * Zod schema for SprintCommandOptions.
 */
export const SprintCommandOptionsSchema = z.object({
  subcommand: z.enum(['plan', 'list']),
  vote: z.boolean().optional().default(false),
  createIssue: z.boolean().optional().default(false),
  format: z.enum(['text', 'json']).optional().default('text'),
  dryRun: z.boolean().optional().default(false),
  maxPerPriority: z.number().int().positive().optional().default(5),
  duration: z.string().optional().default('1 week'),
});

/**
 * Raw GitHub issue from API.
 */
export interface GitHubIssueRaw {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly state: string;
  readonly labels: Array<{ name: string }>;
  readonly createdAt: string;
  readonly updatedAt: string;
}
