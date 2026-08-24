/**
 * Heartbeat-based liveness monitor for expert agent sessions.
 *
 * Tracks active expert executions with periodic heartbeats.
 * Detects stalled sessions that stop making progress, enabling
 * faster detection than wall-clock timeouts alone.
 *
 * @module agents/heartbeat-monitor
 * (Source: Issue #1032 — Agent heartbeat health monitor)
 */

import { randomBytes } from 'node:crypto';
import { getTimeProvider } from '../core/index.js';

// ============================================================================
// Types
// ============================================================================

/** Health status of an expert session. */
/**
 * `unmeasured` (#4665) is the empty case: nothing has claimed to report this
 * session's progress, so its silence carries no information. Deliberately
 * neither `alive` (the old self-petting lie) nor `stalled` (which would blame a
 * session for running on an uninstrumented path).
 */
export type SessionHealth = 'unmeasured' | 'alive' | 'slow' | 'stalled';

/** Snapshot of a single expert session. */
export interface ExpertSessionSnapshot {
  readonly sessionId: string;
  readonly expertId: string;
  readonly startedAt: number;
  readonly lastHeartbeat: number;
  readonly heartbeatCount: number;
  readonly health: SessionHealth;
  readonly elapsedMs: number;
  readonly timeSinceHeartbeatMs: number;
}

/** Aggregate health report for all active sessions. */
export interface AgentHealthReport {
  readonly activeSessions: number;
  readonly stalledSessions: number;
  readonly sessions: readonly ExpertSessionSnapshot[];
}

/** Configuration for the heartbeat monitor. */
export interface HeartbeatConfig {
  /** Time without heartbeat before marking 'slow' (ms). */
  readonly slowThresholdMs: number;
  /** Time without heartbeat before marking 'stalled' (ms). */
  readonly stalledThresholdMs: number;
  /** Absolute max lifetime for any session (ms). Safety cap. */
  readonly absoluteMaxMs: number;
}

// ============================================================================
// Constants
// ============================================================================

// Canonical source: config/timeouts.ts (Issue #1046)
import { HEARTBEAT_TIMEOUTS } from '../config/timeouts.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { stepBus } from '../core/step-bus.js';

const DEFAULT_SLOW_THRESHOLD_MS = HEARTBEAT_TIMEOUTS.slowThresholdMs;
const DEFAULT_STALLED_THRESHOLD_MS = HEARTBEAT_TIMEOUTS.stalledThresholdMs;
const DEFAULT_ABSOLUTE_MAX_MS = HEARTBEAT_TIMEOUTS.absoluteMaxMs;

// ============================================================================
// Internal Session State
// ============================================================================

interface SessionEntry {
  readonly expertId: string;
  readonly startedAt: number;
  lastHeartbeat: number;
  heartbeatCount: number;
  /** Set once the session's work is running under a progress scope (#4665). */
  instrumented: boolean;
  /** Previous health state for transition detection (Issue #1088 Phase 4). */
  previousHealth: SessionHealth;
}

/** Health transition info returned by getSessionHealth(). */
export interface HealthTransition {
  readonly sessionId: string;
  readonly agentId: string;
  readonly health: SessionHealth;
  readonly previousHealth: SessionHealth;
  readonly changed: boolean;
  readonly elapsedMs: number;
  readonly heartbeatCount: number;
}

// ============================================================================
// HeartbeatMonitor
// ============================================================================

/**
 * Tracks expert session liveness via heartbeats.
 *
 * - `startSession()` begins tracking a new expert execution
 * - `heartbeat()` resets the liveness timer for a session
 * - `endSession()` stops tracking
 * - `getHealth()` returns aggregate health report
 * - `isStalled()` checks if a specific session is stalled
 */
export class HeartbeatMonitor {
  private readonly config: HeartbeatConfig;
  private readonly sessions = new Map<string, SessionEntry>();

  constructor(config?: Partial<HeartbeatConfig>) {
    this.config = {
      slowThresholdMs: config?.slowThresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS,
      stalledThresholdMs: config?.stalledThresholdMs ?? DEFAULT_STALLED_THRESHOLD_MS,
      absoluteMaxMs: config?.absoluteMaxMs ?? DEFAULT_ABSOLUTE_MAX_MS,
    };
  }

  /** Start tracking a new expert session. Returns session ID. */
  startSession(expertId: string): string {
    const sessionId = `hb-${expertId}-${randomBytes(6).toString('hex')}`;
    const now = getTimeProvider().now();
    this.sessions.set(sessionId, {
      expertId,
      startedAt: now,
      lastHeartbeat: now,
      heartbeatCount: 0,
      instrumented: false,
      previousHealth: 'unmeasured',
    });
    return sessionId;
  }

  /**
   * Declares that this session's work runs under a progress scope (#4665), so
   * silence from it is meaningful.
   *
   * This separates two facts that `heartbeatCount === 0` conflates: a session
   * on an uninstrumented path (nothing is watching, so say `unmeasured`) and a
   * session that hung BEFORE emitting its first step (the worst stall there is,
   * and one an `unmeasured` verdict would hide forever).
   */
  markInstrumented(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry === undefined) return;
    entry.instrumented = true;
  }

  /** Record a heartbeat for an active session. */
  heartbeat(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry === undefined) return;
    entry.lastHeartbeat = getTimeProvider().now();
    entry.heartbeatCount++;
  }

  /** Stop tracking a session. */
  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Check if a session has exceeded the stalled threshold. */
  isStalled(sessionId: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (entry === undefined) return false;
    // #4665: silence from an uninstrumented session means nothing — no scope
    // ever claimed to report its progress. Silence from an instrumented one is
    // the signal.
    if (!entry.instrumented && entry.heartbeatCount === 0) return false;
    const elapsed = getTimeProvider().now() - entry.lastHeartbeat;
    return elapsed >= this.config.stalledThresholdMs;
  }

  /** Check if a session has exceeded the absolute max lifetime. */
  isExpired(sessionId: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (entry === undefined) return false;
    return getTimeProvider().now() - entry.startedAt >= this.config.absoluteMaxMs;
  }

  /** Get aggregate health report for all active sessions. */
  getHealth(): AgentHealthReport {
    const now = getTimeProvider().now();
    const sessions: ExpertSessionSnapshot[] = [];
    let stalledCount = 0;

    for (const [sessionId, entry] of this.sessions) {
      const timeSince = now - entry.lastHeartbeat;
      const health = this.classifyHealth(timeSince, entry.heartbeatCount, entry.instrumented);
      if (health === 'stalled') stalledCount++;

      sessions.push({
        sessionId,
        expertId: entry.expertId,
        startedAt: entry.startedAt,
        lastHeartbeat: entry.lastHeartbeat,
        heartbeatCount: entry.heartbeatCount,
        health,
        elapsedMs: now - entry.startedAt,
        timeSinceHeartbeatMs: timeSince,
      });
    }

    return {
      activeSessions: this.sessions.size,
      stalledSessions: stalledCount,
      sessions,
    };
  }

  /**
   * Get health state with transition detection for a session.
   * Updates previousHealth on each call to track transitions.
   * (Issue #1088 Phase 4 — observability)
   */
  getSessionHealth(sessionId: string): HealthTransition | undefined {
    const entry = this.sessions.get(sessionId);
    if (entry === undefined) return undefined;
    const now = getTimeProvider().now();
    const timeSince = now - entry.lastHeartbeat;
    const health = this.classifyHealth(timeSince, entry.heartbeatCount, entry.instrumented);
    const changed = health !== entry.previousHealth;
    const result: HealthTransition = {
      sessionId,
      agentId: entry.expertId,
      health,
      previousHealth: entry.previousHealth,
      changed,
      elapsedMs: now - entry.startedAt,
      heartbeatCount: entry.heartbeatCount,
    };
    entry.previousHealth = health;
    return result;
  }

  /** Number of currently tracked sessions. */
  get activeCount(): number {
    return this.sessions.size;
  }

  private classifyHealth(
    timeSinceMs: number,
    heartbeatCount: number,
    instrumented: boolean
  ): SessionHealth {
    // Nothing ever claimed to report this session's progress, so `lastHeartbeat`
    // is still just `startedAt` and the elapsed time measures the clock, not the
    // work. An INSTRUMENTED session with no heartbeats is a different fact — it
    // hung before its first step — and falls through to the thresholds.
    if (!instrumented && heartbeatCount === 0) return 'unmeasured';
    if (timeSinceMs >= this.config.stalledThresholdMs) return 'stalled';
    if (timeSinceMs >= this.config.slowThresholdMs) return 'slow';
    return 'alive';
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalMonitor: HeartbeatMonitor | undefined;

/** Get or create the global heartbeat monitor singleton. */
export function getHeartbeatMonitor(): HeartbeatMonitor {
  globalMonitor ??= new HeartbeatMonitor();
  ensureProgressSubscription();
  return globalMonitor;
}

/** Reset global monitor (for testing). */
export function resetHeartbeatMonitor(): void {
  globalMonitor = undefined;
}

// ============================================================================
// Progress-driven heartbeats (#4665)
// ============================================================================

/**
 * The session that owns the currently-executing async work.
 *
 * Progress has to pet the watchdog, not a timer. The three monitored regions
 * each wrap a single opaque `await`, so there is no in-line place to call
 * `heartbeat()` — but `withStep` emits on `stepBus` for every nested step
 * INSIDE that await, and `EventEmitter` handlers run synchronously within
 * `emit()`, so the emitting code's async context is still live in the handler.
 * That is what lets one global subscriber pet exactly the right session, rather
 * than every session crediting every other session's work.
 */
const sessionAls = new AsyncLocalStorage<string>();

/**
 * Runs `fn` attributed to `sessionId`, so step activity inside it counts as
 * progress for that session.
 */
export function runInHeartbeatSession<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  getHeartbeatMonitor().markInstrumented(sessionId);
  return sessionAls.run(sessionId, fn);
}

/** The session owning the current async context, if any. Exported for tests. */
export function currentHeartbeatSession(): string | undefined {
  return sessionAls.getStore();
}

let subscribed = false;

/**
 * Subscribes the monitor to step activity. Idempotent, and called from
 * `getHeartbeatMonitor` so any consumer of the singleton gets it. Reads
 * `globalMonitor` at call time so a `resetHeartbeatMonitor()` in tests is
 * followed correctly.
 */
function ensureProgressSubscription(): void {
  if (subscribed) return;
  subscribed = true;
  stepBus.on('step', () => {
    const sessionId = sessionAls.getStore();
    if (sessionId === undefined) return;
    globalMonitor?.heartbeat(sessionId);
  });
}
