/**
 * nexus-agents/swe-bench - Benchmark Runner
 *
 * Runs the benchmark execution loop against SWE-bench instances.
 *
 * @module swe-bench/benchmark-runner
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

/* eslint-disable no-console */
// Console output is intentional for CLI user feedback

import type { Result } from '../core/result.js';
import type { SWEBenchConfig, SWEBenchInstance, SWEBenchRunResult } from './types.js';
import { runAgentOnInstance, type RunOptions, type IAgentExecutor } from './agent-runner.js';
import { AgentRunnerError } from './agent-runner.js';
import { PredictionWriter } from './prediction-writer.js';
import { createNexusExecutorFromEnv } from './nexus-agent-executor.js';
import { createCliExecutor } from './cli-agent-executor.js';
import { runBenchmarkParallel } from './parallel-runner.js';
import {
  createBenchmarkMemory,
  buildEnrichedPrompt,
  recordOutcome,
  extractPastSuccessRates,
} from './memory-enrichment.js';
import { sortByPriority } from './instance-sorter.js';
import type { SessionMemory } from '../context/session-memory.js';
import type { SessionLearning } from '../context/session-memory-types.js';

/**
 * Result from running benchmark.
 */
export interface BenchmarkRunResult {
  readonly success: boolean;
  readonly message: string;
  readonly total: number;
  readonly completed: number;
  readonly failed: number;
  readonly tokensUsed: number;
  readonly outputPath: string;
}

/**
 * Options for running benchmark.
 */
export interface BenchmarkRunOptions {
  readonly instances: readonly SWEBenchInstance[];
  readonly config: SWEBenchConfig;
  readonly outputPath: string;
  readonly append: boolean;
  readonly verbose: boolean;
}

/**
 * Executor with model ID for reporting.
 */
export interface ExecutorWithModel extends IAgentExecutor {
  getModelId(): string;
}

/**
 * Create executor, preferring CLI over API.
 */
export async function createExecutor(
  verbose: boolean
): Promise<Result<ExecutorWithModel, AgentRunnerError>> {
  const onMessage = verbose
    ? (msg: string): void => {
        console.log(`  [agent] ${msg}`);
      }
    : undefined;

  console.log('Checking CLI availability...');
  const cliResult = await createCliExecutor({ onMessage });
  if (cliResult.ok) {
    console.log('Using Claude CLI (OAuth authentication)');
    return cliResult;
  }

  console.log('CLI not available, checking API key...');
  const apiResult = createNexusExecutorFromEnv({ onMessage });
  if (apiResult.ok) {
    console.log('Using Anthropic API');
    return apiResult;
  }

  return {
    ok: false,
    error: new AgentRunnerError(
      'No executor available. Either:\n' +
        '  - Install and authenticate Claude CLI\n' +
        '  - Set ANTHROPIC_API_KEY environment variable'
    ),
  };
}

/**
 * Minimal writer interface for runSingleInstance.
 * Both PredictionWriter and LockedWriter satisfy this.
 */
export interface IBenchmarkWriter {
  writeResult(
    result: Parameters<PredictionWriter['writeResult']>[0]
  ): Promise<Result<boolean, import('./prediction-writer.js').PredictionWriteError>>;
}

/** Options for running a single benchmark instance. */
export interface SingleInstanceOptions {
  readonly instance: SWEBenchInstance;
  readonly executor: ExecutorWithModel;
  readonly config: SWEBenchConfig;
  readonly writer: IBenchmarkWriter;
  readonly verbose: boolean;
  readonly systemPrompt?: string;
}

/** Run single instance and handle result. */
export async function runSingleInstance(
  opts: SingleInstanceOptions
): Promise<{ completed: boolean; tokens: number }> {
  const { instance, executor, config, writer, verbose, systemPrompt } = opts;
  const runOpts: RunOptions = {
    executor,
    config,
    ...(verbose && {
      onMessage: (msg: string): void => {
        console.log(`  ${msg}`);
      },
    }),
    ...(systemPrompt !== undefined && { systemPrompt }),
  };

  const result = await runAgentOnInstance(instance, runOpts);

  if (!result.ok) {
    console.log(`  Error: ${result.error.message}`);
    return { completed: false, tokens: 0 };
  }

  const runResult = result.value;
  const tokens = runResult.tokens_used ?? 0;

  if (runResult.completed) {
    const writeResult = await writer.writeResult(runResult);
    if (writeResult.ok && writeResult.value) {
      console.log(`  OK (${String(runResult.duration_ms)}ms, ${String(tokens)} tokens)`);
      return { completed: true, tokens };
    }
    console.log(`  Failed to write prediction`);
  } else {
    console.log(`  Failed: ${runResult.error ?? 'unknown'}`);
  }

  return { completed: false, tokens };
}

/** Memory context for a benchmark session. */
interface MemoryContext {
  readonly memory: SessionMemory;
  readonly learnings: readonly SessionLearning[];
}

/** Initialize memory for cross-run learning (if configured). */
function initMemory(config: SWEBenchConfig): MemoryContext | null {
  if (config.memory_dir === '') return null;

  const memory = createBenchmarkMemory(config.memory_dir);
  const sessionResult = memory.startSession(`swe-bench-${Date.now().toString(36)}`);
  const learnings = sessionResult.ok ? sessionResult.value : [];
  return { memory, learnings };
}

/** Run sequential benchmark loop with memory integration. */
async function runSequential(
  opts: BenchmarkRunOptions & {
    executor: ExecutorWithModel;
    writer: PredictionWriter;
    memCtx: MemoryContext | null;
  }
): Promise<{ completed: number; failed: number; tokensUsed: number }> {
  const { instances, config, verbose, executor, writer, memCtx } = opts;
  let completed = 0;
  let failed = 0;
  let tokensUsed = 0;

  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    if (instance === undefined) continue;

    console.log(`\n[${String(i + 1)}/${String(instances.length)}] ${instance.instance_id}`);

    const systemPrompt =
      memCtx !== null && memCtx.learnings.length > 0
        ? buildEnrichedPrompt(memCtx.learnings, instance)
        : undefined;

    const result = await runSingleInstance({
      instance,
      executor,
      config,
      writer,
      verbose,
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    });
    tokensUsed += result.tokens;
    if (result.completed) completed++;
    else failed++;

    if (memCtx !== null) {
      const runResult: SWEBenchRunResult = {
        instance_id: instance.instance_id,
        completed: result.completed,
        duration_ms: 0,
        tokens_used: result.tokens,
        ...(result.completed ? {} : { error: 'failed' }),
      };
      recordOutcome(memCtx.memory, instance, runResult);
    }
  }

  await writer.close();
  return { completed, failed, tokensUsed };
}

/** Build a failure result. */
function failResult(message: string, total: number, outputPath: string): BenchmarkRunResult {
  return { success: false, message, total, completed: 0, failed: 0, tokensUsed: 0, outputPath };
}

/** Sort instances by difficulty, leveraging memory data when available. */
function sortInstances(
  instances: readonly SWEBenchInstance[],
  memCtx: MemoryContext | null
): SWEBenchInstance[] {
  const pastSuccessRates = memCtx !== null ? extractPastSuccessRates(memCtx.learnings) : undefined;
  const sorted = sortByPriority(instances, {
    ...(pastSuccessRates !== undefined && pastSuccessRates.size > 0 ? { pastSuccessRates } : {}),
  });
  const memNote =
    pastSuccessRates !== undefined && pastSuccessRates.size > 0
      ? ` (${String(pastSuccessRates.size)} with memory data)`
      : '';
  console.log(`Sorted ${String(sorted.length)} instances by estimated difficulty${memNote}`);
  return sorted;
}

/**
 * Run all instances and write predictions.
 */
export async function runBenchmarkInstances(
  executor: ExecutorWithModel,
  options: BenchmarkRunOptions
): Promise<BenchmarkRunResult> {
  const { instances, config, outputPath, append, verbose } = options;

  const writer = new PredictionWriter({
    outputPath,
    modelName: `nexus-agents/${executor.getModelId()}`,
    append,
  });

  const openResult = await writer.open();
  if (!openResult.ok) {
    return failResult(openResult.error.message, instances.length, outputPath);
  }

  const memCtx = initMemory(config);
  const sorted = sortInstances(instances, memCtx);

  let stats: { completed: number; failed: number; tokensUsed: number };

  if (config.concurrency > 1) {
    await writer.close();
    stats = await runBenchmarkParallel({
      executor,
      instances: sorted,
      config,
      outputPath,
      append,
      verbose,
      concurrency: config.concurrency,
      memCtx,
    });
  } else {
    stats = await runSequential({ ...options, instances: sorted, executor, writer, memCtx });
  }

  if (memCtx !== null) {
    memCtx.memory.endSession(
      `SWE-bench run: ${String(stats.completed)}/${String(instances.length)} solved`
    );
  }

  console.log(`\nResults: ${outputPath}`);
  return {
    success: true,
    message: `Completed ${String(stats.completed)}/${String(instances.length)} instances`,
    total: instances.length,
    ...stats,
    outputPath,
  };
}
