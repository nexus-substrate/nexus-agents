/**
 * Scaffold Command Handler
 *
 * Command handler for the scaffold CLI command.
 *
 * @module cli-scaffold-handler
 * (Source: Issue #653 - Scaffold command)
 */

import {
  EXIT_CODES,
  cliExit,
  cliExitFromStatus,
  type CliExitResult,
  type ParsedCliArgs,
} from './cli-types.js';
import { scaffoldCommand, isValidScaffoldType, printScaffoldUsage } from './cli/index.js';

/**
 * Handles scaffold command for generating project files.
 * (Source: Issue #653 - Scaffold command)
 *
 * #3942: RETURNS a {@link CliExitResult}; the dispatcher owns `process.exit`.
 * Exit-code mapping is byte-identical to the pre-migration inline exits:
 * INVALID_ARGS (3) on bad/missing type or name; SUCCESS (0) / SERVER_START_FAILED (1)
 * from `scaffoldCommand`'s 0|non-0 status.
 */
export function handleScaffoldCommand(args: ParsedCliArgs): CliExitResult {
  // scaffold <type> <name>
  const type = args.positionals[1];
  const name = args.positionals[2];

  if (type === undefined || name === undefined || !isValidScaffoldType(type)) {
    printScaffoldUsage();
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }

  const exitCode = scaffoldCommand({
    type,
    name,
    dryRun: args.options.dryRun,
  });
  return cliExitFromStatus(exitCode);
}
