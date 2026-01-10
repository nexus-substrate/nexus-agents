/**
 * nexus-agents CLI Types
 *
 * Type definitions and constants for the CLI.
 *
 * @module cli-types
 */

import type { ServerMode } from './cli/index.js';

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
  | 'doctor'
  | 'review';

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
 * (Source: Node.js 22.x util.parseArgs documentation)
 */
export const PARSE_ARGS_CONFIG = {
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
export const HELP_TEXT = `
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
  review <url>    Review a GitHub pull request (dogfooding)

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

REVIEW OPTIONS:
  --dry-run            Review without posting to GitHub

EXAMPLES:
  nexus-agents                  Start MCP server (default)
  nexus-agents --interactive    Start interactive REPL
  nexus-agents doctor           Check CLI health
  nexus-agents config init      Generate config file
  nexus-agents expert list      List available experts
  nexus-agents workflow list    List workflow templates
  nexus-agents workflow run code-review --dry-run
  nexus-agents --mode=mesh      Full hybrid mesh mode
  nexus-agents review https://github.com/owner/repo/pull/123
  nexus-agents review owner/repo#123 --dry-run

For more information, visit: https://github.com/williamzujkowski/nexus-agents
`.trim();

/**
 * Checks if a string is a valid CLI command.
 *
 * @param value - String to check
 * @returns True if the value is a valid command
 */
export function isValidCommand(value: string): value is CliCommand {
  const validCommands: CliCommand[] = [
    'server',
    'help',
    'version',
    'config',
    'expert',
    'workflow',
    'doctor',
    'review',
  ];
  return validCommands.includes(value as CliCommand);
}
