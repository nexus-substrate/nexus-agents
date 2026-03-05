/**
 * nexus-agents/swe-bench - Structured Trace Logger
 *
 * Emits JSONL trace files and status snapshots for SWE-bench runs.
 * All writes are best-effort — errors are caught silently to avoid
 * disrupting the benchmark run.
 *
 * @module swe-bench/trace-logger
 * (Source: Issue #1412 - Structured trace logging)
 */

import { appendFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { getTimeProvider } from '../core/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Event types emitted to the trace file.
 */
export type TraceEventType =
  | 'run_start'
  | 'run_complete'
  | 'instance_start'
  | 'instance_complete'
  | 'iteration_start'
  | 'iteration_complete';

/**
 * A single trace event written as a JSONL line.
 */
export interface TraceEvent {
  readonly type: TraceEventType;
  readonly timestamp: string;
  readonly runId: string;
  readonly instanceId?: string;
  readonly iteration?: number;
  readonly data?: Record<string, unknown>;
}

/**
 * Live status snapshot written as JSON.
 */
export interface RunStatus {
  readonly runId: string;
  readonly startedAt: string;
  readonly currentInstance: string;
  readonly currentIteration: number;
  readonly totalInstances: number;
  readonly completedInstances: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly elapsedMs: number;
  readonly totalTokens: number;
}

/**
 * Constructor options for TraceLogger.
 */
export interface TraceLoggerOptions {
  readonly outputPath: string;
  readonly runId: string;
  readonly totalInstances: number;
}

// ============================================================================
// Path derivation helpers
// ============================================================================

/** Derive trace file path from output path. */
function deriveTracePath(outputPath: string): string {
  const ext = path.extname(outputPath);
  const base = outputPath.slice(0, outputPath.length - ext.length);
  return `${base}-trace.jsonl`;
}

/** Derive status file path from output path. */
function deriveStatusPath(outputPath: string): string {
  const ext = path.extname(outputPath);
  const base = outputPath.slice(0, outputPath.length - ext.length);
  return `${base}-status.json`;
}

// ============================================================================
// TraceLogger
// ============================================================================

/**
 * Structured trace logger for SWE-bench runs.
 *
 * Writes JSONL trace events and a live JSON status snapshot.
 * All I/O is best-effort — failures are silently caught.
 */
export class TraceLogger {
  private readonly tracePath: string;
  private readonly statusPath: string;
  private readonly runId: string;
  private readonly totalInstances: number;
  private readonly startedAt: string;
  private readonly startTime: number;

  private currentInstance = '';
  private currentIteration = 0;
  private completedInstances = 0;
  private successCount = 0;
  private failureCount = 0;
  private totalTokens = 0;

  constructor(options: TraceLoggerOptions) {
    this.tracePath = deriveTracePath(options.outputPath);
    this.statusPath = deriveStatusPath(options.outputPath);
    this.runId = options.runId;
    this.totalInstances = options.totalInstances;
    const tp = getTimeProvider();
    this.startedAt = tp.nowIso();
    this.startTime = tp.now();
  }

  /** Get the derived trace file path. */
  getTracePath(): string {
    return this.tracePath;
  }

  /** Get the derived status file path. */
  getStatusPath(): string {
    return this.statusPath;
  }

  /** Emit a trace event to the JSONL file (best-effort). */
  async emit(type: TraceEventType, data?: Record<string, unknown>): Promise<void> {
    const event: TraceEvent = {
      type,
      timestamp: getTimeProvider().nowIso(),
      runId: this.runId,
      ...(this.currentInstance !== '' ? { instanceId: this.currentInstance } : {}),
      ...(this.currentIteration > 0 ? { iteration: this.currentIteration } : {}),
      ...(data !== undefined ? { data } : {}),
    };

    try {
      await appendFile(this.tracePath, JSON.stringify(event) + '\n');
    } catch {
      // Best-effort — do not disrupt the run
    }
  }

  /** Record the start of an instance. */
  async instanceStart(instanceId: string): Promise<void> {
    this.currentInstance = instanceId;
    this.currentIteration = 0;
    await this.emit('instance_start');
    await this.updateStatus();
  }

  /** Record the start of an iteration. */
  async iterationStart(iteration: number): Promise<void> {
    this.currentIteration = iteration;
    await this.emit('iteration_start');
    await this.updateStatus();
  }

  /** Record the completion of an iteration. */
  async iterationComplete(
    durationMs: number,
    tokensUsed: number,
    patchFound: boolean
  ): Promise<void> {
    this.totalTokens += tokensUsed;
    await this.emit('iteration_complete', {
      durationMs,
      tokensUsed,
      patchFound,
    });
    await this.updateStatus();
  }

  /** Record the completion of an instance. */
  async instanceComplete(
    success: boolean,
    totalIterations: number,
    durationMs: number
  ): Promise<void> {
    this.completedInstances++;
    if (success) {
      this.successCount++;
    } else {
      this.failureCount++;
    }
    await this.emit('instance_complete', {
      success,
      totalIterations,
      durationMs,
    });
    await this.updateStatus();
  }

  /** Record the start of a benchmark run. */
  async runStart(config: Record<string, unknown>): Promise<void> {
    await this.emit('run_start', config);
    await this.updateStatus();
  }

  /** Record the completion of a benchmark run. */
  async runComplete(): Promise<void> {
    await this.emit('run_complete', {
      completedInstances: this.completedInstances,
      successCount: this.successCount,
      failureCount: this.failureCount,
      totalTokens: this.totalTokens,
    });
    await this.updateStatus();
  }

  /** Write current status snapshot (best-effort). */
  private async updateStatus(): Promise<void> {
    const tp = getTimeProvider();
    const status: RunStatus = {
      runId: this.runId,
      startedAt: this.startedAt,
      currentInstance: this.currentInstance,
      currentIteration: this.currentIteration,
      totalInstances: this.totalInstances,
      completedInstances: this.completedInstances,
      successCount: this.successCount,
      failureCount: this.failureCount,
      elapsedMs: tp.now() - this.startTime,
      totalTokens: this.totalTokens,
    };

    try {
      await writeFile(this.statusPath, JSON.stringify(status, null, 2));
    } catch {
      // Best-effort — do not disrupt the run
    }
  }
}
