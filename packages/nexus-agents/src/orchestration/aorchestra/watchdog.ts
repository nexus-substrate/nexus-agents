/**
 * Progressive watchdog for worker dispatch (#1499, Overstory pattern).
 *
 * Escalates through stages instead of flat timeout → kill:
 * 1. Healthy — worker is running normally
 * 2. Warned — elapsed > 50% of timeout, logged for diagnostics
 * 3. Terminated — elapsed > 100% of timeout, worker killed
 *
 * Future stages (nudge, AI triage) can be added when agent communication
 * channels are available.
 *
 * @module orchestration/aorchestra/watchdog
 */

import { createLogger, getTimeProvider } from '../../core/index.js';

const logger = createLogger({ component: 'worker-watchdog' });

/** Watchdog escalation states. */
export type WatchdogState = 'healthy' | 'warned' | 'terminated';

/** Threshold ratios for escalation (fraction of timeoutMs). */
export const WATCHDOG_THRESHOLDS = {
  warn: 0.5,
  terminate: 1.0,
} as const;

/** Watchdog check interval in ms. */
export const WATCHDOG_CHECK_INTERVAL_MS = 5_000;

/** Context for a single monitored worker. */
export interface WatchdogEntry {
  readonly role: string;
  readonly startMs: number;
  readonly timeoutMs: number;
  state: WatchdogState;
}

/**
 * Determines the watchdog state for a worker based on elapsed time.
 */
export function evaluateState(entry: WatchdogEntry, nowMs: number): WatchdogState {
  const elapsed = nowMs - entry.startMs;
  const ratio = elapsed / entry.timeoutMs;

  if (ratio >= WATCHDOG_THRESHOLDS.terminate) return 'terminated';
  if (ratio >= WATCHDOG_THRESHOLDS.warn) return 'warned';
  return 'healthy';
}

/**
 * Runs a task with progressive watchdog monitoring.
 *
 * Logs escalation events at warn threshold (50% timeout).
 * Returns the task result or a timeout error at terminate threshold.
 *
 * The task receives an `AbortSignal` (#3036). When the watchdog timeout
 * fires (or `withWatchdog`'s caller aborts via an outer signal), the
 * controller aborts before the timeout promise rejects, so the task
 * can cancel any in-flight work (subprocesses, fetch calls, SDK
 * requests). Tasks that ignore the signal still see the timeout
 * rejection at the Promise.race boundary — the abort is a *hint* to
 * the task that it can stop early; the watchdog itself bounds latency
 * regardless.
 *
 * @param role - Worker role name for logging
 * @param timeoutMs - Total timeout for the worker
 * @param task - The async task to monitor; receives an AbortSignal it
 *               should thread into any cancellable work it does.
 * @param outerSignal - The caller's cancellation (#6680), e.g. `cancel_job`'s
 *               signal reaching worker dispatch. Its abort is forwarded to the
 *               task's signal. Like the timeout abort it is a hint: a task
 *               that ignores its signal completes the current call, and the
 *               watchdog does not return early on an outer abort.
 * @returns Task result or timeout error
 */
export async function withWatchdog<T>(
  role: string,
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
  outerSignal?: AbortSignal
): Promise<T> {
  const entry: WatchdogEntry = {
    role,
    startMs: getTimeProvider().now(),
    timeoutMs,
    state: 'healthy',
  };

  // #3036: the controller is the signal the watchdog uses to tell the
  // task "the timeout won, you can stop now." Without this, the task
  // (typically an adapter call) keeps running after Promise.race
  // resolves with the timeout rejection, leaking subprocess fan-out
  // and late OutcomeStore writes.
  const controller = new AbortController();
  const forwardOuterAbort = (): void => {
    controller.abort(outerSignal?.reason);
  };
  if (outerSignal?.aborted === true) controller.abort(outerSignal.reason);
  outerSignal?.addEventListener('abort', forwardOuterAbort, { once: true });
  const taskPromise = task(controller.signal);
  const { promise: timeoutPromise, cancel: cancelTimeout } = createTerminationTimer(
    entry,
    timeoutMs,
    controller
  );
  const watchdogTimer = startEscalationMonitor(entry, timeoutMs);

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    outerSignal?.removeEventListener('abort', forwardOuterAbort);
    clearInterval(watchdogTimer);
    cancelTimeout();
    // Idempotent — if abort already fired on timeout, this is a no-op.
    // If the task won the race cleanly, we still abort so any orphan
    // sub-work the task spawned but didn't await sees the cancel.
    if (!controller.signal.aborted) {
      controller.abort();
    }
  }
}

/** Build the terminate-on-timeout promise + its cancel handle. */
function createTerminationTimer(
  entry: WatchdogEntry,
  timeoutMs: number,
  controller: AbortController
): { promise: Promise<never>; cancel: () => void } {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_, reject) => {
    handle = setTimeout(() => {
      entry.state = 'terminated';
      logger.warn('Worker terminated by watchdog', {
        role: entry.role,
        timeoutMs,
        elapsed: getTimeProvider().now() - entry.startMs,
        state: 'terminated',
      });
      // Abort BEFORE rejecting so any signal listeners (subprocess
      // SIGTERM, fetch cancel) fire before the rejection propagates.
      const timeoutError = new Error(`Worker timeout after ${String(timeoutMs)}ms`);
      timeoutError.name = 'TimeoutError';
      controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });
  const cancel = (): void => {
    if (handle !== undefined) clearTimeout(handle);
  };
  return { promise, cancel };
}

/** Start the periodic warn-escalation interval. Returns the handle to clear. */
function startEscalationMonitor(
  entry: WatchdogEntry,
  timeoutMs: number
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const newState = evaluateState(entry, getTimeProvider().now());
    if (newState === entry.state) return;
    entry.state = newState;
    if (newState === 'warned') {
      const elapsed = getTimeProvider().now() - entry.startMs;
      logger.warn('Worker approaching timeout', {
        role: entry.role,
        elapsed,
        timeoutMs,
        percentUsed: Math.round((elapsed / timeoutMs) * 100),
        state: 'warned',
      });
    }
  }, WATCHDOG_CHECK_INTERVAL_MS);
}
