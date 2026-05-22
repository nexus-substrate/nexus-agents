/**
 * Tests for Stdin Lifecycle Monitor
 *
 * @module adapters/stdin-lifecycle.test
 * (Source: Issue #810 — zombie MCP server processes; hardened in #2905)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StdinLifecycleMonitor } from './stdin-lifecycle.js';

/**
 * Captures the handlers `start()` registers on `process.stdin` so tests
 * can invoke them directly — there's no portable way to make the real
 * stdin emit `'end'` / `'close'` in a unit test.
 */
function spyStdin(): {
  handlers: Map<string, () => void>;
  restore: () => void;
} {
  const handlers = new Map<string, () => void>();
  const onceSpy = vi
    .spyOn(process.stdin, 'once')
    .mockImplementation((event: string | symbol, handler: (...args: unknown[]) => void) => {
      handlers.set(String(event), handler);
      return process.stdin;
    });
  const resumeSpy = vi.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin);
  return {
    handlers,
    restore: () => {
      onceSpy.mockRestore();
      resumeSpy.mockRestore();
    },
  };
}

describe('StdinLifecycleMonitor', () => {
  let stdin: ReturnType<typeof spyStdin>;

  beforeEach(() => {
    stdin = spyStdin();
  });

  afterEach(() => {
    stdin.restore();
    vi.useRealTimers();
  });

  it('start() is idempotent — attaches stdin listeners only once', () => {
    const monitor = new StdinLifecycleMonitor();
    monitor.start();
    monitor.start();
    monitor.start();
    // One 'end' + one 'close' from the single effective start().
    expect(stdin.handlers.size).toBe(2);
    expect(stdin.handlers.has('end')).toBe(true);
    expect(stdin.handlers.has('close')).toBe(true);
  });

  it('fires onClose callbacks when stdin emits "end"', async () => {
    const monitor = new StdinLifecycleMonitor();
    const cb = vi.fn();
    monitor.onClose(cb);
    monitor.start();

    stdin.handlers.get('end')?.();
    await vi.waitFor(() => {
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  it('fires onClose callbacks when stdin emits "close" (abrupt parent death)', async () => {
    // #2905: 'end' alone missed SIGKILLed parents; 'close' covers them.
    const monitor = new StdinLifecycleMonitor();
    const cb = vi.fn();
    monitor.onClose(cb);
    monitor.start();

    stdin.handlers.get('close')?.();
    await vi.waitFor(() => {
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  it('fires callbacks exactly once even when multiple signals arrive', async () => {
    const monitor = new StdinLifecycleMonitor();
    const cb = vi.fn();
    monitor.onClose(cb);
    monitor.start();

    stdin.handlers.get('end')?.();
    stdin.handlers.get('close')?.();
    stdin.handlers.get('end')?.();
    await vi.waitFor(() => {
      expect(cb).toHaveBeenCalledTimes(1);
    });
    // Give any stray async path a tick to (not) double-fire.
    await Promise.resolve();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('runs every registered callback', async () => {
    const monitor = new StdinLifecycleMonitor();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    monitor.onClose(cb1);
    monitor.onClose(cb2);
    monitor.start();

    stdin.handlers.get('end')?.();
    await vi.waitFor(() => {
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  it('a throwing callback does not block the others', async () => {
    const monitor = new StdinLifecycleMonitor();
    const throwing = vi.fn(() => {
      throw new Error('boom');
    });
    const healthy = vi.fn();
    monitor.onClose(throwing);
    monitor.onClose(healthy);
    monitor.start();

    stdin.handlers.get('end')?.();
    await vi.waitFor(() => {
      expect(healthy).toHaveBeenCalledTimes(1);
    });
  });

  it('fires when the parent pid changes — signal 3, the SIGKILL catch-all', async () => {
    // #2905: simulate reparenting (parent died → ppid changes).
    vi.useFakeTimers();
    let ppid = 4242;
    const monitor = new StdinLifecycleMonitor({
      getPpid: () => ppid,
      ppidPollMs: 1000,
    });
    const cb = vi.fn();
    monitor.onClose(cb);
    monitor.start();

    // Parent alive — poll fires, no callback.
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb).not.toHaveBeenCalled();

    // Parent dies — ppid reparents to init.
    ppid = 1;
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does not fire while the parent pid is stable', async () => {
    vi.useFakeTimers();
    const monitor = new StdinLifecycleMonitor({
      getPpid: () => 9999,
      ppidPollMs: 500,
    });
    const cb = vi.fn();
    monitor.onClose(cb);
    monitor.start();

    await vi.advanceTimersByTimeAsync(5000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('stops the ppid poll after firing (no leaked interval)', async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    let ppid = 100;
    const monitor = new StdinLifecycleMonitor({ getPpid: () => ppid, ppidPollMs: 100 });
    monitor.onClose(vi.fn());
    monitor.start();

    ppid = 1;
    await vi.advanceTimersByTimeAsync(100);
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
