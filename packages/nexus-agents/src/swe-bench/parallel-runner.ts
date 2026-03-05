/**
 * nexus-agents/swe-bench - Parallel Benchmark Runner
 *
 * Runs SWE-bench instances concurrently with thread-safe prediction writes
 * and per-slot isolated work directories.
 *
 * @module swe-bench/parallel-runner
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

/* eslint-disable no-console */
// Console output is intentional for CLI user feedback

import type { SWEBenchConfig, SWEBenchInstance, SWEBenchRunResult } from './types.js';
import { PredictionWriter } from './prediction-writer.js';
import type { ExecutorWithModel, IBenchmarkWriter } from './benchmark-runner.js';
import { runSingleInstance } from './benchmark-runner.js';
import { buildEnrichedPrompt, recordOutcome } from './memory-enrichment.js';
import type { SessionMemory } from '../context/session-memory.js';
import type { SessionLearning } from '../context/session-memory-types.js';

/**
 * Thread-safe wrapper around PredictionWriter.
 * Uses a promise chain as a mutex to serialize writes.
 * Implements IBenchmarkWriter for use with runSingleInstance.
 */
export class LockedWriter implements IBenchmarkWriter {
  private readonly writer: PredictionWriter;
  private chain: Promise<void> = Promise.resolve();

  constructor(writer: PredictionWriter) {
    this.writer = writer;
  }

  /** Serialized writeResult — concurrent calls queue behind previous ones. */
  writeResult(
    result: Parameters<PredictionWriter['writeResult']>[0]
  ): ReturnType<PredictionWriter['writeResult']> {
    type WriteReturn = Awaited<ReturnType<PredictionWriter['writeResult']>>;
    let resultCapture: WriteReturn | undefined;
    this.chain = this.chain.then(async () => {
      resultCapture = await this.writer.writeResult(result);
    });
    return this.chain.then(() => {
      if (resultCapture === undefined) {
        return { ok: false as const, error: new Error('Write failed') } as WriteReturn;
      }
      return resultCapture;
    });
  }

  getPredictionCount(): number {
    return this.writer.getPredictionCount();
  }
}

/** Stats accumulated across all workers. */
interface ParallelStats {
  completed: number;
  failed: number;
  tokensUsed: number;
}

/** Memory context for enriching parallel worker prompts. */
interface ParallelMemoryContext {
  readonly memory: SessionMemory;
  readonly learnings: readonly SessionLearning[];
}

/** Options for a single worker loop. */
interface WorkerOptions {
  readonly slot: number;
  readonly queue: SWEBenchInstance[];
  readonly total: number;
  readonly executor: ExecutorWithModel;
  readonly config: SWEBenchConfig;
  readonly lockedWriter: LockedWriter;
  readonly verbose: boolean;
  readonly stats: ParallelStats;
  readonly memCtx: ParallelMemoryContext | null;
}

/** Worker loop — pulls instances from the shared queue and processes them. */
async function workerLoop(opts: WorkerOptions): Promise<void> {
  const { slot, queue, total, executor, config, lockedWriter, verbose, stats, memCtx } = opts;
  const slotWorkDir = `${config.work_dir}/slot-${String(slot)}`;
  const slotConfig: SWEBenchConfig = { ...config, work_dir: slotWorkDir };

  while (queue.length > 0) {
    const instance = queue.shift();
    if (instance === undefined) break;

    const idx = total - queue.length;
    console.log(`[slot-${String(slot)}] [${String(idx)}/${String(total)}] ${instance.instance_id}`);

    const systemPrompt =
      memCtx !== null && memCtx.learnings.length > 0
        ? buildEnrichedPrompt(memCtx.learnings, instance)
        : undefined;

    const result = await runSingleInstance({
      instance,
      executor,
      config: slotConfig,
      writer: lockedWriter,
      verbose,
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    });
    stats.tokensUsed += result.tokens;
    if (result.completed) stats.completed++;
    else stats.failed++;

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
}

/** Options for parallel benchmark execution. */
export interface ParallelRunOptions {
  readonly executor: ExecutorWithModel;
  readonly instances: readonly SWEBenchInstance[];
  readonly config: SWEBenchConfig;
  readonly outputPath: string;
  readonly append: boolean;
  readonly verbose: boolean;
  readonly concurrency: number;
  readonly memCtx?: ParallelMemoryContext | null;
}

/**
 * Runs benchmark instances in parallel with N concurrent workers.
 *
 * Each worker gets an isolated work directory (`slot-0`, `slot-1`, etc.)
 * to prevent repository clone collisions. Prediction writes are serialized
 * via LockedWriter to prevent JSONL interleaving.
 */
export async function runBenchmarkParallel(opts: ParallelRunOptions): Promise<ParallelStats> {
  const { executor, instances, config, outputPath, append, verbose, concurrency, memCtx } = opts;

  const writer = new PredictionWriter({
    outputPath,
    modelName: `nexus-agents/${executor.getModelId()}`,
    append,
  });

  const openResult = await writer.open();
  if (!openResult.ok) {
    throw new Error(`Failed to open output: ${openResult.error.message}`);
  }

  const lockedWriter = new LockedWriter(writer);
  const queue = [...instances];
  const total = queue.length;
  const stats: ParallelStats = { completed: 0, failed: 0, tokensUsed: 0 };

  const effectiveConcurrency = Math.min(concurrency, instances.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < effectiveConcurrency; i++) {
    workers.push(
      workerLoop({
        slot: i,
        queue,
        total,
        executor,
        config,
        lockedWriter,
        verbose,
        stats,
        memCtx: memCtx ?? null,
      })
    );
  }

  await Promise.all(workers);
  await writer.close();

  return stats;
}
