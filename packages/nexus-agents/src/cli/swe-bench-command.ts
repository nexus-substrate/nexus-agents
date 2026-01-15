/**
 * CLI SWE-bench Command
 *
 * Benchmark nexus-agents against SWE-bench instances.
 *
 * @module cli/swe-bench-command
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

/* eslint-disable no-console */
// Console output is intentional for CLI user feedback

import {
  loadDataset,
  getDatasetInfo,
  getCompletedInstanceIds,
  type SWEBenchVariant,
  type SWEBenchInstance,
} from '../swe-bench/index.js';

/**
 * SWE-bench command options.
 */
export interface SWEBenchOptions {
  /** Subcommand to run */
  readonly subcommand: 'run' | 'status' | 'info' | 'evaluate';
  /** Dataset variant */
  readonly variant: SWEBenchVariant;
  /** Maximum instances to run */
  readonly limit?: number;
  /** Output path for predictions */
  readonly output: string;
  /** Resume from checkpoint */
  readonly resume: boolean;
  /** Enable verbose output */
  readonly verbose: boolean;
  /** Specific instance IDs to run */
  readonly instances: readonly string[];
}

/**
 * SWE-bench run result.
 */
export interface SWEBenchCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Run the 'info' subcommand.
 */
function runInfo(options: SWEBenchOptions): SWEBenchCommandResult {
  console.log(`\nSWE-bench Dataset: ${options.variant}`);
  console.log('='.repeat(40));

  const info = getDatasetInfo(options.variant);
  console.log(`Total instances: ${String(info.num_instances)}`);
  console.log(`Repositories: ${String(info.repositories.length)}`);

  if (options.verbose) {
    console.log('\nRepositories:');
    for (const repo of info.repositories) {
      console.log(`  - ${repo}`);
    }
  }

  return {
    success: true,
    message: `Dataset info retrieved: ${String(info.num_instances)} instances`,
    details: { totalInstances: info.num_instances, repos: [...info.repositories] },
  };
}

/**
 * Run the 'status' subcommand.
 */
async function runStatus(options: SWEBenchOptions): Promise<SWEBenchCommandResult> {
  console.log(`\nSWE-bench Status`);
  console.log('='.repeat(40));
  console.log(`Output file: ${options.output}`);

  const idsResult = await getCompletedInstanceIds(options.output);
  if (!idsResult.ok) {
    // File doesn't exist is okay - means 0 completed
    console.log(`Completed predictions: 0`);
    return {
      success: true,
      message: 'No predictions file found',
      details: { completedCount: 0 },
    };
  }

  const completedIds = idsResult.value;
  const count = completedIds.size;
  console.log(`Completed predictions: ${String(count)}`);

  if (options.verbose && count > 0) {
    console.log('\nCompleted instances:');
    const idsArray = [...completedIds];
    for (const id of idsArray.slice(0, 20)) {
      console.log(`  - ${id}`);
    }
    if (count > 20) {
      console.log(`  ... and ${String(count - 20)} more`);
    }
  }

  return {
    success: true,
    message: `Found ${String(count)} completed predictions`,
    details: { completedCount: count, instanceIds: [...completedIds] },
  };
}

/**
 * Select instances to run based on options.
 */
function selectInstances(
  allInstances: readonly SWEBenchInstance[],
  completedIds: Set<string>,
  options: SWEBenchOptions
): SWEBenchInstance[] {
  let instances = [...allInstances];

  // Filter by specific instance IDs if provided
  if (options.instances.length > 0) {
    const requestedIds = new Set(options.instances);
    instances = instances.filter((inst) => requestedIds.has(inst.instance_id));
  }

  // Skip already completed instances if resuming
  if (options.resume) {
    instances = instances.filter((inst) => !completedIds.has(inst.instance_id));
  }

  // Limit number of instances
  if (options.limit !== undefined && options.limit > 0) {
    instances = instances.slice(0, options.limit);
  }

  return instances;
}

/**
 * Load completed instance IDs, returning empty set on error.
 */
async function loadCompletedIds(outputPath: string): Promise<Set<string>> {
  const result = await getCompletedInstanceIds(outputPath);
  return result.ok ? result.value : new Set();
}

/**
 * Print selected instances.
 */
function printSelectedInstances(instances: readonly SWEBenchInstance[]): void {
  console.log('\nInstances queued for execution:');
  for (const inst of instances.slice(0, 10)) {
    console.log(`  - ${inst.instance_id} (${inst.repo})`);
  }
  if (instances.length > 10) {
    console.log(`  ... and ${String(instances.length - 10)} more`);
  }
}

/**
 * Run the 'run' subcommand.
 */
async function runBenchmark(options: SWEBenchOptions): Promise<SWEBenchCommandResult> {
  console.log(`\nSWE-bench Run: ${options.variant}`);
  console.log('='.repeat(40));

  // Load dataset
  console.log('Loading dataset...');
  const loadResult = await loadDataset(options.variant);
  if (!loadResult.ok) {
    return { success: false, message: loadResult.error.message };
  }

  const allInstances = loadResult.value.instances;
  console.log(`Loaded ${String(allInstances.length)} instances`);

  // Get completed IDs
  const completedIds = await loadCompletedIds(options.output);
  console.log(`Already completed: ${String(completedIds.size)}`);

  // Select instances
  const instancesToRun = selectInstances(allInstances, completedIds, options);
  console.log(`Instances to run: ${String(instancesToRun.length)}`);

  if (instancesToRun.length === 0) {
    console.log('\nNo instances to run.');
    return {
      success: true,
      message: 'No instances to run',
      details: {
        totalInstances: allInstances.length,
        completedInstances: completedIds.size,
      },
    };
  }

  printSelectedInstances(instancesToRun);

  console.log('\n[Agent execution not yet implemented]');
  console.log('This command will run agents on instances in a future update.');

  return {
    success: true,
    message: `${String(instancesToRun.length)} instances queued`,
    details: {
      totalInstances: allInstances.length,
      completedInstances: completedIds.size,
      queuedInstances: instancesToRun.length,
    },
  };
}

/**
 * Check if a command is available.
 */
async function commandExists(cmd: string): Promise<boolean> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);
  try {
    await execAsync(`which ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check Python swebench package.
 */
async function checkSwebenchPackage(): Promise<boolean> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);
  try {
    await execAsync('python3 -c "import swebench"');
    return true;
  } catch {
    return false;
  }
}

/**
 * Run the 'evaluate' subcommand.
 */
async function runEvaluate(options: SWEBenchOptions): Promise<SWEBenchCommandResult> {
  console.log(`\nSWE-bench Evaluate`);
  console.log('='.repeat(40));
  console.log(`Predictions file: ${options.output}`);

  // Check predictions file exists
  const idsResult = await getCompletedInstanceIds(options.output);
  if (!idsResult.ok) {
    console.log('\nNo predictions file found.');
    console.log('Run "nexus-agents swe-bench run" first to generate predictions.');
    return { success: false, message: 'No predictions file found' };
  }

  const count = idsResult.value.size;
  console.log(`Predictions to evaluate: ${String(count)}`);

  if (count === 0) {
    return { success: false, message: 'No predictions to evaluate' };
  }

  // Check dependencies
  console.log('\nChecking dependencies...');

  const hasPython = await commandExists('python3');
  if (!hasPython) {
    console.log('  [!] python3 not found');
    console.log('\nPython 3.8+ is required for evaluation.');
    return { success: false, message: 'python3 not found' };
  }
  console.log('  [OK] python3');

  const hasDocker = await commandExists('docker');
  if (!hasDocker) {
    console.log('  [!] docker not found');
    console.log('\nDocker is required for SWE-bench evaluation.');
    return { success: false, message: 'docker not found' };
  }
  console.log('  [OK] docker');

  const hasSwebench = await checkSwebenchPackage();
  if (!hasSwebench) {
    console.log('  [!] swebench package not found');
    console.log('\nInstall with: pip install swebench');
    return { success: false, message: 'swebench package not installed' };
  }
  console.log('  [OK] swebench package');

  console.log('\n[Evaluation harness integration not yet implemented]');
  console.log('Manual evaluation:');
  console.log(`  python -m swebench.harness.run_evaluation \\`);
  console.log(`    --predictions_path ${options.output} \\`);
  console.log(`    --swe_bench_tasks princeton-nlp/SWE-bench_Lite \\`);
  console.log(`    --run_id nexus-agents-eval`);

  return {
    success: true,
    message: `${String(count)} predictions ready for evaluation`,
    details: { predictionsCount: count, dependenciesReady: true },
  };
}

/**
 * Parse variant argument.
 */
function parseVariant(arg: string): SWEBenchVariant {
  const v = arg.slice('--variant='.length);
  if (v === 'lite' || v === 'verified' || v === 'full') {
    return v;
  }
  return 'lite';
}

/**
 * Parse subcommand from first argument.
 */
function parseSubcommand(arg: string | undefined): 'run' | 'status' | 'info' | 'evaluate' {
  if (arg === 'status') return 'status';
  if (arg === 'info') return 'info';
  if (arg === 'evaluate') return 'evaluate';
  return 'run';
}

/**
 * Mutable state for argument parsing.
 */
interface ParseState {
  variant: SWEBenchVariant;
  limit: number | undefined;
  output: string;
  resume: boolean;
  verbose: boolean;
  instances: string[];
}

/**
 * Process a single argument.
 */
function processArg(arg: string, state: ParseState): void {
  if (arg.startsWith('--variant=')) {
    state.variant = parseVariant(arg);
  } else if (arg.startsWith('--limit=')) {
    state.limit = parseInt(arg.slice('--limit='.length), 10);
  } else if (arg.startsWith('--output=')) {
    state.output = arg.slice('--output='.length);
  } else if (arg === '--resume') {
    state.resume = true;
  } else if (arg === '--verbose' || arg === '-v') {
    state.verbose = true;
  } else if (arg.startsWith('--instance=')) {
    state.instances.push(arg.slice('--instance='.length));
  }
}

/**
 * Build final options object with proper typing.
 */
function buildOptions(
  subcommand: 'run' | 'status' | 'info' | 'evaluate',
  state: ParseState
): SWEBenchOptions {
  const base = {
    subcommand,
    variant: state.variant,
    output: state.output,
    resume: state.resume,
    verbose: state.verbose,
    instances: state.instances,
  };
  if (state.limit === undefined) {
    return base;
  }
  return { ...base, limit: state.limit };
}

/**
 * Parse command line arguments into options.
 */
export function parseSweBenchArgs(args: readonly string[]): SWEBenchOptions {
  const subcommand = parseSubcommand(args[0]);
  const state: ParseState = {
    variant: 'lite',
    limit: undefined,
    output: 'predictions.jsonl',
    resume: false,
    verbose: false,
    instances: [],
  };

  for (const arg of args.slice(1)) {
    processArg(arg, state);
  }

  return buildOptions(subcommand, state);
}

/**
 * Print help for SWE-bench command.
 */
export function printSweBenchHelp(): void {
  console.log(`
Usage: nexus-agents swe-bench <subcommand> [options]

Subcommands:
  run       Run agents on SWE-bench instances
  status    Show progress and completed predictions
  info      Display dataset information
  evaluate  Evaluate predictions using SWE-bench harness

Options:
  --variant=<lite|verified|full>  Dataset variant (default: lite)
  --limit=<n>                     Maximum instances to run
  --output=<path>                 Output predictions file (default: predictions.jsonl)
  --resume                        Skip already completed instances
  --instance=<id>                 Run specific instance (can be repeated)
  --verbose, -v                   Enable verbose output

Examples:
  nexus-agents swe-bench info --variant=lite
  nexus-agents swe-bench run --limit=10 --output=./output/predictions.jsonl
  nexus-agents swe-bench status --output=./output/predictions.jsonl
  nexus-agents swe-bench run --resume --variant=lite
  nexus-agents swe-bench evaluate --output=./predictions.jsonl
`);
}

/**
 * Execute subcommand.
 */
async function executeSubcommand(options: SWEBenchOptions): Promise<SWEBenchCommandResult> {
  switch (options.subcommand) {
    case 'info':
      return Promise.resolve(runInfo(options));
    case 'status':
      return runStatus(options);
    case 'run':
      return runBenchmark(options);
    case 'evaluate':
      return runEvaluate(options);
  }
}

/**
 * Main SWE-bench command handler.
 */
export async function sweBenchCommand(args: readonly string[]): Promise<number> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printSweBenchHelp();
    return 0;
  }

  const options = parseSweBenchArgs(args);

  try {
    const result = await executeSubcommand(options);
    return result.success ? 0 : 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return 1;
  }
}
