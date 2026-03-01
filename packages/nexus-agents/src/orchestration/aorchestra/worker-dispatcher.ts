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

const logger = createLogger({ component: 'worker-dispatcher' });

// ============================================================================
// Types
// ============================================================================

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
}

/**
 * Options for dispatching workers.
 */
export interface WorkerDispatchOptions {
  /** Function that executes a single worker and returns its result */
  readonly executeWorker: (entry: AgentPlanEntry) => Promise<WorkerResult>;
  /** Maximum concurrent workers per wave (default: MAX_WORKERS_PER_WAVE = 3) */
  readonly maxConcurrency?: number;
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

    const tasks = wave.map(
      (entry) => (): Promise<WorkerResult> => executeSafe(entry, options.executeWorker)
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
 * Execute a single worker, catching any thrown errors.
 */
async function executeSafe(
  entry: AgentPlanEntry,
  executeWorker: (entry: AgentPlanEntry) => Promise<WorkerResult>
): Promise<WorkerResult> {
  try {
    return await executeWorker(entry);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Worker threw exception', { role: entry.role, error: message });
    return {
      role: entry.role,
      subTask: entry.subTask,
      output: '',
      status: 'error',
      durationMs: 0,
      error: message,
    };
  }
}
