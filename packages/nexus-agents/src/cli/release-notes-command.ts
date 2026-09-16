/**
 * Release Notes Command
 *
 * CLI command for generating release notes from git commits.
 * Uses consensus voting to categorize and prioritize changes.
 *
 * @module cli/release-notes-command
 * (Source: Issue #639 - Automated release notes generator)
 */

/* eslint-disable no-console -- stdout is this command's user-facing output; the logger writes to stderr */

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

/** A git ref given as the empty string is treated as not given, the same as undefined. */
function isGivenRef(ref: string | undefined): ref is string {
  return ref !== undefined && ref !== '';
}

/** Builds the failure/empty-range result shape shared by the early returns. */
function earlyResult(
  fields: Pick<ReleaseNotesResult, 'success' | 'content' | 'fromRef' | 'toRef'>,
  startTime: number
): ReleaseNotesResult {
  return {
    ...fields,
    version: 'unknown',
    commitCount: 0,
    categories: [],
    usedConsensus: false,
    durationMs: Date.now() - startTime,
  };
}

/** Parses `<hash> <subject>` lines from `git log --oneline` into categorized commits. */
function parseCommitLines(commitLines: string[]): CategorizedCommit[] {
  return commitLines.map((line) => {
    const spaceIndex = line.indexOf(' ');
    const hash = line.substring(0, spaceIndex);
    const message = line.substring(spaceIndex + 1);
    return parseConventionalCommit(hash, message);
  });
}

/** Renders the categorized commits in the requested output format. */
function renderReleaseNotes(
  format: ReleaseNotesOptions['format'],
  version: string,
  categories: ReturnType<typeof groupCommitsByCategory>
): string {
  const today = new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10);
  switch (format) {
    case 'json':
      return generateJsonFormat(version, today, categories);
    case 'markdown':
      return generateMarkdownFormat(version, categories);
    case 'changelog':
    default:
      return generateChangelogFormat(version, today, categories);
  }
}

/** Synchronous body of `runReleaseNotes`; every step it takes is a local git read. */
function buildReleaseNotes(options: Partial<ReleaseNotesOptions>): ReleaseNotesResult {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Determine references
  const fromRef = isGivenRef(opts.from) ? opts.from : (getLatestTag() ?? 'HEAD~50');
  const toRef = isGivenRef(opts.to) ? opts.to : 'HEAD';

  if (opts.verbose) {
    console.log(`${colors.dim}Analyzing commits from ${fromRef} to ${toRef}...${colors.reset}`);
  }

  // Get commits. Closes #2980: distinguish "valid range with no commits" from
  // "git command failed" so a typo'd --from or a missing git binary surfaces
  // as a failure instead of a "successful" empty release notes file.
  const commitsResult = tryGetCommitsBetween(fromRef, toRef);
  if (commitsResult.kind === 'invalid_ref') {
    const content = `Invalid git ref: "${commitsResult.ref}". Refs may only contain [a-zA-Z0-9._\\-/~^].`;
    return earlyResult({ success: false, content, fromRef, toRef }, startTime);
  }
  if (commitsResult.kind === 'git_failed') {
    const content = `git log failed for ${fromRef}..${toRef}: ${commitsResult.reason}`;
    return earlyResult({ success: false, content, fromRef, toRef }, startTime);
  }
  if (commitsResult.commits.length === 0) {
    const content = 'No commits found in range.';
    return earlyResult({ success: true, content, fromRef, toRef }, startTime);
  }

  const commits = parseCommitLines(commitsResult.commits);
  if (opts.verbose) {
    console.log(`${colors.dim}Found ${String(commits.length)} commits${colors.reset}`);
  }

  const categories = groupCommitsByCategory(commits);
  // A ref that is only the "v" prefix leaves an empty version string; fall back to 0.0.0.
  const stripped = fromRef.replace(/^v/, '');
  const currentVersion = stripped === '' ? '0.0.0' : stripped;
  const suggestedVersion = suggestNextVersion(currentVersion, commits);

  return {
    success: true,
    content: renderReleaseNotes(opts.format, suggestedVersion, categories),
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
 * Runs the release-notes command.
 *
 * The contract is asynchronous because the CLI dispatcher awaits it alongside
 * the other release commands; the implementation itself only reads local git
 * state synchronously, so the result is wrapped rather than awaited.
 *
 * @param options - Command options
 * @returns Release notes result
 */
export function runReleaseNotes(
  options: Partial<ReleaseNotesOptions> = {}
): Promise<ReleaseNotesResult> {
  return Promise.resolve(buildReleaseNotes(options));
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
    console.log(`${colors.dim}Commits:${colors.reset} ${String(result.commitCount)}`);
    console.log(`${colors.dim}Categories:${colors.reset} ${String(result.categories.length)}`);
    console.log(`${colors.dim}Duration:${colors.reset} ${String(result.durationMs)}ms`);
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
  // `--format ''` means the default, the same as no flag.
  const format = (
    args.options.format !== undefined && args.options.format !== ''
      ? args.options.format
      : 'changelog'
  ) as 'changelog' | 'json' | 'markdown';

  const options: Partial<ReleaseNotesOptions> = {
    format,
    dryRun: args.options.dryRun ?? false,
    verbose: args.options.verbose ?? false,
  };
  if (args.options.from !== undefined) options.from = args.options.from;
  if (args.options.to !== undefined) options.to = args.options.to;

  const result = await runReleaseNotes(options);

  if (!result.success) {
    console.error(`${colors.red}Error: ${result.error ?? result.content}${colors.reset}`);
    return 1;
  }

  printReleaseNotesResult(result, args.options.verbose);
  return 0;
}
