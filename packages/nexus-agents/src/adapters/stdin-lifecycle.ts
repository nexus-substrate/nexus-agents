/**
 * Stdin Lifecycle Monitor
 *
 * Detects when the parent process (Claude Code, an editor, any MCP client)
 * goes away and triggers graceful shutdown so `nexus-agents --mode=server`
 * processes don't leak as zombies.
 *
 * Three independent signals — any one fires the shutdown callbacks exactly
 * once. Belt-and-suspenders because no single signal is reliable across
 * clean exit / SIGKILL / pipe-yank:
 *
 *   1. stdin `'end'`   — clean parent exit; EOF once buffered data drains.
 *   2. stdin `'close'` — the stdin fd closed; covers abrupt death where
 *                        `'end'` never cleanly emits.
 *   3. ppid change     — the parent pid differs from what it was at
 *                        `start()`. A SIGKILLed parent leaves the child
 *                        reparented (to init); this poll catches every
 *                        case the stream events miss. The timer is
 *                        `unref()`'d so it never keeps the process alive.
 *
 * Issue #810 shipped only signal 1 (`process.stdin.once('end')`). That
 * misses SIGKILLed parents and abrupt pipe death — a sweep found 134
 * leaked server processes aged up to 17 days. Signals 2 + 3 close the
 * gap (issue #2905).
 *
 * @module adapters/stdin-lifecycle
 * (Source: Issue #810; hardened in #2905)
 */

import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'StdinLifecycleMonitor' });

type StdinCallback = () => void | Promise<void>;

/** Default interval for the parent-pid poll (signal 3). */
const DEFAULT_PPID_POLL_MS = 30_000;

/**
 * Construction options. All optional — the defaults are the production
 * configuration; the overrides exist so the ppid poll is unit-testable
 * without actually reparenting a process.
 */
export interface StdinLifecycleOptions {
  /** Source of the current parent pid. Default: `() => process.ppid`. */
  readonly getPpid?: () => number;
  /** Parent-pid poll interval in ms. Default: 30000. */
  readonly ppidPollMs?: number;
}

/**
 * Monitors for parent-process death and fires registered shutdown
 * callbacks exactly once when it's detected.
 */
export class StdinLifecycleMonitor {
  private readonly callbacks: Set<StdinCallback> = new Set();
  private started = false;
  private fired = false;
  private ppidTimer: NodeJS.Timeout | undefined;
  private readonly getPpid: () => number;
  private readonly ppidPollMs: number;

  constructor(options: StdinLifecycleOptions = {}) {
    this.getPpid = options.getPpid ?? ((): number => process.ppid);
    this.ppidPollMs = options.ppidPollMs ?? DEFAULT_PPID_POLL_MS;
  }

  /**
   * Begin monitoring. Safe to call multiple times — only the first call
   * attaches listeners.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Signals 1 + 2: stdin EOF and fd close.
    process.stdin.once('end', () => {
      void this.trigger('stdin-end');
    });
    process.stdin.once('close', () => {
      void this.trigger('stdin-close');
    });
    // Flowing mode so 'end' can be reached; resume() doesn't, by itself,
    // keep the event loop alive.
    process.stdin.resume();

    // Signal 3: parent-pid change. Capture the startup parent; if the
    // observed ppid ever differs, the original parent died and we were
    // reparented — orphaned.
    const startupPpid = this.getPpid();
    this.ppidTimer = setInterval(() => {
      if (this.getPpid() !== startupPpid) {
        void this.trigger('ppid-changed');
      }
    }, this.ppidPollMs);
    // The poll must never be the reason the process stays alive.
    this.ppidTimer.unref();
  }

  /** Register a callback to fire when parent death is detected. */
  onClose(cb: StdinCallback): void {
    this.callbacks.add(cb);
  }

  /**
   * Fire shutdown callbacks exactly once, whichever signal arrives first.
   * Idempotent — later signals are no-ops.
   */
  private async trigger(reason: string): Promise<void> {
    if (this.fired) return;
    this.fired = true;
    if (this.ppidTimer !== undefined) {
      clearInterval(this.ppidTimer);
      this.ppidTimer = undefined;
    }
    logger.warn('Parent process gone — shutting down MCP server', { reason });
    await this.fireCallbacks();
  }

  private async fireCallbacks(): Promise<void> {
    for (const cb of this.callbacks) {
      try {
        await cb();
      } catch (error) {
        logger.warn('Stdin shutdown callback failed', { error: String(error) });
      }
    }
  }
}

let singleton: StdinLifecycleMonitor | undefined;

/** Get the singleton StdinLifecycleMonitor instance. */
export function getStdinLifecycleMonitor(): StdinLifecycleMonitor {
  singleton ??= new StdinLifecycleMonitor();
  return singleton;
}

/** Reset the singleton (for testing). */
export function resetStdinLifecycleMonitor(): void {
  singleton = undefined;
}
