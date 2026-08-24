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
  runInHeartbeatSession,
  type HealthTransition,
} from './heartbeat-monitor.js';
import { stepBus } from '../core/step-bus.js';

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
      monitor.markInstrumented(sid);
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
      monitor.markInstrumented(sid);
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
      monitor.markInstrumented(sid);
      monitor.heartbeat(sid);

      const health = monitor.getHealth();
      const session = health.sessions.find((s) => s.sessionId === sid);
      expect(session?.health).toBe('alive');
    });

    it('should classify session as slow after threshold', () => {
      const monitor = new HeartbeatMonitor({ slowThresholdMs: 10_000 });
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);

      vi.advanceTimersByTime(15_000);

      const health = monitor.getHealth();
      const session = health.sessions.find((s) => s.sessionId === sid);
      expect(session?.health).toBe('slow');
    });

    it('should classify session as stalled after threshold', () => {
      const monitor = new HeartbeatMonitor({ stalledThresholdMs: 20_000 });
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);

      vi.advanceTimersByTime(25_000);

      expect(monitor.isStalled(sid)).toBe(true);
      const health = monitor.getHealth();
      expect(health.stalledSessions).toBe(1);
    });

    it('should reset stall timer on heartbeat', () => {
      const monitor = new HeartbeatMonitor({ stalledThresholdMs: 20_000 });
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);

      vi.advanceTimersByTime(15_000);
      monitor.heartbeat(sid);
      vi.advanceTimersByTime(10_000);

      expect(monitor.isStalled(sid)).toBe(false);
    });

    it('should detect expired sessions', () => {
      const monitor = new HeartbeatMonitor({ absoluteMaxMs: 50_000 });
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);

      vi.advanceTimersByTime(60_000);

      expect(monitor.isExpired(sid)).toBe(true);
    });

    it('should not expire if within max', () => {
      const monitor = new HeartbeatMonitor({ absoluteMaxMs: 100_000 });
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);

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
      monitor.markInstrumented(sid);

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
      monitor.markInstrumented(sid1);
      const sid2 = monitor.startSession('expert-2');
      monitor.markInstrumented(sid2);

      vi.advanceTimersByTime(15_000);
      monitor.heartbeat(sid1); // expert-1 alive, expert-2 stalled

      const health = monitor.getHealth();
      expect(health.activeSessions).toBe(2);
      expect(health.stalledSessions).toBe(1);
    });
  });

  describe('periodic heartbeat pattern (Issue #1087)', () => {
    it('should stay alive with periodic heartbeats', () => {
      const monitor = new HeartbeatMonitor({
        slowThresholdMs: 30_000,
        stalledThresholdMs: 60_000,
      });
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);

      // Simulate periodic heartbeats every 15s for 90s
      for (let i = 0; i < 6; i++) {
        vi.advanceTimersByTime(15_000);
        monitor.heartbeat(sid);
      }

      expect(monitor.isStalled(sid)).toBe(false);
      const health = monitor.getHealth();
      const session = health.sessions.find((s) => s.sessionId === sid);
      expect(session?.health).toBe('alive');
      expect(session?.heartbeatCount).toBe(6);
    });

    it('should detect stall when heartbeats stop', () => {
      const monitor = new HeartbeatMonitor({
        slowThresholdMs: 30_000,
        stalledThresholdMs: 60_000,
      });
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);

      // Heartbeat for a while
      vi.advanceTimersByTime(15_000);
      monitor.heartbeat(sid);
      vi.advanceTimersByTime(15_000);
      monitor.heartbeat(sid);

      // Then stop heartbeating
      vi.advanceTimersByTime(65_000);

      expect(monitor.isStalled(sid)).toBe(true);
    });

    it('should transition through health states', () => {
      const monitor = new HeartbeatMonitor({
        slowThresholdMs: 20_000,
        stalledThresholdMs: 40_000,
      });
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);

      // Initially alive
      expect(monitor.getHealth().sessions[0]?.health).toBe('alive');

      // After slow threshold
      vi.advanceTimersByTime(25_000);
      expect(monitor.getHealth().sessions[0]?.health).toBe('slow');

      // After stalled threshold
      vi.advanceTimersByTime(20_000);
      expect(monitor.getHealth().sessions[0]?.health).toBe('stalled');

      // Heartbeat resets to alive
      monitor.heartbeat(sid);
      expect(monitor.getHealth().sessions[0]?.health).toBe('alive');
    });
  });

  describe('getSessionHealth (Issue #1088 Phase 4)', () => {
    it('returns undefined for unknown session', () => {
      const monitor = new HeartbeatMonitor();
      expect(monitor.getSessionHealth('nope')).toBeUndefined();
    });

    // #4665: a new session starts at `unmeasured` — nothing has been observed
    // yet — so its first health read is a real unmeasured → alive transition
    // rather than a no-op. Only 'slow' and 'stalled' transitions are logged, so
    // this is silent in production.
    it('reports the first observation of a new session as unmeasured → alive', () => {
      const monitor = new HeartbeatMonitor();
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);
      const t = monitor.getSessionHealth(sid) as HealthTransition;
      expect(t.health).toBe('alive');
      expect(t.previousHealth).toBe('unmeasured');
      expect(t.changed).toBe(true);
    });

    it('reports no transition on a second read with no change', () => {
      const monitor = new HeartbeatMonitor();
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);
      monitor.getSessionHealth(sid);
      const t = monitor.getSessionHealth(sid) as HealthTransition;
      expect(t.changed).toBe(false);
    });

    it('detects alive → slow transition', () => {
      const monitor = new HeartbeatMonitor({ slowThresholdMs: 10_000 });
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);
      // First check — alive
      monitor.getSessionHealth(sid);

      vi.advanceTimersByTime(15_000);
      const t = monitor.getSessionHealth(sid) as HealthTransition;
      expect(t.health).toBe('slow');
      expect(t.previousHealth).toBe('alive');
      expect(t.changed).toBe(true);
    });

    it('detects slow → stalled transition', () => {
      const monitor = new HeartbeatMonitor({
        slowThresholdMs: 10_000,
        stalledThresholdMs: 20_000,
      });
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);

      vi.advanceTimersByTime(15_000);
      monitor.getSessionHealth(sid); // alive → slow

      vi.advanceTimersByTime(10_000);
      const t = monitor.getSessionHealth(sid) as HealthTransition;
      expect(t.health).toBe('stalled');
      expect(t.previousHealth).toBe('slow');
      expect(t.changed).toBe(true);
    });

    it('does not report change when health is stable', () => {
      const monitor = new HeartbeatMonitor({ slowThresholdMs: 10_000 });
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);

      vi.advanceTimersByTime(15_000);
      monitor.getSessionHealth(sid); // alive → slow

      vi.advanceTimersByTime(1_000);
      const t = monitor.getSessionHealth(sid) as HealthTransition;
      expect(t.health).toBe('slow');
      expect(t.changed).toBe(false);
    });

    it('detects recovery: stalled → alive after heartbeat', () => {
      const monitor = new HeartbeatMonitor({
        slowThresholdMs: 10_000,
        stalledThresholdMs: 20_000,
      });
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);

      vi.advanceTimersByTime(25_000);
      monitor.getSessionHealth(sid); // alive → stalled

      monitor.heartbeat(sid);
      const t = monitor.getSessionHealth(sid) as HealthTransition;
      expect(t.health).toBe('alive');
      expect(t.previousHealth).toBe('stalled');
      expect(t.changed).toBe(true);
    });

    it('includes correct elapsedMs and heartbeatCount', () => {
      const monitor = new HeartbeatMonitor();
      const sid = monitor.startSession('expert-1');
      monitor.markInstrumented(sid);
      monitor.heartbeat(sid);
      monitor.heartbeat(sid);

      vi.advanceTimersByTime(5_000);
      const t = monitor.getSessionHealth(sid) as HealthTransition;
      expect(t.elapsedMs).toBe(5_000);
      expect(t.heartbeatCount).toBe(2);
      expect(t.agentId).toBe('expert-1');
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

  // #4665: the durable fix. Before this, NO caller could produce a session that
  // reports `stalled` — the three monitored regions pet their own watchdog on a
  // timer, so `timeSince` never exceeded the 15s tick. A test that the monitor
  // CAN report a stall is what makes the thresholds mean something.
  describe('progress-driven liveness (#4665)', () => {
    it('reports stalled once a session that HAS reported progress goes silent', () => {
      const monitor = new HeartbeatMonitor();
      const sid = monitor.startSession('expert-stall');

      monitor.heartbeat(sid); // real progress happened at least once
      vi.advanceTimersByTime(130_000); // past the 120s stalled threshold

      expect(monitor.isStalled(sid)).toBe(true);
      expect(monitor.getHealth().stalledSessions).toBe(1);
      expect(monitor.getSessionHealth(sid)?.health).toBe('stalled');
    });

    it('reports unmeasured, not stalled, when no progress was ever reported', () => {
      // Silence only means something once something has spoken. Calling this
      // `stalled` would blame a session for running on an uninstrumented path.
      const monitor = new HeartbeatMonitor();
      const sid = monitor.startSession('expert-quiet');

      vi.advanceTimersByTime(130_000);

      expect(monitor.getSessionHealth(sid)?.health).toBe('unmeasured');
      expect(monitor.isStalled(sid)).toBe(false);
      expect(monitor.getHealth().stalledSessions).toBe(0);
    });

    it('counts step activity inside the session scope as progress', async () => {
      const monitor = getHeartbeatMonitor();
      const sid = monitor.startSession('expert-progress');

      await runInHeartbeatSession(sid, async () => {
        stepBus.emit('step', {
          event: 'step.completed',
          stepId: 's1',
          name: 'x',
          kind: 'expert.exec',
          durationMs: 1,
          status: 'ok',
        });
        return Promise.resolve();
      });

      expect(monitor.getHealth().sessions[0]?.heartbeatCount).toBeGreaterThan(0);
    });

    it('does NOT credit step activity emitted outside the session scope', async () => {
      // The correlation guarantee. Without it a busy session would pet a hung
      // one, which is the same self-petting defect at process granularity.
      const monitor = getHeartbeatMonitor();
      const sid = monitor.startSession('expert-isolated');

      stepBus.emit('step', {
        event: 'step.completed',
        stepId: 's2',
        name: 'y',
        kind: 'expert.exec',
        durationMs: 1,
        status: 'ok',
      });
      await Promise.resolve();

      expect(monitor.getSessionHealth(sid)?.heartbeatCount).toBe(0);
    });
  });
});
