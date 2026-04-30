/* eslint-disable max-lines -- canonical CLI types + parseArgs config, intentionally centralized */
/**
 * nexus-agents CLI Types
 *
 * Type definitions and constants for the CLI.
 *
 * @module cli-types
 */

import type { ServerMode } from './cli/index.js';
import type { CliNameLiteral } from './config/model-capabilities-types.js';

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
  | 'atbench'
  | 'setup'
  | 'hooks'
  | 'demo'
  | 'sprint'
  | 'session'
  | 'evaluate'
  | 'issue'
  | 'fitness-audit'
  | 'release-notes'
  | 'release-validate'
  | 'release-announce'
  | 'scaffold'
  | 'visualize'
  | 'capabilities'
  | 'status'
  | 'memory-benchmark'
  | 'auth'
  | 'scenario'
  | 'warm-up'
  | 'e2e-eval'
  | 'routing-ab'
  | 'memory-eval'
  | 'health'
  | 'init'
  | 'validate'
  | 'registry';

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
    // Tiered --help output (Issue #2135)
    all: boolean;
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
    model?: CliNameLiteral;
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
    concurrency?: number;
    mcp?: boolean;
    // SWE-bench evaluate options
    predictions?: string;
    cacheLevel?: string;
    maxWorkers?: string;
    runId?: string;
    outputDir?: string;
    // ATBench command options (#1981)
    fixture?: string;
    llmScoring?: boolean;
    // Learning-metrics command options
    period?: number;
    export?: string;
    noTrends?: boolean;
    // Setup command options (Issue #363, #416, #1252, #1253, #1259, #1263)
    nonInteractive: boolean;
    skipMcp: boolean;
    skipRules: boolean;
    skipHooks: boolean;
    skipConfig: boolean;
    skipOpencode: boolean;
    skipGemini: boolean;
    skipCodex: boolean;
    scope?: 'user' | 'project';
    // Setup --custom-api for OpenAI-compatible gateway configuration (#2124)
    customApi?: string;
    customApiKey?: string;
    customModel?: string;
    // Demo command options
    mock: boolean;
    // Doctor command options (Issue #1031)
    deep: boolean;
    // Registry command options (#2179)
    json?: boolean;
    source?: string;
    // init --portable command options (#2305)
    portable?: boolean;
    gitignore?: boolean;
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
    // Tiered --help output (Issue #2135): `--help --all` unhides maintainer commands
    all: {
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
    concurrency: {
      type: 'string' as const,
      default: '1',
    },
    mcp: {
      type: 'boolean' as const,
      default: false,
    },
    // SWE-bench evaluate options
    predictions: {
      type: 'string' as const,
    },
    'cache-level': {
      type: 'string' as const,
      default: 'env',
    },
    'max-workers': {
      type: 'string' as const,
      default: '4',
    },
    'run-id': {
      type: 'string' as const,
    },
    'output-dir': {
      type: 'string' as const,
      default: './logs/run_evaluation',
    },
    // ATBench command options (#1981)
    fixture: {
      type: 'string' as const,
    },
    'llm-scoring': {
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
    'skip-config': {
      type: 'boolean' as const,
      default: false,
    },
    'skip-opencode': {
      type: 'boolean' as const,
      default: false,
    },
    'skip-gemini': {
      type: 'boolean' as const,
      default: false,
    },
    'skip-codex': {
      type: 'boolean' as const,
      default: false,
    },
    scope: {
      type: 'string' as const,
      default: 'user',
    },
    // Setup --custom-api for OpenAI-compatible gateway configuration (#2124)
    'custom-api': {
      type: 'string' as const,
    },
    'custom-api-key': {
      type: 'string' as const,
    },
    'custom-model': {
      type: 'string' as const,
    },
    // Demo command options
    mock: {
      type: 'boolean' as const,
      default: false,
    },
    // Doctor command options (Issue #1031)
    deep: {
      type: 'boolean' as const,
      default: false,
    },
    // Registry command options (#2179)
    json: {
      type: 'boolean' as const,
      default: false,
    },
    source: {
      type: 'string' as const,
    },
    // init --portable command options (#2305)
    portable: {
      type: 'boolean' as const,
      default: false,
    },
    gitignore: {
      type: 'boolean' as const,
      default: false,
    },
  },
  allowPositionals: true,
  strict: true,
} as const;

const VALID_COMMANDS: readonly CliCommand[] = [
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
  'atbench',
  'setup',
  'hooks',
  'demo',
  'sprint',
  'session',
  'evaluate',
  'issue',
  'fitness-audit',
  'release-notes',
  'release-validate',
  'release-announce',
  'scaffold',
  'visualize',
  'capabilities',
  'status',
  'memory-benchmark',
  'auth',
  'scenario',
  'warm-up',
  'e2e-eval',
  'routing-ab',
  'memory-eval',
  'health',
  'init',
  'validate',
  'registry',
];

/**
 * Checks if a string is a valid CLI command.
 */
export function isValidCommand(value: string): value is CliCommand {
  return (VALID_COMMANDS as readonly string[]).includes(value);
}
