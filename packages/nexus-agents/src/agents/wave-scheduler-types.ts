/**
 * nexus-agents/agents - Wave Scheduler Types
 *
 * Type definitions for wave-based parallel execution with
 * concurrency limits, output truncation, and token budget tracking.
 *
 * (Source: Issue #769 - Code-enforced subagent context limits)
 *
 * @module agents/wave-scheduler-types
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the wave scheduler.
 */
export interface WaveSchedulerConfig {
  /** Maximum number of tasks to execute concurrently in one wave. Default: 4. */
  readonly maxConcurrency: number;
  /** Maximum output length (chars) per task result. Default: 2000. */
  readonly maxOutputChars: number;
  /**
   * Maximum total token budget across all waves. 0 = unlimited. Default: 0.
   *
   * Enforced against the SUM OF ESTIMATES described on
   * `WaveTaskResult.estimatedTokens`, which excludes input tokens and counts a
   * failed task as zero. Both errors run in the same direction: the budget
   * believes it has more headroom than it does, so enabling this does not give
   * you a reliable spend cap (#4761).
   */
  readonly maxTotalTokens: number;
  /** Whether to abort remaining waves on first task failure. Default: false. */
  readonly abortOnFailure: boolean;
  /** Timeout per individual task in ms. Default: 60000. */
  readonly taskTimeoutMs: number;
  /** Optional callback invoked after each wave completes. Used for checkpointing. */
  readonly onWaveComplete?: (
    waveIndex: number,
    results: readonly import('./wave-scheduler-types.js').WaveTaskResult[],
    cumulativeTokens: number
  ) => Promise<void>;
}

/**
 * Default wave scheduler configuration.
 * Matches CLAUDE.md guidelines: waves of 3-4, 2000 char output budget.
 */
export const DEFAULT_WAVE_CONFIG: WaveSchedulerConfig = {
  maxConcurrency: 4,
  maxOutputChars: 2000,
  maxTotalTokens: 0,
  abortOnFailure: false,
  taskTimeoutMs: 60_000,
};

// ============================================================================
// Task & Result Types
// ============================================================================

/**
 * A task to be executed in a wave.
 */
export interface WaveTask<T = unknown> {
  /** Unique identifier for this task. */
  readonly id: string;
  /** Human-readable description of what this task does. */
  readonly description: string;
  /** The input data for this task. */
  readonly input: T;
  /** IDs of tasks that must complete before this one can start. */
  readonly dependencies: readonly string[];
}

/**
 * Result of a single task execution.
 */
export interface WaveTaskResult {
  /** Task ID this result belongs to. */
  readonly taskId: string;
  /** Whether the task completed successfully. */
  readonly success: boolean;
  /** The output text (truncated to maxOutputChars). */
  readonly output: string;
  /** Whether the output was truncated. */
  readonly truncated: boolean;
  /** Original output length before truncation. */
  readonly originalLength: number;
  /**
   * Rough token estimate for this task, derived as `outputChars / 4` (#4761).
   *
   * NOT a measurement, and specifically NOT comparable to
   * `ResultMetadata.tokensUsed`:
   * - **Input is not counted.** Prompt and context usually dominate an agent
   *   task's spend, so a large prompt with a terse answer looks nearly free.
   * - **A failed task reports 0**, however long it ran before throwing.
   *
   * Real usage is not available here: `WaveTaskExecutor` returns a bare string,
   * so the scheduler has nothing better to sum. Treat this as a coarse
   * output-size signal, not a spend figure.
   */
  readonly estimatedTokens: number;
  /** Duration of this task in ms. */
  readonly durationMs: number;
  /** Error message if task failed. */
  readonly error?: string;
}

/**
 * Result of executing a single wave.
 */
export interface WaveResult {
  /** The wave index (0-based). */
  readonly waveIndex: number;
  /** Results of all tasks in this wave. */
  readonly results: readonly WaveTaskResult[];
  /** Total estimated tokens consumed by this wave. */
  readonly totalTokens: number;
  /** Total duration of this wave in ms. */
  readonly durationMs: number;
}

/**
 * Final result of the full wave execution.
 */
export interface WaveExecutionResult {
  /** Results organized by wave. */
  readonly waves: readonly WaveResult[];
  /** All task results flat. */
  readonly allResults: readonly WaveTaskResult[];
  /** Total estimated tokens consumed across all waves. */
  readonly totalTokensUsed: number;
  /** Total duration in ms. */
  readonly totalDurationMs: number;
  /** Whether execution was aborted early (budget exceeded or failure). */
  readonly aborted: boolean;
  /** Reason for abort, if aborted. */
  readonly abortReason?: string;
}

// ============================================================================
// Auto-Chunking
// ============================================================================

/**
 * A chunk of work produced by auto-chunking.
 */
export interface WorkChunk {
  /** Unique ID for this chunk. */
  readonly id: string;
  /** Scope description (e.g., directory path). */
  readonly scope: string;
  /** Items in this chunk (e.g., file paths). */
  readonly items: readonly string[];
}

/**
 * Executor function that processes a single WaveTask.
 * Returns the output string (which will be truncated by the scheduler).
 */
export type WaveTaskExecutor<T = unknown> = (task: WaveTask<T>) => Promise<string>;
