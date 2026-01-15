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
  createExecutor,
  runBenchmarkInstances,
  DEFAULT_SWE_BENCH_CONFIG,
  type SWEBenchVariant,
  type SWEBenchInstance,
  type SWEBenchConfig,
} from '../swe-bench/index.js';

/** SWE-bench command options. */
export interface SWEBenchOptions {
  readonly subcommand: 'run' | 'status' | 'info' | 'evaluate';
  readonly variant: SWEBenchVariant;
  readonly limit?: number;
  readonly output: string;
  readonly resume: boolean;
  readonly verbose: boolean;
  readonly instances: readonly string[];
}

/** SWE-bench run result. */
export interface SWEBenchCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/** Run the 'info' subcommand. */
function runInfo(options: SWEBenchOptions): SWEBenchCommandResult {
  console.log(`\nSWE-bench Dataset: ${options.variant}`);
  console.log('='.repeat(40));
  const info = getDatasetInfo(options.variant);
  console.log(`Total instances: ${String(info.num_instances)}`);
  console.log(`Repositories: ${String(info.repositories.length)}`);
  if (options.verbose) {
    console.log('\nRepositories:');
    for (const repo of info.repositories) console.log(`  - ${repo}`);
  }
  return {
    success: true,
    message: `Dataset info: ${String(info.num_instances)} instances`,
    details: { totalInstances: info.num_instances },
  };
}

/** Run the 'status' subcommand. */
async function runStatus(options: SWEBenchOptions): Promise<SWEBenchCommandResult> {
  console.log(`\nSWE-bench Status`);
  console.log('='.repeat(40));
  console.log(`Output file: ${options.output}`);
  const idsResult = await getCompletedInstanceIds(options.output);
  if (!idsResult.ok) {
    console.log(`Completed predictions: 0`);
    return { success: true, message: 'No predictions file', details: { completedCount: 0 } };
  }
  const count = idsResult.value.size;
  console.log(`Completed predictions: ${String(count)}`);
  return { success: true, message: `Found ${String(count)} predictions`, details: { count } };
}

/** Select instances to run based on options. */
function selectInstances(
  allInstances: readonly SWEBenchInstance[],
  completedIds: Set<string>,
  options: SWEBenchOptions
): SWEBenchInstance[] {
  let instances = [...allInstances];
  if (options.instances.length > 0) {
    const requestedIds = new Set(options.instances);
    instances = instances.filter((inst) => requestedIds.has(inst.instance_id));
  }
  if (options.resume) {
    instances = instances.filter((inst) => !completedIds.has(inst.instance_id));
  }
  if (options.limit !== undefined && options.limit > 0) {
    instances = instances.slice(0, options.limit);
  }
  return instances;
}

/** Build SWE-bench config from CLI options. */
function buildConfig(options: SWEBenchOptions): SWEBenchConfig {
  const base = {
    ...DEFAULT_SWE_BENCH_CONFIG,
    variant: options.variant,
    output_path: options.output,
    resume: options.resume,
  };
  return options.limit !== undefined ? { ...base, limit: options.limit } : base;
}

/** Run the 'run' subcommand. */
async function runBenchmark(options: SWEBenchOptions): Promise<SWEBenchCommandResult> {
  console.log(`\nSWE-bench Run: ${options.variant}`);
  console.log('='.repeat(40));

  const executorResult = createExecutor(options.verbose);
  if (!executorResult.ok) {
    console.error(`\nError: ${executorResult.error.message}`);
    console.log('\nSet ANTHROPIC_API_KEY environment variable to run SWE-bench.');
    return { success: false, message: executorResult.error.message };
  }

  const executor = executorResult.value;
  console.log(`Model: ${executor.getModelId()}`);

  console.log('Loading dataset...');
  const loadResult = await loadDataset(options.variant);
  if (!loadResult.ok) return { success: false, message: loadResult.error.message };

  const allInstances = loadResult.value.instances;
  console.log(`Loaded ${String(allInstances.length)} instances`);

  const completedIds = await getCompletedInstanceIds(options.output);
  const completed = completedIds.ok ? completedIds.value : new Set<string>();
  console.log(`Already completed: ${String(completed.size)}`);

  const instancesToRun = selectInstances(allInstances, completed, options);
  console.log(`Instances to run: ${String(instancesToRun.length)}`);

  if (instancesToRun.length === 0) {
    console.log('\nNo instances to run.');
    return { success: true, message: 'No instances to run' };
  }

  const result = await runBenchmarkInstances(executor, {
    instances: instancesToRun,
    config: buildConfig(options),
    outputPath: options.output,
    append: options.resume,
    verbose: options.verbose,
  });

  return { success: result.success, message: result.message, details: { ...result } };
}

/** Check if a command is available. */
async function commandExists(cmd: string): Promise<boolean> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  try {
    await promisify(exec)(`which ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

/** Run the 'evaluate' subcommand. */
async function runEvaluate(options: SWEBenchOptions): Promise<SWEBenchCommandResult> {
  console.log(`\nSWE-bench Evaluate`);
  console.log('='.repeat(40));
  const idsResult = await getCompletedInstanceIds(options.output);
  if (!idsResult.ok) {
    console.log('No predictions file. Run "nexus-agents swe-bench run" first.');
    return { success: false, message: 'No predictions file' };
  }
  const count = idsResult.value.size;
  if (count === 0) return { success: false, message: 'No predictions' };

  console.log('\nChecking dependencies...');
  const hasPython = await commandExists('python3');
  const hasDocker = await commandExists('docker');
  if (!hasPython) return { success: false, message: 'python3 not found' };
  if (!hasDocker) return { success: false, message: 'docker not found' };
  console.log('  [OK] python3, docker');

  console.log('\nManual evaluation:');
  console.log(`  python -m swebench.harness.run_evaluation \\`);
  console.log(`    --predictions_path ${options.output} \\`);
  console.log(`    --swe_bench_tasks princeton-nlp/SWE-bench_Lite`);

  return { success: true, message: `${String(count)} predictions ready` };
}

/** Parse subcommand argument. */
function parseSubcommand(arg: string | undefined): SWEBenchOptions['subcommand'] {
  if (arg === 'status') return 'status';
  if (arg === 'info') return 'info';
  if (arg === 'evaluate') return 'evaluate';
  return 'run';
}

/** Parse variant argument. */
function parseVariant(arg: string): SWEBenchVariant {
  const v = arg.slice('--variant='.length);
  if (v === 'lite' || v === 'verified' || v === 'full') return v;
  return 'lite';
}

/** Parse a single argument and update state. */
function parseArg(
  arg: string,
  state: {
    variant: SWEBenchVariant;
    limit: number | undefined;
    output: string;
    resume: boolean;
    verbose: boolean;
    instances: string[];
  }
): void {
  if (arg.startsWith('--variant=')) state.variant = parseVariant(arg);
  else if (arg.startsWith('--limit=')) state.limit = parseInt(arg.slice('--limit='.length), 10);
  else if (arg.startsWith('--output=')) state.output = arg.slice('--output='.length);
  else if (arg === '--resume') state.resume = true;
  else if (arg === '--verbose' || arg === '-v') state.verbose = true;
  else if (arg.startsWith('--instance=')) state.instances.push(arg.slice('--instance='.length));
}

/** Parse command line arguments into options. */
export function parseSweBenchArgs(args: readonly string[]): SWEBenchOptions {
  const subcommand = parseSubcommand(args[0]);
  const state = {
    variant: 'lite' as SWEBenchVariant,
    limit: undefined as number | undefined,
    output: 'predictions.jsonl',
    resume: false,
    verbose: false,
    instances: [] as string[],
  };
  for (const arg of args.slice(1)) parseArg(arg, state);
  const base = {
    subcommand,
    variant: state.variant,
    output: state.output,
    resume: state.resume,
    verbose: state.verbose,
    instances: state.instances,
  };
  return state.limit !== undefined ? { ...base, limit: state.limit } : base;
}

/** Print help for SWE-bench command. */
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
`);
}

/** Main SWE-bench command handler. */
export async function sweBenchCommand(args: readonly string[]): Promise<number> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printSweBenchHelp();
    return 0;
  }
  const options = parseSweBenchArgs(args);
  try {
    const result =
      options.subcommand === 'info'
        ? runInfo(options)
        : options.subcommand === 'status'
          ? await runStatus(options)
          : options.subcommand === 'evaluate'
            ? await runEvaluate(options)
            : await runBenchmark(options);
    return result.success ? 0 : 1;
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
