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
 * @param role - Worker role name for logging
 * @param timeoutMs - Total timeout for the worker
 * @param task - The async task to monitor
 * @returns Task result or timeout error
 */
export async function withWatchdog<T>(
  role: string,
  timeoutMs: number,
  task: () => Promise<T>
): Promise<T> {
  const entry: WatchdogEntry = {
    role,
    startMs: getTimeProvider().now(),
    timeoutMs,
    state: 'healthy',
  };

  const taskPromise = task();

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      entry.state = 'terminated';
      logger.warn('Worker terminated by watchdog', {
        role,
        timeoutMs,
        elapsed: getTimeProvider().now() - entry.startMs,
        state: 'terminated',
      });
      reject(new Error(`Worker timeout after ${String(timeoutMs)}ms`));
    }, timeoutMs);
  });

  // Periodic check for warn escalation
  const watchdogTimer = setInterval(() => {
    const newState = evaluateState(entry, getTimeProvider().now());
    if (newState !== entry.state) {
      entry.state = newState;
      if (newState === 'warned') {
        const elapsed = getTimeProvider().now() - entry.startMs;
        logger.warn('Worker approaching timeout', {
          role,
          elapsed,
          timeoutMs,
          percentUsed: Math.round((elapsed / timeoutMs) * 100),
          state: 'warned',
        });
      }
    }
  }, WATCHDOG_CHECK_INTERVAL_MS);

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    clearInterval(watchdogTimer);
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}
