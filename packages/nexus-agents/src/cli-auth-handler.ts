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
import type { ParsedCliArgs } from './cli-types.js';

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
export async function handleAuthCommand(args: ParsedCliArgs): Promise<void> {
  if (args.subcommand === 'status') {
    await handleLoginCommand(args);
    return;
  }
  const format: 'text' | 'json' = args.options.format === 'json' ? 'json' : 'text';
  authCommand(args.subcommand, { force: args.options.force, format });
}
