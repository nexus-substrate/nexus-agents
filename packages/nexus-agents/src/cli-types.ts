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
  | 'review'
  | 'routing-audit'
  | 'orchestrate'
  | 'system-review'
  | 'vote'
  | 'index';

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
    banditStats: boolean;
    // Orchestrate command options
    model?: 'claude' | 'gemini' | 'codex';
    maxTokens?: number;
    maxCostUsd?: number;
    // System review command options
    createIssue: boolean;
    fix: boolean;
    // Vote command options
    proposal?: string;
    threshold?: 'majority' | 'supermajority' | 'unanimous';
    quick: boolean;
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
    'bandit-stats': {
      type: 'boolean' as const,
      default: false,
    },
    // Orchestrate command options
    model: {
      type: 'string' as const,
    },
    'max-tokens': {
      type: 'string' as const,
    },
    'max-cost-usd': {
      type: 'string' as const,
    },
    // System review command options
    'create-issue': {
      type: 'boolean' as const,
      default: false,
    },
    fix: {
      type: 'boolean' as const,
      default: false,
    },
    // Vote command options
    proposal: {
      type: 'string' as const,
      short: 'p',
    },
    threshold: {
      type: 'string' as const,
      short: 't',
    },
    quick: {
      type: 'boolean' as const,
      short: 'q',
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
  routing-audit   Debug model routing decisions
  orchestrate     Execute task using CLI tools (standalone mode)
  system-review   Run automated system review (5-phase checklist)
  index           Generate and manage codebase index

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

ROUTING-AUDIT OPTIONS:
  --format=json        Output as JSON (default: ASCII table)
  --verbose            Show explanation of routing steps
  --dry-run            Use deterministic TOPSIS-only selection
  --bandit-stats       Show detailed LinUCB bandit statistics

ORCHESTRATE OPTIONS:
  --model=<name>       Specific CLI to use: claude, gemini, codex (auto-selects)
  --format=<fmt>       Output format: text, json (default: text)
  --dry-run            Show routing decision without executing
  --max-tokens=<n>     Maximum token budget (default: 100000)
  --max-cost-usd=<n>   Maximum cost budget in USD (default: 10)

SYSTEM-REVIEW OPTIONS:
  --create-issue       Create GitHub issue with review results
  --fix                Auto-fix correctable issues (lint errors)
  --verbose            Show detailed phase output

VOTE OPTIONS:
  -p, --proposal <text>  Proposal text to vote on (required)
  -t, --threshold <t>    Voting threshold: majority, supermajority, unanimous
  --quick                Use 3 agents instead of 5 for faster votes
  --dry-run              Simulate votes without actual agent execution
  --verbose              Show vote verification hashes

INDEX OPTIONS:
  index generate         Generate/update codebase index
  index check            Validate index freshness (for CI)
  index diagram          Generate Mermaid dependency diagram
  index validate         Check ARCHITECTURE.md matches index
  --format=<yaml|json>   Output format (default: yaml)
  -o, --output=<path>    Custom output path
  --verbose              Show extraction progress

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
  nexus-agents routing-audit "Implement sorting algorithm"
  nexus-agents routing-audit "Review code" --bandit-stats
  nexus-agents orchestrate "Explain this function" --model=claude
  nexus-agents orchestrate "Generate unit tests" --dry-run
  nexus-agents orchestrate "Refactor for performance" --format=json
  nexus-agents system-review                      Run 5-phase system review
  nexus-agents system-review --create-issue       Create GitHub issue with results
  nexus-agents system-review --fix                Auto-fix correctable issues
  nexus-agents vote --proposal "Add feature X"    Run consensus vote
  nexus-agents vote -p "Proposal" -t unanimous    Vote with unanimous threshold
  nexus-agents vote -p "Quick decision" --quick   Fast 3-agent vote
  nexus-agents index generate                     Generate codebase index
  nexus-agents index check                        Check if index is up to date
  nexus-agents index diagram                      Generate dependency diagram

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
    'routing-audit',
    'orchestrate',
    'system-review',
    'vote',
    'index',
  ];
  return validCommands.includes(value as CliCommand);
}
