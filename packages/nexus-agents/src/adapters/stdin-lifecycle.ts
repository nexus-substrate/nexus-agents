/**
 * Stdin Lifecycle Monitor
 *
 * Detects when the parent process closes stdin (e.g., Claude Code exits)
 * and triggers graceful shutdown to prevent zombie MCP server processes.
 *
 * @module adapters/stdin-lifecycle
 * (Source: Issue #810 - Zombie MCP server processes)
 */

import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'StdinLifecycleMonitor' });

type StdinCallback = () => void | Promise<void>;

/**
 * Monitors process.stdin for closure, indicating the parent process died.
 */
export class StdinLifecycleMonitor {
  private readonly callbacks: Set<StdinCallback> = new Set();
  private started = false;

  /**
   * Begin monitoring stdin for closure.
   * Safe to call multiple times — only attaches listener once.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    process.stdin.once('end', () => {
      void this.fireCallbacks();
    });

    // Ensure stdin doesn't keep the event loop alive on its own
    process.stdin.resume();
  }

  /** Register a callback to fire when stdin closes. */
  onClose(cb: StdinCallback): void {
    this.callbacks.add(cb);
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
