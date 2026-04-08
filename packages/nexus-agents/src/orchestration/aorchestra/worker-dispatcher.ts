/* eslint-disable max-lines -- Cohesive module: wave dispatch + failure tracking + triage retry. 400-600 OK per governance. */
/**
 * Worker Dispatcher — Wave-based parallel expert execution.
 *
 * Groups AgentPlanEntry items by wave number and executes each wave
 * in parallel with bounded concurrency. Workers receive composed
 * prompts via PromptComposer and return structured results.
 * Includes graduated degradation recovery (Issue #1458).
 *
 * @module orchestration/aorchestra/worker-dispatcher
 * (Source: Issue #1301, Epic #1299, arXiv:2602.20478)
 */

import type { AgentPlanEntry } from './agent-planner.js';
import { MAX_WORKERS_PER_WAVE } from './agent-planner.js';
import { createLogger, getErrorMessage } from '../../core/index.js';
import { getExpertTaskTimeout, WORKER_TIMEOUTS } from '../../config/timeouts.js';
import { isRateLimitError } from '../../cli/voter-execution.js';
import type { IEventBus } from '../../pipeline/event-types.js';
import { withWatchdog } from './watchdog.js';
import { applyQualityGate, type QualityGateFn, type AsyncQualityGateFn } from './quality-gate.js';
import { triageWorkerFailure, type TriageAction } from './worker-triage.js';

const logger = createLogger({ component: 'worker-dispatcher' });

/** Minimum allowed worker timeout — delegates to centralized config (#1490). */
export const MIN_WORKER_TIMEOUT_MS = WORKER_TIMEOUTS.minMs;

/** Maximum allowed worker timeout — delegates to centralized config (#1490). */
export const MAX_WORKER_TIMEOUT_MS = WORKER_TIMEOUTS.maxMs;

/**
 * Default per-worker timeout. Delegates to centralized config/timeouts.ts.
 * Clamped to [MIN_WORKER_TIMEOUT_MS, MAX_WORKER_TIMEOUT_MS] bounds (Issue #1465).
 * Supports NEXUS_WORKER_TIMEOUT_MS env override.
 */
export const WORKER_TIMEOUT_MS = Math.max(
  MIN_WORKER_TIMEOUT_MS,
  Math.min(MAX_WORKER_TIMEOUT_MS, WORKER_TIMEOUTS.defaultMs)
);

/** Delay before next wave when rate-limit errors are detected (Issue #1328). */
export const RATE_LIMIT_WAVE_DELAY_MS = 5_000;

/** Default stagger delay between spawns within a wave (#1501, Overstory pattern).
 * Prevents burst API rate-limit errors when launching multiple workers. */
export const DEFAULT_STAGGER_DELAY_MS = 500;

/**
 * Number of consecutive failures before a role is auto-disabled (Issue #1425).
 * Prevents repeated token burn from persistently failing roles.
 */
export const CONSECUTIVE_FAILURE_THRESHOLD = 3;

/** Initial cooldown before a disabled role can attempt recovery (Issue #1458). */
export const RECOVERY_COOLDOWN_MS = 30_000;

/** Maximum cooldown after exponential backoff (5 minutes, Issue #1458). */
export const MAX_COOLDOWN_MS = 300_000;

/** Minimum spacing between requests to rate-limited roles (Issue #1458). */
export const RATE_LIMIT_SPACING_MS = 2_000;

// ============================================================================
// Types
// ============================================================================

/**
 * Discriminated error type for worker failures.
 * - `timeout`: Worker exceeded the configured timeout (Promise.race)
 * - `model_error`: Model adapter returned an error
 * - `logic_error`: Unexpected exception in worker logic
 */
export type WorkerErrorType = 'timeout' | 'model_error' | 'logic_error' | 'rate_limit';

/**
 * Result from a single worker execution.
 */
export interface WorkerResult {
  readonly role: string;
  readonly subTask: string;
  readonly output: string;
  readonly status: 'success' | 'error' | 'skipped';
  readonly durationMs: number;
  readonly error?: string;
  /** Discriminated error type — set only when status is 'error'. */
  readonly errorType?: WorkerErrorType;
  /** CLI that actually executed this worker (for accurate outcome recording, #1527). */
  readonly resolvedCli?: string;
  /** Triage action taken on failure (#1506). Set only when status is 'error'. */
  readonly triageAction?: TriageAction;
  /** Whether this result came from a triage-initiated retry (#1506). */
  readonly wasRetried?: boolean;
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
  /** Optional event bus for wave dispatch observability (Issue #1401). */
  readonly eventBus?: IEventBus;
  /** Execution ID for event correlation. */
  readonly executionId?: string;
  /** Consecutive failures before auto-disabling a role (default: 3, Issue #1425). */
  readonly consecutiveFailureThreshold?: number;
  /** Stagger delay (ms) between spawns within a wave (default: 500ms, #1501). */
  readonly staggerDelayMs?: number;
  /** Optional sync quality gate applied to worker results before acceptance (#1502). */
  readonly qualityGate?: QualityGateFn;
  /** Optional async QA gate for semantic review of worker output (#1710). */
  readonly asyncQualityGate?: AsyncQualityGateFn;
  /** Enable pattern-based failure triage with automatic retry (#1506). Default: true. */
  readonly enableTriage?: boolean;
  /**
   * Optional alternative executor for `retry_different_cli` triage action (#1535).
   * When provided and triage recommends a different CLI, this executor is used
   * instead of the primary one — enabling actual CLI rotation on rate-limit retries.
   */
  readonly altExecuteWorker?: (
    entry: AgentPlanEntry,
    priorWaveResults?: readonly WorkerResult[]
  ) => Promise<WorkerResult>;
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
// Role Failure Tracking (Issue #1425)
// ============================================================================

/**
 * Tracks consecutive failures per role with graduated degradation
 * and recovery. Disabled roles enter a cooldown period, then get
 * a half-open retry. Exponential backoff on repeated failures (Issue #1458).
 */
export class RoleFailureTracker {
  private readonly counts = new Map<string, number>();
  private readonly disabled = new Set<string>();
  private readonly cooldownUntil = new Map<string, number>();
  private readonly cooldownMultiplier = new Map<string, number>();
  private readonly halfOpen = new Set<string>();
  private readonly rateLimitedRoles = new Set<string>();
  private readonly lastRequestTime = new Map<string, number>();
  private readonly threshold: number;
  private readonly nowFn: () => number;

  constructor(threshold: number = CONSECUTIVE_FAILURE_THRESHOLD, nowFn?: () => number) {
    this.threshold = threshold;
    this.nowFn = nowFn ?? ((): number => Date.now());
  }

  /** Record a worker result — handles recovery and backoff logic. */
  record(result: WorkerResult): void {
    if (result.status === 'skipped') return;
    this.lastRequestTime.set(result.role, this.nowFn());
    if (result.status === 'success') {
      this.recordSuccess(result.role);
      return;
    }
    this.recordFailure(result);
  }

  /** Check if a role should be skipped (disabled and not yet eligible for retry). */
  shouldSkipRole(role: string): boolean {
    if (!this.disabled.has(role)) return false;
    const until = this.cooldownUntil.get(role);
    if (until !== undefined && this.nowFn() >= until) {
      this.halfOpen.add(role);
      logger.info('Half-open retry for disabled role', { role });
      return false;
    }
    return true;
  }

  /** Check if a role is auto-disabled (regardless of cooldown state). */
  isDisabled(role: string): boolean {
    return this.disabled.has(role);
  }

  /** Get the set of disabled roles (for observability). */
  getDisabledRoles(): ReadonlySet<string> {
    return this.disabled;
  }

  /** Get minimum delay (ms) before next request to this role, 0 if none needed. */
  getSpacingDelay(role: string): number {
    if (!this.rateLimitedRoles.has(role)) return 0;
    const last = this.lastRequestTime.get(role);
    if (last === undefined) return 0;
    const elapsed = this.nowFn() - last;
    return Math.max(0, RATE_LIMIT_SPACING_MS - elapsed);
  }

  private recordSuccess(role: string): void {
    this.counts.set(role, 0);
    if (this.halfOpen.has(role)) {
      this.halfOpen.delete(role);
      this.disabled.delete(role);
      this.cooldownUntil.delete(role);
      this.cooldownMultiplier.delete(role);
      this.rateLimitedRoles.delete(role);
      logger.info('Role recovered from degraded state', { role });
    }
  }

  private recordFailure(result: WorkerResult): void {
    if (this.halfOpen.has(result.role)) {
      this.extendCooldown(result.role);
      return;
    }
    const current = this.counts.get(result.role) ?? 0;
    const next = current + 1;
    this.counts.set(result.role, next);
    if (result.error !== undefined && isRateLimitError(result.error)) {
      this.rateLimitedRoles.add(result.role);
    }
    if (next >= this.threshold) {
      this.disableWithCooldown(result.role, next);
    }
  }

  private disableWithCooldown(role: string, failures: number): void {
    this.disabled.add(role);
    const multiplier = this.cooldownMultiplier.get(role) ?? 1;
    const cooldown = Math.min(RECOVERY_COOLDOWN_MS * multiplier, MAX_COOLDOWN_MS);
    this.cooldownUntil.set(role, this.nowFn() + cooldown);
    this.cooldownMultiplier.set(role, multiplier * 2);
    logger.warn('Auto-disabled role with recovery cooldown', {
      role,
      consecutiveFailures: failures,
      threshold: this.threshold,
      cooldownMs: cooldown,
    });
  }

  private extendCooldown(role: string): void {
    this.halfOpen.delete(role);
    const multiplier = (this.cooldownMultiplier.get(role) ?? 1) * 2;
    this.cooldownMultiplier.set(role, multiplier);
    const cooldown = Math.min(RECOVERY_COOLDOWN_MS * multiplier, MAX_COOLDOWN_MS);
    this.cooldownUntil.set(role, this.nowFn() + cooldown);
    logger.warn('Half-open retry failed — extending cooldown', {
      role,
      cooldownMs: cooldown,
      multiplier,
    });
  }
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
  const failureTracker = new RoleFailureTracker(
    options.consecutiveFailureThreshold ?? CONSECUTIVE_FAILURE_THRESHOLD
  );

  const bus = options.eventBus;
  const execId = options.executionId ?? `dispatch-${Date.now().toString(36)}`;

  const staggerDelayMs = options.staggerDelayMs ?? DEFAULT_STAGGER_DELAY_MS;

  for (const [waveIdx, wave] of waves.entries()) {
    const waveResults = await processWave(wave, waveIdx, waves.length, {
      bus,
      executionId: execId,
      maxConcurrency,
      options,
      priorResults: allResults.length > 0 ? [...allResults] : undefined,
      failureTracker,
      staggerDelayMs,
      qualityGate: options.qualityGate,
      asyncQualityGate: options.asyncQualityGate,
      enableTriage: options.enableTriage ?? true,
    });
    allResults.push(...waveResults);

    await maybeDelayForRateLimit(waveResults, waveIdx, waves.length);
  }

  return allResults;
}

// ============================================================================
// Wave Processing Helpers
// ============================================================================

/** Options for processing a single wave. */
interface ProcessWaveOptions {
  readonly bus: IEventBus | undefined;
  readonly executionId: string;
  readonly maxConcurrency: number;
  readonly options: WorkerDispatchOptions;
  readonly priorResults: readonly WorkerResult[] | undefined;
  readonly failureTracker: RoleFailureTracker;
  readonly staggerDelayMs: number;
  readonly qualityGate: QualityGateFn | undefined;
  readonly asyncQualityGate: AsyncQualityGateFn | undefined;
  readonly enableTriage: boolean;
}

/** Apply sync + async quality gates to a worker result (#1502, #1710). */
async function applyGates(
  result: WorkerResult,
  role: string,
  syncGate: QualityGateFn | undefined,
  asyncGate: AsyncQualityGateFn | undefined
): Promise<WorkerResult> {
  let gated = syncGate !== undefined ? applyQualityGate(result, syncGate) : result;
  if (asyncGate !== undefined && gated.status === 'success') {
    const rejection = await asyncGate(gated);
    if (rejection !== undefined) {
      logger.info('Async QA gate rejected', { role, reason: rejection.slice(0, 200) });
      gated = { ...gated, status: 'error', error: rejection, errorType: 'logic_error' as const };
    }
  }
  return gated;
}

/** Create a task closure for a single worker within a wave. */
function createWorkerTask(
  entry: AgentPlanEntry,
  taskIndex: number,
  waveNumber: number,
  opts: ProcessWaveOptions
): () => Promise<WorkerResult> {
  return async (): Promise<WorkerResult> => {
    if (opts.failureTracker.shouldSkipRole(entry.role)) {
      logger.info('Skipping auto-disabled role', { role: entry.role, wave: waveNumber });
      return {
        role: entry.role,
        subTask: entry.subTask,
        output: '',
        status: 'skipped' as const,
        durationMs: 0,
        error: 'Role auto-disabled after consecutive failures',
      };
    }
    // Stagger delay: offset each worker launch to avoid API burst (#1501)
    const staggerMs = taskIndex * opts.staggerDelayMs;
    if (staggerMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, staggerMs));
    }
    const spacingDelay = opts.failureTracker.getSpacingDelay(entry.role);
    if (spacingDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, spacingDelay));
    }
    const timeoutMs = opts.options.workerTimeoutMs ?? getExpertTaskTimeout(entry.subTask);
    const result = await executeSafe({
      entry,
      executeWorker: opts.options.executeWorker,
      priorWaveResults: opts.priorResults,
      timeoutMs,
      enableTriage: opts.enableTriage,
      altExecuteWorker: opts.options.altExecuteWorker,
    });
    return applyGates(result, entry.role, opts.qualityGate, opts.asyncQualityGate);
  };
}

/** Process a single wave: emit events, execute tasks, return results. */
async function processWave(
  wave: readonly AgentPlanEntry[],
  waveIdx: number,
  totalWaves: number,
  opts: ProcessWaveOptions
): Promise<WorkerResult[]> {
  const waveNumber = waveIdx + 1;
  const roles = wave.map((e) => e.role);
  logger.info('Dispatching wave', { wave: waveNumber, totalWaves, workers: wave.length, roles });

  const waveCtx: WaveEventContext = {
    bus: opts.bus,
    executionId: opts.executionId,
    waveNumber,
    totalWaves,
  };
  emitWaveStarted(waveCtx, wave.length, roles);
  const waveStartMs = Date.now();

  const tasks = wave.map((entry, taskIndex) =>
    createWorkerTask(entry, taskIndex, waveNumber, opts)
  );

  const waveResults = await executeWithConcurrencyLimit(tasks, opts.maxConcurrency);
  for (const result of waveResults) {
    opts.failureTracker.record(result);
  }
  const successes = waveResults.filter((r) => r.status === 'success').length;
  const errorCount = waveResults.filter((r) => r.status === 'error').length;
  const skipped = waveResults.filter((r) => r.status === 'skipped').length;
  logger.info('Wave complete', { wave: waveNumber, successes, errors: errorCount, skipped });
  emitWaveCompleted(waveCtx, Date.now() - waveStartMs, successes, errorCount);
  return waveResults;
}

/** Delay before next wave if rate-limit errors detected (Issue #1328). */
async function maybeDelayForRateLimit(
  results: readonly WorkerResult[],
  waveIdx: number,
  totalWaves: number
): Promise<void> {
  const hasErrors = results.some((r) => r.status === 'error');
  if (!hasErrors || waveIdx >= totalWaves - 1) return;

  const hasRateLimit = results.some(
    (r) => r.status === 'error' && r.error !== undefined && isRateLimitError(r.error)
  );
  if (hasRateLimit) {
    logger.warn('Rate-limit detected — delaying next wave', { delayMs: RATE_LIMIT_WAVE_DELAY_MS });
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WAVE_DELAY_MS));
  }
}

// ============================================================================
// Wave Event Emitters (Issue #1401, Phase 6.2)
// ============================================================================

interface WaveEventContext {
  readonly bus: IEventBus | undefined;
  readonly executionId: string;
  readonly waveNumber: number;
  readonly totalWaves: number;
}

function emitWaveStarted(
  ctx: WaveEventContext,
  workerCount: number,
  roles: readonly string[]
): void {
  if (ctx.bus === undefined) return;
  ctx.bus.emit({
    type: 'wave.started',
    timestamp: Date.now(),
    executionId: ctx.executionId,
    waveNumber: ctx.waveNumber,
    totalWaves: ctx.totalWaves,
    workerCount,
    roles,
  });
}

function emitWaveCompleted(
  ctx: WaveEventContext,
  durationMs: number,
  successes: number,
  errors: number
): void {
  if (ctx.bus === undefined) return;
  ctx.bus.emit({
    type: 'wave.completed',
    timestamp: Date.now(),
    executionId: ctx.executionId,
    waveNumber: ctx.waveNumber,
    totalWaves: ctx.totalWaves,
    durationMs,
    successes,
    errors,
  });
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
  if (isRateLimitError(message)) return 'rate_limit';
  if (lower.includes('model')) return 'model_error';
  return 'logic_error';
}

/** Timeout extension multiplier for triage-initiated retries (#1506). */
const TIMEOUT_EXTENSION_FACTOR = 1.5;

/** Max chars of error context appended to retry sub-task. */
const MAX_RETRY_CONTEXT_CHARS = 200;

/** Build a retry entry with failure context appended to the sub-task (#1507). */
function buildRetryEntry(
  original: AgentPlanEntry,
  failedResult: WorkerResult,
  triageReason: string
): AgentPlanEntry {
  const errorSnippet = (failedResult.error ?? '').slice(0, MAX_RETRY_CONTEXT_CHARS);
  const retryContext =
    `\n\n[Retry context: previous attempt failed — ${triageReason}.` +
    (errorSnippet !== '' ? ` Error: ${errorSnippet}` : '') +
    ` Adjust your approach to avoid this failure.]`;
  return { ...original, subTask: original.subTask + retryContext };
}

/** Options for executeSafe — bundled to stay within max-params (5). */
interface ExecuteSafeOptions {
  readonly entry: AgentPlanEntry;
  readonly executeWorker: (
    e: AgentPlanEntry,
    prior?: readonly WorkerResult[]
  ) => Promise<WorkerResult>;
  readonly priorWaveResults: readonly WorkerResult[] | undefined;
  readonly timeoutMs: number;
  readonly enableTriage?: boolean | undefined;
  readonly altExecuteWorker?:
    | ((e: AgentPlanEntry, prior?: readonly WorkerResult[]) => Promise<WorkerResult>)
    | undefined;
}

/**
 * Execute a single worker with progressive watchdog monitoring (#1499)
 * and pattern-based failure triage with single retry (#1506).
 */
async function executeSafe(opts: ExecuteSafeOptions): Promise<WorkerResult> {
  const { entry, executeWorker, priorWaveResults, timeoutMs, altExecuteWorker } = opts;
  const enableTriage = opts.enableTriage ?? true;
  const result = await attemptExecution(entry, executeWorker, priorWaveResults, timeoutMs);
  if (result.status !== 'error' || !enableTriage) return result;
  return maybeRetryAfterTriage({
    failedResult: result,
    entry,
    executeWorker,
    priorWaveResults,
    timeoutMs,
    altExecuteWorker,
  });
}

/** Single execution attempt. Returns undefined on success (result returned directly), or failed WorkerResult. */
async function attemptExecution(
  entry: AgentPlanEntry,
  executeWorker: (e: AgentPlanEntry, prior?: readonly WorkerResult[]) => Promise<WorkerResult>,
  priorWaveResults: readonly WorkerResult[] | undefined,
  timeoutMs: number
): Promise<WorkerResult> {
  const startMs = Date.now();
  try {
    return await withWatchdog(entry.role, timeoutMs, () => executeWorker(entry, priorWaveResults));
  } catch (error: unknown) {
    const durationMs = Date.now() - startMs;
    const message = getErrorMessage(error);
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

/** Options for maybeRetryAfterTriage — bundled to stay within max-params (5). */
interface TriageRetryOptions {
  readonly failedResult: WorkerResult;
  readonly entry: AgentPlanEntry;
  readonly executeWorker: (
    e: AgentPlanEntry,
    prior?: readonly WorkerResult[]
  ) => Promise<WorkerResult>;
  readonly priorWaveResults: readonly WorkerResult[] | undefined;
  readonly timeoutMs: number;
  readonly altExecuteWorker?:
    | ((e: AgentPlanEntry, prior?: readonly WorkerResult[]) => Promise<WorkerResult>)
    | undefined;
}

/** Triage a failed result and retry once if recommended (#1506). */
async function maybeRetryAfterTriage(opts: TriageRetryOptions): Promise<WorkerResult> {
  const { failedResult, entry, executeWorker, priorWaveResults, timeoutMs, altExecuteWorker } =
    opts;
  if (failedResult.status !== 'error') return failedResult;

  const triage = triageWorkerFailure(failedResult);
  logger.info('Worker failure triaged', {
    role: entry.role,
    action: triage.action,
    retryable: triage.retryable,
    reason: triage.reason,
    hasUsefulOutput: triage.hasUsefulOutput,
  });

  if (!triage.retryable) {
    return { ...failedResult, triageAction: triage.action };
  }

  // Rate-limit retry: use alt executor for different CLI if available (#1535)
  const useAltCli = triage.action === 'retry_different_cli' && altExecuteWorker !== undefined;
  if (triage.action === 'retry_different_cli') {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_SPACING_MS));
  }

  // Single retry for all retryable actions
  const retryTimeout =
    triage.action === 'extend_timeout'
      ? Math.min(timeoutMs * TIMEOUT_EXTENSION_FACTOR, MAX_WORKER_TIMEOUT_MS)
      : timeoutMs;

  const retryExecutor = useAltCli ? altExecuteWorker : executeWorker;
  logger.info('Retrying worker after triage', {
    role: entry.role,
    action: triage.action,
    retryTimeout,
    usingAltCli: useAltCli,
  });

  // Enrich retry entry with failure context so the model can avoid the same mistake
  const retryEntry = buildRetryEntry(entry, failedResult, triage.reason);
  const retryResult = await attemptExecution(
    retryEntry,
    retryExecutor,
    priorWaveResults,
    retryTimeout
  );
  if (retryResult.status === 'success') {
    logger.info('Triage retry succeeded', {
      role: entry.role,
      action: triage.action,
      usingAltCli: useAltCli,
    });
    return { ...retryResult, wasRetried: true };
  }

  logger.warn('Triage retry also failed', { role: entry.role, action: triage.action });
  return { ...retryResult, triageAction: triage.action, wasRetried: true };
}
