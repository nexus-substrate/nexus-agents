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
import type { ParsedCliArgs } from './cli-types.js';

/**
 * Handles auth command for token management.
 * (Source: Issue #739 - enable MCP authentication by default)
 */
export function handleAuthCommand(args: ParsedCliArgs): void {
  const subcommand = args.subcommand;
  const format: 'text' | 'json' = args.options.format === 'json' ? 'json' : 'text';
  authCommand(subcommand, { force: args.options.force, format });
}
