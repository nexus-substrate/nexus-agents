/**
 * nexus-agents sprint command helpers
 *
 * Helper functions for terminal output, issue parsing, and formatting.
 *
 * @module cli/sprint-helpers
 */

import { execSync } from 'node:child_process';
import type {
  SprintPlanResult,
  SprintProposal,
  SprintIssue,
  Priority,
  GitHubIssueRaw,
} from './sprint-types.js';

// ============================================================================
// Terminal Output Helpers
// ============================================================================

export const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

export const symbols = {
  check: process.platform === 'win32' ? 'v' : '✓',
  cross: process.platform === 'win32' ? 'x' : '✗',
  bullet: process.platform === 'win32' ? '*' : '•',
};

export function writeLine(text: string): void {
  process.stdout.write(text + '\n');
}

// ============================================================================
// Issue Fetching and Parsing
// ============================================================================

/**
 * Fetch open issues from GitHub.
 */
export function fetchOpenIssues(): readonly GitHubIssueRaw[] {
  try {
    const output = execSync(
      'gh issue list --state open --limit 100 --json number,title,body,state,labels,createdAt,updatedAt',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return JSON.parse(output) as GitHubIssueRaw[];
  } catch {
    return [];
  }
}

/**
 * Extract priority from labels.
 */
export function extractPriority(labels: readonly string[]): Priority | null {
  const priorityLabels = ['P1', 'P2', 'P3', 'P4'];
  for (const label of labels) {
    const upper = label.toUpperCase();
    if (priorityLabels.includes(upper)) {
      return upper as Priority;
    }
  }
  return null;
}

/**
 * Prefix patterns to issue type mapping.
 */
const PREFIX_TO_TYPE: ReadonlyArray<{ prefixes: readonly string[]; type: SprintIssue['type'] }> = [
  { prefixes: ['feat:', 'feature:', 'enhancement:'], type: 'feat' },
  { prefixes: ['bug:', 'fix:'], type: 'bug' },
  { prefixes: ['task:', 'chore:'], type: 'task' },
  { prefixes: ['refactor:'], type: 'refactor' },
  { prefixes: ['docs:', 'documentation:'], type: 'docs' },
];

/**
 * Extract issue type from title.
 */
export function extractIssueType(title: string): SprintIssue['type'] {
  const lower = title.toLowerCase();
  for (const { prefixes, type } of PREFIX_TO_TYPE) {
    if (prefixes.some((prefix) => lower.startsWith(prefix))) {
      return type;
    }
  }
  return 'other';
}

/**
 * Extract estimated effort from issue body.
 */
export function extractEstimatedEffort(body: string): string | undefined {
  // Look for patterns like "Estimated Effort: ~4-6 hours" or "Effort: 2h"
  const patterns = [
    /estimated?\s*effort[:\s]*([~\d\-]+\s*(?:hours?|h|days?|d|weeks?|w))/i,
    /effort[:\s]*([~\d\-]+\s*(?:hours?|h|days?|d|weeks?|w))/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(body);
    if (match?.[1] !== undefined && match[1] !== '') {
      return match[1].trim();
    }
  }

  return undefined;
}

/**
 * Parse raw GitHub issue into SprintIssue.
 */
export function parseIssue(raw: GitHubIssueRaw): SprintIssue {
  const estimatedEffort = extractEstimatedEffort(raw.body);
  const base = {
    number: raw.number,
    title: raw.title,
    labels: raw.labels.map((l) => l.name),
    priority: extractPriority(raw.labels.map((l) => l.name)),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    type: extractIssueType(raw.title),
  };

  if (estimatedEffort !== undefined) {
    return { ...base, estimatedEffort };
  }
  return base;
}

/**
 * Filter out epic issues.
 */
export function isNotEpic(issue: SprintIssue): boolean {
  return !issue.labels.some((l) => l.toLowerCase() === 'epic');
}

/**
 * Categorize issues by priority.
 */
export function categorizeByPriority(issues: readonly SprintIssue[]): {
  p1: readonly SprintIssue[];
  p2: readonly SprintIssue[];
  p3: readonly SprintIssue[];
  p4: readonly SprintIssue[];
  unassigned: readonly SprintIssue[];
} {
  const p1: SprintIssue[] = [];
  const p2: SprintIssue[] = [];
  const p3: SprintIssue[] = [];
  const p4: SprintIssue[] = [];
  const unassigned: SprintIssue[] = [];

  for (const issue of issues) {
    switch (issue.priority) {
      case 'P1':
        p1.push(issue);
        break;
      case 'P2':
        p2.push(issue);
        break;
      case 'P3':
        p3.push(issue);
        break;
      case 'P4':
        p4.push(issue);
        break;
      default:
        unassigned.push(issue);
    }
  }

  return { p1, p2, p3, p4, unassigned };
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Print sprint proposal summary.
 */
export function printProposal(proposal: SprintProposal): void {
  writeLine(`\n${colors.bold}Sprint Proposal${colors.reset}`);
  writeLine('='.repeat(40));
  writeLine(`${colors.dim}Title:${colors.reset} ${proposal.title}`);
  writeLine('');
  writeLine(`${colors.cyan}Goals:${colors.reset}`);
  for (const goal of proposal.goals) {
    writeLine(`  ${symbols.bullet} ${goal}`);
  }
  writeLine('');

  if (proposal.p1Issues.length > 0) {
    writeLine(`${colors.red}P1 Critical (${String(proposal.p1Issues.length)}):${colors.reset}`);
    for (const issue of proposal.p1Issues) {
      writeLine(`  ${symbols.bullet} #${String(issue.number)} - ${issue.title}`);
    }
    writeLine('');
  }

  if (proposal.p2Issues.length > 0) {
    writeLine(`${colors.yellow}P2 High (${String(proposal.p2Issues.length)}):${colors.reset}`);
    for (const issue of proposal.p2Issues) {
      writeLine(`  ${symbols.bullet} #${String(issue.number)} - ${issue.title}`);
    }
    writeLine('');
  }

  if (proposal.p3Issues.length > 0) {
    writeLine(`${colors.dim}P3 Nice-to-Have (${String(proposal.p3Issues.length)}):${colors.reset}`);
    for (const issue of proposal.p3Issues) {
      writeLine(`  ${symbols.bullet} #${String(issue.number)} - ${issue.title}`);
    }
    writeLine('');
  }
}

/**
 * Print sprint plan result.
 */
export function printSprintResult(result: SprintPlanResult, format: 'text' | 'json'): void {
  if (format === 'json') {
    writeLine(JSON.stringify(result, null, 2));
    return;
  }

  if (result.error !== undefined && result.error !== '') {
    writeLine(`${colors.red}${symbols.cross} Error: ${result.error}${colors.reset}`);
    return;
  }

  if (result.proposal !== undefined) {
    printProposal(result.proposal);
  }

  if (result.voteOutcome !== undefined && result.voteOutcome !== 'skipped') {
    const voteColor = result.voteOutcome === 'approved' ? colors.green : colors.red;
    const voteIcon = result.voteOutcome === 'approved' ? symbols.check : symbols.cross;
    writeLine(
      `${colors.cyan}Vote Result:${colors.reset} ${voteColor}${voteIcon} ${result.voteOutcome.toUpperCase()}${colors.reset}`
    );
    writeLine('');
  }

  if (result.createdIssueNumber !== undefined) {
    writeLine(
      `${colors.green}${symbols.check} Created issue #${String(result.createdIssueNumber)}${colors.reset}`
    );
    writeLine('');
  }
}
