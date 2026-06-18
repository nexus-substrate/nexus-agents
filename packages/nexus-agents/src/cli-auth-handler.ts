/**
 * nexus-agents CLI Auth Handler
 *
 * Handler for authentication-related CLI commands.
 * Extracted from cli-commands-handlers.ts to maintain file size limits.
 *
 * @module cli-auth-handler
 * (Source: Issue #739 - enable MCP authentication by default)
 */

import { authCommand } from './cli/index.js';
import { handleLoginCommand } from './cli/login-command.js';
import {
  cliExitFromStatus,
  EXIT_CODES,
  type CliExitResult,
  type ParsedCliArgs,
} from './cli-types.js';

/**
 * Handles auth command for token management.
 *
 * `auth status` (#2449) routes to the shared login-command handler, which
 * probes per-CLI auth state. It is the canonical name; `nexus-agents login`
 * is kept as an alias for one minor cycle to avoid rotting docs that just
 * shipped.
 *
 * (Source: Issue #739 - enable MCP authentication by default)
 */
export async function handleAuthCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  if (args.subcommand === 'status') {
    // #3942: forward the login probe's exit result unchanged.
    return handleLoginCommand(args);
  }
  const format: 'text' | 'json' = args.options.format === 'json' ? 'json' : 'text';
  const success = authCommand(args.subcommand, { force: args.options.force, format });
  // #3942: byte-identical to the prior behavior, which set `process.exitCode = 1`
  // on failure and otherwise exited 0 naturally. `cliExitFromStatus(0|1)` maps
  // to SUCCESS (0) / SERVER_START_FAILED (1).
  return cliExitFromStatus(success ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}
