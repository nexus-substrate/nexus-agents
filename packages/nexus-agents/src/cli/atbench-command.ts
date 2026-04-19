/**
 * CLI ATBench Command (#1981).
 *
 * Run trajectory-safety evaluations against ATBench-Claw / ATBench-CodeX.
 *
 * Subcommands:
 * - `info`   : print dataset metadata + scorer mode
 * - `run`    : load trajectories, score, summarize
 *
 * Pattern mirrors `cli/swe-bench-command.ts`. Built so the dispatcher
 * wiring is a separate, low-risk follow-up.
 *
 * @module cli/atbench-command
 */

/* eslint-disable no-console */
// Console output is intentional for CLI user feedback.

import { ATBenchAdapter } from '../benchmarks/atbench/adapter.js';
import type { ATBenchEvalResult } from '../benchmarks/atbench/types.js';

/** ATBench command options. */
export interface ATBenchOptions {
  readonly subcommand: 'run' | 'info';
  readonly variant: 'claw' | 'codex';
  /** Optional cap on instances (smoke testing). */
  readonly limit?: number;
  /** Local JSONL fixture path. When omitted, fetches from HuggingFace. */
  readonly fixturePath?: string;
  /** Enable LLM scoring via the registry's recommended adapter. */
  readonly llmScoring: boolean;
  /** Verbose progress output. */
  readonly verbose: boolean;
}

/** Result of an ATBench command invocation. */
export interface ATBenchCommandResult {
  readonly success: boolean;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/** Run the 'info' subcommand — prints variant, source, scorer mode. */
export function runInfo(options: ATBenchOptions): ATBenchCommandResult {
  console.log('\nATBench info');
  console.log('='.repeat(40));
  console.log(`Variant:          ${options.variant}`);
  const source =
    options.fixturePath !== undefined
      ? `local fixture: ${options.fixturePath}`
      : `HuggingFace: AI45Research/ATBench-${options.variant === 'codex' ? 'CodeX' : 'Claw'}`;
  console.log(`Source:           ${source}`);
  console.log(
    `Scorer:           ${options.llmScoring ? 'LLM (TBD: adapter wiring)' : 'stub (perfect oracle)'}`
  );
  console.log(`Instance limit:   ${options.limit !== undefined ? String(options.limit) : 'all'}`);
  return {
    success: true,
    message: `info for atbench/${options.variant}`,
  };
}

/** Run the 'run' subcommand — loads, scores, summarizes. */
export async function runEvaluation(options: ATBenchOptions): Promise<ATBenchCommandResult> {
  console.log(`\nATBench run: ${options.variant}`);
  console.log('='.repeat(40));

  const adapter = new ATBenchAdapter({ variant: options.variant });
  const startedLoad = Date.now();
  const instances = await adapter.loadInstances({
    variant: options.variant,
    ...(options.fixturePath !== undefined ? { fixturePath: options.fixturePath } : {}),
    ...(options.limit !== undefined ? { maxInstances: options.limit } : {}),
  });
  const loadTimeMs = Date.now() - startedLoad;
  console.log(`Loaded ${String(instances.length)} trajectories in ${String(loadTimeMs)}ms`);

  const startedRun = Date.now();
  const evalResults = await scoreAll(adapter, instances, options.verbose);
  const runTimeMs = Date.now() - startedRun;

  const summary = adapter.summarize(evalResults, runTimeMs);
  printSummary(summary, runTimeMs);

  const meta = summary.metadata as SummaryMeta;
  return {
    success: true,
    message: `${String(summary.passed)}/${String(summary.total)} passed (${(summary.passRate * 100).toFixed(1)}%)`,
    details: {
      total: summary.total,
      passed: summary.passed,
      passRate: summary.passRate,
      runTimeMs,
      loadTimeMs,
      precision: meta.precision,
      recall: meta.recall,
      f1: meta.f1,
    },
  };
}

interface SummaryMeta {
  readonly precision?: number;
  readonly recall?: number;
  readonly f1?: number;
  readonly confusionMatrix?: {
    readonly tp: number;
    readonly tn: number;
    readonly fp: number;
    readonly fn: number;
  };
}

/** Score all instances sequentially. */
async function scoreAll(
  adapter: ATBenchAdapter,
  instances: readonly import('../benchmarks/atbench/types.js').ATBenchTrajectory[],
  verbose: boolean
): Promise<ATBenchEvalResult[]> {
  const results: ATBenchEvalResult[] = [];
  for (const [idx, instance] of instances.entries()) {
    if (verbose) {
      console.log(
        `  [${String(idx + 1)}/${String(instances.length)}] scoring ${instance.id} (truth: ${instance.safetyLabel})`
      );
    }
    const prediction = await adapter.runInstance(instance, { timeoutMs: 30_000 });
    const evalResult = await adapter.evaluate(instance, prediction);
    results.push(evalResult);
  }
  return results;
}

/** Print the human-readable summary block. */
function printSummary(
  summary: {
    readonly total: number;
    readonly passed: number;
    readonly passRate: number;
    readonly metadata: Record<string, unknown>;
  },
  runTimeMs: number
): void {
  const meta = summary.metadata as SummaryMeta;
  console.log('\nResults');
  console.log('-'.repeat(40));
  console.log(`Total:            ${String(summary.total)}`);
  console.log(
    `Passed:           ${String(summary.passed)} (${(summary.passRate * 100).toFixed(1)}%)`
  );
  if (meta.precision !== undefined) console.log(`Precision:        ${meta.precision.toFixed(3)}`);
  if (meta.recall !== undefined) console.log(`Recall:           ${meta.recall.toFixed(3)}`);
  if (meta.f1 !== undefined) console.log(`F1:               ${meta.f1.toFixed(3)}`);
  if (meta.confusionMatrix !== undefined) {
    const cm = meta.confusionMatrix;
    console.log(
      `Confusion (tp/fn/fp/tn): ${String(cm.tp)}/${String(cm.fn)}/${String(cm.fp)}/${String(cm.tn)}`
    );
  }
  console.log(`Run time:         ${String(runTimeMs)}ms`);
}

/** Top-level dispatch for the atbench CLI command. */
export async function atbenchCommand(options: ATBenchOptions): Promise<ATBenchCommandResult> {
  if (options.subcommand === 'info') return Promise.resolve(runInfo(options));
  return runEvaluation(options);
}

/** Parse subcommand argument. */
function parseSubcommand(arg: string | undefined): ATBenchOptions['subcommand'] {
  return arg === 'info' ? 'info' : 'run';
}

/** Parse variant argument. */
function parseVariant(arg: string): 'claw' | 'codex' {
  const v = arg.slice('--variant='.length);
  return v === 'codex' ? 'codex' : 'claw';
}

interface ParseState {
  variant: 'claw' | 'codex';
  limit: number | undefined;
  fixturePath: string | undefined;
  llmScoring: boolean;
  verbose: boolean;
}

/** Apply a single argv token to the parse state. */
function applyArg(arg: string, state: ParseState): void {
  if (arg.startsWith('--variant=')) {
    state.variant = parseVariant(arg);
    return;
  }
  if (arg.startsWith('--limit=')) {
    const n = Number(arg.slice('--limit='.length));
    if (Number.isInteger(n) && n > 0) state.limit = n;
    return;
  }
  if (arg.startsWith('--fixture=')) {
    state.fixturePath = arg.slice('--fixture='.length);
    return;
  }
  if (arg === '--llm-scoring') state.llmScoring = true;
  else if (arg === '--verbose' || arg === '-v') state.verbose = true;
}

/** Parse argv into ATBenchOptions. */
export function parseAtbenchArgs(argv: readonly string[]): ATBenchOptions {
  const subcommand = parseSubcommand(argv[0]);
  const state: ParseState = {
    variant: 'claw',
    limit: undefined,
    fixturePath: undefined,
    llmScoring: false,
    verbose: false,
  };
  for (const arg of argv.slice(1)) applyArg(arg, state);

  const opts: ATBenchOptions = {
    subcommand,
    variant: state.variant,
    llmScoring: state.llmScoring,
    verbose: state.verbose,
    ...(state.limit !== undefined ? { limit: state.limit } : {}),
    ...(state.fixturePath !== undefined ? { fixturePath: state.fixturePath } : {}),
  };
  return opts;
}

/** Print CLI help text. */
export function printAtbenchHelp(): void {
  console.log(`
nexus-agents atbench — trajectory-safety benchmarking against ATBench

Subcommands:
  info       Show dataset metadata + scorer mode
  run        Load trajectories, score, summarize (default)

Options:
  --variant=<claw|codex>   Dataset variant (default: claw)
  --limit=<N>              Cap instances (smoke runs)
  --fixture=<path>         Use local JSONL instead of HuggingFace
  --llm-scoring            Enable LLM scorer (default: stub oracle)
  --verbose, -v            Print per-instance progress

Examples:
  nexus-agents atbench info
  nexus-agents atbench run --variant=claw --limit=10 --verbose
  nexus-agents atbench run --fixture=./test/atbench-fixture.jsonl
`);
}
