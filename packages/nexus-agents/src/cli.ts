#!/usr/bin/env node
/**
 * nexus-agents CLI
 *
 * CLI entry point for Nexus Agents MCP server.
 * Supports commands for server operation, configuration, and expert management.
 *
 * (Source: MCP Protocol 2025-11-25)
 * (Source: Node.js 24.x parseArgs documentation)
 */

import { parseArgs } from 'node:util';
import { createLogger } from './core/index.js';
import { detectMode, isValidServerMode } from './cli/index.js';
import {
  EXIT_CODES,
  PARSE_ARGS_CONFIG,
  isValidCommand,
  type CliCommand,
  type ParsedCliArgs,
} from './cli-types.js';
import { dispatchCommand } from './cli-commands.js';

// Re-export types and constants for external use
export { EXIT_CODES, type CliCommand, type ParsedCliArgs } from './cli-types.js';
export { printHelp, printVersion } from './cli-commands.js';
// dispatchCommand also uses printHelp and printVersion, but they are also exported
export type { ServerMode } from './cli/mode-detector.js';

/**
 * Determines the command from parsed options and positionals.
 */
function determineCommand(
  options: { help: boolean; version: boolean },
  positionals: string[]
): CliCommand {
  if (options.help) return 'help';
  if (options.version) return 'version';

  const firstArg = positionals[0];
  if (firstArg !== undefined && isValidCommand(firstArg)) {
    return firstArg;
  }

  return 'server';
}

/**
 * Builds the options object from parsed values.
 * Uses auto-detection for mode when not explicitly provided.
 */
function buildOptions(values: {
  help: boolean;
  version: boolean;
  verbose: boolean;
  interactive: boolean;
  mode: unknown;
  output?: string;
  force: boolean;
  format: string;
  input?: string;
  'dry-run': boolean;
}): ParsedCliArgs['options'] {
  // Check if mode was explicitly provided (not the default value)
  const explicitMode =
    isValidServerMode(values.mode) && values.mode !== 'server' ? values.mode : undefined;

  // Use auto-detection, passing explicit mode if provided
  const detectionResult = detectMode({
    explicitMode: explicitMode ?? (isValidServerMode(values.mode) ? values.mode : undefined),
  });

  return {
    help: values.help,
    version: values.version,
    verbose: values.verbose,
    interactive: values.interactive,
    mode: detectionResult.mode,
    force: values.force,
    format: values.format,
    dryRun: values['dry-run'],
    ...(values.output !== undefined && { output: values.output }),
    ...(values.input !== undefined && { input: values.input }),
  };
}

/**
 * Parses CLI arguments and determines the command to run.
 *
 * @param args - Command line arguments (defaults to process.argv.slice(2))
 * @returns Parsed CLI arguments with command and options
 */
export function parseCliArgs(args: string[] = process.argv.slice(2)): ParsedCliArgs {
  const { values, positionals } = parseArgs({
    options: PARSE_ARGS_CONFIG.options,
    allowPositionals: PARSE_ARGS_CONFIG.allowPositionals,
    strict: PARSE_ARGS_CONFIG.strict,
    args,
  });

  const options = buildOptions(values);
  const command = determineCommand(options, positionals);

  const result: ParsedCliArgs = {
    command,
    options,
    positionals,
  };

  // Only add subcommand if it exists
  if (positionals.length > 1 && positionals[1] !== undefined) {
    result.subcommand = positionals[1];
  }

  return result;
}

/**
 * Main entry point for the Nexus Agents CLI.
 * Parses arguments and dispatches to appropriate command handler.
 */
async function main(): Promise<void> {
  let parsedArgs: ParsedCliArgs;

  try {
    parsedArgs = parseCliArgs();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown argument parsing error';
    console.error(`Error: ${message}`);
    console.error('Run "nexus-agents --help" for usage information.');
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  await dispatchCommand(parsedArgs);
}

// Run main if this is the entry point
main().catch((error: unknown) => {
  const logger = createLogger({ component: 'cli' });
  logger.error(
    'Fatal error during startup',
    error instanceof Error ? error : new Error(String(error))
  );
  process.exit(EXIT_CODES.SERVER_START_FAILED);
});
