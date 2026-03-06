#!/usr/bin/env node
/**
 * nexus-agents CLI
 *
 * CLI entry point for Nexus Agents MCP server.
 * Supports commands for server operation, configuration, and expert management.
 *
 * (Source: MCP Protocol 2025-11-25)
 * (Source: Node.js 22.x parseArgs documentation)
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
import { formatCommandHelp } from './cli-command-help.js';
import { CLI_NAMES, type CliNameLiteral } from './config/model-capabilities-types.js';

// Re-export types and constants for external use
export { EXIT_CODES, type CliCommand, type ParsedCliArgs } from './cli-types.js';
export { printHelp, printVersion } from './cli-commands.js';
// dispatchCommand also uses printHelp and printVersion, but they are also exported
export type { ServerMode } from './cli/mode-detector.js';

/**
 * Determines the command from parsed options and positionals.
 * When --help is combined with a valid command (e.g., `orchestrate --help`),
 * returns the command so per-command help can be shown.
 */
function determineCommand(
  options: { help: boolean; version: boolean },
  positionals: string[]
): CliCommand {
  const firstArg = positionals[0];
  const hasValidCommand = firstArg !== undefined && isValidCommand(firstArg);

  // Per-command help: `nexus-agents orchestrate --help` returns 'orchestrate'
  if (options.help && hasValidCommand) return firstArg;
  if (options.help) return 'help';
  if (options.version) return 'version';

  if (hasValidCommand) return firstArg;

  return 'server';
}

/**
 * Parses a string to a number if valid.
 */
function parseNumericOption(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

/**
 * Validates orchestrate model option.
 */
function parseOrchestrateModel(value: string | undefined): CliNameLiteral | undefined {
  if (value !== undefined && (CLI_NAMES as readonly string[]).includes(value)) {
    return value as CliNameLiteral;
  }
  return undefined;
}

/**
 * Validates orchestrate engine option.
 * (Source: Issue #386)
 */
function parseOrchestrateEngine(value: string | undefined): 'router' | 'puppeteer' | undefined {
  if (value === 'router' || value === 'puppeteer') {
    return value;
  }
  return undefined;
}

/** Parsed values from parseArgs. */
interface ParsedValues {
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
  'bandit-stats': boolean;
  setup: boolean;
  'skip-checks': boolean;
  model?: string;
  'max-tokens'?: string;
  'max-cost-usd'?: string;
  // Orchestrate engine options (Issue #386)
  engine?: string;
  learn: boolean;
  'policy-path'?: string;
  'max-steps'?: string;
  'create-issue': boolean;
  fix: boolean;
  proposal?: string;
  threshold?: string;
  quick: boolean;
  timeout?: string;
  // SWE-bench options
  variant?: string;
  limit?: string;
  instance?: string[];
  resume: boolean;
  concurrency?: string;
  mcp: boolean;
  // Learning-metrics options
  period?: string;
  export?: string;
  'no-trends': boolean;
  // Setup command options (Issue #363, #416, #1252, #1253, #1259, #1263)
  'non-interactive': boolean;
  'skip-mcp': boolean;
  'skip-rules': boolean;
  'skip-hooks': boolean;
  'skip-config': boolean;
  'skip-opencode': boolean;
  'skip-gemini': boolean;
  'skip-codex': boolean;
  scope?: string;
  // Demo command options
  mock: boolean;
  // Doctor command options (Issue #1031)
  deep: boolean;
}

/** Builds orchestrate-specific options. */
function buildOrchestrateOptions(values: ParsedValues): Record<string, unknown> {
  const model = parseOrchestrateModel(values.model);
  const maxTokens = parseNumericOption(values['max-tokens']);
  const maxCostUsd = parseNumericOption(values['max-cost-usd']);
  const engine = parseOrchestrateEngine(values.engine);
  const maxSteps = parseNumericOption(values['max-steps']);
  return {
    ...(model !== undefined && { model }),
    ...(maxTokens !== undefined && { maxTokens }),
    ...(maxCostUsd !== undefined && { maxCostUsd }),
    ...(engine !== undefined && { engine }),
    ...(values.learn && { learn: true }),
    ...(values['policy-path'] !== undefined && { policyPath: values['policy-path'] }),
    ...(maxSteps !== undefined && { maxSteps }),
  };
}

/** Validates threshold option for vote command. */
function parseThreshold(
  value: string | undefined
): 'majority' | 'supermajority' | 'unanimous' | undefined {
  if (value === 'majority' || value === 'supermajority' || value === 'unanimous') {
    return value;
  }
  return undefined;
}

/** Builds vote-specific options. */
function buildVoteOptions(values: ParsedValues): Record<string, unknown> {
  const threshold = parseThreshold(values.threshold);
  const timeoutSec = parseNumericOption(values.timeout);
  // Convert seconds to milliseconds (CLI uses seconds for readability)
  const timeoutMs = timeoutSec !== undefined ? timeoutSec * 1000 : undefined;
  return {
    ...(values.proposal !== undefined && { proposal: values.proposal }),
    ...(threshold !== undefined && { threshold }),
    ...(timeoutMs !== undefined && { timeoutMs }),
  };
}

/** Validates swe-bench variant option. */
function parseSweBenchVariant(value: string | undefined): 'lite' | 'verified' | 'full' | undefined {
  if (value === 'lite' || value === 'verified' || value === 'full') {
    return value;
  }
  return undefined;
}

/** Builds swe-bench-specific options. */
function buildSweBenchOptions(values: ParsedValues): {
  variant?: 'lite' | 'verified' | 'full';
  limit?: number;
  instance?: string[];
  resume: boolean;
  concurrency?: number;
  mcp?: boolean;
} {
  const variant = parseSweBenchVariant(values.variant);
  const limit = parseNumericOption(values.limit);
  const concurrency = parseNumericOption(values.concurrency);
  const base: {
    resume: boolean;
    variant?: 'lite' | 'verified' | 'full';
    limit?: number;
    concurrency?: number;
    mcp?: boolean;
  } = {
    resume: values.resume,
  };
  if (variant !== undefined) base.variant = variant;
  if (limit !== undefined) base.limit = limit;
  if (concurrency !== undefined) base.concurrency = concurrency;
  if (values.mcp) base.mcp = true;
  if (values.instance !== undefined && values.instance.length > 0) {
    return { ...base, instance: values.instance };
  }
  return base;
}

/** Builds learning-metrics specific options. */
function buildLearningMetricsOptions(values: ParsedValues): {
  period?: number;
  export?: string;
  noTrends?: boolean;
} {
  const period = parseNumericOption(values.period);
  const result: { period?: number; export?: string; noTrends?: boolean } = {};
  if (period !== undefined) result.period = period;
  if (values.export !== undefined) result.export = values.export;
  if (values['no-trends']) result.noTrends = true;
  return result;
}

/** Validates scope option for setup command. */
function parseSetupScope(value: string | undefined): 'user' | 'project' | undefined {
  if (value === 'user' || value === 'project') {
    return value;
  }
  return undefined;
}

/** Builds setup-specific options. */
function buildSetupOptions(values: ParsedValues): {
  nonInteractive: boolean;
  skipMcp: boolean;
  skipRules: boolean;
  skipHooks: boolean;
  skipConfig: boolean;
  skipOpencode: boolean;
  skipGemini: boolean;
  skipCodex: boolean;
  scope?: 'user' | 'project';
} {
  const scope = parseSetupScope(values.scope);
  const result: {
    nonInteractive: boolean;
    skipMcp: boolean;
    skipRules: boolean;
    skipHooks: boolean;
    skipConfig: boolean;
    skipOpencode: boolean;
    skipGemini: boolean;
    skipCodex: boolean;
    scope?: 'user' | 'project';
  } = {
    nonInteractive: values['non-interactive'],
    skipMcp: values['skip-mcp'],
    skipRules: values['skip-rules'],
    skipHooks: values['skip-hooks'],
    skipConfig: values['skip-config'],
    skipOpencode: values['skip-opencode'],
    skipGemini: values['skip-gemini'],
    skipCodex: values['skip-codex'],
  };
  if (scope !== undefined) result.scope = scope;
  return result;
}

/** Builds the options object from parsed values. */
function buildOptions(values: ParsedValues): ParsedCliArgs['options'] {
  const explicitMode = isValidServerMode(values.mode) ? values.mode : undefined;
  const detectionResult = detectMode({ explicitMode });

  return {
    help: values.help,
    version: values.version,
    verbose: values.verbose,
    interactive: values.interactive,
    mode: detectionResult.mode,
    force: values.force,
    format: values.format,
    dryRun: values['dry-run'],
    banditStats: values['bandit-stats'],
    setup: values.setup,
    skipChecks: values['skip-checks'],
    createIssue: values['create-issue'],
    fix: values.fix,
    quick: values.quick,
    mock: values.mock,
    deep: values.deep,
    ...(values.output !== undefined && { output: values.output }),
    ...(values.input !== undefined && { input: values.input }),
    ...buildOrchestrateOptions(values),
    ...buildVoteOptions(values),
    ...buildSweBenchOptions(values),
    ...buildLearningMetricsOptions(values),
    ...buildSetupOptions(values),
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

  // Per-command help: show targeted help when --help is used with a command
  if (parsedArgs.options.help && parsedArgs.command !== 'help') {
    const helpText = formatCommandHelp(parsedArgs.command);
    if (helpText !== undefined) {
      process.stdout.write(helpText + '\n');
      process.exit(EXIT_CODES.SUCCESS);
    }
    // Fall through to general help if no per-command help exists
    parsedArgs = { ...parsedArgs, command: 'help' };
  }

  await dispatchCommand(parsedArgs);
}

// Run main only if this is the direct entry point (not imported as module)
// Check if script URL matches the process execution path
const isDirectRun = (): boolean => {
  try {
    const execPath = process.argv[1];
    if (execPath === undefined) return false;

    // When running via npx or as installed global, execPath may be:
    // - The actual cli.js file: /path/to/dist/cli.js
    // - A symlink named nexus-agents: /path/to/.bin/nexus-agents
    // - The package binary: /path/to/node_modules/nexus-agents/dist/cli.js
    // When imported as a module in tests, execPath points to vitest/jest runner
    return (
      execPath.endsWith('cli.js') ||
      execPath.endsWith('nexus-agents') ||
      execPath.endsWith('.bin/nexus-agents')
    );
  } catch {
    return false;
  }
};

if (isDirectRun()) {
  main().catch((error: unknown) => {
    const logger = createLogger({ component: 'cli' });
    logger.error(
      'Fatal error during startup',
      error instanceof Error ? error : new Error(String(error))
    );
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  });
}
