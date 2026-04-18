/**
 * Runs a BenchmarkAdapter end-to-end: load → run → evaluate → summarize.
 *
 * Handles concurrency, timeouts, progress, and partial failure so each
 * adapter doesn't reinvent the same harness.
 *
 * @module benchmarks/orchestrator
 */

import type { BenchmarkAdapter, BenchmarkRunContext, BenchmarkRunSummary } from './adapter.js';

export interface OrchestratorOptions {
  /** Max parallel `runInstance` calls. Default 1 (serial). */
  readonly concurrency?: number;
  /** Per-instance timeout in ms. Default 300_000 (5 min). */
  readonly instanceTimeoutMs?: number;
  /** Limit instances evaluated (useful for smoke runs). */
  readonly limit?: number;
  /** Progress callback. */
  readonly onProgress?: BenchmarkRunContext['onProgress'];
  /** Abort the whole run. */
  readonly signal?: AbortSignal;
}

const DEFAULT_INSTANCE_TIMEOUT_MS = 300_000;

interface RunState<TEvalResult> {
  readonly results: TEvalResult[];
  readonly failures: unknown[];
  completed: number;
}

interface RunOneArgs<TInstance, TPrediction, TEvalResult> {
  readonly adapter: BenchmarkAdapter<TInstance, TPrediction, TEvalResult>;
  readonly instance: TInstance;
  readonly ctx: BenchmarkRunContext;
  readonly state: RunState<TEvalResult>;
  readonly idx: number;
  readonly total: number;
  readonly onProgress: OrchestratorOptions['onProgress'];
}

async function runOneInstance<TInstance, TPrediction, TEvalResult>(
  args: RunOneArgs<TInstance, TPrediction, TEvalResult>
): Promise<void> {
  const prediction = await args.adapter.runInstance(args.instance, args.ctx);
  const evalResult = await args.adapter.evaluate(args.instance, prediction);
  args.state.results[args.idx] = evalResult;
  args.state.completed++;
  args.onProgress?.(args.state.completed, args.total);
}

interface WorkerPoolArgs<TInstance, TPrediction, TEvalResult> {
  readonly adapter: BenchmarkAdapter<TInstance, TPrediction, TEvalResult>;
  readonly instances: readonly TInstance[];
  readonly ctx: BenchmarkRunContext;
  readonly state: RunState<TEvalResult>;
  readonly concurrency: number;
  readonly onProgress: OrchestratorOptions['onProgress'];
}

async function runWorkerPool<TInstance, TPrediction, TEvalResult>(
  args: WorkerPoolArgs<TInstance, TPrediction, TEvalResult>
): Promise<void> {
  const { adapter, instances, ctx, state, concurrency, onProgress } = args;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < instances.length) {
      const i = next++;
      const instance = instances[i];
      if (instance === undefined) continue;
      try {
        await runOneInstance({
          adapter,
          instance,
          ctx,
          state,
          idx: i,
          total: instances.length,
          onProgress,
        });
      } catch (e: unknown) {
        state.failures.push(e);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, instances.length) }, () => worker())
  );
}

/**
 * Execute one adapter end-to-end. Returns the adapter-produced summary.
 *
 * Behavioral notes:
 * - An instance failure (either runInstance or evaluate throws) is captured
 *   as a failure count in summary metadata; the run continues.
 * - Timeouts cancel via AbortController; adapters should honor `ctx.signal`.
 */
export async function runBenchmark<TInstance, TPrediction, TEvalResult>(
  adapter: BenchmarkAdapter<TInstance, TPrediction, TEvalResult>,
  config: Record<string, unknown>,
  options: OrchestratorOptions = {}
): Promise<BenchmarkRunSummary> {
  const concurrency = Math.max(1, options.concurrency ?? 1);
  const instanceTimeoutMs = options.instanceTimeoutMs ?? DEFAULT_INSTANCE_TIMEOUT_MS;
  const start = performance.now();

  let instances = await adapter.loadInstances(config);
  if (options.limit !== undefined && options.limit < instances.length) {
    instances = instances.slice(0, options.limit);
  }

  const state: RunState<TEvalResult> = {
    results: new Array(instances.length) as TEvalResult[],
    failures: [],
    completed: 0,
  };
  const ctx: BenchmarkRunContext = {
    timeoutMs: instanceTimeoutMs,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  };

  await runWorkerPool({
    adapter,
    instances,
    ctx,
    state,
    concurrency,
    onProgress: options.onProgress,
  });

  const runTimeMs = Math.round(performance.now() - start);
  const completedResults = state.results.filter((r): r is TEvalResult => r !== undefined);
  const summary = adapter.summarize(completedResults, runTimeMs);

  if (state.failures.length === 0) return summary;
  return {
    ...summary,
    metadata: {
      ...summary.metadata,
      failureCount: state.failures.length,
      sampleFailure:
        state.failures[0] instanceof Error ? state.failures[0].message : String(state.failures[0]),
    },
  };
}
