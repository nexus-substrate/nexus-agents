/**
 * Scaffold Command Handler
 *
 * Command handler for the scaffold CLI command.
 *
 * @module cli-scaffold-handler
 * (Source: Issue #653 - Scaffold command)
 */

import { EXIT_CODES, type ParsedCliArgs } from './cli-types.js';
import { scaffoldCommand, isValidScaffoldType, printScaffoldUsage } from './cli/index.js';

/**
 * Handles scaffold command for generating project files.
 * (Source: Issue #653 - Scaffold command)
 */
export function handleScaffoldCommand(args: ParsedCliArgs): void {
  // scaffold <type> <name>
  const type = args.positionals[1];
  const name = args.positionals[2];

  if (type === undefined || name === undefined || !isValidScaffoldType(type)) {
    printScaffoldUsage();
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  const exitCode = scaffoldCommand({
    type,
    name,
    dryRun: args.options.dryRun,
  });
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}
