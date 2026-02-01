/**
 * nexus-agents issue command
 *
 * CLI command for issue template validation and creation.
 *
 * (Source: Issue #229, Epic #225)
 */

import { safeExecSandboxed } from './sandbox-exec.js';
import type {
  IssueCommandOptions,
  IssueCommandResult,
  GitHubIssue,
  IssueType,
} from './issue-template-types.js';
import { validateIssueBody, generateTemplateBody, getTemplate } from './issue-templates.js';
import { colors, symbols, writeLine } from './ansi-output.js';

// ============================================================================
// GitHub CLI Integration
// ============================================================================

/**
 * Fetch issue from GitHub using gh CLI.
 */
export function fetchGitHubIssue(issueNumber: number): GitHubIssue | null {
  try {
    const output = safeExecSandboxed(
      `gh issue view ${String(issueNumber)} --json number,title,body,state,labels`,
      { context: 'gh' }
    );

    if (output === null) {
      return null;
    }

    const data = JSON.parse(output) as {
      number: number;
      title: string;
      body: string | null;
      state: string;
      labels: Array<{ name: string }>;
    };

    return {
      number: data.number,
      title: data.title,
      body: data.body ?? '',
      state: data.state === 'OPEN' ? 'open' : 'closed',
      labels: data.labels.map((l) => l.name),
    };
  } catch {
    return null;
  }
}

/**
 * Create a new issue using gh CLI.
 */
export function createGitHubIssue(
  title: string,
  body: string,
  labels: readonly string[]
): number | null {
  try {
    const labelArgs = labels.map((l) => `--label "${l}"`).join(' ');
    const escapedBody = body.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    const output = safeExecSandboxed(
      `gh issue create --title "${title}" --body "${escapedBody}" ${labelArgs}`,
      { context: 'gh' }
    );

    if (output === null) {
      return null;
    }

    // Extract issue number from URL
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
// Validation Subcommand
// ============================================================================

/**
 * Validate an existing issue by number.
 */
export function validateIssue(issueNumber: number): IssueCommandResult {
  const issue = fetchGitHubIssue(issueNumber);

  if (issue === null) {
    return {
      success: false,
      issueNumber,
      error: `Issue #${String(issueNumber)} not found or not accessible`,
    };
  }

  const validation = validateIssueBody(issue.title, issue.body);

  return {
    success: validation.valid,
    issueNumber,
    validation,
  };
}

/**
 * Print validation result header and status.
 */
function printValidationHeader(result: IssueCommandResult): boolean {
  if (result.error !== undefined && result.error !== '') {
    writeLine(`${colors.red}${symbols.cross} Error: ${result.error}${colors.reset}`);
    return false;
  }

  if (result.validation === undefined) {
    writeLine(`${colors.red}${symbols.cross} No validation result${colors.reset}`);
    return false;
  }

  const v = result.validation;
  const statusColor = v.valid ? colors.green : colors.red;
  const statusIcon = v.valid ? symbols.check : symbols.cross;
  const statusText = v.valid ? 'VALID' : 'INVALID';

  writeLine(`\n${colors.bold}Issue #${String(result.issueNumber)} Validation${colors.reset}`);
  writeLine('='.repeat(40));
  writeLine(`${colors.dim}Type:${colors.reset} ${v.template.displayName}`);
  writeLine(
    `${colors.dim}Status:${colors.reset} ${statusColor}${statusIcon} ${statusText}${colors.reset}`
  );
  return true;
}

/**
 * Print validation sections.
 */
function printValidationSections(result: IssueCommandResult): void {
  if (result.validation === undefined) return;
  const v = result.validation;

  writeLine('');
  writeLine(`${colors.cyan}Sections:${colors.reset}`);

  for (const section of v.sections) {
    const icon = section.found
      ? `${colors.green}${symbols.check}${colors.reset}`
      : section.required
        ? `${colors.red}${symbols.cross}${colors.reset}`
        : `${colors.dim}${symbols.circle}${colors.reset}`;
    const label = section.required ? `${colors.dim}(required)${colors.reset}` : '';
    writeLine(`  ${icon} ${section.section} ${label}`);
  }

  if (v.suggestions.length > 0) {
    writeLine('');
    writeLine(`${colors.yellow}Suggestions:${colors.reset}`);
    for (const suggestion of v.suggestions) {
      writeLine(`  - ${suggestion}`);
    }
  }

  writeLine('');
}

/**
 * Print validation result to terminal.
 */
export function printValidationResult(result: IssueCommandResult, format: 'text' | 'json'): void {
  if (format === 'json') {
    writeLine(JSON.stringify(result, null, 2));
    return;
  }

  if (!printValidationHeader(result)) {
    return;
  }

  printValidationSections(result);
}

// ============================================================================
// Create Subcommand
// ============================================================================

/**
 * Print template for creating a new issue.
 */
export function printTemplate(type: IssueType): void {
  const template = getTemplate(type);
  const body = generateTemplateBody(type);

  writeLine(`\n${colors.bold}${template.displayName} Issue Template${colors.reset}`);
  writeLine('='.repeat(40));
  writeLine(`${colors.dim}Title format:${colors.reset} ${type}: <description>`);
  writeLine('');
  writeLine(`${colors.cyan}Required sections:${colors.reset}`);

  for (const section of template.sections) {
    if (section.required) {
      writeLine(`  - ${section.name}: ${colors.dim}${section.description}${colors.reset}`);
    }
  }

  writeLine('');
  writeLine(`${colors.cyan}Template:${colors.reset}`);
  writeLine('---');
  writeLine(body);
  writeLine('---');
  writeLine('');
}

// ============================================================================
// Main Command
// ============================================================================

/**
 * Handle the validate subcommand.
 */
function handleValidateSubcommand(options: IssueCommandOptions): number {
  if (options.issueNumber === undefined) {
    writeLine(`${colors.red}Error: Issue number required for validate subcommand${colors.reset}`);
    writeLine(`${colors.dim}Usage: nexus-agents issue validate <issue-number>${colors.reset}`);
    return 1;
  }

  const result = validateIssue(options.issueNumber);
  const format = options.format ?? 'text';
  printValidationResult(result, format);

  return result.success ? 0 : 1;
}

/**
 * Handle the create subcommand.
 */
function handleCreateSubcommand(options: IssueCommandOptions): number {
  const type = options.type ?? 'feat';
  printTemplate(type);
  writeLine(`${colors.dim}Copy the template above and create the issue with:${colors.reset}`);
  writeLine(`  gh issue create --title "${type}: <description>" --body "..."${colors.reset}\n`);
  return 0;
}

/**
 * Run the issue command.
 */
export function issueCommand(options: IssueCommandOptions): number {
  writeLine(`\n${colors.bold}Nexus Agents Issue Template${colors.reset}`);
  writeLine('===========================\n');

  switch (options.subcommand) {
    case 'validate':
      return handleValidateSubcommand(options);
    case 'create':
      return handleCreateSubcommand(options);
    default:
      // This handles future subcommands if any
      writeLine(`${colors.red}Unknown subcommand${colors.reset}`);
      return 1;
  }
}

// ============================================================================
// Exports
// ============================================================================

export type { IssueCommandOptions, IssueCommandResult } from './issue-template-types.js';
