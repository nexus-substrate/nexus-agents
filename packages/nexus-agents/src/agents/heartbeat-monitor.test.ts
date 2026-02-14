/**
 * Tests for heartbeat-based liveness monitor.
 *
 * @module agents/heartbeat-monitor.test
 * (Source: Issue #1032 — Agent heartbeat health monitor)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  HeartbeatMonitor,
  getHeartbeatMonitor,
  resetHeartbeatMonitor,
} from './heartbeat-monitor.js';

describe('heartbeat-monitor', () => {
  beforeEach(() => {
    resetHeartbeatMonitor();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('HeartbeatMonitor', () => {
    it('should start and end sessions', () => {
      const monitor = new HeartbeatMonitor();
      const sid = monitor.startSession('expert-1');
      expect(sid).toContain('expert-1');
      expect(monitor.activeCount).toBe(1);

      monitor.endSession(sid);
      expect(monitor.activeCount).toBe(0);
    });

    it('should track multiple sessions', () => {
      const monitor = new HeartbeatMonitor();
      monitor.startSession('expert-1');
      monitor.startSession('expert-2');
      monitor.startSession('expert-3');
      expect(monitor.activeCount).toBe(3);
    });

    it('should record heartbeats', () => {
      const monitor = new HeartbeatMonitor();
      const sid = monitor.startSession('expert-1');
      monitor.heartbeat(sid);
      monitor.heartbeat(sid);
      monitor.heartbeat(sid);

      const health = monitor.getHealth();
      const session = health.sessions.find((s) => s.sessionId === sid);
      expect(session?.heartbeatCount).toBe(3);
    });

    it('should classify session as alive when recent heartbeat', () => {
      const monitor = new HeartbeatMonitor();
      const sid = monitor.startSession('expert-1');
      monitor.heartbeat(sid);

      const health = monitor.getHealth();
      const session = health.sessions.find((s) => s.sessionId === sid);
      expect(session?.health).toBe('alive');
    });

    it('should classify session as slow after threshold', () => {
      const monitor = new HeartbeatMonitor({ slowThresholdMs: 10_000 });
      const sid = monitor.startSession('expert-1');

      vi.advanceTimersByTime(15_000);

      const health = monitor.getHealth();
      const session = health.sessions.find((s) => s.sessionId === sid);
      expect(session?.health).toBe('slow');
    });

    it('should classify session as stalled after threshold', () => {
      const monitor = new HeartbeatMonitor({ stalledThresholdMs: 20_000 });
      const sid = monitor.startSession('expert-1');

      vi.advanceTimersByTime(25_000);

      expect(monitor.isStalled(sid)).toBe(true);
      const health = monitor.getHealth();
      expect(health.stalledSessions).toBe(1);
    });

    it('should reset stall timer on heartbeat', () => {
      const monitor = new HeartbeatMonitor({ stalledThresholdMs: 20_000 });
      const sid = monitor.startSession('expert-1');

      vi.advanceTimersByTime(15_000);
      monitor.heartbeat(sid);
      vi.advanceTimersByTime(10_000);

      expect(monitor.isStalled(sid)).toBe(false);
    });

    it('should detect expired sessions', () => {
      const monitor = new HeartbeatMonitor({ absoluteMaxMs: 50_000 });
      const sid = monitor.startSession('expert-1');

      vi.advanceTimersByTime(60_000);

      expect(monitor.isExpired(sid)).toBe(true);
    });

    it('should not expire if within max', () => {
      const monitor = new HeartbeatMonitor({ absoluteMaxMs: 100_000 });
      const sid = monitor.startSession('expert-1');

      vi.advanceTimersByTime(50_000);

      expect(monitor.isExpired(sid)).toBe(false);
    });

    it('should handle heartbeat for unknown session', () => {
      const monitor = new HeartbeatMonitor();
      expect(() => {
        monitor.heartbeat('nonexistent');
      }).not.toThrow();
    });

    it('should return false for isStalled on unknown session', () => {
      const monitor = new HeartbeatMonitor();
      expect(monitor.isStalled('nonexistent')).toBe(false);
    });

    it('should return false for isExpired on unknown session', () => {
      const monitor = new HeartbeatMonitor();
      expect(monitor.isExpired('nonexistent')).toBe(false);
    });

    it('should include elapsed and timeSince in snapshot', () => {
      const monitor = new HeartbeatMonitor();
      const sid = monitor.startSession('expert-1');

      vi.advanceTimersByTime(5_000);

      const health = monitor.getHealth();
      const session = health.sessions.find((s) => s.sessionId === sid);
      expect(session?.elapsedMs).toBe(5_000);
      expect(session?.timeSinceHeartbeatMs).toBe(5_000);
    });

    it('should report aggregate health correctly', () => {
      const monitor = new HeartbeatMonitor({
        stalledThresholdMs: 10_000,
      });
      const sid1 = monitor.startSession('expert-1');
      monitor.startSession('expert-2');

      vi.advanceTimersByTime(15_000);
      monitor.heartbeat(sid1); // expert-1 alive, expert-2 stalled

      const health = monitor.getHealth();
      expect(health.activeSessions).toBe(2);
      expect(health.stalledSessions).toBe(1);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const a = getHeartbeatMonitor();
      const b = getHeartbeatMonitor();
      expect(a).toBe(b);
    });

    it('should reset singleton', () => {
      const a = getHeartbeatMonitor();
      resetHeartbeatMonitor();
      const b = getHeartbeatMonitor();
      expect(a).not.toBe(b);
    });
  });
});
