/**
 * Tests for the SwarmObserver → pipeline-bus signal producer (#3223).
 */

import { describe, it, expect, vi } from 'vitest';
import type { ILogger } from '../core/index.js';
import { EventBus } from '../pipeline/event-bus.js';
import type { PipelineEvent } from '../pipeline/event-types.js';
import type { BottleneckInfo, SwarmHealthMetrics } from './swarm-observer-types.js';
import {
  confidentCliSlot,
  emitSwarmUnhealthySignals,
  startSwarmHealthSignals,
  shutdownSwarmHealthSignals,
} from './swarm-health-signals.js';

function spyLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: ILogger) {
      return this;
    }),
    setLevel: vi.fn(),
  };
}

function bottleneck(over: Partial<BottleneckInfo>): BottleneckInfo {
  return {
    agentId: 'claude',
    queuedMessages: 12,
    avgWaitTimeMs: 500,
    blockedAgents: 3,
    severity: 'high',
    ...over,
  };
}

function metrics(bottlenecks: BottleneckInfo[]): SwarmHealthMetrics {
  return {
    totalAgents: 4,
    activeAgents: 4,
    errorAgents: 0,
    totalInteractions: 100,
    successRate: 0.8,
    avgLatencyMs: 200,
    bottlenecks,
    clusters: [],
    calculatedAt: '2026-06-01T00:00:00.000Z',
  };
}

function capture(bus: EventBus): PipelineEvent[] {
  const seen: PipelineEvent[] = [];
  bus.subscribe({ type: ['signal.swarm_unhealthy'] }, (e) => seen.push(e));
  return seen;
}

describe('confidentCliSlot (#3223)', () => {
  it('resolves CLI-name literals to themselves', () => {
    expect(confidentCliSlot('claude')).toBe('claude');
    expect(confidentCliSlot('gemini')).toBe('gemini');
    expect(confidentCliSlot('codex')).toBe('codex');
    expect(confidentCliSlot('opencode')).toBe('opencode');
  });

  it('resolves curated model ids to their slot', () => {
    expect(confidentCliSlot('claude-opus')).toBe('claude');
    expect(confidentCliSlot('gemini-3-pro')).toBe('gemini');
  });

  it('returns undefined for non-CLI-attributable ids (no mis-attribution)', () => {
    expect(confidentCliSlot('architect')).toBeUndefined();
    expect(confidentCliSlot('voter-7')).toBeUndefined();
    expect(confidentCliSlot('mcp-server')).toBeUndefined();
    expect(confidentCliSlot('trace-abc123')).toBeUndefined();
  });
});

describe('emitSwarmUnhealthySignals (#3223)', () => {
  it('emits a signal for a severe, CLI-attributable bottleneck', () => {
    const bus = new EventBus();
    const seen = capture(bus);
    const n = emitSwarmUnhealthySignals(
      metrics([bottleneck({ agentId: 'gemini', severity: 'critical' })]),
      bus,
      spyLogger()
    );
    expect(n).toBe(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      type: 'signal.swarm_unhealthy',
      agentId: 'gemini',
    });
    expect((seen[0] as { reason: string }).reason).toContain('severity critical');
  });

  it('ignores non-severe (low/medium) bottlenecks', () => {
    const bus = new EventBus();
    const seen = capture(bus);
    const n = emitSwarmUnhealthySignals(
      metrics([
        bottleneck({ agentId: 'claude', severity: 'low' }),
        bottleneck({ agentId: 'codex', severity: 'medium' }),
      ]),
      bus,
      spyLogger()
    );
    expect(n).toBe(0);
    expect(seen).toHaveLength(0);
  });

  it('skips non-CLI-attributable agents with a debug log, never mis-attributing', () => {
    const bus = new EventBus();
    const seen = capture(bus);
    const logger = spyLogger();
    const n = emitSwarmUnhealthySignals(
      metrics([bottleneck({ agentId: 'architect', severity: 'critical' })]),
      bus,
      logger
    );
    expect(n).toBe(0);
    expect(seen).toHaveLength(0);
    expect(logger.debug).toHaveBeenCalledWith(
      'Skipping non-CLI-attributable bottleneck',
      expect.objectContaining({ agentId: 'architect' })
    );
  });

  it('dedups to at most one signal per CLI slot', () => {
    const bus = new EventBus();
    const seen = capture(bus);
    const n = emitSwarmUnhealthySignals(
      metrics([
        bottleneck({ agentId: 'claude', severity: 'high', queuedMessages: 20 }),
        bottleneck({ agentId: 'claude', severity: 'critical', queuedMessages: 30 }),
      ]),
      bus,
      spyLogger()
    );
    expect(n).toBe(1);
    expect(seen).toHaveLength(1);
  });

  it('emits nothing for an empty bottleneck list', () => {
    const bus = new EventBus();
    const seen = capture(bus);
    expect(emitSwarmUnhealthySignals(metrics([]), bus, spyLogger())).toBe(0);
    expect(seen).toHaveLength(0);
  });
});

describe('startSwarmHealthSignals / shutdownSwarmHealthSignals (#3223)', () => {
  it('polls the observer and emits, then stops cleanly on shutdown', () => {
    vi.useFakeTimers();
    try {
      const bus = new EventBus();
      const seen = capture(bus);
      const getHealthMetrics = vi.fn(() =>
        metrics([bottleneck({ agentId: 'codex', severity: 'critical' })])
      );
      // Minimal ISwarmObserver stand-in: only getHealthMetrics is exercised.
      const observer = { getHealthMetrics } as unknown as Parameters<
        typeof startSwarmHealthSignals
      >[0];

      startSwarmHealthSignals(observer, bus, { intervalMs: 1000, logger: spyLogger() });
      // Idempotent: a second start does not add a second timer.
      startSwarmHealthSignals(observer, bus, { intervalMs: 1000, logger: spyLogger() });

      vi.advanceTimersByTime(1000);
      expect(getHealthMetrics).toHaveBeenCalledTimes(1);
      expect(seen).toHaveLength(1);

      vi.advanceTimersByTime(1000);
      expect(seen).toHaveLength(2);

      shutdownSwarmHealthSignals();
      vi.advanceTimersByTime(5000);
      expect(seen).toHaveLength(2); // no further emissions after shutdown
    } finally {
      shutdownSwarmHealthSignals();
      vi.useRealTimers();
    }
  });
});
