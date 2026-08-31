/**
 * Tests for heartbeat-based liveness monitor.
 *
 * @module agents/heartbeat-monitor.test
 * (Source: Issue #1032 — Agent heartbeat health monitor)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  classifyStallTick,
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
      monitor.heartbeat(sid); // progress must be credited before silence means anything

      vi.advanceTimersByTime(15_000);

      const health = monitor.getHealth();
      const session = health.sessions.find((s) => s.sessionId === sid);
      expect(session?.health).toBe('slow');
    });

    it('should classify session as stalled after threshold', () => {
      const monitor = new HeartbeatMonitor({ stalledThresholdMs: 20_000 });
      const sid = monitor.startSession('expert-1');
      monitor.heartbeat(sid);

      vi.advanceTimersByTime(25_000);

      expect(classifyStallTick(monitor.getSessionHealth(sid)?.health)).toBe('stalled');
      const health = monitor.getHealth();
      expect(health.stalledSessions).toBe(1);
    });

    it('should reset stall timer on heartbeat', () => {
      const monitor = new HeartbeatMonitor({ stalledThresholdMs: 20_000 });
      const sid = monitor.startSession('expert-1');

      vi.advanceTimersByTime(15_000);
      monitor.heartbeat(sid);
      vi.advanceTimersByTime(10_000);

      expect(classifyStallTick(monitor.getSessionHealth(sid)?.health)).toBe('quiet');
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

    it('should stay quiet for an unknown session', () => {
      const monitor = new HeartbeatMonitor();
      expect(classifyStallTick(monitor.getSessionHealth('nonexistent')?.health)).toBe('quiet');
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
      monitor.heartbeat(sid1);
      const sid2 = monitor.startSession('expert-2');
      monitor.heartbeat(sid2);

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

      // Simulate periodic heartbeats every 15s for 90s
      for (let i = 0; i < 6; i++) {
        vi.advanceTimersByTime(15_000);
        monitor.heartbeat(sid);
      }

      expect(classifyStallTick(monitor.getSessionHealth(sid)?.health)).toBe('quiet');
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

      // Heartbeat for a while
      vi.advanceTimersByTime(15_000);
      monitor.heartbeat(sid);
      vi.advanceTimersByTime(15_000);
      monitor.heartbeat(sid);

      // Then stop heartbeating
      vi.advanceTimersByTime(65_000);

      expect(classifyStallTick(monitor.getSessionHealth(sid)?.health)).toBe('stalled');
    });

    it('should transition through health states', () => {
      const monitor = new HeartbeatMonitor({
        slowThresholdMs: 20_000,
        stalledThresholdMs: 40_000,
      });
      const sid = monitor.startSession('expert-1');
      monitor.heartbeat(sid);

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

    // #4665: a session starts `unmeasured` and stays there until progress is
    // actually credited. The first credited heartbeat is what makes it `alive`.
    it('reports unmeasured → alive once progress is credited', () => {
      const monitor = new HeartbeatMonitor();
      const sid = monitor.startSession('expert-1');
      monitor.heartbeat(sid);
      const t = monitor.getSessionHealth(sid) as HealthTransition;
      expect(t.health).toBe('alive');
      expect(t.previousHealth).toBe('unmeasured');
      expect(t.changed).toBe(true);
    });

    it('reports no transition on a second read with no change', () => {
      const monitor = new HeartbeatMonitor();
      const sid = monitor.startSession('expert-1');
      monitor.getSessionHealth(sid);
      const t = monitor.getSessionHealth(sid) as HealthTransition;
      expect(t.changed).toBe(false);
    });

    it('detects alive → slow transition', () => {
      const monitor = new HeartbeatMonitor({ slowThresholdMs: 10_000 });
      const sid = monitor.startSession('expert-1');
      monitor.heartbeat(sid);
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
      monitor.heartbeat(sid);

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
      monitor.heartbeat(sid);

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
      monitor.heartbeat(sid); // credit progress so silence is meaningful

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

      expect(classifyStallTick(monitor.getSessionHealth(sid)?.health)).toBe('stalled');
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
      // #5282: this asserted `isStalled(sid) === false` — pinning the collapse
      // of 'unmeasured' into a green "not stalled" as intended behaviour. The
      // watchdog now reports the absence of measurement instead.
      expect(classifyStallTick(monitor.getSessionHealth(sid)?.health)).toBe('unmeasured');
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

    it('stays unmeasured when a scope opens but never reports a step (#4758)', async () => {
      // The regression this pins: #4752 marked a session measured the moment
      // `runInHeartbeatSession` opened its scope. Nothing under `src/agents/`
      // emits a step, so every scoped expert task over 120s fell through to the
      // thresholds and logged a false stall. Opening a scope is an intent to
      // report progress, not progress.
      //
      // This needs the SINGLETON: the regression lived in the module-level
      // `runInHeartbeatSession`, which reaches the monitor via
      // `getHeartbeatMonitor()`. A locally-constructed monitor never sees it.
      const monitor = getHeartbeatMonitor();
      const sid = monitor.startSession('expert-scoped-silent');

      await runInHeartbeatSession(sid, async () => {
        // The realistic case: real work runs, emitting nothing on `stepBus`.
        return Promise.resolve();
      });
      vi.advanceTimersByTime(130_000);

      expect(monitor.getSessionHealth(sid)?.health).toBe('unmeasured');
      // #5282: this asserted `isStalled(sid) === false` — pinning the collapse
      // of 'unmeasured' into a green "not stalled" as intended behaviour. The
      // watchdog now reports the absence of measurement instead.
      expect(classifyStallTick(monitor.getSessionHealth(sid)?.health)).toBe('unmeasured');
      expect(monitor.getHealth().stalledSessions).toBe(0);
    });
  });
});
