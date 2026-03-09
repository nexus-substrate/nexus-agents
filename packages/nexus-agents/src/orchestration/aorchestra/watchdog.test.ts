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
  });
});
