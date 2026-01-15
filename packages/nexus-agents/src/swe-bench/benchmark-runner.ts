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
import type { SWEBenchConfig, SWEBenchInstance } from './types.js';
import { runAgentOnInstance, type RunOptions, type IAgentExecutor } from './agent-runner.js';
import { AgentRunnerError } from './agent-runner.js';
import { PredictionWriter } from './prediction-writer.js';
import { createNexusExecutorFromEnv } from './nexus-agent-executor.js';
import { createCliExecutor } from './cli-agent-executor.js';

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
 *
 * Order of preference:
 * 1. Claude CLI (uses OAuth, no API key needed)
 * 2. API with ANTHROPIC_API_KEY environment variable
 */
export async function createExecutor(
  verbose: boolean
): Promise<Result<ExecutorWithModel, AgentRunnerError>> {
  const onMessage = verbose
    ? (msg: string): void => {
        console.log(`  [agent] ${msg}`);
      }
    : undefined;

  // Try CLI first (preferred - uses OAuth)
  console.log('Checking CLI availability...');
  const cliResult = await createCliExecutor({ onMessage });
  if (cliResult.ok) {
    console.log('Using Claude CLI (OAuth authentication)');
    return cliResult;
  }

  // Fall back to API
  console.log('CLI not available, checking API key...');
  const apiResult = createNexusExecutorFromEnv({ onMessage });
  if (apiResult.ok) {
    console.log('Using Anthropic API');
    return apiResult;
  }

  // Neither available
  return {
    ok: false,
    error: new AgentRunnerError(
      'No executor available. Either:\n' +
        '  - Install and authenticate Claude CLI: "npm install -g @anthropic-ai/claude && claude auth"\n' +
        '  - Set ANTHROPIC_API_KEY environment variable'
    ),
  };
}

/** Run single instance and handle result. */
async function runSingleInstance(
  instance: SWEBenchInstance,
  executor: ExecutorWithModel,
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
