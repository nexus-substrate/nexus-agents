/**
 * nexus-agents CLI Types
 *
 * Type definitions and constants for the CLI.
 *
 * @module cli-types
 */

import type { ServerMode } from './cli/index.js';

// Re-export help text from extracted module for backward compatibility
export { HELP_TEXT } from './cli-help-text.js';

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
  | 'hello'
  | 'config'
  | 'expert'
  | 'workflow'
  | 'doctor'
  | 'verify'
  | 'review'
  | 'routing-audit'
  | 'orchestrate'
  | 'system-review'
  | 'vote'
  | 'index'
  | 'research'
  | 'validation'
  | 'learning-metrics'
  | 'swe-bench'
  | 'setup'
  | 'hooks'
  | 'demo'
  | 'sprint'
  | 'session'
  | 'evaluate'
  | 'issue'
  | 'fitness-audit';

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
    // Review command options
    setup: boolean;
    skipChecks: boolean;
    // Orchestrate command options (also used in orchestrator mode)
    task?: string;
    model?: 'claude' | 'gemini' | 'codex';
    maxTokens?: number;
    maxCostUsd?: number;
    engine?: 'router' | 'puppeteer';
    learn?: boolean;
    policyPath?: string;
    maxSteps?: number;
    // System review command options
    createIssue: boolean;
    fix: boolean;
    // Vote command options
    proposal?: string;
    threshold?: 'majority' | 'supermajority' | 'unanimous';
    quick: boolean;
    timeoutMs?: number;
    // SWE-bench command options
    variant?: 'lite' | 'verified' | 'full';
    limit?: number;
    instance?: string[];
    resume: boolean;
    // Learning-metrics command options
    period?: number;
    export?: string;
    noTrends?: boolean;
    // Setup command options (Issue #363, #416)
    nonInteractive: boolean;
    skipMcp: boolean;
    skipRules: boolean;
    skipHooks: boolean;
    scope?: 'user' | 'project';
    // Demo command options
    mock: boolean;
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
    // Review command options
    setup: {
      type: 'boolean' as const,
      default: false,
    },
    'skip-checks': {
      type: 'boolean' as const,
      default: false,
    },
    // Orchestrate command options (also used in orchestrator mode)
    task: {
      type: 'string' as const,
      short: 't',
    },
    model: {
      type: 'string' as const,
    },
    'max-tokens': {
      type: 'string' as const,
    },
    'max-cost-usd': {
      type: 'string' as const,
    },
    // Orchestrate engine options (Issue #386)
    engine: {
      type: 'string' as const,
      default: 'router',
    },
    learn: {
      type: 'boolean' as const,
      default: false,
    },
    'policy-path': {
      type: 'string' as const,
    },
    'max-steps': {
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
    timeout: {
      type: 'string' as const,
      default: '90',
    },
    // SWE-bench command options
    variant: {
      type: 'string' as const,
      default: 'lite',
    },
    limit: {
      type: 'string' as const,
    },
    instance: {
      type: 'string' as const,
      multiple: true,
    },
    resume: {
      type: 'boolean' as const,
      default: false,
    },
    // Learning-metrics command options
    period: {
      type: 'string' as const,
      short: 'p',
    },
    export: {
      type: 'string' as const,
    },
    'no-trends': {
      type: 'boolean' as const,
      default: false,
    },
    // Setup command options (Issue #363)
    'non-interactive': {
      type: 'boolean' as const,
      default: false,
    },
    'skip-mcp': {
      type: 'boolean' as const,
      default: false,
    },
    'skip-rules': {
      type: 'boolean' as const,
      default: false,
    },
    'skip-hooks': {
      type: 'boolean' as const,
      default: false,
    },
    scope: {
      type: 'string' as const,
      default: 'user',
    },
    // Demo command options
    mock: {
      type: 'boolean' as const,
      default: false,
    },
  },
  allowPositionals: true,
  strict: true,
} as const;

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
    'hello',
    'config',
    'expert',
    'workflow',
    'doctor',
    'verify',
    'review',
    'routing-audit',
    'orchestrate',
    'system-review',
    'vote',
    'index',
    'research',
    'validation',
    'learning-metrics',
    'swe-bench',
    'setup',
    'hooks',
    'demo',
    'sprint',
    'session',
    'evaluate',
    'issue',
    'fitness-audit',
  ];
  return validCommands.includes(value as CliCommand);
}
