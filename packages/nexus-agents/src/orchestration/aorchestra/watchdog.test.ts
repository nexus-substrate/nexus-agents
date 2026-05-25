/**
 * Tests for progressive watchdog (#1499).
 *
 * @module orchestration/aorchestra/watchdog.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  evaluateState,
  withWatchdog,
  WATCHDOG_THRESHOLDS,
  WATCHDOG_CHECK_INTERVAL_MS,
  type WatchdogEntry,
} from './watchdog.js';

describe('watchdog', () => {
  describe('evaluateState', () => {
    const makeEntry = (startMs: number, timeoutMs: number): WatchdogEntry => ({
      role: 'code',
      startMs,
      timeoutMs,
      state: 'healthy',
    });

    it('returns healthy when below warn threshold', () => {
      const entry = makeEntry(0, 1000);
      expect(evaluateState(entry, 400)).toBe('healthy');
    });

    it('returns warned at exactly 50% elapsed', () => {
      const entry = makeEntry(0, 1000);
      expect(evaluateState(entry, 500)).toBe('warned');
    });

    it('returns warned between 50% and 100%', () => {
      const entry = makeEntry(0, 1000);
      expect(evaluateState(entry, 750)).toBe('warned');
    });

    it('returns terminated at exactly 100% elapsed', () => {
      const entry = makeEntry(0, 1000);
      expect(evaluateState(entry, 1000)).toBe('terminated');
    });

    it('returns terminated when over 100%', () => {
      const entry = makeEntry(0, 1000);
      expect(evaluateState(entry, 1500)).toBe('terminated');
    });
  });

  describe('constants', () => {
    it('exports warn threshold at 0.5', () => {
      expect(WATCHDOG_THRESHOLDS.warn).toBe(0.5);
    });

    it('exports terminate threshold at 1.0', () => {
      expect(WATCHDOG_THRESHOLDS.terminate).toBe(1.0);
    });

    it('exports check interval', () => {
      expect(WATCHDOG_CHECK_INTERVAL_MS).toBe(5_000);
    });
  });

  describe('withWatchdog', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns task result when task completes before timeout', async () => {
      const taskPromise = withWatchdog('code', 1000, () => Promise.resolve('done'));
      const result = await taskPromise;
      expect(result).toBe('done');
    });

    it('rejects with timeout error when task exceeds timeout', async () => {
      const neverResolve = withWatchdog(
        'code',
        100,
        () => new Promise<string>(() => {}) // never resolves
      );

      // Advance past timeout threshold, then await rejection
      vi.advanceTimersByTime(150);

      await expect(neverResolve).rejects.toThrow('Worker timeout after 100ms');

      // Drain remaining timers (watchdog interval cleanup)
      vi.clearAllTimers();
    });

    it('propagates task errors', async () => {
      const failingTask = withWatchdog('code', 1000, () =>
        Promise.reject(new Error('task failed'))
      );
      await expect(failingTask).rejects.toThrow('task failed');
    });

    // #3036: the watchdog must abort its AbortController BEFORE
    // rejecting on timeout, so subprocess kill / fetch cancel
    // listeners in the task fire before the rejection propagates
    // and the dispatcher moves on. Without abort, the task keeps
    // running past Promise.race and posts late results into
    // OutcomeStore for a decision already discarded.
    it('aborts the task signal when the watchdog timeout fires (#3036)', async () => {
      let observedSignal: AbortSignal | undefined;
      const taskPromise = withWatchdog(
        'code',
        100,
        (signal) =>
          new Promise<string>(() => {
            observedSignal = signal;
          })
      );

      vi.advanceTimersByTime(150);
      await expect(taskPromise).rejects.toThrow('Worker timeout after 100ms');

      expect(observedSignal).toBeDefined();
      expect(observedSignal?.aborted).toBe(true);

      vi.clearAllTimers();
    });

    // The task receives a signal it can opt into. This verifies the
    // wiring is live — the task's own abort listener resolves it
    // before the watchdog's rejection wins the race.
    it('the task can observe the abort and stop early (#3036)', async () => {
      let aborted = false;
      const taskPromise = withWatchdog<string>(
        'code',
        100,
        (signal) =>
          new Promise<string>((_, reject) => {
            signal.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('Task cancelled by signal'));
            });
          })
      );

      vi.advanceTimersByTime(150);
      await expect(taskPromise).rejects.toThrow();
      expect(aborted).toBe(true);

      vi.clearAllTimers();
    });

    // Clean-finish path: even when the task wins the race, the
    // `controller.abort()` in `finally` runs so any orphan sub-work
    // the task spawned but didn't await sees the cancel.
    it('aborts the signal in the finally block when the task wins cleanly (#3036)', async () => {
      let observedSignal: AbortSignal | undefined;
      const result = await withWatchdog('code', 5000, (signal) => {
        observedSignal = signal;
        return Promise.resolve('ok');
      });

      expect(result).toBe('ok');
      expect(observedSignal).toBeDefined();
      expect(observedSignal?.aborted).toBe(true);
    });
  });
});
