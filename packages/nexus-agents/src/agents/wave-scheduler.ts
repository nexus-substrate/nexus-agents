/**
 * nexus-agents/agents - Wave Scheduler
 *
 * Manages parallel task execution in bounded waves with concurrency limits,
 * output truncation, and token budget tracking. Prevents agent context
 * exhaustion by enforcing CLAUDE.md subagent management guidelines.
 *
 * (Source: Issue #769 - Code-enforced subagent context limits)
 *
 * @module agents/wave-scheduler
 */

import type { ILogger } from '../core/index.js';
import { getErrorMessage, createLogger, getTimeProvider } from '../core/index.js';

import { truncateWithInfo } from '../utils/text-utils.js';
import type {
  WaveSchedulerConfig,
  WaveTask,
  WaveTaskResult,
  WaveResult,
  WaveExecutionResult,
  WorkChunk,
  WaveTaskExecutor,
} from './wave-scheduler-types.js';
import { DEFAULT_WAVE_CONFIG } from './wave-scheduler-types.js';

// Re-export types for convenience
export type {
  WaveSchedulerConfig,
  WaveTask,
  WaveTaskResult,
  WaveResult,
  WaveExecutionResult,
  WorkChunk,
  WaveTaskExecutor,
} from './wave-scheduler-types.js';
export { DEFAULT_WAVE_CONFIG } from './wave-scheduler-types.js';

// ============================================================================
// Wave Scheduler
// ============================================================================

/**
 * Wave scheduler for bounded parallel task execution.
 *
 * Executes tasks in waves respecting concurrency limits, dependency order,
 * output budgets, and token budgets. Each wave waits for all tasks to
 * complete before the next wave launches.
 *
 * @example
 * ```typescript
 * const scheduler = createWaveScheduler({ maxConcurrency: 3 });
 * const result = await scheduler.execute(tasks, async (task) => {
 *   return await runAgent(task.input);
 * });
 * console.log(`Completed in ${result.waves.length} waves`);
 * ```
 */
export class WaveScheduler {
  private readonly config: WaveSchedulerConfig;
  private readonly logger: ILogger;

  constructor(config: Partial<WaveSchedulerConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_WAVE_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'wave-scheduler' });
  }

  /**
   * Execute tasks in waves respecting dependencies and concurrency limits.
   */
  async execute<T>(
    tasks: readonly WaveTask<T>[],
    executor: WaveTaskExecutor<T>
  ): Promise<WaveExecutionResult> {
    const startTime = getTimeProvider().now();
    const taskWaves = this.buildWaves(tasks);

    this.logger.info('Wave execution starting', {
      totalTasks: tasks.length,
      waveCount: taskWaves.length,
      maxConcurrency: this.config.maxConcurrency,
    });

    const { waves, allResults, totalTokensUsed, aborted, abortReason } = await this.runWaveLoop(
      taskWaves,
      executor
    );

    const totalDurationMs = getTimeProvider().now() - startTime;

    this.logger.info('Wave execution finished', {
      totalWaves: waves.length,
      totalTasks: allResults.length,
      totalTokensUsed,
      totalDurationMs,
      aborted,
    });

    return {
      waves,
      allResults,
      totalTokensUsed,
      totalDurationMs,
      aborted,
      ...(abortReason !== undefined && { abortReason }),
    };
  }

  /**
   * Build waves from tasks respecting dependency ordering.
   *
   * Tasks with no unresolved dependencies go in the earliest possible wave.
   * Within each wave, tasks are further split into sub-waves of maxConcurrency size.
   */
  buildWaves<T>(tasks: readonly WaveTask<T>[]): WaveTask<T>[][] {
    const waves: WaveTask<T>[][] = [];
    const resolved = new Set<string>();
    const remaining = new Set(tasks.map((t) => t.id));

    while (remaining.size > 0) {
      const ready: WaveTask<T>[] = [];

      for (const task of tasks) {
        if (!remaining.has(task.id)) continue;
        const depsResolved = task.dependencies.every((d) => resolved.has(d));
        if (depsResolved) {
          ready.push(task);
        }
      }

      if (ready.length === 0) {
        this.logger.warn('Circular dependency detected, breaking remaining tasks into final wave', {
          remainingTasks: [...remaining],
        });
        // Add remaining tasks as a final wave to prevent infinite loop
        const stuck = tasks.filter((t) => remaining.has(t.id));
        waves.push(...this.splitByMaxConcurrency(stuck));
        break;
      }

      for (const task of ready) {
        remaining.delete(task.id);
        resolved.add(task.id);
      }

      // Split ready tasks into sub-waves of maxConcurrency
      waves.push(...this.splitByMaxConcurrency(ready));
    }

    return waves;
  }

  /**
   * Get the scheduler configuration.
   */
  getConfig(): Readonly<WaveSchedulerConfig> {
    return { ...this.config };
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private async runWaveLoop<T>(
    taskWaves: WaveTask<T>[][],
    executor: WaveTaskExecutor<T>
  ): Promise<{
    waves: WaveResult[];
    allResults: WaveTaskResult[];
    totalTokensUsed: number;
    aborted: boolean;
    abortReason: string | undefined;
  }> {
    const waves: WaveResult[] = [];
    const allResults: WaveTaskResult[] = [];
    let totalTokensUsed = 0;
    let aborted = false;
    let abortReason: string | undefined;

    for (let waveIdx = 0; waveIdx < taskWaves.length; waveIdx++) {
      if (aborted) break;

      if (this.isTokenBudgetExhausted(totalTokensUsed)) {
        aborted = true;
        abortReason = `Token budget exhausted: ${String(totalTokensUsed)}/${String(this.config.maxTotalTokens)}`;
        break;
      }

      const wave = taskWaves[waveIdx];
      if (wave === undefined || wave.length === 0) continue;

      const waveResult = await this.executeWave(wave, waveIdx, executor);
      waves.push(waveResult);
      totalTokensUsed += waveResult.totalTokens;

      const failReason = this.collectResults(waveResult, allResults);
      if (failReason !== undefined) {
        aborted = true;
        abortReason = failReason;
      }

      this.logger.info('Wave completed', {
        waveIndex: waveIdx,
        tasksCompleted: waveResult.results.length,
        waveTokens: waveResult.totalTokens,
        totalTokensUsed,
        durationMs: waveResult.durationMs,
      });

      if (this.config.onWaveComplete !== undefined) {
        try {
          await this.config.onWaveComplete(waveIdx, waveResult.results, totalTokensUsed);
        } catch (err) {
          aborted = true;
          abortReason = err instanceof Error ? err.message : String(err);
        }
      }
    }

    return { waves, allResults, totalTokensUsed, aborted, abortReason };
  }

  private isTokenBudgetExhausted(totalTokensUsed: number): boolean {
    if (this.config.maxTotalTokens <= 0 || totalTokensUsed < this.config.maxTotalTokens) {
      return false;
    }
    this.logger.warn('Wave execution aborted: token budget exhausted', {
      totalTokensUsed,
      maxTotalTokens: this.config.maxTotalTokens,
    });
    return true;
  }

  private collectResults(waveResult: WaveResult, allResults: WaveTaskResult[]): string | undefined {
    for (const result of waveResult.results) {
      allResults.push(result);
      if (!result.success && this.config.abortOnFailure) {
        return `Task ${result.taskId} failed: ${result.error ?? 'unknown'}`;
      }
    }
    return undefined;
  }

  private splitByMaxConcurrency<T>(tasks: WaveTask<T>[]): WaveTask<T>[][] {
    const subWaves: WaveTask<T>[][] = [];
    for (let i = 0; i < tasks.length; i += this.config.maxConcurrency) {
      subWaves.push(tasks.slice(i, i + this.config.maxConcurrency));
    }
    return subWaves;
  }

  private async executeWave<T>(
    tasks: readonly WaveTask<T>[],
    waveIndex: number,
    executor: WaveTaskExecutor<T>
  ): Promise<WaveResult> {
    const waveStart = getTimeProvider().now();

    this.logger.debug('Starting wave', {
      waveIndex,
      taskCount: tasks.length,
      taskIds: tasks.map((t) => t.id),
    });

    const results = await Promise.all(tasks.map((task) => this.executeTask(task, executor)));

    const totalTokens = results.reduce((sum, r) => sum + r.estimatedTokens, 0);
    const durationMs = getTimeProvider().now() - waveStart;

    return { waveIndex, results, totalTokens, durationMs };
  }

  private async executeTask<T>(
    task: WaveTask<T>,
    executor: WaveTaskExecutor<T>
  ): Promise<WaveTaskResult> {
    const taskStart = getTimeProvider().now();

    try {
      const rawOutput = await this.withTimeout(executor(task), this.config.taskTimeoutMs, task.id);

      const originalLength = rawOutput.length;
      const truncated = originalLength > this.config.maxOutputChars;
      const output = truncated
        ? truncateWithInfo(rawOutput, this.config.maxOutputChars)
        : rawOutput;

      // Estimate tokens as ~4 chars per token (rough approximation)
      const estimatedTokens = Math.ceil(originalLength / 4);
      const durationMs = getTimeProvider().now() - taskStart;

      if (truncated) {
        this.logger.debug('Task output truncated', {
          taskId: task.id,
          originalLength,
          truncatedTo: this.config.maxOutputChars,
        });
      }

      return {
        taskId: task.id,
        success: true,
        output,
        truncated,
        originalLength,
        estimatedTokens,
        durationMs,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      const durationMs = getTimeProvider().now() - taskStart;

      this.logger.warn('Task failed', { taskId: task.id, error: message, durationMs });

      return {
        taskId: task.id,
        success: false,
        output: '',
        truncated: false,
        originalLength: 0,
        estimatedTokens: 0,
        durationMs,
        error: message,
      };
    }
  }

  private async withTimeout<R>(promise: Promise<R>, timeoutMs: number, taskId: string): Promise<R> {
    if (timeoutMs <= 0) return promise;

    return new Promise<R>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task ${taskId} timed out after ${String(timeoutMs)}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }
}

// ============================================================================
// Auto-Chunking
// ============================================================================

/**
 * Partition a list of file paths into directory-scoped chunks.
 * Each chunk corresponds to a top-level directory within the base path.
 *
 * @param files - Array of file paths
 * @param basePath - Base path prefix to strip for grouping
 * @returns Array of work chunks grouped by top-level directory
 */
export function chunkByDirectory(files: readonly string[], basePath: string): WorkChunk[] {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const groups = new Map<string, string[]>();

  for (const file of files) {
    const relative = file.startsWith(normalizedBase) ? file.slice(normalizedBase.length) : file;
    // Strip leading slash to get clean directory name
    const stripped = relative.startsWith('/') ? relative.slice(1) : relative;
    const topDir = stripped.split('/')[0] ?? 'root';

    const existing = groups.get(topDir);
    if (existing !== undefined) {
      existing.push(file);
    } else {
      groups.set(topDir, [file]);
    }
  }

  return Array.from(groups.entries()).map(([dir, items]) => ({
    id: `chunk-${dir}`,
    scope: `${normalizedBase}${dir}/`,
    items,
  }));
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new WaveScheduler instance with the given configuration.
 */
export function createWaveScheduler(
  config: Partial<WaveSchedulerConfig> = {},
  logger?: ILogger
): WaveScheduler {
  return new WaveScheduler(config, logger);
}
