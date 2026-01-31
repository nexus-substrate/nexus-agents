/**
 * nexus-agents issue template types
 *
 * Type definitions for issue template validation.
 *
 * (Source: Issue #229, Epic #225)
 */

import { z } from 'zod';
import type { CommandResult } from '../core/index.js';

/**
 * Supported issue types for template validation.
 */
export type IssueType = 'feat' | 'bug' | 'task' | 'refactor' | 'docs' | 'unknown';

/**
 * Required section definition for a template.
 */
export interface RequiredSection {
  /** Section header name (e.g., "Description", "Steps to Reproduce") */
  readonly name: string;
  /** Regular expression pattern to match the section header */
  readonly pattern: RegExp;
  /** Whether this section is required */
  readonly required: boolean;
  /** Description of what this section should contain */
  readonly description: string;
}

/**
 * Template definition for an issue type.
 */
export interface IssueTemplate {
  /** Issue type this template applies to */
  readonly type: IssueType;
  /** Human-readable name for this template */
  readonly displayName: string;
  /** Required sections for this issue type */
  readonly sections: readonly RequiredSection[];
  /** Optional example body */
  readonly example?: string;
}

/**
 * Validation result for a single section.
 */
export interface SectionValidationResult {
  /** Section name */
  readonly section: string;
  /** Whether section was found */
  readonly found: boolean;
  /** Whether section is required */
  readonly required: boolean;
  /** Content extracted if found */
  readonly content?: string;
}

/**
 * Full validation result for an issue.
 */
export interface IssueValidationResult {
  /** Whether validation passed */
  readonly valid: boolean;
  /** Detected issue type */
  readonly issueType: IssueType;
  /** Template used for validation */
  readonly template: IssueTemplate;
  /** Per-section validation results */
  readonly sections: readonly SectionValidationResult[];
  /** Missing required sections */
  readonly missingRequired: readonly string[];
  /** Suggestions for improvement */
  readonly suggestions: readonly string[];
}

/**
 * Options for the issue command.
 */
export interface IssueCommandOptions {
  /** Subcommand: 'validate' or 'create' */
  readonly subcommand: 'validate' | 'create';
  /** Issue number to validate (for 'validate' subcommand) */
  readonly issueNumber?: number;
  /** Issue type (for 'create' subcommand) */
  readonly type?: IssueType;
  /** Output format */
  readonly format?: 'text' | 'json';
  /** Whether to auto-fix issues */
  readonly fix?: boolean;
}

/**
 * Zod schema for IssueCommandOptions.
 */
export const IssueCommandOptionsSchema = z.object({
  subcommand: z.enum(['validate', 'create']),
  issueNumber: z.number().int().positive().optional(),
  type: z.enum(['feat', 'bug', 'task', 'refactor', 'docs', 'unknown']).optional(),
  format: z.enum(['text', 'json']).optional().default('text'),
  fix: z.boolean().optional().default(false),
});

/**
 * GitHub issue data structure.
 */
export interface GitHubIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly state: 'open' | 'closed';
  readonly labels: readonly string[];
}

/**
 * Result of the issue command.
 * Extends CommandResult base pattern (Issue #584).
 */
export interface IssueCommandResult extends CommandResult {
  /** Issue number processed */
  readonly issueNumber?: number;
  /** Validation result if validate subcommand */
  readonly validation?: IssueValidationResult;
}
