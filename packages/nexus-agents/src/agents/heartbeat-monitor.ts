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

// ============================================================================
// Types
// ============================================================================

/** Health status of an expert session. */
export type SessionHealth = 'alive' | 'slow' | 'stalled';

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
    const now = Date.now();
    this.sessions.set(sessionId, {
      expertId,
      startedAt: now,
      lastHeartbeat: now,
      heartbeatCount: 0,
      previousHealth: 'alive',
    });
    return sessionId;
  }

  /** Record a heartbeat for an active session. */
  heartbeat(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry === undefined) return;
    entry.lastHeartbeat = Date.now();
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
    const elapsed = Date.now() - entry.lastHeartbeat;
    return elapsed >= this.config.stalledThresholdMs;
  }

  /** Check if a session has exceeded the absolute max lifetime. */
  isExpired(sessionId: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (entry === undefined) return false;
    return Date.now() - entry.startedAt >= this.config.absoluteMaxMs;
  }

  /** Get aggregate health report for all active sessions. */
  getHealth(): AgentHealthReport {
    const now = Date.now();
    const sessions: ExpertSessionSnapshot[] = [];
    let stalledCount = 0;

    for (const [sessionId, entry] of this.sessions) {
      const timeSince = now - entry.lastHeartbeat;
      const health = this.classifyHealth(timeSince);
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
    const now = Date.now();
    const timeSince = now - entry.lastHeartbeat;
    const health = this.classifyHealth(timeSince);
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

  private classifyHealth(timeSinceMs: number): SessionHealth {
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
  return globalMonitor;
}

/** Reset global monitor (for testing). */
export function resetHeartbeatMonitor(): void {
  globalMonitor = undefined;
}
