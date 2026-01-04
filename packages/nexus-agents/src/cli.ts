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
import { startStdioServer, closeServer, registerTools } from './mcp/index.js';
import { createLogger, type ILogger } from './core/index.js';
import { VERSION } from './index.js';

/**
 * Exit codes for the CLI.
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  SERVER_START_FAILED: 1,
  SHUTDOWN_ERROR: 2,
  INVALID_ARGS: 3,
} as const;

/**
 * CLI command types that can be executed.
 */
export type CliCommand = 'server' | 'help' | 'version' | 'config' | 'expert' | 'workflow';

/**
 * Parsed CLI arguments and command.
 */
export interface ParsedCliArgs {
  command: CliCommand;
  subcommand?: string;
  options: {
    help: boolean;
    version: boolean;
    verbose: boolean;
  };
  positionals: string[];
}

/**
 * parseArgs configuration for the CLI.
 * (Source: Node.js 24.x util.parseArgs documentation)
 */
const PARSE_ARGS_CONFIG = {
  options: {
    help: {
      type: 'boolean' as const,
      short: 'h',
      default: false,
    },
    version: {
      type: 'boolean' as const,
      short: 'v',
      default: false,
    },
    verbose: {
      type: 'boolean' as const,
      default: false,
    },
  },
  allowPositionals: true,
  strict: true,
} as const;

/**
 * Help text for the CLI.
 */
const HELP_TEXT = `
nexus-agents - Multi-agent orchestration MCP server

USAGE:
  nexus-agents [OPTIONS]
  nexus-agents [COMMAND] [OPTIONS]

COMMANDS:
  (default)     Start MCP server with stdio transport
  config        Manage configuration (coming soon)
  expert        Manage experts (coming soon)
  workflow      Manage workflows (coming soon)

OPTIONS:
  -h, --help      Show this help message
  -v, --version   Show version information
  --verbose       Enable verbose output

EXAMPLES:
  nexus-agents              Start MCP server
  nexus-agents --help       Show help
  nexus-agents --version    Show version

For more information, visit: https://github.com/williamzujkowski/nexus-agents
`.trim();

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

  // Extract values - our config specifies defaults, so these are always booleans
  const { help, version, verbose } = values;

  const options = { help, version, verbose };

  // Determine command from flags or first positional
  let command: CliCommand = 'server';

  if (options.help) {
    command = 'help';
  } else if (options.version) {
    command = 'version';
  } else if (positionals.length > 0) {
    const firstArg = positionals[0];
    if (firstArg !== undefined && isValidCommand(firstArg)) {
      command = firstArg;
    }
  }

  // Build result with proper typing for exactOptionalPropertyTypes
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
 * Checks if a string is a valid CLI command.
 *
 * @param value - String to check
 * @returns True if the value is a valid command
 */
function isValidCommand(value: string): value is CliCommand {
  const validCommands: CliCommand[] = ['server', 'help', 'version', 'config', 'expert', 'workflow'];
  return validCommands.includes(value as CliCommand);
}

/**
 * Prints help text to stdout.
 * Uses process.stdout.write for CLI output (not console.log to avoid ESLint warnings).
 */
export function printHelp(): void {
  process.stdout.write(HELP_TEXT + '\n');
}

/**
 * Prints version information to stdout.
 * Uses process.stdout.write for CLI output (not console.log to avoid ESLint warnings).
 */
export function printVersion(): void {
  process.stdout.write(`nexus-agents v${VERSION}\n`);
}

/**
 * Handles unimplemented commands with a coming soon message.
 *
 * @param command - The command that was requested
 */
function handleUnimplementedCommand(command: string): void {
  process.stdout.write(`The '${command}' command is coming soon.\n`);
  process.stdout.write('Run "nexus-agents --help" for available options.\n');
}

/**
 * Sets up graceful shutdown handlers.
 *
 * @param cleanup - Async cleanup function to call on shutdown
 * @param logger - Logger instance
 */
function setupShutdownHandlers(cleanup: () => Promise<void>, logger: ILogger): void {
  let isShuttingDown = false;

  const handleShutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      logger.debug('Shutdown already in progress, ignoring signal', { signal });
      return;
    }

    isShuttingDown = true;
    logger.info('Received shutdown signal', { signal });

    try {
      await cleanup();
      logger.info('Shutdown complete');
      process.exit(EXIT_CODES.SUCCESS);
    } catch (error) {
      logger.error(
        'Error during shutdown',
        error instanceof Error ? error : new Error(String(error))
      );
      process.exit(EXIT_CODES.SHUTDOWN_ERROR);
    }
  };

  process.on('SIGINT', () => void handleShutdown('SIGINT'));
  process.on('SIGTERM', () => void handleShutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', error);
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('Unhandled rejection', error);
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  });
}

/**
 * Starts the MCP server with stdio transport.
 *
 * @param verbose - Whether to enable verbose logging
 */
async function startServer(verbose: boolean): Promise<void> {
  const logger = createLogger({ component: 'cli' });

  if (verbose) {
    logger.setLevel('debug');
  }

  logger.info('Starting Nexus Agents', {
    version: VERSION,
    nodeVersion: process.version,
    platform: process.platform,
  });

  // Start the MCP server with stdio transport
  const serverResult = await startStdioServer({
    name: 'nexus-agents',
    version: VERSION,
    logger,
  });

  if (!serverResult.ok) {
    logger.error('Failed to start MCP server', new Error(serverResult.error.message));
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  }

  const { server, logger: serverLogger } = serverResult.value;

  // Initialize tool registration infrastructure
  // Note: Individual tools (orchestrate, create_expert, run_workflow) are
  // registered separately with their specific dependencies (TechLead, factories, etc.)
  const toolInfra = registerTools(server, { logger: serverLogger });

  logger.info('MCP server started successfully', {
    availableTools: toolInfra.tools,
  });

  // Setup graceful shutdown
  setupShutdownHandlers(async () => {
    const closeResult = await closeServer(server, serverLogger);
    if (!closeResult.ok) {
      throw new Error(closeResult.error.message);
    }
  }, logger);

  // Keep process alive - stdio transport handles communication
  logger.debug('Server running, waiting for requests...');
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
    // parseArgs throws on invalid arguments
    const message = error instanceof Error ? error.message : 'Unknown argument parsing error';
    console.error(`Error: ${message}`);
    console.error('Run "nexus-agents --help" for usage information.');
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  switch (parsedArgs.command) {
    case 'help':
      printHelp();
      process.exit(EXIT_CODES.SUCCESS);
      break;

    case 'version':
      printVersion();
      process.exit(EXIT_CODES.SUCCESS);
      break;

    case 'server':
      await startServer(parsedArgs.options.verbose);
      break;

    case 'config':
    case 'expert':
    case 'workflow':
      handleUnimplementedCommand(parsedArgs.command);
      process.exit(EXIT_CODES.SUCCESS);
      break;
  }
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
