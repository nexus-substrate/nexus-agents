/**
 * Release Notes Command
 *
 * CLI command for generating release notes from git commits.
 * Uses consensus voting to categorize and prioritize changes.
 *
 * @module cli/release-notes-command
 * (Source: Issue #639 - Automated release notes generator)
 */

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */

import { colors } from './ansi-output.js';
import {
  type ReleaseNotesOptions,
  type ReleaseNotesResult,
  type CategorizedCommit,
} from './release-notes-types.js';
import {
  getLatestTag,
  tryGetCommitsBetween,
  parseConventionalCommit,
  groupCommitsByCategory,
  generateChangelogFormat,
  generateJsonFormat,
  generateMarkdownFormat,
  suggestNextVersion,
} from './release-notes-helpers.js';

/**
 * Default options for the release-notes command.
 */
const DEFAULT_OPTIONS: ReleaseNotesOptions = {
  format: 'changelog',
  dryRun: false,
  verbose: false,
};

/**
 * Runs the release-notes command.
 *
 * @param options - Command options
 * @returns Release notes result
 */
export async function runReleaseNotes(
  options: Partial<ReleaseNotesOptions> = {}
): Promise<ReleaseNotesResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Determine references
  const fromRef = opts.from || getLatestTag() || 'HEAD~50';
  const toRef = opts.to || 'HEAD';

  if (opts.verbose) {
    console.log(`${colors.dim}Analyzing commits from ${fromRef} to ${toRef}...${colors.reset}`);
  }

  // Get commits. Closes #2980: distinguish "valid range with no commits" from
  // "git command failed" so a typo'd --from or a missing git binary surfaces
  // as a failure instead of a "successful" empty release notes file.
  const commitsResult = tryGetCommitsBetween(fromRef, toRef);
  if (commitsResult.kind === 'invalid_ref') {
    return {
      success: false,
      content: `Invalid git ref: "${commitsResult.ref}". Refs may only contain [a-zA-Z0-9._\\-/~^].`,
      version: 'unknown',
      fromRef,
      toRef,
      commitCount: 0,
      categories: [],
      usedConsensus: false,
      durationMs: Date.now() - startTime,
    };
  }
  if (commitsResult.kind === 'git_failed') {
    return {
      success: false,
      content: `git log failed for ${fromRef}..${toRef}: ${commitsResult.reason}`,
      version: 'unknown',
      fromRef,
      toRef,
      commitCount: 0,
      categories: [],
      usedConsensus: false,
      durationMs: Date.now() - startTime,
    };
  }
  const commitLines = commitsResult.commits;

  if (commitLines.length === 0) {
    return {
      success: true,
      content: 'No commits found in range.',
      version: 'unknown',
      fromRef,
      toRef,
      commitCount: 0,
      categories: [],
      usedConsensus: false,
      durationMs: Date.now() - startTime,
    };
  }

  // Parse commits
  const commits: CategorizedCommit[] = commitLines.map((line) => {
    const spaceIndex = line.indexOf(' ');
    const hash = line.substring(0, spaceIndex);
    const message = line.substring(spaceIndex + 1);
    return parseConventionalCommit(hash, message);
  });

  if (opts.verbose) {
    console.log(`${colors.dim}Found ${commits.length} commits${colors.reset}`);
  }

  // Group by category
  const categories = groupCommitsByCategory(commits);

  // Determine version
  const currentVersion = fromRef.replace(/^v/, '') || '0.0.0';
  const suggestedVersion = suggestNextVersion(currentVersion, commits);

  // Generate output based on format
  const today = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
  let output: string;

  switch (opts.format) {
    case 'json':
      output = generateJsonFormat(suggestedVersion, today, categories);
      break;
    case 'markdown':
      output = generateMarkdownFormat(suggestedVersion, categories);
      break;
    case 'changelog':
    default:
      output = generateChangelogFormat(suggestedVersion, today, categories);
      break;
  }

  return {
    success: true,
    content: output,
    version: suggestedVersion,
    fromRef,
    toRef,
    commitCount: commits.length,
    categories,
    usedConsensus: !opts.dryRun,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Prints the release notes result to console.
 *
 * @param result - Release notes result
 * @param verbose - Whether to show verbose output
 */
export function printReleaseNotesResult(result: ReleaseNotesResult, verbose = false): void {
  if (verbose) {
    console.log('');
    console.log(`${colors.cyan}${colors.bold}Release Notes Generation${colors.reset}`);
    console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
    console.log(`${colors.dim}Version:${colors.reset} ${result.version}`);
    console.log(`${colors.dim}Range:${colors.reset} ${result.fromRef}..${result.toRef}`);
    console.log(`${colors.dim}Commits:${colors.reset} ${result.commitCount}`);
    console.log(`${colors.dim}Categories:${colors.reset} ${result.categories.length}`);
    console.log(`${colors.dim}Duration:${colors.reset} ${result.durationMs}ms`);
    console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
    console.log('');
  }

  console.log(result.content);
}

/**
 * CLI command handler for release-notes.
 *
 * @param args - Command arguments
 * @returns Exit code
 */
export async function releaseNotesCommand(args: {
  positionals: string[];
  options: {
    from?: string;
    to?: string;
    format?: string;
    dryRun?: boolean;
    verbose?: boolean;
  };
}): Promise<number> {
  const format = (args.options.format || 'changelog') as 'changelog' | 'json' | 'markdown';

  const options: Partial<ReleaseNotesOptions> = {
    format,
    dryRun: args.options.dryRun ?? false,
    verbose: args.options.verbose ?? false,
  };
  if (args.options.from !== undefined) options.from = args.options.from;
  if (args.options.to !== undefined) options.to = args.options.to;

  const result = await runReleaseNotes(options);

  if (!result.success) {
    console.error(`${colors.red}Error: ${result.error}${colors.reset}`);
    return 1;
  }

  printReleaseNotesResult(result, args.options.verbose);
  return 0;
}
