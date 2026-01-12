/**
 * nexus-agents sprint command
 *
 * CLI command for automated sprint planning.
 *
 * (Source: Issue #230, Epic #225)
 */

import { execSync } from 'node:child_process';
import type {
  SprintCommandOptions,
  SprintPlanResult,
  SprintProposal,
  SprintIssue,
  Priority,
  GitHubIssueRaw,
} from './sprint-types.js';
import { voteCommand } from './vote-command.js';

// ============================================================================
// Terminal Output Helpers
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

const symbols = {
  check: process.platform === 'win32' ? 'v' : '✓',
  cross: process.platform === 'win32' ? 'x' : '✗',
  bullet: process.platform === 'win32' ? '*' : '•',
};

function writeLine(text: string): void {
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
// Proposal Generation
// ============================================================================

/**
 * Generate sprint title from date.
 */
export function generateSprintTitle(duration: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return `sprint: ${dateStr} (${duration})`;
}

/**
 * Format issue for proposal body.
 */
function formatIssueForBody(issue: SprintIssue): string {
  const effort = issue.estimatedEffort !== undefined ? ` (${issue.estimatedEffort})` : '';
  return `- [ ] #${String(issue.number)} - ${issue.title}${effort}`;
}

/**
 * Generate sprint proposal body.
 */
export function generateProposalBody(
  title: string,
  goals: readonly string[],
  p1: readonly SprintIssue[],
  p2: readonly SprintIssue[],
  p3: readonly SprintIssue[]
): string {
  const lines: string[] = [];

  lines.push('## Goals');
  lines.push('');
  for (const goal of goals) {
    lines.push(`- ${goal}`);
  }
  lines.push('');

  if (p1.length > 0) {
    lines.push('## P1 (Critical)');
    lines.push('');
    for (const issue of p1) {
      lines.push(formatIssueForBody(issue));
    }
    lines.push('');
  }

  if (p2.length > 0) {
    lines.push('## P2 (High Priority)');
    lines.push('');
    for (const issue of p2) {
      lines.push(formatIssueForBody(issue));
    }
    lines.push('');
  }

  if (p3.length > 0) {
    lines.push('## P3 (Nice to Have)');
    lines.push('');
    for (const issue of p3) {
      lines.push(formatIssueForBody(issue));
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*Generated by nexus-agents sprint plan*');

  return lines.join('\n');
}

/**
 * Generate goals from issues.
 */
export function generateGoals(
  p1: readonly SprintIssue[],
  p2: readonly SprintIssue[]
): readonly string[] {
  const goals: string[] = [];

  // Derive goals from P1 issues
  const featCount = [...p1, ...p2].filter((i) => i.type === 'feat').length;
  const bugCount = [...p1, ...p2].filter((i) => i.type === 'bug').length;

  if (featCount > 0) {
    goals.push(`Implement ${String(featCount)} new feature${featCount > 1 ? 's' : ''}`);
  }
  if (bugCount > 0) {
    goals.push(`Fix ${String(bugCount)} bug${bugCount > 1 ? 's' : ''}`);
  }
  if (goals.length === 0) {
    goals.push('Complete prioritized backlog items');
  }

  return goals;
}

/**
 * Generate sprint proposal from issues.
 */
export function generateProposal(
  issues: readonly SprintIssue[],
  options: SprintCommandOptions
): SprintProposal {
  const { p1, p2, p3, p4 } = categorizeByPriority(issues);

  const maxPer = options.maxPerPriority ?? 5;
  const duration = options.duration ?? '1 week';

  const selectedP1 = p1.slice(0, maxPer);
  const selectedP2 = p2.slice(0, maxPer);
  const selectedP3 = p3.slice(0, maxPer);
  const selectedP4 = p4.slice(0, maxPer);

  const title = generateSprintTitle(duration);
  const goals = generateGoals(selectedP1, selectedP2);
  const body = generateProposalBody(title, goals, selectedP1, selectedP2, selectedP3);

  return {
    title,
    goals,
    p1Issues: selectedP1,
    p2Issues: selectedP2,
    p3Issues: selectedP3,
    p4Issues: selectedP4,
    body,
  };
}

// ============================================================================
// Issue Creation
// ============================================================================

/**
 * Create sprint issue on GitHub.
 */
export function createSprintIssue(proposal: SprintProposal): number | null {
  try {
    const escapedBody = proposal.body
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');

    const output = execSync(
      `gh issue create --title "${proposal.title}" --body "${escapedBody}" --label "epic"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const match = /\/issues\/(\d+)/.exec(output);
    const issueNumStr = match?.[1];
    if (issueNumStr !== undefined && issueNumStr !== '') {
      return parseInt(issueNumStr, 10);
    }
    return null;
  } catch {
    return null;
  }
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

// ============================================================================
// Subcommand Handlers
// ============================================================================

/**
 * Handle the plan subcommand.
 */
async function handlePlanSubcommand(options: SprintCommandOptions): Promise<SprintPlanResult> {
  writeLine(`${colors.dim}Fetching open issues...${colors.reset}`);
  const rawIssues = fetchOpenIssues();

  if (rawIssues.length === 0) {
    return { success: false, error: 'No open issues found or unable to access GitHub' };
  }

  const issues = rawIssues.map(parseIssue).filter(isNotEpic);
  writeLine(`${colors.dim}Found ${String(issues.length)} non-epic issues${colors.reset}\n`);

  const proposal = generateProposal(issues, options);

  // Run vote if requested
  let voteOutcome: SprintPlanResult['voteOutcome'] = 'skipped';
  if (options.vote === true) {
    const voteProposal = `Sprint Plan: ${proposal.title}\n\nGoals: ${proposal.goals.join(', ')}\n\nP1: ${String(proposal.p1Issues.length)} items, P2: ${String(proposal.p2Issues.length)} items`;

    writeLine(`${colors.dim}Running consensus vote...${colors.reset}\n`);
    const exitCode = await voteCommand({
      proposal: voteProposal,
      threshold: 'supermajority',
      dryRun: options.dryRun === true,
    });

    voteOutcome = exitCode === 0 ? 'approved' : 'rejected';
  }

  // Create issue if requested and vote passed (or no vote)
  let createdIssueNumber: number | null = null;
  if (options.createIssue === true && (voteOutcome === 'approved' || voteOutcome === 'skipped')) {
    if (options.dryRun === true) {
      writeLine(`${colors.yellow}[DRY RUN]${colors.reset} Would create sprint issue\n`);
    } else {
      writeLine(`${colors.dim}Creating sprint issue...${colors.reset}`);
      createdIssueNumber = createSprintIssue(proposal);
    }
  }

  // Build result with only defined optional properties
  const result: SprintPlanResult = {
    success: true,
    proposal,
    voteOutcome,
  };

  if (createdIssueNumber !== null) {
    return { ...result, createdIssueNumber };
  }
  return result;
}

/**
 * Handle the list subcommand - show prioritized backlog.
 */
function handleListSubcommand(): SprintPlanResult {
  writeLine(`${colors.dim}Fetching open issues...${colors.reset}`);
  const rawIssues = fetchOpenIssues();

  if (rawIssues.length === 0) {
    return { success: false, error: 'No open issues found or unable to access GitHub' };
  }

  const issues = rawIssues.map(parseIssue).filter(isNotEpic);
  const { p1, p2, p3, p4, unassigned } = categorizeByPriority(issues);

  writeLine(`\n${colors.bold}Prioritized Backlog${colors.reset}`);
  writeLine('='.repeat(40));

  const printCategory = (label: string, color: string, items: readonly SprintIssue[]): void => {
    if (items.length === 0) return;
    writeLine(`\n${color}${label} (${String(items.length)}):${colors.reset}`);
    for (const issue of items) {
      const effort =
        issue.estimatedEffort !== undefined
          ? ` ${colors.dim}(${issue.estimatedEffort})${colors.reset}`
          : '';
      writeLine(`  ${symbols.bullet} #${String(issue.number)} - ${issue.title}${effort}`);
    }
  };

  printCategory('P1 Critical', colors.red, p1);
  printCategory('P2 High Priority', colors.yellow, p2);
  printCategory('P3 Normal', colors.cyan, p3);
  printCategory('P4 Low Priority', colors.dim, p4);
  printCategory('Unassigned', colors.dim, unassigned);

  writeLine('');

  return { success: true };
}

// ============================================================================
// Main Command
// ============================================================================

/**
 * Run the sprint command.
 */
export async function sprintCommand(options: SprintCommandOptions): Promise<number> {
  writeLine(`\n${colors.bold}Nexus Agents Sprint Planning${colors.reset}`);
  writeLine('=============================\n');

  let result: SprintPlanResult;

  switch (options.subcommand) {
    case 'plan':
      result = await handlePlanSubcommand(options);
      break;
    case 'list':
      result = handleListSubcommand();
      break;
    default:
      writeLine(`${colors.red}Unknown subcommand${colors.reset}`);
      return 1;
  }

  printSprintResult(result, options.format ?? 'text');

  return result.success ? 0 : 1;
}

// ============================================================================
// Exports
// ============================================================================

export type { SprintCommandOptions, SprintPlanResult, SprintProposal } from './sprint-types.js';
