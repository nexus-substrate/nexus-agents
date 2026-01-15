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

import type { SWEBenchConfig, SWEBenchInstance } from './types.js';
import { runAgentOnInstance, type RunOptions } from './agent-runner.js';
import { PredictionWriter } from './prediction-writer.js';
import { NexusAgentExecutor, createNexusExecutorFromEnv } from './nexus-agent-executor.js';

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

/** Create executor and return early error if unavailable. */
export function createExecutor(verbose: boolean): ReturnType<typeof createNexusExecutorFromEnv> {
  const overrides = verbose
    ? {
        onMessage: (msg: string): void => {
          console.log(`  [agent] ${msg}`);
        },
      }
    : {};
  return createNexusExecutorFromEnv(overrides);
}

/** Run single instance and handle result. */
async function runSingleInstance(
  instance: SWEBenchInstance,
  executor: NexusAgentExecutor,
  config: SWEBenchConfig,
  writer: PredictionWriter,
  verbose: boolean
): Promise<{ completed: boolean; tokens: number }> {
  const runOpts: RunOptions = verbose
    ? {
        executor,
        config,
        onMessage: (msg: string): void => {
          console.log(`  ${msg}`);
        },
      }
    : { executor, config };

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

/**
 * Run all instances and write predictions.
 */
export async function runBenchmarkInstances(
  executor: NexusAgentExecutor,
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
    return {
      success: false,
      message: openResult.error.message,
      total: instances.length,
      completed: 0,
      failed: 0,
      tokensUsed: 0,
      outputPath,
    };
  }

  let completed = 0;
  let failed = 0;
  let tokensUsed = 0;

  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    if (instance === undefined) continue;

    console.log(`\n[${String(i + 1)}/${String(instances.length)}] ${instance.instance_id}`);

    const result = await runSingleInstance(instance, executor, config, writer, verbose);
    tokensUsed += result.tokens;
    if (result.completed) completed++;
    else failed++;
  }

  await writer.close();

  console.log(`\nResults: ${outputPath}`);
  return {
    success: true,
    message: `Completed ${String(completed)}/${String(instances.length)} instances`,
    total: instances.length,
    completed,
    failed,
    tokensUsed,
    outputPath,
  };
}
