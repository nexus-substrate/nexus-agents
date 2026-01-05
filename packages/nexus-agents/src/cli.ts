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
import {
  doctorCommand,
  configInitCommand,
  expertListCommand,
  workflowRunCommand,
  printWorkflowTemplates,
  replCommand,
} from './cli/index.js';
import type { ExpertListFormat } from './cli/index.js';

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
export type CliCommand =
  | 'server'
  | 'help'
  | 'version'
  | 'config'
  | 'expert'
  | 'workflow'
  | 'doctor';

/**
 * Server mode for nexus-agents.
 * - server: MCP server only (responds to MCP client calls)
 * - orchestrator: CLI orchestrator (calls external CLIs)
 * - mesh: Full bidirectional (both server and orchestrator)
 */
export type ServerMode = 'server' | 'orchestrator' | 'mesh';

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
    interactive: boolean;
    mode: ServerMode;
    output?: string;
    force: boolean;
    format: string;
    input?: string;
    dryRun: boolean;
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
    interactive: {
      type: 'boolean' as const,
      default: false,
    },
    mode: {
      type: 'string' as const,
      short: 'm',
      default: 'server',
    },
    output: {
      type: 'string' as const,
      short: 'o',
    },
    force: {
      type: 'boolean' as const,
      short: 'f',
      default: false,
    },
    format: {
      type: 'string' as const,
      default: 'table',
    },
    input: {
      type: 'string' as const,
      short: 'i',
    },
    'dry-run': {
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
  nexus-agents [COMMAND] [SUBCOMMAND] [OPTIONS]

COMMANDS:
  (default)       Start MCP server with stdio transport
  doctor          Check CLI installations and health status
  config init     Generate starter configuration file
  expert list     List available experts (built-in and custom)
  workflow list   List available workflow templates
  workflow run    Execute a workflow template

OPTIONS:
  -h, --help           Show this help message
  -v, --version        Show version information
  --verbose            Enable verbose output
  --interactive        Start interactive REPL mode
  -m, --mode <mode>    Server mode: server, orchestrator, mesh (default: server)
                       - server:       MCP server only (for Claude CLI integration)
                       - orchestrator: CLI orchestrator (calls Gemini/Codex CLIs)
                       - mesh:         Full bidirectional (both modes)

CONFIG OPTIONS:
  -o, --output <path>  Output path for config init (default: ./nexus-agents.yaml)
  -f, --force          Overwrite existing configuration file

EXPERT OPTIONS:
  --format <fmt>       Output format: table, json, yaml (default: table)

WORKFLOW OPTIONS:
  -i, --input <json>   Workflow inputs as JSON string or file path
  --dry-run            Validate workflow without executing

EXAMPLES:
  nexus-agents                  Start MCP server (default)
  nexus-agents --interactive    Start interactive REPL
  nexus-agents doctor           Check CLI health
  nexus-agents config init      Generate config file
  nexus-agents expert list      List available experts
  nexus-agents workflow list    List workflow templates
  nexus-agents workflow run code-review --dry-run
  nexus-agents --mode=mesh      Full hybrid mesh mode

For more information, visit: https://github.com/williamzujkowski/nexus-agents
`.trim();

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
  const mode = isValidServerMode(values.mode) ? values.mode : 'server';

  return {
    help: values.help,
    version: values.version,
    verbose: values.verbose,
    interactive: values.interactive,
    mode,
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
 * Checks if a string is a valid CLI command.
 *
 * @param value - String to check
 * @returns True if the value is a valid command
 */
function isValidCommand(value: string): value is CliCommand {
  const validCommands: CliCommand[] = [
    'server',
    'help',
    'version',
    'config',
    'expert',
    'workflow',
    'doctor',
  ];
  return validCommands.includes(value as CliCommand);
}

/**
 * Checks if a string is a valid server mode.
 *
 * @param value - String to check
 * @returns True if the value is a valid ServerMode
 */
function isValidServerMode(value: unknown): value is ServerMode {
  const validModes: ServerMode[] = ['server', 'orchestrator', 'mesh'];
  return typeof value === 'string' && validModes.includes(value as ServerMode);
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
 * @param mode - Server mode (server, orchestrator, mesh)
 */
async function startServer(verbose: boolean, mode: ServerMode): Promise<void> {
  const logger = createLogger({ component: 'cli' });

  if (verbose) {
    logger.setLevel('debug');
  }

  logger.info('Starting Nexus Agents', {
    version: VERSION,
    mode,
    nodeVersion: process.version,
    platform: process.platform,
  });

  // Log mode-specific behavior
  if (mode === 'orchestrator') {
    logger.warn('Orchestrator mode not yet implemented, falling back to server mode');
  } else if (mode === 'mesh') {
    logger.warn('Mesh mode not yet implemented, falling back to server mode');
  }

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
 * Handles the config command and its subcommands.
 */
async function handleConfigCommand(args: ParsedCliArgs): Promise<void> {
  if (args.subcommand === 'init') {
    const configOpts = {
      force: args.options.force,
      ...(args.options.output !== undefined && { output: args.options.output }),
    };
    const exitCode = await configInitCommand(configOpts);
    process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
  } else {
    handleUnimplementedCommand(`config ${args.subcommand ?? ''}`);
    process.exit(EXIT_CODES.SUCCESS);
  }
}

/**
 * Validates and coerces format to ExpertListFormat.
 */
function isValidExpertListFormat(value: string): value is ExpertListFormat {
  return ['table', 'json', 'yaml'].includes(value);
}

/**
 * Handles the expert command and its subcommands.
 */
function handleExpertCommand(args: ParsedCliArgs): void {
  if (args.subcommand === 'list') {
    const format = isValidExpertListFormat(args.options.format) ? args.options.format : 'table';
    const exitCode = expertListCommand({ format });
    process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
  } else {
    handleUnimplementedCommand(`expert ${args.subcommand ?? ''}`);
    process.exit(EXIT_CODES.SUCCESS);
  }
}

/**
 * Handles the workflow command and its subcommands.
 */
async function handleWorkflowCommand(args: ParsedCliArgs): Promise<void> {
  if (args.subcommand === 'list') {
    await printWorkflowTemplates();
    process.exit(EXIT_CODES.SUCCESS);
  } else if (args.subcommand === 'run') {
    // Get workflow name from positionals (workflow run <name>)
    const workflowName = args.positionals[2];
    if (workflowName === undefined) {
      process.stdout.write('Error: Workflow name is required.\n');
      process.stdout.write('Usage: nexus-agents workflow run <name> [options]\n');
      process.exit(EXIT_CODES.INVALID_ARGS);
    }

    const exitCode = await workflowRunCommand({
      name: workflowName,
      input: args.options.input,
      dryRun: args.options.dryRun,
      verbose: args.options.verbose,
    });
    process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
  } else {
    handleUnimplementedCommand(`workflow ${args.subcommand ?? ''}`);
    process.exit(EXIT_CODES.SUCCESS);
  }
}

/**
 * Handles the server command (default mode or interactive REPL).
 */
async function handleServerCommand(args: ParsedCliArgs): Promise<void> {
  if (args.options.interactive) {
    const exitCode = await replCommand({ verbose: args.options.verbose });
    process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
  } else {
    await startServer(args.options.verbose, args.options.mode);
  }
}

/**
 * Dispatches to the appropriate command handler.
 *
 * @param args - Parsed CLI arguments
 */
async function dispatchCommand(args: ParsedCliArgs): Promise<void> {
  switch (args.command) {
    case 'help':
      printHelp();
      process.exit(EXIT_CODES.SUCCESS);
      break;

    case 'version':
      printVersion();
      process.exit(EXIT_CODES.SUCCESS);
      break;

    case 'server':
      await handleServerCommand(args);
      break;

    case 'doctor': {
      const exitCode = await doctorCommand();
      process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
      break;
    }

    case 'config':
      await handleConfigCommand(args);
      break;

    case 'expert':
      handleExpertCommand(args);
      break;

    case 'workflow':
      await handleWorkflowCommand(args);
      break;
  }
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
