/**
 * Release Automation Command Handlers
 *
 * Command handlers for release automation CLI commands.
 *
 * @module cli-release-handlers
 * (Source: Issue #637 - Release automation suite)
 */

import { cliExitFromStatus, type CliExitResult, type ParsedCliArgs } from './cli-types.js';
import {
  releaseNotesCommand,
  releaseValidateCommand,
  releaseAnnounceCommand,
} from './cli/index.js';

// ============================================================================
// Issue #637: Release Automation Suite Commands
// ============================================================================

/**
 * Handles release-notes command for generating release notes.
 * (Source: Issue #639 - Automated release notes generator)
 */
export async function handleReleaseNotesCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const format = ['changelog', 'json', 'markdown'].includes(args.options.format)
    ? (args.options.format as 'changelog' | 'json' | 'markdown')
    : 'changelog';

  const from = args.positionals[1];
  const to = args.positionals[2];

  const exitCode = await releaseNotesCommand({
    positionals: args.positionals,
    options: {
      ...(from !== undefined && { from }),
      ...(to !== undefined && { to }),
      format,
      dryRun: args.options.dryRun,
      verbose: args.options.verbose,
    },
  });
  // #3942: RETURN the exit code; dispatcher owns process.exit. Mapping is
  // byte-identical to the prior inline ternary (0 → SUCCESS, non-0 → 1).
  return cliExitFromStatus(exitCode);
}

/**
 * Handles release-validate command for expert swarm validation.
 * (Source: Issue #640 - Multi-model release validation swarm)
 */
export async function handleReleaseValidateCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const version = args.positionals[1];

  const exitCode = await releaseValidateCommand({
    positionals: args.positionals,
    options: {
      ...(version !== undefined && { version }),
      verbose: args.options.verbose,
      strict: args.options.force, // Reuse force flag for strict mode
    },
  });
  // #3942: RETURN the exit code; dispatcher owns process.exit (0 → SUCCESS, non-0 → 1).
  return cliExitFromStatus(exitCode);
}

/**
 * Handles release-announce command for generating announcements.
 * (Source: Issue #641 - Release announcement bot)
 */
export async function handleReleaseAnnounceCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const version = args.positionals[1];
  const channels = args.positionals[2];

  const exitCode = await releaseAnnounceCommand({
    positionals: args.positionals,
    options: {
      ...(version !== undefined && { version }),
      ...(channels !== undefined && { channels }),
      dryRun: args.options.dryRun,
      verbose: args.options.verbose,
    },
  });
  // #3942: RETURN the exit code; dispatcher owns process.exit (0 → SUCCESS, non-0 → 1).
  return cliExitFromStatus(exitCode);
}
