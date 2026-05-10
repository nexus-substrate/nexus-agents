/**
 * nexus-agents CLI Command Handlers - Complex Commands
 *
 * Handlers for commands with multiple subcommands or complex argument processing.
 * Extracted from cli-commands-handlers.ts to comply with 400-line limit.
 *
 * @module cli-commands-handlers-complex
 * (Source: Extracted from cli-commands-handlers.ts for Issue #272 refactor)
 */

import {
  configInitCommand,
  configCommand,
  isValidConfigAction,
  orchestrateCommand,
  sweBenchCommand,
} from './cli/index.js';
import { EXIT_CODES, type ParsedCliArgs } from './cli-types.js';
import { isValidOrchestrateModel } from './cli-commands-validators.js';
import { printOrchestrateUsage } from './cli-commands-usage.js';

/**
 * Handles the config init subcommand.
 */
async function handleConfigInit(args: ParsedCliArgs): Promise<void> {
  const configOpts = {
    force: args.options.force,
    ...(args.options.output !== undefined && { output: args.options.output }),
  };
  const exitCode = await configInitCommand(configOpts);
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Prints error for unknown config subcommand.
 */
function printUnknownConfigSubcommand(subcommand: string): void {
  process.stdout.write(`Unknown config subcommand: '${subcommand}'\n`);
  process.stdout.write('Valid subcommands: init, get, set, list, reset, export, import\n');
  process.stdout.write('Run "nexus-agents config --help" for usage details.\n');
}

/**
 * Builds config command options from parsed CLI args.
 */
function buildConfigOptions(
  args: ParsedCliArgs,
  action: 'get' | 'set' | 'list' | 'reset' | 'export' | 'import'
): {
  action: typeof action;
  key?: string;
  value?: string;
  file?: string;
  format: 'json' | 'yaml';
  force: boolean;
  verbose: boolean;
} {
  // Parse key/value or file from positionals based on action
  const key = args.positionals[2];
  const value = args.positionals[3];
  const format: 'json' | 'yaml' = args.options.format === 'yaml' ? 'yaml' : 'json';

  return {
    action,
    ...(key !== undefined && { key }),
    ...(value !== undefined && { value }),
    ...(key !== undefined && { file: key }), // For export/import, key position is file path
    format,
    force: args.options.force,
    verbose: args.options.verbose,
  };
}

/**
 * Handles the config command and its subcommands.
 * Supports: init, get, set, list, reset, export, import
 * (Source: Issue #360, Issue #378)
 */
export async function handleConfigCommand(args: ParsedCliArgs): Promise<void> {
  const subcommand = args.subcommand ?? '';

  // Handle init separately (uses different implementation)
  if (subcommand === 'init') {
    return handleConfigInit(args);
  }

  // Validate subcommand is a valid config action
  if (!isValidConfigAction(subcommand)) {
    printUnknownConfigSubcommand(subcommand);
    process.exit(EXIT_CODES.INVALID_ARGS);
    return;
  }

  const configOpts = buildConfigOptions(args, subcommand);
  const exitCode = await configCommand(configOpts);
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Validates orchestrate engine option.
 * (Source: Issue #386)
 */
function isValidOrchestrateEngine(value: string): value is 'router' | 'puppeteer' {
  return value === 'router' || value === 'puppeteer';
}

/**
 * Handles the orchestrate command for standalone CLI execution.
 * (Source: Issue #183, 5-0 consensus vote)
 * (Source: Issue #386 - PuppeteerOrchestrator integration)
 */
export async function handleOrchestrateCommand(args: ParsedCliArgs): Promise<void> {
  // Get task from positionals (orchestrate <task>)
  const task = args.positionals[1];
  if (task === undefined) {
    printOrchestrateUsage();
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  // Parse optional model
  const model = args.options.model;
  const validModel = model !== undefined && isValidOrchestrateModel(model) ? model : undefined;

  // Parse format
  const format = args.options.format === 'json' ? 'json' : 'text';

  // Parse numeric options
  const maxTokens = args.options.maxTokens;
  const maxCostUsd = args.options.maxCostUsd;

  // Parse engine options (Issue #386)
  const engine = args.options.engine;
  const validEngine = engine !== undefined && isValidOrchestrateEngine(engine) ? engine : undefined;
  const learn = args.options.learn;
  const policyPath = args.options.policyPath;
  const maxSteps = args.options.maxSteps;

  const exitCode = await orchestrateCommand({
    task,
    model: validModel,
    format,
    verbose: args.options.verbose,
    dryRun: args.options.dryRun,
    maxTokens,
    maxCostUsd,
    engine: validEngine,
    learn,
    policyPath,
    maxSteps,
  });
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles the swe-bench command for benchmark evaluation.
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */
/** Maps parsed CLI options to swe-bench sub-args. */
function buildSweBenchSubArgs(args: ParsedCliArgs): string[] {
  const opts = args.options;
  const subArgs: string[] = [args.positionals[1] ?? 'run'];
  // Value flags: [optionKey, argName]
  const valueFlags: [string, string][] = [
    ['variant', 'variant'],
    ['limit', 'limit'],
    ['output', 'output'],
    ['concurrency', 'concurrency'],
    ['predictions', 'predictions'],
    ['cacheLevel', 'cache-level'],
    ['maxWorkers', 'max-workers'],
    ['runId', 'run-id'],
    ['outputDir', 'output-dir'],
  ];
  for (const [key, flag] of valueFlags) {
    const val = opts[key as keyof typeof opts];
    if (val !== undefined) subArgs.push(`--${flag}=${String(val)}`);
  }
  if (opts.resume) subArgs.push('--resume');
  if (opts.verbose) subArgs.push('--verbose');
  if (opts.mcp === true) subArgs.push('--mcp');
  for (const inst of opts.instance ?? []) subArgs.push(`--instance=${inst}`);
  return subArgs;
}

export async function handleSweBenchCommand(args: ParsedCliArgs): Promise<void> {
  const exitCode = await sweBenchCommand(buildSweBenchSubArgs(args));
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Deprecation shim for `nexus-agents atbench` (#2516). The atbench harness
 * was extracted to its own repo per the harness-extraction policy
 * (epic #2514). Operators should switch to `npx nexus-eval-atbench`.
 *
 * Kept for one minor release so automation that hardcodes the subcommand
 * doesn't silently break — prints the migration command to stderr and
 * exits non-zero. Slated for removal after the next minor.
 */
export async function handleAtbenchCommand(_args: ParsedCliArgs): Promise<void> {
  process.stderr.write(
    "The 'nexus-agents atbench' subcommand was removed in this release.\n" +
      'The Atbench harness now lives in its own repo per the harness-extraction\n' +
      'policy (https://github.com/williamzujkowski/nexus-agents/issues/2514).\n' +
      '\n' +
      'Migration:\n' +
      '  npx nexus-eval-atbench [run] [options]\n' +
      '\n' +
      "Run 'npx nexus-eval-atbench --help' for the full flag set.\n"
  );
  await Promise.resolve();
  process.exit(EXIT_CODES.INVALID_ARGS);
}
