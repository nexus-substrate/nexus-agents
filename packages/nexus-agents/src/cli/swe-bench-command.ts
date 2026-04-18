/**
 * CLI SWE-bench Command
 *
 * Benchmark nexus-agents against SWE-bench instances.
 *
 * @module cli/swe-bench-command
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

/* eslint-disable no-console, max-lines */
// Console output is intentional for CLI user feedback
// max-lines: Cohesive CLI command handler (evaluate+run+status+info) — 400-600 OK per governance

import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadDataset,
  getDatasetInfo,
  getCompletedInstanceIds,
  createExecutor,
  runBenchmarkInstances,
  createHarnessExecutor,
  DEFAULT_SWE_BENCH_CONFIG,
  type SWEBenchVariant,
  type SWEBenchInstance,
  type SWEBenchConfig,
  type HarnessExecutionConfig,
  type HarnessExecutionProgress,
} from '../swe-bench/index.js';

/** Valid cache level values for Docker harness. */
type CacheLevel = 'none' | 'base' | 'env' | 'instance';

/** SWE-bench command options. */
export interface SWEBenchOptions {
  readonly subcommand: 'run' | 'status' | 'info' | 'evaluate';
  readonly variant: SWEBenchVariant;
  readonly limit?: number;
  readonly output: string;
  readonly resume: boolean;
  readonly verbose: boolean;
  readonly concurrency: number;
  readonly instances: readonly string[];
  /** Enable MCP tools (memory, research) in child CLI sessions. */
  readonly mcp: boolean;
  /** Path to predictions file for evaluate (defaults to output). */
  readonly predictions?: string;
  /** Docker cache level for evaluate. */
  readonly cacheLevel: CacheLevel;
  /** Max parallel Docker workers for evaluate. */
  readonly maxWorkers: number;
  /** Custom run ID for evaluate. */
  readonly runId?: string;
  /** Output directory for harness logs. */
  readonly outputDir: string;
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
    concurrency: options.concurrency,
    memory_dir: '/tmp/swe-bench-memory',
  };
  return options.limit !== undefined ? { ...base, limit: options.limit } : base;
}

/** Log dataset loading error with optional cause. */
function logDatasetError(error: { message: string; cause?: unknown }): void {
  console.error(`\nError loading dataset: ${error.message}`);
  if (error.cause !== undefined) {
    const causeMsg =
      error.cause instanceof Error ? error.cause.message : JSON.stringify(error.cause);
    console.error(`  Cause: ${causeMsg}`);
  }
}

/** Load and select instances to run. */
async function loadAndSelectInstances(
  options: SWEBenchOptions
): Promise<{ instances: SWEBenchInstance[]; error?: string }> {
  console.log('Loading dataset...');
  // Don't pass limit to dataset loader when --instance is specified,
  // because limit would truncate the dataset before instance filtering.
  const hasInstanceFilter = options.instances.length > 0;
  const loadOptions =
    !hasInstanceFilter && options.limit !== undefined ? { limit: options.limit } : {};
  const loadResult = await loadDataset(options.variant, loadOptions);
  if (!loadResult.ok) {
    logDatasetError(loadResult.error);
    return { instances: [], error: loadResult.error.message };
  }

  const allInstances = loadResult.value.instances;
  console.log(`Loaded ${String(allInstances.length)} instances`);

  const completedIds = await getCompletedInstanceIds(options.output);
  const completed = completedIds.ok ? completedIds.value : new Set<string>();
  console.log(`Already completed: ${String(completed.size)}`);

  const instancesToRun = selectInstances(allInstances, completed, options);
  console.log(`Instances to run: ${String(instancesToRun.length)}`);

  return { instances: instancesToRun };
}

/** Run the 'run' subcommand. */
async function runBenchmark(options: SWEBenchOptions): Promise<SWEBenchCommandResult> {
  console.log(`\nSWE-bench Run: ${options.variant}`);
  console.log('='.repeat(40));

  const executorResult = await createExecutor({
    verbose: options.verbose,
    mcpEnabled: options.mcp,
  });
  if (!executorResult.ok) {
    console.error(`\nError: ${executorResult.error.message}`);
    return { success: false, message: executorResult.error.message };
  }

  const executor = executorResult.value;
  console.log(`Model: ${executor.getModelId()}`);

  const { instances, error } = await loadAndSelectInstances(options);
  if (error !== undefined) return { success: false, message: error };
  if (instances.length === 0) {
    console.log('\nNo instances to run.');
    return { success: true, message: 'No instances to run' };
  }

  const result = await runBenchmarkInstances(executor, {
    instances,
    config: buildConfig(options),
    outputPath: options.output,
    append: options.resume,
    verbose: options.verbose,
  });

  return { success: result.success, message: result.message, details: { ...result } };
}

/** Validate run ID format (alphanumeric, hyphens, underscores only). */
function isValidRunId(runId: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(runId);
}

/** Validate output directory path (no traversal). */
function isValidOutputDir(dir: string): boolean {
  const resolved = path.resolve(dir);
  return !resolved.includes('..') && resolved === path.normalize(resolved);
}

/** Format progress for display. */
function formatProgress(progress: HarnessExecutionProgress): string {
  const pct =
    progress.totalCount > 0 ? Math.round((progress.completedCount / progress.totalCount) * 100) : 0;
  const base = `[${String(progress.completedCount)}/${String(progress.totalCount)}] ${String(pct)}%`;
  if (progress.currentInstanceId !== undefined) {
    return `${base} - ${progress.currentInstanceId}`;
  }
  return base;
}

/** Build harness execution config from CLI options. */
function buildHarnessConfig(options: SWEBenchOptions): HarnessExecutionConfig {
  const predictionsPath = options.predictions ?? options.output;
  const runId = options.runId ?? `eval-${String(Date.now())}`;
  return {
    predictionsPath: path.resolve(predictionsPath),
    datasetName: options.variant,
    maxWorkers: options.maxWorkers,
    runId,
    timeoutSeconds: 1800,
    outputDir: path.resolve(options.outputDir),
    useDocker: true,
    cacheLevel: options.cacheLevel,
  };
}

/** Validate evaluate input options. Returns error message or null if valid. */
function validateEvaluateInputs(options: SWEBenchOptions): string | null {
  if (options.runId !== undefined && !isValidRunId(options.runId)) {
    return 'Invalid run-id: alphanumeric, hyphens, underscores only';
  }
  if (!isValidOutputDir(options.outputDir)) {
    return 'Invalid output-dir: path traversal detected';
  }
  return null;
}

/** Display harness execution results. */
function displayEvaluateResults(
  result: {
    resolvedInstances: number;
    totalInstances: number;
    resolutionRate: number;
    logPath?: string;
    instanceResults: readonly { instanceId: string; resolved: boolean }[];
  },
  verbose: boolean
): void {
  console.log('\n');
  console.log(`Resolved: ${String(result.resolvedInstances)}/${String(result.totalInstances)}`);
  console.log(`Resolution rate: ${(result.resolutionRate * 100).toFixed(1)}%`);
  if (result.logPath !== undefined) console.log(`Logs: ${result.logPath}`);
  if (verbose && result.instanceResults.length > 0) {
    console.log('\nPer-instance results:');
    for (const inst of result.instanceResults) {
      console.log(`  [${inst.resolved ? 'PASS' : 'FAIL'}] ${inst.instanceId}`);
    }
  }
}

/** Run the 'evaluate' subcommand. */
async function runEvaluate(options: SWEBenchOptions): Promise<SWEBenchCommandResult> {
  console.log(`\nSWE-bench Evaluate`);
  console.log('='.repeat(40));

  const predictionsPath = options.predictions ?? options.output;
  const idsResult = await getCompletedInstanceIds(predictionsPath);
  if (!idsResult.ok) {
    console.log('No predictions file. Run "nexus-agents swe-bench run" first.');
    return { success: false, message: 'No predictions file' };
  }
  const count = idsResult.value.size;
  if (count === 0) return { success: false, message: 'No predictions' };

  const inputError = validateEvaluateInputs(options);
  if (inputError !== null) return { success: false, message: inputError };

  console.log(`Predictions: ${String(count)} instances`);
  console.log(`Cache level: ${options.cacheLevel}`);
  console.log(`Max workers: ${String(options.maxWorkers)}`);

  const executor = createHarnessExecutor();
  const validation = await executor.validate();
  if (!validation.ready) {
    console.error('\nEnvironment not ready:');
    for (const err of validation.errors) console.error(`  - ${err}`);
    return { success: false, message: validation.errors.join('; ') };
  }
  console.log(
    `\nEnvironment OK (Python ${validation.pythonVersion ?? '?'}, Docker ${validation.dockerVersion ?? '?'})`
  );

  const config = buildHarnessConfig(options);
  console.log(`\nRunning evaluation (run_id: ${config.runId})...`);
  const result = await executor.execute(config, (progress) => {
    if (progress.state === 'running') process.stdout.write(`\r  ${formatProgress(progress)}`);
  });

  displayEvaluateResults(result, options.verbose);
  const rateStr = (result.resolutionRate * 100).toFixed(1);
  return {
    success: true,
    message: `${String(result.resolvedInstances)}/${String(result.totalInstances)} resolved (${rateStr}%)`,
    details: {
      resolved: result.resolvedInstances,
      total: result.totalInstances,
      resolutionRate: result.resolutionRate,
      runId: result.runId,
    },
  };
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

/** Maximum parallel workers cap: 75% of CPU count, max 24. */
const MAX_WORKERS_CAP = Math.min(Math.floor(os.cpus().length * 0.75), 24);

/** Valid cache levels. */
const VALID_CACHE_LEVELS = new Set<CacheLevel>(['none', 'base', 'env', 'instance']);

/** Mutable state for arg parsing. */
interface ParseState {
  variant: SWEBenchVariant;
  limit: number | undefined;
  output: string;
  resume: boolean;
  verbose: boolean;
  concurrency: number;
  instances: string[];
  mcp: boolean;
  predictions: string | undefined;
  cacheLevel: CacheLevel;
  maxWorkers: number;
  runId: string | undefined;
  outputDir: string;
}

/** Boolean flags that don't require value parsing. */
const BOOLEAN_FLAGS: Record<string, keyof ParseState> = {
  '--resume': 'resume',
  '--verbose': 'verbose',
  '-v': 'verbose',
  '--mcp': 'mcp',
};

/** Parse cache level with validation. */
function parseCacheLevel(value: string): CacheLevel {
  const level = value as CacheLevel;
  return VALID_CACHE_LEVELS.has(level) ? level : 'env';
}

/** Parse max workers with cap enforcement. */
function parseMaxWorkers(value: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return 4;
  return Math.min(parsed, MAX_WORKERS_CAP);
}

/** String flags: prefix → [stateKey, transform] */
const STRING_FLAGS: [string, keyof ParseState, (v: string) => unknown][] = [
  ['--output=', 'output', (v) => v],
  ['--predictions=', 'predictions', (v) => v],
  ['--run-id=', 'runId', (v) => v],
  ['--output-dir=', 'outputDir', (v) => v],
  ['--limit=', 'limit', (v) => parseInt(v, 10)],
  ['--concurrency=', 'concurrency', (v) => Math.max(1, parseInt(v, 10) || 1)],
  ['--cache-level=', 'cacheLevel', parseCacheLevel],
  ['--max-workers=', 'maxWorkers', parseMaxWorkers],
];

/** Parse a single argument and update state. */
function parseArg(arg: string, state: ParseState): void {
  const boolKey = BOOLEAN_FLAGS[arg];
  if (boolKey !== undefined) {
    (state[boolKey] as boolean) = true;
    return;
  }
  if (arg.startsWith('--variant=')) {
    state.variant = parseVariant(arg);
    return;
  }
  if (arg.startsWith('--instance=')) {
    state.instances.push(arg.slice('--instance='.length));
    return;
  }
  for (const [prefix, key, transform] of STRING_FLAGS) {
    if (arg.startsWith(prefix)) {
      (state[key] as unknown) = transform(arg.slice(prefix.length));
      return;
    }
  }
}

/** Parse command line arguments into options. */
export function parseSweBenchArgs(args: readonly string[]): SWEBenchOptions {
  const subcommand = parseSubcommand(args[0]);
  const state: ParseState = {
    variant: 'lite',
    limit: undefined,
    output: 'predictions.jsonl',
    resume: false,
    verbose: false,
    concurrency: 1,
    instances: [],
    mcp: false,
    predictions: undefined,
    cacheLevel: 'env',
    maxWorkers: 4,
    runId: undefined,
    outputDir: './logs/run_evaluation',
  };
  for (const arg of args.slice(1)) parseArg(arg, state);
  const base: SWEBenchOptions = {
    subcommand,
    variant: state.variant,
    output: state.output,
    resume: state.resume,
    verbose: state.verbose,
    concurrency: state.concurrency,
    instances: state.instances,
    mcp: state.mcp,
    cacheLevel: state.cacheLevel,
    maxWorkers: state.maxWorkers,
    outputDir: state.outputDir,
    ...(state.limit !== undefined ? { limit: state.limit } : {}),
    ...(state.predictions !== undefined ? { predictions: state.predictions } : {}),
    ...(state.runId !== undefined ? { runId: state.runId } : {}),
  };
  return base;
}

/** Print help for SWE-bench command. */
export function printSweBenchHelp(): void {
  console.log(`
Usage: nexus-agents swe-bench <subcommand> [options]

DEPRECATED: This command is being superseded by \`nexus-eval-swebench\`
(https://github.com/williamzujkowski/nexus-eval-swebench). It remains
functional for backwards compatibility but will not receive new features.

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
  --concurrency=<n>               Parallel workers (default: 1, sequential)
  --mcp                           Enable MCP tools (memory, research) in child sessions
  --verbose, -v                   Enable verbose output

Evaluate options:
  --predictions=<path>            Predictions file (default: --output value)
  --cache-level=<level>           Docker cache: none|base|env|instance (default: env)
  --max-workers=<n>               Parallel Docker workers (default: 4, max: ${String(MAX_WORKERS_CAP)})
  --run-id=<id>                   Custom run identifier
  --output-dir=<path>             Harness log directory (default: ./logs/run_evaluation)
`);
}

let deprecationWarned = false;

function emitDeprecationWarning(): void {
  if (deprecationWarned) return;
  deprecationWarned = true;
  if (process.env['NEXUS_SUPPRESS_SWEBENCH_DEPRECATION'] === '1') return;
  console.warn(
    '[deprecation] `nexus-agents swe-bench` is superseded by `nexus-eval-swebench` ' +
      '(https://github.com/williamzujkowski/nexus-eval-swebench). This in-tree command ' +
      'remains functional but will not receive new benchmark features. Suppress this ' +
      'warning with NEXUS_SUPPRESS_SWEBENCH_DEPRECATION=1.'
  );
}

/** Main SWE-bench command handler. */
export async function sweBenchCommand(args: readonly string[]): Promise<number> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printSweBenchHelp();
    return 0;
  }
  emitDeprecationWarning();
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
