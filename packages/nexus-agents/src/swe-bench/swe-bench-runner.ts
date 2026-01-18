/**
 * nexus-agents/swe-bench - SWE-Bench Runner
 *
 * Main runner class for executing SWE-bench evaluations.
 * Coordinates dataset loading, agent execution, and result collection.
 *
 * @module swe-bench/swe-bench-runner
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { Result } from '../core/result.js';
import type {
  SWEBenchVariant,
  SWEBenchInstance,
  SWEBenchRunResult,
  SWEBenchConfig,
  SWEBenchSummary,
  SWEBenchCheckpoint,
} from './types.js';
import { DEFAULT_SWE_BENCH_CONFIG } from './types.js';
import type { DatasetLoadOptions } from './dataset-loader.js';
import { loadDataset } from './dataset-loader.js';
import type { IAgentExecutor, RunOptions } from './agent-runner.js';
import { runAgentOnInstance } from './agent-runner.js';
import { PredictionWriter } from './prediction-writer.js';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for runner failures.
 */
export type RunnerErrorCode =
  | 'DATASET_LOAD_FAILED'
  | 'EXECUTOR_NOT_SET'
  | 'RUN_ABORTED'
  | 'CHECKPOINT_ERROR'
  | 'IO_ERROR'
  | 'UNKNOWN';

/**
 * Error for runner operations.
 */
export class SWEBenchRunnerError extends Error {
  override readonly cause?: unknown;
  readonly code: RunnerErrorCode;

  constructor(message: string, code: RunnerErrorCode, cause?: unknown) {
    super(message);
    this.name = 'SWEBenchRunnerError';
    this.code = code;
    this.cause = cause;
  }
}

// ============================================================================
// Progress Tracking
// ============================================================================

/**
 * Progress information during a run.
 */
export interface RunProgress {
  /** Current instance index (0-based). */
  readonly currentIndex: number;
  /** Total instances to process. */
  readonly totalInstances: number;
  /** Current instance ID. */
  readonly currentInstanceId: string;
  /** Number of completed instances. */
  readonly completed: number;
  /** Number of failed instances. */
  readonly failed: number;
  /** Total tokens used so far. */
  readonly tokensUsed: number;
  /** Elapsed time in milliseconds. */
  readonly elapsedMs: number;
  /** Estimated remaining time in milliseconds. */
  readonly estimatedRemainingMs: number;
  /** Current resolution rate. */
  readonly resolutionRate: number;
}

/**
 * Progress callback type.
 */
export type ProgressCallback = (progress: RunProgress) => void;

// ============================================================================
// Runner Configuration
// ============================================================================

/**
 * Configuration for the runner.
 */
export interface RunnerConfig {
  /** SWE-bench configuration. */
  readonly benchConfig: SWEBenchConfig;
  /** Dataset load options. */
  readonly loadOptions?: DatasetLoadOptions;
  /** Model name for predictions. */
  readonly modelName: string;
  /** Whether to resume from checkpoint. */
  readonly resume: boolean;
  /** Checkpoint file path (if resuming). */
  readonly checkpointPath?: string;
  /** Progress callback. */
  readonly onProgress?: ProgressCallback;
  /** Message callback. */
  readonly onMessage?: (message: string) => void;
  /** Abort signal. */
  readonly signal?: AbortSignal;
}

/**
 * Default runner configuration values.
 */
const DEFAULT_RUNNER_CONFIG: Partial<RunnerConfig> = {
  resume: false,
  modelName: 'nexus-agents',
};

// ============================================================================
// Run State
// ============================================================================

/**
 * Internal state during a run.
 */
interface RunState {
  startTime: number;
  completed: number;
  failed: number;
  tokensUsed: number;
  completedIds: Set<string>;
  results: SWEBenchRunResult[];
}

/**
 * Creates initial run state.
 */
function createInitialState(): RunState {
  return {
    startTime: Date.now(),
    completed: 0,
    failed: 0,
    tokensUsed: 0,
    completedIds: new Set(),
    results: [],
  };
}

// ============================================================================
// Progress Calculation
// ============================================================================

/**
 * Calculates estimated remaining time.
 */
function calculateEstimatedRemaining(state: RunState, remaining: number): number {
  const elapsed = Date.now() - state.startTime;
  const processed = state.completed + state.failed;
  if (processed === 0) return 0;
  const avgTimePerInstance = elapsed / processed;
  return Math.round(avgTimePerInstance * remaining);
}

/**
 * Creates progress object.
 */
function createProgress(
  index: number,
  total: number,
  instanceId: string,
  state: RunState
): RunProgress {
  const elapsed = Date.now() - state.startTime;
  const processed = state.completed + state.failed;
  const remaining = total - processed;
  return {
    currentIndex: index,
    totalInstances: total,
    currentInstanceId: instanceId,
    completed: state.completed,
    failed: state.failed,
    tokensUsed: state.tokensUsed,
    elapsedMs: elapsed,
    estimatedRemainingMs: calculateEstimatedRemaining(state, remaining),
    resolutionRate: processed > 0 ? state.completed / processed : 0,
  };
}

// ============================================================================
// Configuration Builder
// ============================================================================

/**
 * Builds optional config properties only if defined.
 */
function buildOptionalConfigProps(config: Partial<RunnerConfig>): Partial<{
  loadOptions: DatasetLoadOptions;
  checkpointPath: string;
  onProgress: ProgressCallback;
  onMessage: (message: string) => void;
  signal: AbortSignal;
}> {
  return {
    ...(config.loadOptions !== undefined && { loadOptions: config.loadOptions }),
    ...(config.checkpointPath !== undefined && { checkpointPath: config.checkpointPath }),
    ...(config.onProgress !== undefined && { onProgress: config.onProgress }),
    ...(config.onMessage !== undefined && { onMessage: config.onMessage }),
    ...(config.signal !== undefined && { signal: config.signal }),
  };
}

/**
 * Builds full runner config from partial input.
 */
function buildRunnerConfig(config: Partial<RunnerConfig>): RunnerConfig {
  const baseConfig = {
    benchConfig: config.benchConfig ?? DEFAULT_SWE_BENCH_CONFIG,
    modelName: config.modelName ?? DEFAULT_RUNNER_CONFIG.modelName ?? 'nexus-agents',
    resume: config.resume ?? DEFAULT_RUNNER_CONFIG.resume ?? false,
  };
  return { ...baseConfig, ...buildOptionalConfigProps(config) };
}

// ============================================================================
// SWEBenchRunner Class
// ============================================================================

/**
 * Main runner for SWE-bench evaluations.
 */
export class SWEBenchRunner {
  private executor: IAgentExecutor | null = null;
  private readonly config: RunnerConfig;

  constructor(config: Partial<RunnerConfig> = {}) {
    this.config = buildRunnerConfig(config);
  }

  /**
   * Sets the agent executor to use.
   */
  setExecutor(executor: IAgentExecutor): void {
    this.executor = executor;
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): RunnerConfig {
    return this.config;
  }

  /**
   * Loads instances from the dataset.
   */
  async loadInstances(
    variant?: SWEBenchVariant
  ): Promise<Result<readonly SWEBenchInstance[], SWEBenchRunnerError>> {
    const targetVariant = variant ?? this.config.benchConfig.variant;
    this.config.onMessage?.(`Loading dataset: ${targetVariant}`);

    const result = await loadDataset(targetVariant, this.config.loadOptions);
    if (!result.ok) {
      return {
        ok: false,
        error: new SWEBenchRunnerError(
          `Failed to load dataset: ${result.error.message}`,
          'DATASET_LOAD_FAILED',
          result.error
        ),
      };
    }

    this.config.onMessage?.(`Loaded ${String(result.value.count)} instances`);
    return { ok: true, value: result.value.instances };
  }

  /**
   * Loads checkpoint if resuming.
   */
  async loadCheckpoint(): Promise<Result<SWEBenchCheckpoint | null, SWEBenchRunnerError>> {
    if (!this.config.resume || this.config.checkpointPath === undefined) {
      return { ok: true, value: null };
    }

    try {
      const fs = await import('node:fs/promises');
      const content = await fs.readFile(this.config.checkpointPath, 'utf-8');
      const checkpoint = JSON.parse(content) as SWEBenchCheckpoint;
      this.config.onMessage?.(
        `Resuming from checkpoint: ${String(checkpoint.completed_instances.length)} completed`
      );
      return { ok: true, value: checkpoint };
    } catch (err) {
      // File doesn't exist is not an error when resuming
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        return { ok: true, value: null };
      }
      return {
        ok: false,
        error: new SWEBenchRunnerError('Failed to load checkpoint', 'CHECKPOINT_ERROR', err),
      };
    }
  }

  /**
   * Saves checkpoint.
   */
  async saveCheckpoint(
    completedIds: readonly string[]
  ): Promise<Result<void, SWEBenchRunnerError>> {
    if (this.config.checkpointPath === undefined) {
      return { ok: true, value: undefined };
    }

    const checkpoint: SWEBenchCheckpoint = {
      config: this.config.benchConfig,
      completed_instances: completedIds,
      last_updated: new Date().toISOString(),
    };

    try {
      const fs = await import('node:fs/promises');
      await fs.writeFile(this.config.checkpointPath, JSON.stringify(checkpoint, null, 2));
      return { ok: true, value: undefined };
    } catch (err) {
      return {
        ok: false,
        error: new SWEBenchRunnerError('Failed to save checkpoint', 'CHECKPOINT_ERROR', err),
      };
    }
  }

  /**
   * Runs on a single instance.
   */
  private async runInstance(
    instance: SWEBenchInstance,
    state: RunState
  ): Promise<SWEBenchRunResult> {
    if (this.executor === null) {
      return {
        instance_id: instance.instance_id,
        completed: false,
        error: 'Executor not set',
        duration_ms: 0,
      };
    }

    // Build runOptions, only including optional properties if defined
    const runOptions: RunOptions = {
      executor: this.executor,
      config: this.config.benchConfig,
      ...(this.config.onMessage !== undefined && { onMessage: this.config.onMessage }),
      ...(this.config.signal !== undefined && { signal: this.config.signal }),
    };

    const result = await runAgentOnInstance(instance, runOptions);

    if (!result.ok) {
      return {
        instance_id: instance.instance_id,
        completed: false,
        error: result.error.message,
        duration_ms: 0,
      };
    }

    // Update state
    if (result.value.completed) {
      state.completed++;
      state.tokensUsed += result.value.tokens_used ?? 0;
    } else {
      state.failed++;
    }

    return result.value;
  }

  /**
   * Resolves instances to process - loads from dataset if not provided.
   */
  private async resolveInstances(
    instances: readonly SWEBenchInstance[] | undefined
  ): Promise<Result<readonly SWEBenchInstance[], SWEBenchRunnerError>> {
    if (instances !== undefined) {
      return { ok: true, value: instances };
    }
    return this.loadInstances();
  }

  /**
   * Prepares run state with checkpoint data.
   */
  private async prepareRunState(
    targetInstances: readonly SWEBenchInstance[]
  ): Promise<Result<{ state: RunState; pending: SWEBenchInstance[] }, SWEBenchRunnerError>> {
    const checkpointResult = await this.loadCheckpoint();
    if (!checkpointResult.ok) {
      return { ok: false, error: checkpointResult.error };
    }

    const state = createInitialState();
    if (checkpointResult.value !== null) {
      state.completedIds = new Set(checkpointResult.value.completed_instances);
    }

    const pending = targetInstances.filter((i) => !state.completedIds.has(i.instance_id));
    return { ok: true, value: { state, pending } };
  }

  /**
   * Processes a single instance in the run loop.
   */
  private async processInstance(
    instance: SWEBenchInstance,
    index: number,
    total: number,
    state: RunState
  ): Promise<void> {
    this.config.onProgress?.(createProgress(index, total, instance.instance_id, state));

    const result = await this.runInstance(instance, state);
    state.results.push(result);
    state.completedIds.add(instance.instance_id);

    await this.saveCheckpoint([...state.completedIds]);
  }

  /**
   * Executes the benchmark run.
   */
  async run(
    instances?: readonly SWEBenchInstance[]
  ): Promise<Result<SWEBenchRunResult[], SWEBenchRunnerError>> {
    if (this.executor === null) {
      return {
        ok: false,
        error: new SWEBenchRunnerError(
          'Executor not set. Call setExecutor() first.',
          'EXECUTOR_NOT_SET'
        ),
      };
    }

    const instancesResult = await this.resolveInstances(instances);
    if (!instancesResult.ok) return instancesResult;

    const prepResult = await this.prepareRunState(instancesResult.value);
    if (!prepResult.ok) return prepResult;

    const { state, pending } = prepResult.value;
    this.config.onMessage?.(`Processing ${String(pending.length)} instances`);

    for (let i = 0; i < pending.length; i++) {
      if (this.config.signal?.aborted === true) {
        this.config.onMessage?.('Run aborted');
        break;
      }

      const instance = pending[i];
      if (instance === undefined) continue;

      await this.processInstance(instance, i, pending.length, state);
    }

    return { ok: true, value: state.results };
  }

  /**
   * Runs and writes predictions to a file.
   */
  async runAndWrite(
    instances?: readonly SWEBenchInstance[]
  ): Promise<Result<SWEBenchSummary, SWEBenchRunnerError>> {
    const runResult = await this.run(instances);
    if (!runResult.ok) return runResult;

    const results = runResult.value;
    const outputPath = this.config.benchConfig.output_path;

    // Write predictions
    const writer = new PredictionWriter({
      outputPath,
      modelName: this.config.modelName,
      append: this.config.resume,
    });

    const openResult = await writer.open();
    if (!openResult.ok) {
      return {
        ok: false,
        error: new SWEBenchRunnerError(
          `Failed to open output file: ${openResult.error.message}`,
          'IO_ERROR',
          openResult.error
        ),
      };
    }

    for (const result of results) {
      if (result.completed && result.prediction !== undefined) {
        await writer.writeResult(result);
      }
    }

    await writer.close();

    // Calculate summary
    const summary = this.calculateSummary(results);
    return { ok: true, value: summary };
  }

  /**
   * Calculates summary statistics from results.
   */
  calculateSummary(results: readonly SWEBenchRunResult[]): SWEBenchSummary {
    const completed = results.filter((r) => r.completed);
    const totalTokens = results.reduce((sum, r) => sum + (r.tokens_used ?? 0), 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration_ms, 0);

    return {
      variant: this.config.benchConfig.variant,
      total_instances: results.length,
      attempted: results.length,
      completed: completed.length,
      resolved: completed.length, // Will be updated after evaluation
      resolution_rate: results.length > 0 ? completed.length / results.length : 0,
      total_tokens: totalTokens,
      avg_tokens_per_instance: results.length > 0 ? totalTokens / results.length : 0,
      total_duration_ms: totalDuration,
      avg_duration_ms: results.length > 0 ? totalDuration / results.length : 0,
      model: this.config.modelName,
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a runner with the given configuration.
 */
export function createRunner(config: Partial<RunnerConfig> = {}): SWEBenchRunner {
  return new SWEBenchRunner(config);
}

/**
 * Creates a runner for a specific variant.
 */
export function createVariantRunner(
  variant: SWEBenchVariant,
  options: Partial<Omit<RunnerConfig, 'benchConfig'>> = {}
): SWEBenchRunner {
  const benchConfig: SWEBenchConfig = {
    ...DEFAULT_SWE_BENCH_CONFIG,
    variant,
  };
  return new SWEBenchRunner({ ...options, benchConfig });
}

/**
 * Quick run for testing with limited instances.
 */
export async function quickRun(
  executor: IAgentExecutor,
  variant: SWEBenchVariant = 'lite',
  limit: number = 5
): Promise<Result<SWEBenchSummary, SWEBenchRunnerError>> {
  const runner = createVariantRunner(variant, {
    loadOptions: { limit },
  });
  runner.setExecutor(executor);
  return runner.runAndWrite();
}
