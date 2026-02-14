/**
 * Research Issue Helpers
 *
 * Functions for creating GitHub issues from research findings.
 * Uses the `gh` CLI tool for issue creation.
 *
 * @module cli/research-helpers-issues
 * (Source: Research System Enhancement - Phase 4)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Result } from '../core/result.js';
import { getErrorMessage } from '../core/index.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';

const execFileAsync = promisify(execFile);

// =============================================================================
// TYPES
// =============================================================================

/** Options for creating a research issue. */
export interface CreateResearchIssueOptions {
  /** Issue title */
  readonly title: string;
  /** Issue body */
  readonly body: string;
  /** Labels to apply */
  readonly labels: readonly string[];
  /** Optional assignee */
  readonly assignee?: string;
}

/** Result of creating a research issue. */
export interface CreateResearchIssueResult {
  /** Whether the issue was created successfully */
  readonly success: boolean;
  /** Issue URL (if created) */
  readonly url: string;
  /** Human-readable message */
  readonly message: string;
}

/** Error for issue creation. */
export interface IssueCreationError {
  readonly code: 'GH_NOT_FOUND' | 'GH_AUTH_FAILED' | 'GH_ERROR';
  readonly message: string;
}

/** Vote result summary for issue body formatting. */
export interface VoteResultSummary {
  readonly decision: string;
  readonly approvalPercentage: number;
  readonly strategy: string;
}

/** Research finding for issue body formatting. */
export interface ResearchFinding {
  readonly title: string;
  readonly source: string;
  readonly url: string;
  readonly description: string;
  readonly relevance: string;
  readonly priority?: string;
}

// =============================================================================
// ISSUE BODY FORMATTING
// =============================================================================

/**
 * Format a research issue body from findings and vote results.
 *
 * @param findings - Research findings to include
 * @param voteResult - Optional vote result summary
 * @returns Formatted markdown issue body
 */
export function formatResearchIssueBody(
  findings: readonly ResearchFinding[],
  voteResult?: VoteResultSummary
): string {
  const lines: string[] = [];

  lines.push('## Research Findings');
  lines.push('');

  for (const finding of findings) {
    lines.push(`### ${finding.title}`);
    lines.push('');
    lines.push(`- **Source:** ${finding.source}`);
    lines.push(`- **URL:** ${finding.url}`);
    lines.push(`- **Relevance:** ${finding.relevance}`);
    if (finding.priority !== undefined) {
      lines.push(`- **Priority:** ${finding.priority}`);
    }
    lines.push('');
    lines.push(finding.description);
    lines.push('');
  }

  if (voteResult !== undefined) {
    lines.push('## Consensus Vote Result');
    lines.push('');
    lines.push(`- **Decision:** ${voteResult.decision}`);
    lines.push(`- **Approval:** ${String(voteResult.approvalPercentage)}%`);
    lines.push(`- **Strategy:** ${voteResult.strategy}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('*Created by nexus-agents research workflow*');

  return lines.join('\n');
}

// =============================================================================
// ISSUE CREATION
// =============================================================================

/** Build gh CLI arguments for issue creation. */
function buildIssueArgs(options: CreateResearchIssueOptions): string[] {
  const args = ['issue', 'create', '--title', options.title, '--body', options.body];
  if (options.labels.length > 0) args.push('--label', options.labels.join(','));
  if (options.assignee !== undefined) args.push('--assignee', options.assignee);
  return args;
}

/** Map error message to structured error. */
function mapGhError(message: string): IssueCreationError {
  if (message.includes('not found') || message.includes('ENOENT')) {
    return { code: 'GH_NOT_FOUND', message: 'GitHub CLI (gh) not found' };
  }
  if (message.includes('auth') || message.includes('401')) {
    return { code: 'GH_AUTH_FAILED', message: 'GitHub CLI not authenticated' };
  }
  return { code: 'GH_ERROR', message: `Failed to create issue: ${message}` };
}

/**
 * Create a GitHub issue for research findings.
 *
 * @param options - Issue creation options
 * @returns Result indicating success or failure
 */
export async function createResearchIssue(
  options: CreateResearchIssueOptions
): Promise<Result<CreateResearchIssueResult, IssueCreationError>> {
  try {
    const { stdout } = await execFileAsync('gh', buildIssueArgs(options), {
      timeout: CLI_SUBPROCESS_TIMEOUTS.ghCommandMs,
    });
    const url = stdout.trim();
    return { ok: true, value: { success: true, url, message: `Issue created: ${url}` } };
  } catch (error) {
    const message = getErrorMessage(error);
    return { ok: false, error: mapGhError(message) };
  }
}
