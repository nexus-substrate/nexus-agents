/**
 * Worker Dispatcher — Wave-based parallel expert execution.
 *
 * Groups AgentPlanEntry items by wave number and executes each wave
 * in parallel with bounded concurrency. Workers receive composed
 * prompts via PromptComposer and return structured results.
 *
 * @module orchestration/aorchestra/worker-dispatcher
 * (Source: Issue #1301, Epic #1299, arXiv:2602.20478)
 */

import type { AgentPlanEntry } from './agent-planner.js';
import { MAX_WORKERS_PER_WAVE } from './agent-planner.js';
import { createLogger } from '../../core/index.js';
import { resolveWorkerTimeout, WORKER_TIMEOUTS } from '../../config/timeouts.js';

const logger = createLogger({ component: 'worker-dispatcher' });

/**
 * Default per-worker timeout. Delegates to centralized config/timeouts.ts.
 * Supports NEXUS_WORKER_TIMEOUT_MS env override.
 */
export const WORKER_TIMEOUT_MS = WORKER_TIMEOUTS.defaultMs;

// ============================================================================
// Types
// ============================================================================

/**
 * Discriminated error type for worker failures.
 * - `timeout`: Worker exceeded the configured timeout (Promise.race)
 * - `model_error`: Model adapter returned an error
 * - `logic_error`: Unexpected exception in worker logic
 */
export type WorkerErrorType = 'timeout' | 'model_error' | 'logic_error';

/**
 * Result from a single worker execution.
 */
export interface WorkerResult {
  readonly role: string;
  readonly subTask: string;
  readonly output: string;
  readonly status: 'success' | 'error';
  readonly durationMs: number;
  readonly error?: string;
  /** Discriminated error type — set only when status is 'error'. */
  readonly errorType?: WorkerErrorType;
}

/**
 * Options for dispatching workers.
 */
export interface WorkerDispatchOptions {
  /**
   * Function that executes a single worker and returns its result.
   * Receives optional prior wave results for cross-wave context (Issue #1308).
   */
  readonly executeWorker: (
    entry: AgentPlanEntry,
    priorWaveResults?: readonly WorkerResult[]
  ) => Promise<WorkerResult>;
  /** Maximum concurrent workers per wave (default: MAX_WORKERS_PER_WAVE = 3) */
  readonly maxConcurrency?: number;
  /** Per-worker timeout in milliseconds (default: WORKER_TIMEOUT_MS = 60s) */
  readonly workerTimeoutMs?: number;
}

// ============================================================================
// Wave Grouping
// ============================================================================

/**
 * Groups plan entries by their wave number, sorted ascending.
 *
 * @param entries - Flat list of plan entries with wave assignments
 * @returns Array of waves, each containing entries for that wave
 */
export function groupByWave(entries: readonly AgentPlanEntry[]): AgentPlanEntry[][] {
  if (entries.length === 0) return [];

  const waveMap = new Map<number, AgentPlanEntry[]>();
  for (const entry of entries) {
    const existing = waveMap.get(entry.wave);
    if (existing !== undefined) {
      existing.push(entry);
    } else {
      waveMap.set(entry.wave, [entry]);
    }
  }

  return Array.from(waveMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, group]) => group);
}

// ============================================================================
// Concurrency-Limited Execution
// ============================================================================

/**
 * Execute an array of async tasks with bounded concurrency.
 */
async function executeWithConcurrencyLimit<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex++;
      const task = tasks[currentIndex];
      if (task !== undefined) {
        results[currentIndex] = await task();
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

// ============================================================================
// Dispatch
// ============================================================================

/**
 * Dispatch workers in waves with bounded concurrency.
 *
 * Executes plan entries grouped by wave number. Within each wave,
 * workers run in parallel up to maxConcurrency. Waves execute
 * sequentially — wave N+1 starts only after wave N completes.
 *
 * @param entries - Plan entries to execute
 * @param options - Dispatch configuration including executeWorker callback
 * @returns Aggregated results from all workers, ordered by wave then entry
 */
export async function dispatchWorkers(
  entries: readonly AgentPlanEntry[],
  options: WorkerDispatchOptions
): Promise<WorkerResult[]> {
  if (entries.length === 0) return [];

  const maxConcurrency = options.maxConcurrency ?? MAX_WORKERS_PER_WAVE;
  const waves = groupByWave(entries);
  const allResults: WorkerResult[] = [];

  for (const [waveIdx, wave] of waves.entries()) {
    logger.info('Dispatching wave', {
      wave: waveIdx + 1,
      totalWaves: waves.length,
      workers: wave.length,
      roles: wave.map((e) => e.role),
    });

    // Pass accumulated prior-wave results to workers (Issue #1308)
    const priorResults: readonly WorkerResult[] | undefined =
      allResults.length > 0 ? [...allResults] : undefined;

    const timeoutMs = options.workerTimeoutMs ?? resolveWorkerTimeout();
    const tasks = wave.map(
      (entry) => (): Promise<WorkerResult> =>
        executeSafe(entry, options.executeWorker, priorResults, timeoutMs)
    );

    const waveResults = await executeWithConcurrencyLimit(tasks, maxConcurrency);
    allResults.push(...waveResults);

    logger.info('Wave complete', {
      wave: waveIdx + 1,
      successes: waveResults.filter((r) => r.status === 'success').length,
      errors: waveResults.filter((r) => r.status === 'error').length,
    });
  }

  return allResults;
}

/**
 * Classify an error into a discriminated error type.
 *
 * - `timeout`: Error message contains "timeout" (from Promise.race timeout)
 * - `model_error`: Error message contains "model" (adapter/model failures)
 * - `logic_error`: Everything else (unexpected exceptions)
 */
function classifyError(message: string, _durationMs: number, _timeoutMs: number): WorkerErrorType {
  const lower = message.toLowerCase();
  if (lower.includes('timeout')) return 'timeout';
  if (lower.includes('model')) return 'model_error';
  return 'logic_error';
}

/**
 * Execute a single worker with timeout and duration tracking.
 */
async function executeSafe(
  entry: AgentPlanEntry,
  executeWorker: (
    entry: AgentPlanEntry,
    priorWaveResults?: readonly WorkerResult[]
  ) => Promise<WorkerResult>,
  priorWaveResults: readonly WorkerResult[] | undefined,
  timeoutMs: number
): Promise<WorkerResult> {
  const startMs = Date.now();
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Worker timeout after ${String(timeoutMs)}ms`));
      }, timeoutMs);
    });
    return await Promise.race([executeWorker(entry, priorWaveResults), timeoutPromise]);
  } catch (error: unknown) {
    const durationMs = Date.now() - startMs;
    const message = error instanceof Error ? error.message : String(error);
    const errorType = classifyError(message, durationMs, timeoutMs);
    logger.warn('Worker failed', { role: entry.role, error: message, errorType, durationMs });
    return {
      role: entry.role,
      subTask: entry.subTask,
      output: '',
      status: 'error',
      durationMs,
      error: message,
      errorType,
    };
  }
}
